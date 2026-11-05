// lost_wake.c：统计「有数据却一直睡」发生了多少次
// RING_SPIN=1 让双方尽快睡。一轮超过 100ms 就算一次卡顿：正常一轮只要几十微秒
#define _GNU_SOURCE
#define RING_SPIN 1
#include "ring.h"
#include <pthread.h>
#include <sched.h>
#include <stdio.h>
#include <stdlib.h>

#ifndef ROUNDS
#define ROUNDS 1000000u
#endif
#define WAIT_MS 200
#define STALL_NS 100000000

static void pin(int cpu) {
    cpu_set_t s;
    CPU_ZERO(&s);
    CPU_SET(cpu, &s);
    sched_setaffinity(0, sizeof s, &s);
}

static void *producer(void *arg) {
    pin(4);
    struct ring_tx tx;
    ring_tx_open(&tx, arg);
    for (uint32_t i = 0; i < ROUNDS; i++) {
        // 变化的小延迟，让生产者和「消费者正要睡」的时刻反复撞上
        for (volatile int k = 0; k < (int)(i % 400); k++) cpu_relax();
        while (ring_push_wait(&tx, &i, sizeof i, WAIT_MS) != 0) {}
    }
    return NULL;
}

int main(void) {
    static alignas(CACHELINE) char mem[4096];
    struct ring *r = (struct ring *)mem;
    ring_init(r, 4);
    pthread_t th;
    pthread_create(&th, NULL, producer, r);
    pin(2);
    struct ring_rx rx;
    ring_rx_open(&rx, r);
    uint32_t stalls = 0;
    int64_t t0 = now_ns();
    for (uint32_t i = 0; i < ROUNDS; i++) {
        uint32_t v, n;
        int64_t a = now_ns();
        while (ring_pop_wait(&rx, &v, sizeof v, &n, WAIT_MS) != 0) {}
        if (now_ns() - a >= STALL_NS) stalls++;
        if (v != i) { fprintf(stderr, "v=%u i=%u\n", v, i); return 1; }
    }
    pthread_join(th, NULL);
    printf("rounds=%u stalls=%u elapsed_ms=%lld\n", ROUNDS, stalls,
           (long long)((now_ns() - t0) / 1000000));
    return 0;
}
