---
title: 共享内存 IPC 怎么设计：环形队列、原子操作、内存序和 futex，附完整代码与实测
display_title: "设计一条[共享内存]队列"
date: 2026-11-05
section: docs
summary: "共享内存只解决了数据搬运，同步、通知、崩溃和校验都要自己做。本文从零设计一条跨进程 SPSC 环形队列：下标怎么走、内存序怎么选、futex 怎么防丢失唤醒、进程被杀后怎么办，并给出完整 C 代码和与互斥锁、管道的实测对比。"
tags: [Linux, IPC, 共享内存, 无锁, futex]
kicker: 技术文档 / Linux · IPC · 并发
source: "https://man7.org/linux/man-pages/man2/FUTEX_WAIT.2const.html"
source_label: man-pages · 内核文档 · 实测
design: stage
hero: ring-orbit
---

::: tldr
一条好的共享内存队列要回答五个问题：**谁能写哪个变量、对方什么时候看得到、没数据时怎么等、对方死了怎么办、对方写坏了怎么办**。单生产者单消费者时，只要 head 和 tail 各由一方写，加上 release / acquire，就不需要锁和 CAS。实测在同样的两个进程之间，它的吞吐接近互斥锁版本的 6 倍。但是如果每条消息都要睡眠和唤醒，它和管道一样慢，都约 15 微秒。所以低延迟靠的是不睡，而不只是无锁。
:::

这篇承接[《进程间通信到底拷贝了几次》](/docs/linux-ipc-copy.html)。那篇比较了各种 IPC 的数据路径，结论是共享内存省掉了经过内核的拷贝，但同步和通知要自己做。这篇就讲怎么做，并实现一条真正能跑的跨进程队列。

测试环境：x86-64 Ubuntu 24.04（WSL2，内核 5.10）、GCC 13.3、i5-12400F，两个进程绑在不同物理核（CPU2、CPU4）。这是虚拟机里的桌面 CPU，数字只用来比较相对差异。全部源码和测试脚本放在[仓库的 code 目录](https://github.com/Fruiticecake/fruiticecake-blog/tree/main/content/docs/shm-ring-queue/code)。

## [NEED] 共享内存只解决了一件事

`mmap` 之后，两个进程能看到同一块物理内存，数据不用再经过内核。但下面五件事，原来由内核或 socket 代劳，现在都要自己负责：

| 问题 | 内核管道的做法 | 共享内存要自己做的事 |
|---|---|---|
| 互斥和可见性 | 内核加锁 | 约定谁写什么，用原子操作和内存序 |
| 没数据时等待 | 内核让读者睡眠，写入时唤醒 | 自旋、futex 或 eventfd |
| 对方死了 | 读到 EOF，或写时收到 `EPIPE` | 超时、心跳，或再配一条 socket |
| 对方写坏了 | 数据只是字节流，不会破坏管道本身 | 校验所有从共享内存读到的长度和下标 |
| 初始化和清理 | 随 fd 关闭 | 谁创建、谁初始化、残留对象谁删除 |

这张表就是后面章节的目录。

## [MUTEX] 为什么不直接用互斥锁

最直接的办法是在共享内存里放一个 `PTHREAD_PROCESS_SHARED` 互斥锁。常听到一种说法：底层 IPC 不用操作系统的互斥锁，因为它要进内核，太慢，所以要用无锁队列。这个结论方向是对的，理由却不准确。

Linux 的 `pthread_mutex` 基于 futex，**没有竞争时只在用户态做一次原子操作，根本不进内核**，只有竞争时才睡眠。所以互斥锁的问题不在「它是操作系统的」，而在下面三点：

1. **把两边串行化了。** 生产者写槽位 A，消费者读槽位 B，本来互不影响，却要排队。后面实测的互斥锁版本，吞吐只有环形队列的约六分之一，这个差距既来自串行化，也来自条件变量的唤醒调用。
2. **持锁者可能不走了。** 持锁线程被调度走，所有人都要等。低优先级线程持锁时，还可能造成优先级反转。
3. **持锁者可能死了。** 跨进程时这一点尤其致命。

第三点可以直接验证：让一个进程拿着锁时被 `SIGKILL`，另一个进程再用带超时的加锁去试：

```text
default: timedlock -> Connection timed out
robust: timedlock -> Owner died
```

默认的互斥锁会永远锁住，没有超时就是死锁。设置 `PTHREAD_MUTEX_ROBUST` 后能拿到 `EOWNERDEAD`，但这只说明上一任死了，它保护的数据可能只改了一半，恢复逻辑还要自己写。

下面要设计的队列把「改一半」这个状态消灭了：一条消息要么已发布，要么不可见。

## [RING] 环形队列：让两边不写同一个变量

无锁设计的关键不是某个高级指令，而是**约定每个变量只有一方写**。这样就不存在写写冲突：

- `tail` 只有生产者写：下一个要写的位置。
- `head` 只有消费者写：下一个要读的位置。
- 槽位的所有权靠这两个下标转移：`[head, tail)` 归消费者，其余归生产者。

下标有一个值得记住的写法：**让它们一直递增，只在访问数组时才取模**，容量取 2 的幂，取模就是按位与：

```text
已用数量 = tail - head     （无符号减法，回绕后依然正确）
空：tail == head
满：tail - head == capacity
槽位 = tail & (capacity - 1)
```

如果写成回绕的下标（`tail = (tail + 1) % capacity`），`tail == head` 就分不清是空还是满，要么浪费一个槽位，要么多维护一个计数。递增写法没有这个问题。下面的演示从接近 2³² 的位置开始，多写几条就能看到下标越过上限后，判断依然正确：

::: interactive ring-sim title="下标一直涨，取模才是位置" hint="写一条 / 读一条"
容量为 8 的队列。`head` 和 `tail` 都是 32 位无符号数，只增不减。写入时把消息放进 `tail & 7` 号槽位，再把 `tail` 加 1；读取时取 `head & 7` 号槽位，再把 `head` 加 1。`tail - head` 是已用数量，等于 8 时表示满，等于 0 时表示空。当 `tail` 从 4294967295 回绕到 0 时，无符号减法的结果依然正确。
:::

测试里专门把下标初始化到 `UINT32_MAX - 20`，跑了 1000 轮收发，越过 2³² 后顺序和内容都正确。

## [ORDER] 原子操作和内存序：对方什么时候看得到

只约定「谁写谁」还不够。生产者写完数据再更新 `tail`，这个先后顺序在代码里成立，但编译器和 CPU 都可能调整。消费者可能先看到新的 `tail`，再读到旧的数据。

这里有两个不同的问题，经常被混在一起：

- **原子性：** 这个变量的读写不会被撕裂。
- **顺序：** 这个变量和其他内存操作的先后关系。

`memory_order_release` 和 `memory_order_acquire` 解决的是顺序：release 写之前的所有读写，不会被排到它之后；acquire 读到这次写入之后，也一定能看到这些读写的结果。放到队列里就是：

```c
// 生产者
s->len = len;
memcpy(s->data, msg, len);
atomic_store_explicit(&r->tail, t + 1, memory_order_release);

// 消费者
rx->cached_tail = atomic_load_explicit(&r->tail, memory_order_acquire);
if (h == rx->cached_tail) return 0;
// 走到这里，槽位里的数据一定是完整的
```

::: interactive order-sim title="同一段代码，两种内存序" hint="下一步"
使用 release 和 acquire 时，消费者读到新的 `tail`，就一定能读到生产者在它之前写好的数据。全部用 relaxed 时，C 语言标准允许 `tail` 的写入先于数据被另一方看到，消费者可能读到旧数据，并且这在标准里属于数据竞争。
:::

这个错误在 x86 上**几乎测不出来**。x86 的内存模型很强，同一个核的写不会互相调换顺序，GCC 对 release 写和 acquire 读生成的就是普通 `mov`。下面是 `objdump` 的实际结果：

```text
atomic_store(release)        mov   DWORD PTR [x], edi
atomic_load(acquire)         mov   eax, DWORD PTR [x]
atomic_store(seq_cst)        xchg  DWORD PTR [x], edi
atomic_compare_exchange      lock cmpxchg DWORD PTR [x], esi
atomic_fetch_add             lock xadd DWORD PTR [x], eax
atomic_thread_fence(seq_cst) lock or QWORD PTR [rsp], 0x0
```

也就是说，**写错内存序的代码在 x86 上经常照样通过测试**：CPU 不会调换这两个写，只有编译器恰好调换时才出错。换到 ARM 上，CPU 也可能调换，问题才容易暴露，而很多嵌入式设备是 ARM。运行结果不能证明代码是对的，要借助工具。ThreadSanitizer 能发现数据竞争，但它不能证明所有内存序都对。我把 `tail` 的 release 改成 relaxed，再用 ThreadSanitizer 跑，马上就报告了：

```text
WARNING: ThreadSanitizer: data race
  Read of size 4 by main thread:
  Previous write of size 4 by thread T1:
SUMMARY: ThreadSanitizer: data race ring.h:114 in ring_try_pop
```

原版代码在 TSan 下跑 400 万条消息没有报告。我没有 ARM 环境，这篇的代码没有在 ARM 上实际运行过，上 ARM 之前要重新测试。

### CAS 是什么，为什么这里用不上

CAS（比较并交换）的含义是：如果内存里还是我读到的旧值，就改成新值，否则告诉我失败。x86 上它是一条带 `lock` 前缀的 `cmpxchg`；ARM 上传统做法是 `LDXR`/`STXR` 配对，在独占标记被破坏时重试，ARMv8.1 起也有 `CAS` 指令。

CAS 解决的是**多方竞争写同一个变量**。SPSC 队列里每个下标只有一方写，不存在竞争，读改写都不需要，只要一次带顺序的 store。`ring_try_push` 和 `ring_try_pop` 的快路径上没有任何 `lock` 指令，这是 SPSC 快的原因。wait 版为了防丢失唤醒，每条消息多一次 fence，后面会量这个成本。只有到了多生产者场景，才需要 CAS，后面会讲到。

## [CACHE] 缓存行：不共享数据，也可能互相拖累

CPU 缓存按缓存行工作，这台机器上是 64 字节。如果 `head` 和 `tail` 在同一行，生产者每写一次 `tail`，消费者那边的这一行就失效了，消费者下次写 `head` 时要把这一行重新拿回来，尽管两个变量互不相干。这就是**伪共享**。

解决办法是把会被不同核写的变量放到不同的缓存行：

```c
struct ring {
    // 初始化后只读
    _Atomic uint32_t magic;
    uint32_t version;
    uint32_t capacity;
    uint32_t mask;
    // 各占一条缓存行：谁写谁独占
    alignas(64) _Atomic uint32_t tail; // 只有生产者写
    alignas(64) _Atomic uint32_t head; // 只有消费者写
    alignas(64) _Atomic uint32_t cons_sleeping;
    _Atomic uint32_t prod_sleeping;
    alignas(64) struct ring_slot slots[];
};
```

还有一个优化：生产者每次判断满不满都要读 `head`，这会把消费者那条缓存行拉过来。Erik Rigtorp 的文章介绍了**缓存对方的下标**：先用上次读到的旧值判断，它只会比真实值更保守，只有看起来满了才重新读。这个缓存放在进程私有的句柄里，不放进共享内存。

这两项优化都实测了，见下一节。结果比一些文章里的倍数小，这很正常：它们的效果和 CPU、核的位置、队列的繁忙程度都有关系。

## [WAIT] 没数据时怎么等

队列空了，消费者有三种选择：

| 方式 | 延迟 | CPU | 适合 |
|---|---|---|---|
| 一直自旋 | 最低 | 占满一个核 | 绑定了专用核的低延迟路径 |
| 自旋一会儿，再用 futex 睡 | 忙时低，空闲时有唤醒开销 | 空闲时不占 | 大多数场景 |
| eventfd | 每次都有系统调用 | 空闲时不占 | 要和其他 fd 一起放进 epoll |

### futex 只做一件事：比较后再睡

futex 是内核提供的等待队列，以用户态的一个 32 位整数的地址为钥匙。它的两个基本操作是：

- `FUTEX_WAIT(addr, val)`：如果 `*addr` 还等于 `val` 就睡，否则立刻返回 `EAGAIN`。比较和入睡相对于其他 futex 操作是原子的。
- `FUTEX_WAKE(addr, n)`：唤醒最多 n 个在 `addr` 上等待的线程。

跨进程时不能加 `FUTEX_PRIVATE_FLAG`，futex 字要放在共享内存里。手册也提醒返回 0 可能是虚假唤醒，所以醒来后要重新检查条件。

man page 写得很明确，那个「比较」的目的就是**防止丢失唤醒**。我们的队列可以直接把 `tail` 本身当 futex 字：消费者看到 `tail == 5` 决定睡，如果这时 `tail` 变了，内核就不会让它睡。

### 丢失唤醒是怎么发生的

每发一条消息都调用 `futex_wake` 太贵了，这是一次系统调用。所以要加一个 `sleeping` 标志，只有对方可能在睡的时候才唤醒。问题也出在这里：

::: interactive wake-race title="三种写法的执行顺序" hint="切换写法"
第一种写法：消费者检查发现队列为空后才去睡，内核不做比较。生产者的唤醒如果恰好落在这两步之间，就没有任何效果，消费者会一直睡到超时。第二种写法：把旧值交给 `FUTEX_WAIT`，内核发现下标已变就立刻返回，这个窗口被关闭了。第三种写法：用 `sleeping` 标志省掉不必要的唤醒，但没有 fence。消费者「写 sleeping 再读 tail」，生产者「写 tail 再读 sleeping」，两个写都可能还在各自的存储缓冲区里，于是双方都读到旧值：生产者跳过唤醒，消费者继续去睡。
:::

第三种情况是经典的 Dekker 模式：**先写后读**是 x86 唯一允许重排的情况，release / acquire 挡不住它，必须用 `seq_cst` 的 fence。所以双方都要有：

```c
// 消费者：先声明要睡，再检查
atomic_store_explicit(sleeping, 1, memory_order_relaxed);
atomic_thread_fence(memory_order_seq_cst);
if (atomic_load_explicit(word, memory_order_relaxed) == seen)
    futex_wait(word, seen, &ts);

// 生产者：先发布，再检查有没有人睡
atomic_store_explicit(&r->tail, t + 1, memory_order_release);
atomic_thread_fence(memory_order_seq_cst);
if (atomic_load_explicit(sleeping, memory_order_relaxed))
    futex_wake(word, 1);
```

这样，两个 fence 总有先后：要么生产者看到 `sleeping == 1` 去唤醒，要么消费者看到新的 `tail` 不去睡。

我做了实验验证：双方尽量都去睡，统计一条消息等超过 100 毫秒的次数（正常一轮约 16 微秒）。

| 版本 | 轮数 | 卡顿次数 |
|---|---|---|
| 正确版本 | 600 万 | 0 |
| 不比较值：所有等待都停在一个固定字上，内核不再检查下标 | 30 万 | 6 |
| 只去掉两处 fence | 600 万 | 0 |

第二行清楚地说明了比较的作用。第三行要谨慎解读：**只去掉 fence 没有复现问题，不代表它安全**。这个窗口只有存储缓冲区那几纳秒，而且 futex 进内核时的加锁操作也会让这一侧的写入生效，所以在这台 x86 上很难撞上。TSan 也帮不上忙，GCC 明确提示它不支持 `atomic_thread_fence`。这类代码不能靠测试证明正确，只能靠上面的推理，而这也是自己写无锁代码的真实风险。

## [CODE] 完整代码

全部代码约 280 行，一个头文件。`ring_try_*` 是不会阻塞的快路径，`ring_*_wait` 在此基础上加自旋、futex 和超时。

```c
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
```

几个容易忽略的细节，代码里都标了注释：

- **快路径不读时钟。** 我最初在 `ring_push_wait` 开头就计算超时时间，每条消息都要调用一次 `clock_gettime`。挪到第一次要睡时才计算以后，吞吐从 16.4 涨到了 35 以上（百万条/秒），比任何缓存行优化的效果都大。先测量再优化，这是最好的例子。
- **长度只读一次。** 对方进程可能恶意或出错，读两次可能得到不同的值，这是经典的 TOCTOU，所以这里用 `volatile` 只读一次。长度既要和槽位大小比，也要和调用方的缓冲比。
- **mask 和容量不在共享内存里读。** attach 校验后存进私有句柄，之后对方改写头部也不会让下标越界。
- **attach 时全部校验。** `ftruncate` 之前文件大小是 0，这时按预期长度映射再访问，会收到 `SIGBUS`。`magic` 最后写入，对方用 acquire 读到它，才算初始化完成。容量和文件大小也要核对，不能相信头部写的数。

测试覆盖了空、满、超长消息、下标越过 2³²、超时、非法长度、调用方缓冲不足、被改写的 mask、残留的 sleeping 标志、错误的头部，以及两种容量（2 和 1024）下的 200 万条顺序校验，普通构建、ASan + UBSan、TSan 三种方式都通过了。TSan 看不到跨进程的共享内存访问，所以它只跑多线程部分。

## [BENCH] 实测：无锁赢在吞吐，延迟要靠不睡

吞吐测试：两个进程，一个发一个收，每条消息占一个 64 字节槽位，内容 56 字节，容量 1024，共 2000 万条，接收方校验序号。为了减少机器状态漂移的影响，各方式交替运行 11 轮，取中位数。

::: interactive bench-bars title="吞吐（百万条 / 秒，越大越好）" hint="实测" unit="M/s" best="high" note="11 轮的中位数。四分位范围见下方文字。"
| 方式 | 吞吐 |
|---|---|
| 自旋 + 缓存下标 + 对齐 | 45.6 |
| 同一缓存行 + 缓存下标 | 38.8 |
| 对齐，不缓存下标 | 37.1 |
| 同一缓存行，不缓存下标 | 31.4 |
| 自旋 + futex（文中的 wait 版） | 38.5 |
| 互斥锁 + 条件变量 | 6.7 |
| 管道 | 4.7 |
:::

四分位范围（百万条/秒）：自旋加缓存 41.5–50.2，同一缓存行加缓存 35.2–45.4，不缓存 33.4–39.7，同一行不缓存 28.0–36.3，wait 版 35.7–40.0，互斥锁 5.6–7.3，管道 4.7–4.8。

能得出的结论：

- **带 futex 的环形队列，吞吐接近互斥锁的 6 倍，是管道的 8 倍。** 互斥锁版本有串行化和条件变量的唤醒调用，管道每条消息两次系统调用。
- **fence 确实有成本：** wait 版是 38.5，把 fence 去掉后是 46.3（四分位范围 42.3–47.7），也就是每条消息约多 4 纳秒。去掉 fence 的版本不安全，这个数只用来衡量开销。如果批量发送，可以每批只调用一次 `ring_notify`。
- **缓存行对齐和缓存下标都有效果，但不是几倍的差距**。从同一行不缓存（31.4）到对齐加缓存（45.6）提升约四成半，而且单项的四分位范围有重叠。在我的第一轮非交替测试里，同一配置的中位数差了近 30%，所以小差异不要当真。

延迟测试：两个进程乒乓，共 20 万次往返，一次往返时间的一半算单向延迟。这个场景下每条消息之后对方都没活干，正好考验等待方式。

::: interactive bench-bars title="单向延迟（纳秒，越小越好）" hint="实测" unit="ns" best="low" scale="log" note="7 轮的中位数。"
| 方式 | p50 | p99 |
|---|---|---|
| 环形队列，一直自旋 | 78 | 127 |
| 环形队列，先自旋再 futex | 94 | 136 |
| 环形队列，每次都 futex 睡 | 15004 | 24666 |
| 管道 | 14914 | 25412 |
| 互斥锁 + 条件变量 | 15154 | 26390 |

:::

这张图是全文最重要的一组数据：

::: quote
只要每条消息都要睡眠和唤醒，无锁队列和管道*一样慢*。
:::

94 纳秒和 15 微秒差了约 160 倍，这个差距来自**等待方式**，和有没有锁无关。一旦要睡，一次唤醒的调度开销远大于锁和拷贝。「先自旋再 futex」的 p50 和纯自旋只差十几纳秒，因为往返够快时对方在自旋阶段就等到了，只有真正空闲时才睡。这也是这种混合方式最值得默认选用的原因。

虚拟机可能放大唤醒开销，15 微秒不能当成开发板上的数字，这种量级关系换到别的硬件上也要重新测。纯自旋的代价也要记住：测试时两个核一直是 100% 占用。

## [CRASH] 进程死了怎么办

共享内存不会随进程退出而恢复，对方死了也不会有任何通知。这是这种方式和 socket 相比最大的短板。先看这条队列在崩溃时的行为：

| 崩溃时机 | 结果 |
|---|---|
| 生产者写了槽位，还没更新 `tail` | 这条消息从未发布，消费者看不到，也没有损坏 |
| 消费者拷贝完数据，还没更新 `head` | 这条消息还没处理，新消费者会重新读到它，不算重复 |
| 消费者更新了 `head`，还没处理完 | 这条消息丢了：最多一次 |
| 任一方睡着时死掉，`sleeping` 留着 1 | 对方每发一条都多一次无用的 `futex_wake`，新进程 open 时清掉 |

因为发布只有一次原子写，所以**不存在写了一半的中间状态**，这是相比互斥锁保护的复杂结构最大的优势。至于语义是至少一次还是最多一次，取决于 `head` 是在处理前还是处理后更新。上面的代码拷贝后就更新，处理前崩溃会丢这一条，属于最多一次。要至少一次，就处理完再更新 `head`，这时如果处理完、提交前崩溃，新消费者会重复处理这一条。

我测试了消费者被 `SIGKILL` 的场景：

```text
killed consumer: producer timed out, head=184 tail=200
ok crash, re-attach, sequence continues
```

生产者写满 16 个槽位后，每次等待都返回 `-ETIMEDOUT`，不会挂死。新消费者 attach 后从 `head=184` 接着读，序号连续。**这依赖于所有等待都有超时**，否则生产者看起来只是「很安静」。

超时只说明对方慢，不说明对方死了。要准确地发现对端退出，常用这几种办法：

- 再建一条 Unix 域 socket，对端退出时能读到 EOF。这条连接还能用 `SCM_RIGHTS` 传递共享内存的 fd。
- 在共享内存里放心跳计数，定期检查。
- 用 `pidfd_open` 监视对方进程。

还有两条规则：SPSC 的假设必须由外部保证，旧消费者没有确认死亡之前，不能启动新消费者，否则两个写者同时写 `head`，队列就坏了；另外，共享内存对象会一直留到 `shm_unlink` 或者重启，启动方要负责清理上一次的残留。

## [MP] 多个生产者时，才需要 CAS

如果有多个生产者，`tail` 就有了多个写者。常见的 Dmitry Vyukov 有界 MPMC 队列给每个槽位加了一个序号，表示这个槽位现在轮到谁：

```c
struct mpmc_cell {
    _Atomic uint64_t seq; // 这个槽位现在轮到谁
    uint64_t value;
};

static inline bool mpmc_push(struct mpmc *q, uint64_t v) {
    uint64_t pos = atomic_load_explicit(&q->enq, memory_order_relaxed);
    for (;;) {
        struct mpmc_cell *c = &q->cells[pos & q->mask];
        uint64_t seq = atomic_load_explicit(&c->seq, memory_order_acquire);
        int64_t diff = (int64_t)seq - (int64_t)pos;
        if (diff == 0) { // 槽位空闲，抢这个位置
            if (atomic_compare_exchange_weak_explicit(&q->enq, &pos, pos + 1,
                    memory_order_relaxed, memory_order_relaxed)) {
                c->value = v;
                atomic_store_explicit(&c->seq, pos + 1, memory_order_release);
                return true;
            }
        } else if (diff < 0) { // 这一圈的消费者还没取走：满了
            return false;
        } else { // 别人抢先了，重新读
            pos = atomic_load_explicit(&q->enq, memory_order_relaxed);
        }
    }
}
```

每次操作一次 CAS，发布分两步：先用 CAS 抢位置，写完数据后再把序号改成可读。我的 C11 版在 4 生产者 4 消费者下测试了 200 万条，每条恰好被取走一次，TSan 也没有报告。

这里有两个代价要清楚：

- **竞争回来了。** `enq` 变成多方争抢的缓存行，生产者越多越慢。所以很多系统宁可给每个生产者一条 SPSC，让消费者轮询多条队列，LMAX Disruptor 这类设计也强调尽量让一份数据只有一个写者。
- **它不是严格意义的无锁。** 作者的文章自己也说明了这一点：生产者抢到位置后如果被杀或者长时间不被调度，这个槽位永远不会变成可读，消费者会一直卡在这里，尽管后面的槽位已经写好了。跨进程使用时，这是必须考虑的崩溃场景，SPSC 则不存在这个问题。

「无锁」在严格定义里是一种进度保证：任何线程停下来，都不会阻止其他线程前进。没有用 mutex 不等于无锁。

## [DESIGN] 真正落地还要决定什么

队列本身写完以后，一个 IPC 通道还有下面这些设计决定：

::: ledger
- **满了怎么办** 阻塞、丢新的、丢旧的，要由业务决定。传感器数据通常可以丢旧的，控制命令不能丢。SPSC 里丢旧的并不简单，生产者不能写 `head`，需要带序号的覆盖式设计。
- **变长消息** 用「长度头 + 数据」，尾部放不下时写一个跳转标记回到开头。另一种办法是把同一块物理内存连续映射两次，让回绕变得连续。
- **大数据** 不要在环里拷贝，环里只传句柄或偏移，数据放进内存池或 dma-buf，并约定谁释放。环形队列是控制面，内存池是数据面。
- **零拷贝接口** 把 `push` 拆成 `reserve` 和 `commit`，直接在槽位上构造数据，代价是调用方要遵守所有权规则。
- **版本兼容** 头部放 `magic`、`version`、槽位大小，attach 时检查。在线升级时新老进程可能同时存在。
- **安全边界** 对方不可信时，读到的任何东西都要校验，长度只读一次。可以用 `memfd_create` 配合封印（seal）防止对方缩小文件；能只读映射的一方就只读映射。
- **实时性** `MAP_POPULATE` 或提前写一遍，避免第一次访问时缺页；`mlock` 防止被换出；线程绑核。
- **可观测性** 统计丢弃数、等待次数、最大积压，放在共享内存里，不用打扰对方就能看到。没有这些数据，线上出现积压时无从查起。
:::

选型时可以按这个顺序判断：

1. 消息不多，对微秒级延迟也不敏感？**不用共享内存，用 Unix 域 socket**。简单、有背压、能发现对端退出。
2. 数据量大？**共享内存放数据，socket 传通知和句柄**。
3. 实测确实卡在吞吐或延迟上，而且能绑核？**SPSC 环形队列加自旋**。
4. 多个写者？**优先多条 SPSC**，确实不行再用 MPMC，并想清楚生产者崩溃的处理。

## [NOTE] 结论与速查

::: lessons
1. **无锁的核心是单写者。** 让每个变量只有一方写，大部分同步问题就消失了，连 CAS 都不需要。
2. **x86 上很难测出内存序的错误。** 写错了经常照样通过测试，要靠推理和 TSan，上 ARM 必须重新验证。
3. **延迟差距来自等待，不来自锁。** 这组实测里，每次都睡眠和唤醒，比先自旋的延迟高约 160 倍。
4. **先测量再优化。** 一次 `clock_gettime` 的影响，超过了所有缓存行优化的总和。
5. **共享内存的难点在失败路径。** 所有等待都要有超时，所有读到的值都要校验，发布只能有一次原子写。
:::

| 概念 | 一句话 |
|---|---|
| release / acquire | 配对使用，读到新值就能看到它之前写的所有数据 |
| seq_cst fence | 挡住「先写后读」的重排，防丢失唤醒要靠它 |
| CAS | 多方竞争写同一个变量时才需要 |
| futex | 比较值后再睡，等待队列在内核，快路径不进内核 |
| 伪共享 | 不同的核写同一条缓存行上的不同变量 |
| 自由递增下标 | 只在访问时取模，空和满不再混淆 |
| robust mutex | 持锁者死了能拿到 `EOWNERDEAD`，数据恢复还要自己做 |
| 严格无锁 | 任何线程停下，都不妨碍其他线程前进 |

## [REF] 参考

- [`FUTEX_WAIT(2const)`](https://man7.org/linux/man-pages/man2/FUTEX_WAIT.2const.html)：比较和入睡的原子性、防丢失唤醒的目的、`EAGAIN`、虚假唤醒、相对超时；[`futex(2)`](https://man7.org/linux/man-pages/man2/futex.2.html)：32 位字、`FUTEX_PRIVATE_FLAG`、跨进程放在共享内存
- Ulrich Drepper，《[Futexes Are Tricky](https://www.akkadia.org/drepper/futex.pdf)》
- [`pthread_mutexattr_setrobust(3)`](https://man7.org/linux/man-pages/man3/pthread_mutexattr_setrobust.3.html)、[`shm_overview(7)`](https://man7.org/linux/man-pages/man7/shm_overview.7.html)、[`memfd_create(2)`](https://man7.org/linux/man-pages/man2/memfd_create.2.html)、[`eventfd(2)`](https://man7.org/linux/man-pages/man2/eventfd.2.html)
- [cppreference：memory_order](https://en.cppreference.com/w/c/atomic/memory_order)、[Linux 内核 memory-barriers.txt](https://www.kernel.org/doc/Documentation/memory-barriers.txt)
- Erik Rigtorp，《[Optimizing a ring buffer for throughput](https://rigtorp.se/ringbuffer/)》：缓存对方下标
- Dmitry Vyukov，《[Bounded MPMC queue](https://web.archive.org/web/20240112144100/https://www.1024cores.net/home/lock-free-algorithms/queues/bounded-mpmc-queue)》（原站域名已失效，这里链接的是互联网档案馆的存档）；[rigtorp/MPMCQueue](https://github.com/rigtorp/MPMCQueue)
- [LMAX Disruptor 技术论文](https://lmax-exchange.github.io/disruptor/disruptor.html)：单写者原则、伪共享；[Linux `kfifo`](https://github.com/torvalds/linux/blob/master/include/linux/kfifo.h)：内核里的单生产者单消费者环形缓冲
- 耗时和卡顿次数来自我写的测试程序，运行环境见开头。内存序和丢失唤醒的演示组件是图解，展示的是标准允许发生的一种执行顺序。
