// robust.c：持锁进程被杀之后，别的进程还能不能拿到锁
#define _GNU_SOURCE
#include <errno.h>
#include <pthread.h>
#include <signal.h>
#include <stdio.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

static void try_case(int robust) {
    pthread_mutex_t *mu = mmap(NULL, sizeof *mu, PROT_READ | PROT_WRITE,
                               MAP_SHARED | MAP_ANONYMOUS, -1, 0);
    pthread_mutexattr_t a;
    pthread_mutexattr_init(&a);
    pthread_mutexattr_setpshared(&a, PTHREAD_PROCESS_SHARED);
    if (robust) pthread_mutexattr_setrobust(&a, PTHREAD_MUTEX_ROBUST);
    pthread_mutex_init(mu, &a);

    pid_t pid = fork();
    if (pid == 0) {
        pthread_mutex_lock(mu);
        raise(SIGKILL); // 拿着锁死掉
    }
    waitpid(pid, NULL, 0);

    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);
    ts.tv_sec += 1;
    int rc = pthread_mutex_timedlock(mu, &ts);
    printf("%s: timedlock -> %s\n", robust ? "robust" : "default", strerror(rc));
    if (rc == EOWNERDEAD) { // 拿到锁了，但保护的数据可能只改了一半
        pthread_mutex_consistent(mu);
        pthread_mutex_unlock(mu);
    }
}

int main(void) {
    try_case(0);
    try_case(1);
    return 0;
}
