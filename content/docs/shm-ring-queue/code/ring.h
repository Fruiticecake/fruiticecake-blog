// ring.h：共享内存 SPSC 环形队列（C11 原子 + Linux futex）
// 一个生产者、一个消费者，可以在两个进程里。编译：gcc -std=gnu11 -O2
#ifndef RING_H
#define RING_H

#include <errno.h>
#include <fcntl.h>
#include <linux/futex.h>
#include <stdalign.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stdint.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <time.h>
#include <unistd.h>

#define RING_MAGIC   0x52494E47u
#define RING_VERSION 1u
#define RING_PAYLOAD 56u
#define CACHELINE    64

#ifndef RING_SPIN // 进内核睡眠前先自旋多少次
#define RING_SPIN 2000
#endif
#ifndef RING_ALIGN // 实测伪共享时用 -DRING_ALIGN= 去掉对齐
#define RING_ALIGN alignas(CACHELINE)
#endif
#ifndef RING_NO_CACHE // 实测缓存下标的效果时设为 1
#define RING_NO_CACHE 0
#endif

struct ring_slot {
    uint32_t len;
    uint32_t type;
    uint8_t data[RING_PAYLOAD];
};

struct ring {
    // 初始化后只读
    _Atomic uint32_t magic; // 最后写入，attach 方看到它才算初始化完成
    uint32_t version;
    uint32_t capacity; // 必须是 2 的幂
    uint32_t mask;
    // 各占一条缓存行：谁写谁独占
    RING_ALIGN _Atomic uint32_t tail; // 只有生产者写
    RING_ALIGN _Atomic uint32_t head; // 只有消费者写
    RING_ALIGN _Atomic uint32_t cons_sleeping;
    _Atomic uint32_t prod_sleeping;
    alignas(CACHELINE) struct ring_slot slots[];
};

// 每个进程私有的句柄，不放进共享内存。capacity 和 mask 校验后存在这里，
// 收发时不再读共享内存里的那一份：对端可以改它，越界就从这里开始
struct ring_tx { struct ring *r; uint32_t capacity, mask, tail, cached_head; };
struct ring_rx { struct ring *r; uint32_t mask, head, cached_tail; };

static inline void cpu_relax(void) {
#if defined(__x86_64__) || defined(__i386__)
    __builtin_ia32_pause();
#elif defined(__aarch64__)
    __asm__ volatile("yield");
#endif
}

static inline int64_t now_ns(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (int64_t)ts.tv_sec * 1000000000 + ts.tv_nsec;
}

// 跨进程不能用 FUTEX_PRIVATE_FLAG
static inline long futex_wait(_Atomic uint32_t *word, uint32_t seen,
                              const struct timespec *rel) {
    return syscall(SYS_futex, word, FUTEX_WAIT, seen, rel, NULL, 0);
}

static inline long futex_wake(_Atomic uint32_t *word, int n) {
    return syscall(SYS_futex, word, FUTEX_WAKE, n, NULL, NULL, 0);
}

/* ---------- 非阻塞收发：快路径不进内核 ---------- */

static inline bool ring_try_push(struct ring_tx *tx, const void *msg, uint32_t len) {
    struct ring *r = tx->r;
    uint32_t t = tx->tail;
    if (len > RING_PAYLOAD) return false;
    if (RING_NO_CACHE || t - tx->cached_head == tx->capacity) {
        // 只有看起来满了才读对方的下标，少一次缓存行迁移
        tx->cached_head = atomic_load_explicit(&r->head, memory_order_acquire);
        if (t - tx->cached_head == tx->capacity) return false;
    }
    struct ring_slot *s = &r->slots[t & tx->mask];
    s->len = len;
    memcpy(s->data, msg, len);
    tx->tail = t + 1;
    // release：对方看到新 tail 时，一定也能看到上面写好的数据
    atomic_store_explicit(&r->tail, t + 1, memory_order_release);
    return true;
}

// 返回 1 取到，0 为空，-EBADMSG 表示长度字段非法，-EMSGSIZE 表示 out 放不下
static inline int ring_try_pop(struct ring_rx *rx, void *out, uint32_t cap, uint32_t *len) {
    struct ring *r = rx->r;
    uint32_t h = rx->head;
    if (RING_NO_CACHE || h == rx->cached_tail) {
        rx->cached_tail = atomic_load_explicit(&r->tail, memory_order_acquire);
        if (h == rx->cached_tail) return 0;
    }
    const struct ring_slot *s = &r->slots[h & rx->mask];
    // 只读一次：对方进程不可信时，再读一次可能变了。volatile 防止编译器重读
    uint32_t n = *(const volatile uint32_t *)&s->len;
    if (n > RING_PAYLOAD) return -EBADMSG;
    if (n > cap) return -EMSGSIZE;
    memcpy(out, s->data, n);
    *len = n;
    rx->head = h + 1;
    atomic_store_explicit(&r->head, h + 1, memory_order_release);
    return 1;
}

/* ---------- 带超时的等待：慢路径才用 futex ---------- */

// 发布新下标之后调用。和 ring_sleep 里的 fence 配对，防止丢失唤醒
static inline void ring_notify(_Atomic uint32_t *word, _Atomic uint32_t *sleeping) {
    atomic_thread_fence(memory_order_seq_cst);
    if (atomic_load_explicit(sleeping, memory_order_relaxed))
        futex_wake(word, 1);
}

// 只要 *word 还等于 seen 就睡，最多睡到 deadline
static inline void ring_sleep(_Atomic uint32_t *word, _Atomic uint32_t *sleeping,
                              uint32_t seen, int64_t deadline) {
    atomic_store_explicit(sleeping, 1, memory_order_relaxed);
    atomic_thread_fence(memory_order_seq_cst);
    int64_t left = deadline - now_ns();
    if (left > 0 && atomic_load_explicit(word, memory_order_relaxed) == seen) {
        struct timespec ts = { left / 1000000000, left % 1000000000 };
        futex_wait(word, seen, &ts); // 醒来的原因不重要，调用方会重新检查
    }
    atomic_store_explicit(sleeping, 0, memory_order_relaxed);
}

// 所有等待都有超时：对端可能已经死了，超时后由调用方决定怎么办
static inline int ring_push_wait(struct ring_tx *tx, const void *msg, uint32_t len,
                                 int timeout_ms) {
    struct ring *r = tx->r;
    int64_t deadline = 0; // 快路径不读时钟，第一次要睡时才计算
    if (len > RING_PAYLOAD) return -EMSGSIZE;
    for (;;) {
        for (int i = 0; i < RING_SPIN; i++) {
            if (ring_try_push(tx, msg, len)) {
                ring_notify(&r->tail, &r->cons_sleeping);
                return 0;
            }
            cpu_relax();
        }
        int64_t now = now_ns();
        if (deadline == 0) deadline = now + (int64_t)timeout_ms * 1000000;
        else if (now >= deadline) return -ETIMEDOUT;
        ring_sleep(&r->head, &r->prod_sleeping, tx->cached_head, deadline);
    }
}

static inline int ring_pop_wait(struct ring_rx *rx, void *out, uint32_t cap, uint32_t *len,
                                int timeout_ms) {
    struct ring *r = rx->r;
    int64_t deadline = 0;
    for (;;) {
        for (int i = 0; i < RING_SPIN; i++) {
            int rc = ring_try_pop(rx, out, cap, len);
            if (rc == 1) {
                ring_notify(&r->head, &r->prod_sleeping);
                return 0;
            }
            if (rc < 0) return rc;
            cpu_relax();
        }
        int64_t now = now_ns();
        if (deadline == 0) deadline = now + (int64_t)timeout_ms * 1000000;
        else if (now >= deadline) return -ETIMEDOUT;
        ring_sleep(&r->tail, &r->cons_sleeping, rx->head, deadline);
    }
}

/* ---------- 创建与连接 ---------- */

static inline size_t ring_bytes(uint32_t capacity) {
    return sizeof(struct ring) + (size_t)capacity * sizeof(struct ring_slot);
}

static inline void ring_init(struct ring *r, uint32_t capacity) {
    r->version = RING_VERSION;
    r->capacity = capacity;
    r->mask = capacity - 1;
    atomic_init(&r->head, 0);
    atomic_init(&r->tail, 0);
    atomic_init(&r->cons_sleeping, 0);
    atomic_init(&r->prod_sleeping, 0);
    atomic_store_explicit(&r->magic, RING_MAGIC, memory_order_release);
}

// O_EXCL 保证只有一方初始化。上次崩溃留下的旧对象，由启动方先 shm_unlink
static inline struct ring *ring_create(const char *name, uint32_t capacity) {
    if (capacity == 0 || (capacity & (capacity - 1))) { errno = EINVAL; return NULL; }
    int fd = shm_open(name, O_CREAT | O_EXCL | O_RDWR, 0600);
    if (fd < 0) return NULL;
    size_t size = ring_bytes(capacity);
    void *p = MAP_FAILED;
    if (ftruncate(fd, (off_t)size) == 0)
        p = mmap(NULL, size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    close(fd);
    if (p == MAP_FAILED) { shm_unlink(name); return NULL; }
    ring_init(p, capacity);
    return p;
}

// 对方可能还在初始化，也可能写着错误的头部，都要检查后才能用
static inline struct ring *ring_attach(const char *name, int timeout_ms) {
    int64_t deadline = now_ns() + (int64_t)timeout_ms * 1000000;
    const struct timespec nap = { 0, 1000000 };
    int fd;
    while ((fd = shm_open(name, O_RDWR, 0)) < 0) {
        if (errno != ENOENT || now_ns() >= deadline) return NULL;
        nanosleep(&nap, NULL);
    }
    struct stat st;
    for (;;) {
        if (fstat(fd, &st) != 0) { close(fd); return NULL; }
        // ftruncate 之前 size 是 0，这时访问映射会收到 SIGBUS
        if ((size_t)st.st_size >= sizeof(struct ring)) break;
        if (now_ns() >= deadline) { close(fd); errno = ETIMEDOUT; return NULL; }
        nanosleep(&nap, NULL);
    }
    struct ring *r = mmap(NULL, (size_t)st.st_size, PROT_READ | PROT_WRITE,
                          MAP_SHARED, fd, 0);
    close(fd);
    if (r == MAP_FAILED) return NULL;
    while (atomic_load_explicit(&r->magic, memory_order_acquire) != RING_MAGIC) {
        if (now_ns() >= deadline) { errno = ETIMEDOUT; goto bad; }
        nanosleep(&nap, NULL);
    }
    if (r->version != RING_VERSION || r->capacity == 0
        || (r->capacity & (r->capacity - 1)) || r->mask != r->capacity - 1
        || ring_bytes(r->capacity) != (size_t)st.st_size) {
        errno = EPROTO;
        goto bad;
    }
    return r;
bad:
    munmap(r, (size_t)st.st_size);
    return NULL;
}

static inline void ring_tx_open(struct ring_tx *tx, struct ring *r) {
    tx->r = r;
    tx->capacity = r->capacity;
    tx->mask = r->mask;
    // 上一任可能睡着时死掉：不清掉的话，对方每发一条都会多一次系统调用
    atomic_store_explicit(&r->prod_sleeping, 0, memory_order_relaxed);
    tx->tail = atomic_load_explicit(&r->tail, memory_order_relaxed);
    tx->cached_head = atomic_load_explicit(&r->head, memory_order_acquire);
}

static inline void ring_rx_open(struct ring_rx *rx, struct ring *r) {
    rx->r = r;
    rx->mask = r->mask;
    atomic_store_explicit(&r->cons_sleeping, 0, memory_order_relaxed);
    rx->head = atomic_load_explicit(&r->head, memory_order_relaxed);
    rx->cached_tail = rx->head;
}

#endif
