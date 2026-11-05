// mpmc.h：有界 MPMC 队列（Dmitry Vyukov 的序号槽位算法），C11 版
#ifndef MPMC_H
#define MPMC_H
#include <stdalign.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define MPMC_LINE 64

struct mpmc_cell {
    _Atomic uint64_t seq; // 这个槽位现在轮到谁
    uint64_t value;
};

struct mpmc {
    uint64_t mask;
    alignas(MPMC_LINE) _Atomic uint64_t enq;
    alignas(MPMC_LINE) _Atomic uint64_t deq;
    alignas(MPMC_LINE) struct mpmc_cell cells[];
};

static inline void mpmc_init(struct mpmc *q, uint64_t capacity) {
    q->mask = capacity - 1;
    atomic_init(&q->enq, 0);
    atomic_init(&q->deq, 0);
    for (uint64_t i = 0; i < capacity; i++) atomic_init(&q->cells[i].seq, i);
}

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

static inline bool mpmc_pop(struct mpmc *q, uint64_t *v) {
    uint64_t pos = atomic_load_explicit(&q->deq, memory_order_relaxed);
    for (;;) {
        struct mpmc_cell *c = &q->cells[pos & q->mask];
        uint64_t seq = atomic_load_explicit(&c->seq, memory_order_acquire);
        int64_t diff = (int64_t)seq - (int64_t)(pos + 1);
        if (diff == 0) {
            if (atomic_compare_exchange_weak_explicit(&q->deq, &pos, pos + 1,
                    memory_order_relaxed, memory_order_relaxed)) {
                *v = c->value;
                // 标记成下一圈生产者可用
                atomic_store_explicit(&c->seq, pos + q->mask + 1, memory_order_release);
                return true;
            }
        } else if (diff < 0) { // 空，或者生产者抢到位置还没写完
            return false;
        } else {
            pos = atomic_load_explicit(&q->deq, memory_order_relaxed);
        }
    }
}
#endif
