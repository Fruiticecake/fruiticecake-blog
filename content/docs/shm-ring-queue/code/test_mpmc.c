// test_mpmc.c：4 生产者 4 消费者，每条消息必须恰好被取走一次
#define _GNU_SOURCE
#include "mpmc.h"
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define P 4
#define C 4
#define PER_P 500000ull
#define CAP 1024
static struct mpmc *q;
static _Atomic uint8_t *seen;
static _Atomic uint64_t done;

static void *prod(void *arg) {
    uint64_t id = (uint64_t)(uintptr_t)arg;
    for (uint64_t i = 0; i < PER_P; i++) {
        uint64_t v = id * PER_P + i;
        while (!mpmc_push(q, v)) {}
    }
    return NULL;
}

static void *cons(void *arg) {
    (void)arg;
    uint64_t v;
    while (atomic_load(&done) < P * PER_P) {
        if (mpmc_pop(q, &v)) {
            if (atomic_fetch_add(&seen[v], 1) != 0) { fprintf(stderr, "dup %llu\n", (unsigned long long)v); abort(); }
            atomic_fetch_add(&done, 1);
        }
    }
    return NULL;
}

int main(void) {
    q = aligned_alloc(MPMC_LINE, (sizeof(struct mpmc) + CAP * sizeof(struct mpmc_cell) + MPMC_LINE - 1) / MPMC_LINE * MPMC_LINE);
    seen = calloc(P * PER_P, 1);
    mpmc_init(q, CAP);
    // 空和满的边界
    uint64_t v;
    if (mpmc_pop(q, &v)) abort();
    for (uint64_t i = 0; i < CAP; i++) if (!mpmc_push(q, i)) abort();
    if (mpmc_push(q, 9)) abort();
    for (uint64_t i = 0; i < CAP; i++) if (!mpmc_pop(q, &v) || v != i) abort();
    pthread_t pt[P], ct[C];
    for (int i = 0; i < C; i++) pthread_create(&ct[i], NULL, cons, NULL);
    for (int i = 0; i < P; i++) pthread_create(&pt[i], NULL, prod, (void *)(uintptr_t)i);
    for (int i = 0; i < P; i++) pthread_join(pt[i], NULL);
    for (int i = 0; i < C; i++) pthread_join(ct[i], NULL);
    for (uint64_t i = 0; i < P * PER_P; i++) if (atomic_load(&seen[i]) != 1) { fprintf(stderr, "lost %llu\n", (unsigned long long)i); abort(); }
    printf("ok mpmc %dP%dC msgs=%llu exactly once\n", P, C, (unsigned long long)(P * PER_P));
    return 0;
}
