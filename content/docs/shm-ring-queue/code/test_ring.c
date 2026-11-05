// test_ring.c：边界、回绕、超时、跨线程顺序、进程崩溃恢复
#define _GNU_SOURCE
#include "ring.h"
#include <pthread.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/wait.h>

#define CHECK(c) do { if (!(c)) { fprintf(stderr, "FAIL %s:%d %s\n", __FILE__, __LINE__, #c); abort(); } } while (0)

static struct ring *anon_ring(uint32_t cap) {
    size_t size = (ring_bytes(cap) + CACHELINE - 1) / CACHELINE * CACHELINE;
    void *p = aligned_alloc(CACHELINE, size);
    CHECK(p);
    memset(p, 0, size);
    ring_init(p, cap);
    return p;
}

static void test_boundary(void) {
    struct ring *r = anon_ring(4);
    struct ring_tx tx; struct ring_rx rx;
    ring_tx_open(&tx, r); ring_rx_open(&rx, r);
    uint32_t v, n;
    CHECK(ring_try_pop(&rx, &v, sizeof v, &n) == 0);
    for (uint32_t i = 0; i < 4; i++) CHECK(ring_try_push(&tx, &i, sizeof i));
    v = 9; CHECK(!ring_try_push(&tx, &v, sizeof v));
    for (uint32_t i = 0; i < 4; i++) {
        CHECK(ring_try_pop(&rx, &v, sizeof v, &n) == 1);
        CHECK(v == i && n == sizeof v);
    }
    CHECK(ring_try_pop(&rx, &v, sizeof v, &n) == 0);
    uint8_t big[RING_PAYLOAD + 1] = {0};
    CHECK(!ring_try_push(&tx, big, sizeof big));
    CHECK(ring_push_wait(&tx, big, sizeof big, 1) == -EMSGSIZE);
    free(r);
    puts("ok boundary: empty, full, oversize");
}

static void test_wrap(void) {
    struct ring *r = anon_ring(8);
    const uint32_t start = UINT32_MAX - 20;
    atomic_store(&r->head, start); atomic_store(&r->tail, start);
    struct ring_tx tx; struct ring_rx rx;
    ring_tx_open(&tx, r); ring_rx_open(&rx, r);
    uint32_t out = 0, n;
    for (uint32_t i = 0; i < 1000; i++) {
        for (uint32_t k = 0; k < (i % 8) + 1; k++) {
            uint32_t v = i * 100 + k;
            CHECK(ring_try_push(&tx, &v, sizeof v));
        }
        for (uint32_t k = 0; k < (i % 8) + 1; k++) {
            CHECK(ring_try_pop(&rx, &out, sizeof out, &n) == 1);
            CHECK(out == i * 100 + k);
        }
    }
    CHECK(tx.tail < 100000); // 确实越过了 2^32
    free(r);
    puts("ok index wraps past 2^32");
}

static void test_timeout(void) {
    struct ring *r = anon_ring(2);
    struct ring_tx tx; struct ring_rx rx;
    ring_tx_open(&tx, r); ring_rx_open(&rx, r);
    uint32_t v = 1, n;
    int64_t t0 = now_ns();
    CHECK(ring_pop_wait(&rx, &v, sizeof v, &n, 50) == -ETIMEDOUT);
    int64_t ms = (now_ns() - t0) / 1000000;
    CHECK(ms >= 50 && ms < 500);
    CHECK(ring_try_push(&tx, &v, sizeof v) && ring_try_push(&tx, &v, sizeof v));
    CHECK(ring_push_wait(&tx, &v, sizeof v, 50) == -ETIMEDOUT);
    free(r);
    puts("ok wait returns -ETIMEDOUT");
}

static void test_bad_len(void) {
    struct ring *r = anon_ring(2);
    struct ring_tx tx; struct ring_rx rx;
    ring_tx_open(&tx, r); ring_rx_open(&rx, r);
    uint32_t v = 1, n;
    CHECK(ring_try_push(&tx, &v, sizeof v));
    r->slots[0].len = 0xFFFFFFFF; // 模拟对方写坏
    uint8_t out[RING_PAYLOAD];
    CHECK(ring_try_pop(&rx, out, sizeof out, &n) == -EBADMSG);
    free(r);
    puts("ok reject bad length");
}

// 对端发来的消息比调用方的缓冲大：拒绝，消息留在队列里，不写越界
static void test_small_buffer(void) {
    struct ring *r = anon_ring(2);
    struct ring_tx tx; struct ring_rx rx;
    ring_tx_open(&tx, r); ring_rx_open(&rx, r);
    uint64_t v = 7, big = 0;
    uint32_t small = 0, n;
    CHECK(ring_try_push(&tx, &v, sizeof v));
    CHECK(ring_try_pop(&rx, &small, sizeof small, &n) == -EMSGSIZE);
    CHECK(small == 0);
    CHECK(ring_try_pop(&rx, &big, sizeof big, &n) == 1 && big == 7);
    free(r);
    puts("ok reject message larger than caller buffer");
}

// 对端改写共享头部里的 mask：句柄用自己存的那份，下标仍在界内
static void test_hostile_mask(void) {
    struct ring *r = anon_ring(4);
    struct ring_tx tx; struct ring_rx rx;
    ring_tx_open(&tx, r); ring_rx_open(&rx, r);
    r->mask = 0xFFFFFFFF;
    r->capacity = 0xFFFFFFFF;
    uint32_t v = 3, out = 0, n;
    for (uint32_t i = 0; i < 4; i++) CHECK(ring_try_push(&tx, &v, sizeof v));
    CHECK(!ring_try_push(&tx, &v, sizeof v));
    CHECK(ring_try_pop(&rx, &out, sizeof out, &n) == 1 && out == 3);
    free(r);
    puts("ok handle ignores rewritten mask and capacity");
}

// 上一任消费者睡着时死掉，sleeping 留着 1；重新 open 后要清掉
static void test_reopen_clears_sleeping(void) {
    struct ring *r = anon_ring(2);
    atomic_store(&r->cons_sleeping, 1);
    atomic_store(&r->prod_sleeping, 1);
    struct ring_tx tx; struct ring_rx rx;
    ring_rx_open(&rx, r);
    CHECK(atomic_load(&r->cons_sleeping) == 0);
    ring_tx_open(&tx, r);
    CHECK(atomic_load(&r->prod_sleeping) == 0);
    free(r);
    puts("ok reopen clears stale sleeping flag");
}

#define N_MSGS 2000000u
struct msg { uint64_t seq, check; };
#define MIX 0x9E3779B97F4A7C15ull

static void *producer(void *arg) {
    struct ring_tx tx;
    ring_tx_open(&tx, arg);
    for (uint64_t i = 0; i < N_MSGS; i++) {
        struct msg m = { i, i * MIX };
        CHECK(ring_push_wait(&tx, &m, sizeof m, 5000) == 0);
    }
    return NULL;
}

static void test_threads(uint32_t cap) {
    struct ring *r = anon_ring(cap);
    struct ring_rx rx;
    ring_rx_open(&rx, r);
    pthread_t th;
    pthread_create(&th, NULL, producer, r);
    for (uint64_t i = 0; i < N_MSGS; i++) {
        struct msg m; uint32_t n;
        CHECK(ring_pop_wait(&rx, &m, sizeof m, &n, 5000) == 0);
        CHECK(n == sizeof m && m.seq == i && m.check == i * MIX);
    }
    pthread_join(th, NULL);
    free(r);
    printf("ok threads cap=%u msgs=%u in order\n", cap, N_MSGS);
}

// 消费者被 SIGKILL 后：生产者只会超时，不会挂死；新消费者接着读，序号连续
static void test_crash(void) {
    const char *name = "/ring_test_crash";
    shm_unlink(name);
    struct ring *r = ring_create(name, 16);
    CHECK(r);
    struct ring_tx tx;
    ring_tx_open(&tx, r);
    pid_t pid = fork();
    if (pid == 0) {
        struct ring *c = ring_attach(name, 1000);
        struct ring_rx rx;
        CHECK(c);
        ring_rx_open(&rx, c);
        for (;;) { // 读得很慢，等着被杀
            uint64_t v; uint32_t n;
            CHECK(ring_pop_wait(&rx, &v, sizeof v, &n, 5000) == 0);
            struct timespec ts = { 0, 1000000 };
            nanosleep(&ts, NULL);
        }
    }
    uint64_t seq = 0;
    while (seq < 200) { CHECK(ring_push_wait(&tx, &seq, sizeof seq, 2000) == 0); seq++; }
    kill(pid, SIGKILL);
    waitpid(pid, NULL, 0);
    int rc;
    while ((rc = ring_push_wait(&tx, &seq, sizeof seq, 100)) == 0) seq++;
    CHECK(rc == -ETIMEDOUT);
    uint32_t h = atomic_load(&r->head);
    printf("killed consumer: producer timed out, head=%u tail=%u\n", h, atomic_load(&r->tail));

    pid = fork();
    if (pid == 0) {
        struct ring *c = ring_attach(name, 1000);
        struct ring_rx rx;
        CHECK(c);
        ring_rx_open(&rx, c);
        uint64_t expect = h, v; uint32_t n;
        for (int i = 0; i < 16; i++) {
            CHECK(ring_pop_wait(&rx, &v, sizeof v, &n, 1000) == 0);
            CHECK(v == expect);
            expect++;
        }
        _exit(0);
    }
    int st;
    waitpid(pid, &st, 0);
    CHECK(WIFEXITED(st) && WEXITSTATUS(st) == 0);
    shm_unlink(name);
    munmap(r, ring_bytes(16));
    puts("ok crash, re-attach, sequence continues");
}

static void test_attach_reject(void) {
    const char *name = "/ring_test_bad";
    shm_unlink(name);
    struct ring *r = ring_create(name, 8);
    CHECK(r);
    r->capacity = 7;
    errno = 0;
    CHECK(ring_attach(name, 50) == NULL && errno == EPROTO);
    r->capacity = 1u << 20; r->mask = r->capacity - 1;
    errno = 0;
    CHECK(ring_attach(name, 50) == NULL && errno == EPROTO);
    r->capacity = 8; r->mask = 7; r->version = 99;
    errno = 0;
    CHECK(ring_attach(name, 50) == NULL && errno == EPROTO);
    CHECK(ring_create("/ring_bad_cap", 7) == NULL && errno == EINVAL);
    CHECK(ring_attach("/ring_test_missing", 20) == NULL);
    shm_unlink(name);
    munmap(r, ring_bytes(8));
    puts("ok attach rejects bad header");
}

int main(int argc, char **argv) {
    (void)argv;
    test_boundary();
    test_wrap();
    test_timeout();
    test_bad_len();
    test_small_buffer();
    test_hostile_mask();
    test_reopen_clears_sleeping();
    test_attach_reject();
    test_threads(2);
    test_threads(1024);
    if (argc < 2) test_crash(); // TSan 下不跑 fork 用例
    return 0;
}
