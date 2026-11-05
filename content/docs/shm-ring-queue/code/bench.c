// bench.c：两个进程之间传 64 字节槽位消息，比较吞吐和往返延迟
// 用法：bench tput|lat <方式> [绑核A 绑核B]
#define _GNU_SOURCE
#include "ring.h"
#include <pthread.h>
#include <sched.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/wait.h>

#define CAP 1024u
#define TPUT_N 20000000ull
#define LAT_N 200000
#define PAYLOAD 56
#define TIMEOUT_MS 10000

static void pin(int cpu) {
    cpu_set_t s;
    CPU_ZERO(&s);
    CPU_SET(cpu, &s);
    if (sched_setaffinity(0, sizeof s, &s) != 0) { perror("affinity"); exit(1); }
}

static void *shared(size_t size) {
    void *p = mmap(NULL, size, PROT_READ | PROT_WRITE, MAP_SHARED | MAP_ANONYMOUS, -1, 0);
    if (p == MAP_FAILED) { perror("mmap"); exit(1); }
    return p;
}

/* ---------- 对照组：进程共享的 mutex + cond 环形队列 ---------- */

struct mq {
    pthread_mutex_t mu;
    pthread_cond_t not_empty, not_full;
    uint32_t head, tail;
    struct ring_slot slots[CAP];
};

static struct mq *mq_new(void) {
    struct mq *q = shared(sizeof *q);
    pthread_mutexattr_t ma;
    pthread_condattr_t ca;
    pthread_mutexattr_init(&ma);
    pthread_mutexattr_setpshared(&ma, PTHREAD_PROCESS_SHARED);
    pthread_condattr_init(&ca);
    pthread_condattr_setpshared(&ca, PTHREAD_PROCESS_SHARED);
    pthread_mutex_init(&q->mu, &ma);
    pthread_cond_init(&q->not_empty, &ca);
    pthread_cond_init(&q->not_full, &ca);
    return q;
}

static void mq_push(struct mq *q, const void *m, uint32_t n) {
    pthread_mutex_lock(&q->mu);
    while (q->tail - q->head == CAP) pthread_cond_wait(&q->not_full, &q->mu);
    struct ring_slot *s = &q->slots[q->tail & (CAP - 1)];
    s->len = n;
    memcpy(s->data, m, n);
    q->tail++;
    pthread_cond_signal(&q->not_empty);
    pthread_mutex_unlock(&q->mu);
}

static void mq_pop(struct mq *q, void *m, uint32_t *n) {
    pthread_mutex_lock(&q->mu);
    while (q->tail == q->head) pthread_cond_wait(&q->not_empty, &q->mu);
    struct ring_slot *s = &q->slots[q->head & (CAP - 1)];
    *n = s->len;
    memcpy(m, s->data, s->len);
    q->head++;
    pthread_cond_signal(&q->not_full);
    pthread_mutex_unlock(&q->mu);
}

/* ---------- 统一的单向通道 ---------- */

enum kind { K_SPIN, K_WAIT, K_MUTEX, K_PIPE };
struct chan {
    enum kind k;
    struct ring *r;
    struct ring_tx tx;
    struct ring_rx rx;
    struct mq *q;
    int fd[2];
};

static void chan_new(struct chan *c, enum kind k) {
    memset(c, 0, sizeof *c);
    c->k = k;
    if (k == K_SPIN || k == K_WAIT) {
        c->r = shared(ring_bytes(CAP));
        ring_init(c->r, CAP);
        ring_tx_open(&c->tx, c->r);
        ring_rx_open(&c->rx, c->r);
    } else if (k == K_MUTEX) {
        c->q = mq_new();
    } else {
        if (pipe(c->fd) != 0) { perror("pipe"); exit(1); }
    }
}

static inline void chan_send(struct chan *c, const void *m, uint32_t n) {
    switch (c->k) {
    case K_SPIN:
        while (!ring_try_push(&c->tx, m, n)) cpu_relax();
        break;
    case K_WAIT:
        if (ring_push_wait(&c->tx, m, n, TIMEOUT_MS) != 0) { fputs("push timeout\n", stderr); exit(2); }
        break;
    case K_MUTEX:
        mq_push(c->q, m, n);
        break;
    case K_PIPE:
        if (write(c->fd[1], m, n) != (ssize_t)n) { perror("write"); exit(2); }
        break;
    }
}

static inline void chan_recv(struct chan *c, void *m, uint32_t n) {
    uint32_t got;
    switch (c->k) {
    case K_SPIN:
        while (ring_try_pop(&c->rx, m, n, &got) != 1) cpu_relax();
        break;
    case K_WAIT:
        if (ring_pop_wait(&c->rx, m, n, &got, TIMEOUT_MS) != 0) { fputs("pop timeout\n", stderr); exit(2); }
        break;
    case K_MUTEX:
        mq_pop(c->q, m, &got);
        break;
    case K_PIPE: {
        size_t left = n;
        char *p = m;
        while (left) {
            ssize_t k = read(c->fd[0], p, left);
            if (k <= 0) { perror("read"); exit(2); }
            p += k; left -= (size_t)k;
        }
        break;
    }
    }
}

static enum kind parse(const char *s) {
    if (!strcmp(s, "spin")) return K_SPIN;
    if (!strcmp(s, "wait")) return K_WAIT;
    if (!strcmp(s, "mutex")) return K_MUTEX;
    if (!strcmp(s, "pipe")) return K_PIPE;
    fprintf(stderr, "unknown kind %s\n", s);
    exit(1);
}

static void tput(enum kind k, int a, int b) {
    struct chan c;
    chan_new(&c, k);
    pid_t pid = fork();
    if (pid == 0) {
        pin(b);
        uint64_t m[PAYLOAD / 8];
        for (uint64_t i = 0; i < TPUT_N; i++) {
            chan_recv(&c, m, PAYLOAD);
            if (m[0] != i) { fprintf(stderr, "order broken at %llu\n", (unsigned long long)i); _exit(3); }
        }
        _exit(0);
    }
    pin(a);
    uint64_t m[PAYLOAD / 8] = {0};
    int64_t t0 = now_ns();
    for (uint64_t i = 0; i < TPUT_N; i++) { m[0] = i; chan_send(&c, m, PAYLOAD); }
    int st;
    waitpid(pid, &st, 0);
    int64_t dt = now_ns() - t0;
    if (!WIFEXITED(st) || WEXITSTATUS(st)) { fputs("child failed\n", stderr); exit(4); }
    printf("%.2f\n", (double)TPUT_N * 1e3 / (double)dt); // 百万条/秒
}

static int cmp(const void *x, const void *y) {
    int64_t a = *(const int64_t *)x, b = *(const int64_t *)y;
    return (a > b) - (a < b);
}

static void lat(enum kind k, int a, int b) {
    struct chan ping, pong;
    chan_new(&ping, k);
    chan_new(&pong, k);
    pid_t pid = fork();
    if (pid == 0) {
        pin(b);
        uint64_t m[8 / 8];
        for (int i = 0; i < LAT_N; i++) { chan_recv(&ping, m, 8); chan_send(&pong, m, 8); }
        _exit(0);
    }
    pin(a);
    int64_t *rtt = malloc(sizeof(int64_t) * LAT_N);
    uint64_t m[1] = {0};
    for (int i = 0; i < LAT_N; i++) {
        int64_t t0 = now_ns();
        chan_send(&ping, m, 8);
        chan_recv(&pong, m, 8);
        rtt[i] = now_ns() - t0;
    }
    waitpid(pid, NULL, 0);
    qsort(rtt, LAT_N, sizeof *rtt, cmp);
    printf("%.0f %.0f %.0f\n", rtt[LAT_N / 2] / 2.0, rtt[LAT_N * 99 / 100] / 2.0, rtt[LAT_N - 1] / 2.0);
}

int main(int argc, char **argv) {
    if (argc < 3) { fputs("usage: bench tput|lat spin|wait|mutex|pipe [cpuA cpuB]\n", stderr); return 1; }
    int a = argc > 3 ? atoi(argv[3]) : 2, b = argc > 4 ? atoi(argv[4]) : 4;
    if (!strcmp(argv[1], "tput")) tput(parse(argv[2]), a, b);
    else lat(parse(argv[2]), a, b);
    return 0;
}
