---
title: POSIX 消息队列和 System V 消息队列怎么选：接口、行为差异、实测和代码示例
display_title: "POSIX 还是 System V：[消息队列]怎么选"
date: 2026-11-05
section: docs
summary: "两种消息队列都由内核保存消息，每条都拷两次，实测收发耗时也接近。真正的差别在怎么命名、怎么等待、怎么挑消息、怎么清理。本文给出可运行的 C 示例、实测数据、优缺点和选型顺序。"
tags: [Linux, IPC, 消息队列, POSIX, 嵌入式]
kicker: 技术文档 / Linux · IPC · 消息队列
source: "https://man7.org/linux/man-pages/man7/mq_overview.7.html"
source_label: man-pages · 内核源码 · 实测
design: stage
hero: mq-two-lanes
---

::: tldr
新写的 Linux 代码默认选 **POSIX 消息队列**：它在 Linux 上是 fd，能进 epoll，有带超时的收发和优先级。**System V** 的优势是一个队列按类型分发，以及老系统和老代码都有它。两者的收发路径共用内核同一组函数，实测耗时接近，所以**不要按性能选**。消息超过几 KB，或者要发现对端退出，两种都不合适，分别换共享内存和 Unix 域 socket。
:::

这篇是我的复习笔记。上一篇[《进程间通信到底拷贝了几次》](/docs/linux-ipc-copy.html)比较了各种 IPC 的数据路径，这篇只比较两种消息队列。

文中的代码都实际编译运行过，环境是 x86-64 Ubuntu 24.04（WSL2，内核 5.10）、GCC 13.3、glibc 2.39、i5-12400F。这是虚拟机里的桌面 CPU，耗时数字只用来比较相对差异。接口行为以 man 手册和内核源码为准，出处列在文末。

## [MAP] 先看差别在哪

| 对比项 | POSIX 消息队列 | System V 消息队列 |
|---|---|---|
| 主要接口 | `mq_open` `mq_send` `mq_receive` `mq_close` `mq_unlink` | `msgget` `msgsnd` `msgrcv` `msgctl` |
| 怎么找到队列 | 名字，如 `/demo_cmd` | 整数 key，常用 `ftok` 生成；操作时用 `msgget` 返回的 id |
| 句柄 | `mqd_t`，Linux 上是 fd | 同一 IPC 命名空间内共用的整数 id，**不是 fd** |
| 能否进 epoll | 能（Linux 特性，不可移植） | 不能 |
| 带超时收发 | `mq_timedsend` `mq_timedreceive` | 没有 |
| 到达通知 | `mq_notify` | 没有 |
| 怎么挑消息 | 总是先取最高优先级 | 按 `msgtyp` 取：最早一条、某一类、或不超过某值的最小类型 |
| 接收缓冲区 | 必须不小于队列的 `mq_msgsize` | 不小于这条消息即可，也可以用 `MSG_NOERROR` 截断 |
| 默认容量 | 10 条，单条 8192 字节 | 队列共 16384 字节，单条 8192 字节 |
| 删除 | `mq_unlink` 只删名字，最后一个描述符关闭才销毁 | `msgctl(IPC_RMID)` 立即删除 |
| 查看 | 挂载 mqueue 文件系统后可用 `ls`、`cat`、`rm` | `ipcs -q`、`ipcrm` |
| 链接 | 手册要求 `-lrt` | 不需要额外的库 |

名字容易让人误会：**System V 消息队列也在 POSIX 标准里**。手册把 `msgget`、`msgsnd`、`msgrcv` 的标准写成 POSIX.1 XSI，也就是 POSIX 的 XSI 扩展部分。所以两者都不是 Linux 自己的接口，Linux 只是实现了它们。这里的「POSIX」和「System V」说的是接口出身：System V 来自 AT&T Unix，`mq_*` 来自后来的 POSIX 实时扩展。`mq_overview` 手册的评价是 POSIX 接口设计得更好，但在老系统上不如 System V 普及。

## [POSIX] POSIX 消息队列：像操作文件一样用

下面这个程序创建队列，按优先级 1、5、3 发三条，用 epoll 等待，再全部取出，最后演示超时。

```c
// gcc posix_demo.c -o posix_demo -lrt
#include <errno.h>
#include <fcntl.h>
#include <mqueue.h>
#include <stdio.h>
#include <string.h>
#include <sys/epoll.h>
#include <time.h>
#include <unistd.h>

#define QUEUE_NAME "/demo_cmd"
#define MSG_SIZE   128

int main(void)
{
    struct mq_attr attr = { .mq_maxmsg = 8, .mq_msgsize = MSG_SIZE };
    mqd_t mq = mq_open(QUEUE_NAME, O_CREAT | O_RDWR, 0600, &attr);
    if (mq == (mqd_t)-1) { perror("mq_open"); return 1; }

    /* 按 1、5、3 的优先级发送 */
    mq_send(mq, "log",   4, 1);
    mq_send(mq, "alarm", 6, 5);
    mq_send(mq, "state", 6, 3);

    /* mqd_t 在 Linux 上是 fd，可以和 socket、timerfd 放进同一个 epoll */
    int ep = epoll_create1(0);
    struct epoll_event ev = { .events = EPOLLIN, .data.fd = mq };
    epoll_ctl(ep, EPOLL_CTL_ADD, mq, &ev);
    printf("epoll_wait ready=%d\n", epoll_wait(ep, &ev, 1, 1000));

    /* 接收缓冲区不能小于 mq_msgsize，否则 EMSGSIZE */
    char buf[MSG_SIZE];
    unsigned prio;
    for (int i = 0; i < 3; i++) {
        mq_receive(mq, buf, sizeof(buf), &prio);
        printf("recv prio=%u %s\n", prio, buf);
    }

    /* 超时参数是 CLOCK_REALTIME 的绝对时间 */
    struct timespec deadline;
    clock_gettime(CLOCK_REALTIME, &deadline);
    deadline.tv_sec += 1;
    if (mq_timedreceive(mq, buf, sizeof(buf), NULL, &deadline) == -1)
        printf("timedreceive: %s\n", strerror(errno));

    close(ep);
    mq_close(mq);
    mq_unlink(QUEUE_NAME);   /* 不 unlink，队列会一直留到重启 */
    return 0;
}
```

实际输出：

```text
epoll_wait ready=1
recv prio=5 alarm
recv prio=3 state
recv prio=1 log
timedreceive: Connection timed out
```

发送顺序是 log、alarm、state，取出顺序按优先级变成 alarm、state、log。同一优先级内先进先出。Linux 上优先级范围是 0 到 32767，POSIX 只要求至少支持 0 到 31，要移植就别超过 31。

### 真实场景：一个线程同时等队列和定时器

fd 的价值在这里：一个线程可以同时等消息、socket 和定时器，不用为队列单独开线程。

```c
// gcc posix_loop.c -o posix_loop -lrt
#include <fcntl.h>
#include <mqueue.h>
#include <stdint.h>
#include <stdio.h>
#include <sys/epoll.h>
#include <sys/timerfd.h>
#include <unistd.h>

#define QUEUE_NAME "/demo_loop"

int main(void)
{
    struct mq_attr attr = { .mq_maxmsg = 8, .mq_msgsize = 128 };
    mqd_t mq = mq_open(QUEUE_NAME, O_CREAT | O_RDWR | O_NONBLOCK, 0600, &attr);
    if (mq == (mqd_t)-1) { perror("mq_open"); return 1; }

    /* 定时器用单调时钟，不受系统时间跳变影响 */
    int tfd = timerfd_create(CLOCK_MONOTONIC, 0);
    struct itimerspec period = { .it_value.tv_nsec = 100000000 };   /* 100 ms 后到期一次 */
    timerfd_settime(tfd, 0, &period, NULL);

    int ep = epoll_create1(0);
    struct epoll_event ev = { .events = EPOLLIN, .data.fd = mq };
    epoll_ctl(ep, EPOLL_CTL_ADD, mq, &ev);
    ev.data.fd = tfd;
    epoll_ctl(ep, EPOLL_CTL_ADD, tfd, &ev);

    mq_send(mq, "hello", 6, 0);

    for (int handled = 0; handled < 2; ) {
        int n = epoll_wait(ep, &ev, 1, 1000);
        if (n <= 0) break;
        if (ev.data.fd == mq) {
            char buf[128];
            unsigned prio;
            while (mq_receive(mq, buf, sizeof(buf), &prio) >= 0)   /* 读到 EAGAIN 为止 */
                printf("queue: prio=%u %s\n", prio, buf);
        } else {
            uint64_t expirations;
            if (read(tfd, &expirations, sizeof(expirations)) == sizeof(expirations))
                printf("timer: %llu\n", (unsigned long long)expirations);
        }
        handled++;
    }

    close(tfd);
    close(ep);
    mq_close(mq);
    mq_unlink(QUEUE_NAME);
    return 0;
}
```

```text
queue: prio=0 hello
timer: 1
```

这也绕开了 `mq_timedreceive` 的一个问题：它的超时是 `CLOCK_REALTIME` 的绝对时间，内核源码里就是这样设的，glibc 2.39 的头文件也没有可以换时钟的版本。设备刚对时、系统时间跳变时，等待时长会跟着变。这对没有电池时钟、联网才对时的设备是实际风险。`epoll_wait` 的超时按 `CLOCK_MONOTONIC` 计，不受影响。

## [SYSV] System V 消息队列：一个队列，按类型取

System V 的消息自带一个 `long mtype`。接收方通过 `msgtyp` 决定取哪条，这是 POSIX 没有的能力。

```c
// gcc sysv_demo.c -o sysv_demo
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <sys/ipc.h>
#include <sys/msg.h>

#define TYPE_ALARM 1
#define TYPE_STATE 2
#define TYPE_LOG   3

struct message {
    long mtype;          /* 必须大于 0，不计入 msgsz */
    char text[128];
};

static void put(int q, long type, const char *s)
{
    struct message m = { .mtype = type };
    strcpy(m.text, s);
    if (msgsnd(q, &m, strlen(s) + 1, 0) == -1) perror("msgsnd");
}

static void take(int q, long want)
{
    struct message m;
    ssize_t n = msgrcv(q, &m, sizeof(m.text), want, IPC_NOWAIT);
    if (n == -1) printf("msgtyp=%-3ld %s\n", want, strerror(errno));
    else         printf("msgtyp=%-3ld got type=%ld %s\n", want, m.mtype, m.text);
}

int main(void)
{
    /* 实际项目里两边要约定同一个 key，常用 ftok(路径, 项目号) 生成 */
    int q = msgget(IPC_PRIVATE, IPC_CREAT | 0600);
    if (q == -1) { perror("msgget"); return 1; }

    put(q, TYPE_LOG,   "log");
    put(q, TYPE_ALARM, "alarm");
    put(q, TYPE_STATE, "state");
    put(q, TYPE_LOG,   "log2");

    take(q, TYPE_STATE);  /* >0：只取这一类的第一条 */
    take(q, 0);           /* =0：不挑类型，取最早的一条 */
    take(q, -3);          /* <0：取类型 <=3 中类型值最小的第一条 */
    take(q, 0);
    take(q, 0);           /* 队列已空，IPC_NOWAIT 立刻返回 ENOMSG */

    msgctl(q, IPC_RMID, NULL);   /* 立即删除，阻塞中的读者收到 EIDRM */
    return 0;
}
```

```text
msgtyp=2   got type=2 state
msgtyp=0   got type=3 log
msgtyp=-3  got type=1 alarm
msgtyp=0   got type=3 log2
msgtyp=0   No message of desired type
```

注意方向相反：POSIX 数字大的优先级高，System V 用负的 `msgtyp` 时类型值**小**的先出。

::: interactive pick-order title="同一批消息，不同的取法" hint="MODE / RECEIVE" note="取法规则来自 mq_receive 和 msgrcv 手册，和上面两个程序的输出一致。"
队列里依次有四条消息：log（优先级 1，类型 3）、alarm（优先级 5，类型 1）、state（优先级 3，类型 2）、log2（优先级 1，类型 3）。

| 取法 | 依次取到 |
|---|---|
| POSIX `mq_receive` | alarm、state、log、log2，然后阻塞 |
| System V `msgtyp=0` | log、alarm、state、log2，然后阻塞 |
| System V `msgtyp=2` | state，然后阻塞，尽管队列里还有三条 |
| System V `msgtyp=-3` | alarm、state、log、log2，然后阻塞 |
:::

`msgtyp=2` 那一行值得记住：队列不空也可能一直阻塞，因为等的那一类没有来。

### 真实场景：一个队列上做请求和回复

经典用法是把客户端的 pid 当回复类型。多个客户端共用一个队列，各自只收发给自己的回复。

```c
// gcc sysv_rpc.c -o sysv_rpc
#include <stdio.h>
#include <stdlib.h>
#include <sys/ipc.h>
#include <sys/msg.h>
#include <sys/wait.h>
#include <unistd.h>

#define TYPE_REQUEST 1L          /* 客户端 pid 不会是 1，这个类型留给请求 */

struct request { long mtype; pid_t client; int value; };
struct reply   { long mtype; int result; };

#define PAYLOAD(T) (sizeof(T) - sizeof(long))

static void client(int q, int value)
{
    struct request req = { TYPE_REQUEST, getpid(), value };
    struct reply rep;
    msgsnd(q, &req, PAYLOAD(struct request), 0);
    /* 只收 mtype 等于自己 pid 的回复，不会拿到别的客户端的 */
    msgrcv(q, &rep, PAYLOAD(struct reply), getpid(), 0);
    printf("client: %d -> %d\n", value, rep.result);
}

int main(void)
{
    int q = msgget(IPC_PRIVATE, 0600);
    if (q == -1) { perror("msgget"); return 1; }

    for (int i = 1; i <= 3; i++)
        if (fork() == 0) { client(q, i); exit(0); }

    for (int i = 0; i < 3; i++) {          /* 服务端只收请求 */
        struct request req;
        msgrcv(q, &req, PAYLOAD(struct request), TYPE_REQUEST, 0);
        struct reply rep = { req.client, req.value * 10 };
        msgsnd(q, &rep, PAYLOAD(struct reply), 0);
    }
    while (wait(NULL) > 0) { }

    msgctl(q, IPC_RMID, NULL);
    return 0;
}
```

```text
client: 1 -> 10
client: 3 -> 30
client: 2 -> 20
```

示例为了简短没有检查每个返回值，实际代码要检查。这个模式有一个隐患：请求和回复共用一个队列的字节额度，客户端太多时队列可能被请求占满，服务端发回复也要等，有死锁风险。常见做法是请求和回复各用一个队列。

用 POSIX 做同样的事，要给每个客户端建一个回复队列。多了名字管理，但每条路互不影响。

## [PERF] 性能差不多，因为收发走的是同一组函数

两种队列都是发送时拷进内核、接收时拷出来。查内核源码（v6.6），`ipc/msg.c` 和 `ipc/mqueue.c` 都调用 `ipc/msgutil.c` 里同一个 `load_msg` 和 `store_msg`。数据路径相同，所以不该指望有明显差距，实测也是这样。

两个进程来回传消息，每组 10 万次往返，取 7 组的中位数：

| 消息大小 | POSIX 往返 | System V 往返 |
|---|---|---|
| 64 字节 | 36.1 µs | 37.0 µs |
| 1 KiB | 34.2 µs | 35.0 µs |
| 4 KiB | 33.8 µs | 34.0 µs |
| 8 KiB | 34.0 µs | 34.1 µs |

差距都不到 3%，而且 8 KiB 和 64 字节几乎一样。一次往返的时间主要花在唤醒对方进程上，拷贝这点数据不是主要成本。

单向连续发送时，每条的耗时。这组以 root 运行，把 `msg_qbytes` 设为 10 条消息的字节数，让两边的队列深度都是 10 条：

| 消息大小 | POSIX | System V |
|---|---|---|
| 64 字节 | 1745 ns | 1667 ns |
| 1 KiB | 1583 ns | 1265 ns |
| 4 KiB | 927 ns | 778 ns |
| 8 KiB | 1030 ns | 1072 ns |

这里 System V 在 1 KiB 和 4 KiB 上少 16%～20%，8 KiB 上 POSIX 少 4%，方向并不一致。这种场景的耗时受批量唤醒影响很大，我没有进一步分析原因，这组数字不足以说明哪个更快。

### 真正的差距：队列积压时挑消息

差距出现在按类型或优先级挑消息时。两者的数据结构不同：

- **POSIX** 按优先级组织成红黑树，每个优先级挂一个链表。取最高优先级不用遍历积压的消息（`ipc/mqueue.c` 的 `msg_insert`）。
- **System V** 所有消息在一条链表上，`msgrcv` 按类型查找时从头遍历（`ipc/msg.c` 的 `find_msg`）。

测法：先在队列里积压 N 条低优先级或类型 1 的消息，再反复发一条高优先级或类型 2 的消息并马上取出。下面是一次发送加一次接收的耗时：

::: interactive backlog-cost title="积压越多，按类型取消息越慢" hint="SELECT BACKLOG" note="实测值，条形长度按对数比例。默认配置下 System V 的 16 字节消息最多积压约一千条，POSIX 只有 10 条，表中的积压量是用 root 调大上限后测的。"
| 积压条数 | POSIX（ns） | System V（ns） |
|---|---|---|
| 0 | 277 | 264 |
| 100 | 272 | 411 |
| 1000 | 269 | 2534 |
| 10000 | 278 | 18023 |
| 60000 | 345 | 114488 |
:::

POSIX 基本不变，System V 随积压线性增长。但要看量级：默认 16384 字节的队列，16 字节的消息最多积压约一千条，也就多花 2 µs 左右。只有把队列调得很大又经常积压时，这才是问题。`msgtyp=0` 直接取链表头，也没有这个成本。

## [LIFE] 两者都不会自动清理，差别在怎么删

一个常见的错误说法是「POSIX 队列进程退出就没了」。两者都是**随内核持续**：进程退出后队列和消息都还在，直到被显式删除或者系统重启。下面每一步都实际跑过。

::: interactive queue-life title="队列的一生：进程退出、重启、删除" hint="← →"
| 动作 | POSIX | System V |
|---|---|---|
| 创建队列，发一条消息，进程退出 | 队列和消息都还在。挂载 mqueue 后 `cat` 能看到 `QSIZE:2` | 队列和消息都还在。`ipcs -q` 能看到 1 条 |
| 进程重启，用同样的名字或 key 打开 | 拿到旧队列和旧消息。这时传入的新属性被忽略 | 拿到同一个 id 和旧消息 |
| 有读者阻塞时删除 | `mq_unlink` 只删名字，读者继续等，用旧描述符发的消息它还能收到 | `IPC_RMID` 立即删除，读者马上返回 `EIDRM` |
| 删除后再用旧句柄 | 旧描述符仍可用，直到全部关闭才销毁 | 旧 id 返回 `EINVAL` |
| 用同样的名字或 key 新建 | 是另一个队列，旧描述符发的消息新队列收不到 | 得到新的 id，和旧队列无关 |
:::

这带来两个实际问题：

**异常重启后的旧消息。** 进程崩溃后再启动，可能读到崩溃前的消息，比如一条早已过期的控制命令。启动时要明确策略：丢弃旧消息就先删除再创建；要接着处理就设计成可以重复执行。

**属性不更新。** 我单独测了一次：先建一个 `mq_maxmsg=4, mq_msgsize=128` 的队列，再用 `mq_maxmsg=2, mq_msgsize=64` 打开它，`mq_getattr` 读到的仍是 4 和 128。程序升级后把消息改大，不删旧队列的话，发送就会返回 `EMSGSIZE`，而且只在没重启过的设备上出现。

## [TRAP] 容易踩的坑

### POSIX

- **接收缓冲区要按队列属性开。** 哪怕消息只有 3 字节，缓冲区小于 `mq_msgsize` 也返回 `EMSGSIZE`，消息留在队列里。写法是先 `mq_getattr` 再分配，或者两边共用一个常量。
- **普通用户的上限很低。** 默认 `msg_max` 是 10，`msgsize_max` 是 8192。实测普通用户把 `mq_maxmsg` 设成 11、或把 `mq_msgsize` 设成 8193，`mq_open` 都返回 `EINVAL`。要更大就改 `/proc/sys/fs/mqueue/` 下的值，或者给进程 `CAP_SYS_RESOURCE`。队列数量默认最多 256 个。
- **创建时就占额度。** 手册的 `RLIMIT_MSGQUEUE` 按每个队列的「最大条数 × 单条上限」再加少量内核开销，计入用户的额度。本机默认是 819200 字节，所以队列数量多、单条又设得大时，`mq_open` 会失败，这时队列明明是空的。
- **`mq_notify` 限制多。** 只能注册一个进程，只通知一次，只在队列从空变非空时触发，有线程阻塞在 `mq_receive` 时也不触发。用 epoll 通常更简单。
- **`-lrt`。** 手册要求链接 `librt`。glibc 2.34 之后这些函数并进了 libc，我在 glibc 2.39 上不加也能链接，但交叉编译工具链版本较老时还是要加。
- **内核可能没开。** 依赖 `CONFIG_POSIX_MQUEUE`，裁剪过的内核要确认。
- **`/dev/mqueue` 不一定存在。** 这不影响 `mq_open`，只影响用文件命令查看。我的 WSL 环境就没有挂载。

### System V

- **`msgsz` 不含 `mtype`。** 把 `sizeof(struct message)` 传进去是常见错误，应该传数据部分的长度。
- **`mtype` 必须大于 0。** 否则 `EINVAL`，这也是忘记初始化时常见的现象。
- **`msqid` 不是 fd。** 把它传给 epoll 通常返回 `EBADF`，但数值碰巧等于一个打开的 fd 时会「成功」。我第一次测时 `msqid` 正好是 2，`epoll_ctl` 返回 0，监听的其实是 stderr。这种错不会报错，只是永远等不到消息。
- **没有超时。** 只能用 `IPC_NOWAIT` 轮询，或者靠信号打断（`EINTR`，且不会自动重启）。要同时等别的事件，就得单开一个线程阻塞在 `msgrcv` 上，再转发给主线程。
- **`ftok` 依赖文件。** 它用文件的 inode 和设备号算 key。文件被删除重建后 key 可能变（实测从 `110215c` 变成 `11023b1`，两边进程于是找不到彼此），文件不存在时直接失败。Linux 上只取 inode 低 16 位，不同文件也可能撞 key。固定路径、不会重建的文件才适合，或者干脆约定一个固定的 key。
- **队列按字节计容量。** 默认 16384 字节，实测 8192 字节的消息只放得下 2 条。零长度消息最多 16384 条，因为条数也不能超过这个值。
- **key 可能和别的程序撞车。** 同一 IPC 命名空间内 key 和 id 都是共用的整数，访问控制只靠 `0600` 这样的模式位。

### 两者都有

- **消息只被一个读者取走。** 这不是发布订阅，多个读者竞争同一个队列时，每条只有一个人收到。要广播得给每个订阅者发一份。
- **每条消息拷两次。** 不适合传图像、文件这类大数据，详见[上一篇](/docs/linux-ipc-copy.html)。
- **低优先级可能饿死。** 高优先级的消息一直来，低优先级的就一直取不到。
- **发不出去时会阻塞。** 队列满了，发送方默认阻塞。主控这类不能卡住的线程要用非阻塞发送，并想好满了怎么办：丢弃、合并还是报错。

## [EACH] 优缺点

::: ledger
- [+] **POSIX：fd** Linux 上能进 select、poll、epoll，一个线程统一等待多种事件。
- [+] **POSIX：超时和优先级** 有带超时的收发；优先级是内建的，积压再多取消息也不变慢。
- [+] **POSIX：好管理** 用名字，不需要生成 key；挂载后能用文件命令查看和删除；描述符自动设置 close-on-exec。
- [-] **POSIX：限制** 默认只有 10 条，超过要改系统配置；接收缓冲区必须按属性开；只能按优先级取，不能按类型。
- [-] **POSIX：依赖** 要 `CONFIG_POSIX_MQUEUE`；老工具链要 `-lrt`；epoll 这个能力不可移植。
- [+] **System V：按类型取** 一个队列就能做多路分发和请求回复。
- [+] **System V：覆盖面广** 老系统和老代码都有，不需要额外的库。
- [+] **System V：小消息能排很多条** 容量按字节算，16 字节的消息默认能放约一千条。
- [-] **System V：不是 fd** 不能和其他事件一起等，通常要多一个线程。
- [-] **System V：没有超时和通知** 只能轮询或靠信号。
- [-] **System V：接口旧** `ftok` 依赖文件，id 是共用的整数，结构体要带 `mtype`，`msgsz` 容易传错。
- [-] **System V：按类型取要遍历** 队列调大且积压时，耗时随条数线性增长。
:::

## [PICK] 怎么选：先问要不要用消息队列

选型不是二选一，前面还有几个问题。它们的顺序很重要：大数据和进程内通信根本不该走这两种队列。

::: interactive mq-chooser title="选型：按顺序回答" hint="YES / NO"
| 问题 | 回答「是」时的选择 | 理由 |
|---|---|---|
| 消息经常超过几 KB，或数据量很大？ | 共享内存，配 eventfd 或信号量通知 | 消息队列每条拷两次，默认单条也只有 8 KB |
| 通信的都是同一进程里的线程？ | 进程内队列：互斥锁加条件变量，或 eventfd | 不用进内核拷贝数据，也不受系统级队列数量和残留的影响 |
| 要发现对端退出、传文件描述符，或以后可能跨机器？ | Unix 域 socket，跨机器用 TCP | 对端退出时 read 返回 0，能用 `SCM_RIGHTS` 传 fd；消息队列没有这些 |
| 平台或已有代码只提供 System V？ | System V | 迁移有成本，能用就先用，把它封装起来 |
| 必须让一个队列按类型分给多个接收方，而且不想建多个队列？ | System V | 这是 `msgtyp` 的本职，POSIX 要每个接收方一个队列 |
| 以上都不是 | POSIX 消息队列 | fd、超时、优先级都有，接口也更不容易用错 |
:::

关于「平台限制」，要说清楚限制具体是什么：内核没开选项、C 库没有实现，还是芯片厂的 SDK 只封装了其中一种。这三种的处理方式不同。先检查内核：

```bash
zcat /proc/config.gz | grep -E 'POSIX_MQUEUE|SYSVIPC'   # 需要内核开了 IKCONFIG
ls /proc/sys/fs/mqueue/ /proc/sys/kernel/msgmax          # 文件存在说明对应功能已启用
```

项目里同时存在两种队列也很常见，比如自己的代码用 POSIX，平台提供的库用 System V。这时不必强行统一，把它们封装在适配层后面，上层只看到「发消息」「收消息」就够了。

## [NOTE] 结论与速查

几个容易说错的地方：

| 容易说成 | 准确说法 |
|---|---|
| System V 不是 POSIX 标准 | 它是 POSIX.1 的 XSI 部分，「System V」说的是接口出身 |
| POSIX 消息队列性能更好 | 收发路径共用 `load_msg` 和 `store_msg`，实测往返差距不到 3%；POSIX 优势在积压时挑消息 |
| POSIX 进程退出就清理 | 两者都随内核持续，都要显式删除 |
| POSIX 队列的 fd 能力是标准规定的 | 手册写明这是 Linux 的实现，不可移植 |
| System V 不能设优先级 | 用负的 `msgtyp` 可以按类型值从小到大取，只是有遍历成本 |
| 消息队列能广播 | 每条只被一个读者取走，广播要发多份 |

面试被问到时可以这样答：

> 两种都是内核保存消息、每条拷两次，实测耗时差不多，所以不按性能选。POSIX 用名字打开，Linux 上描述符是 fd，能和 socket、定时器一起进 epoll，有带超时的收发和优先级；缺点是默认只有 10 条，改大要调系统配置。System V 用 key 和 msgtyp，一个队列能按类型分发，老系统都有；缺点是 id 不是 fd，不能进 epoll，也没有超时，通常要单开线程。两者都不会随进程退出清理。新代码我默认选 POSIX，已有平台或要按类型分发时用 System V。消息大了换共享内存，要发现对端退出换 Unix 域 socket。

::: lessons
1. **性能相近时，按等待方式选。**消息怎么等、超时怎么做，对程序结构的影响比几微秒大得多。
2. **能进 epoll 就少一个线程。**少一个线程，也少一处要加锁和转发的地方。
3. **复杂度要结合数据量看。**按类型取消息是线性遍历，但默认容量下也就差 2 µs，先算量级再决定要不要在意。
4. **系统级资源要假设上次没有清理。**队列、共享内存都会留到重启，启动流程要处理旧数据和旧属性。
5. **「受平台限制」要说到具体。**内核、C 库和 SDK 的限制解决办法不同，说清楚了才能判断是否真的只能这样选。
:::

## [REF] 参考

- [`mq_overview(7)`](https://man7.org/linux/man-pages/man7/mq_overview.7.html)：POSIX 队列的上限、fd 实现、持续性、`-lrt`、优先级范围、两种接口的评价
- [`mq_open(3)`](https://man7.org/linux/man-pages/man3/mq_open.3.html)、[`mq_receive(3)`](https://man7.org/linux/man-pages/man3/mq_receive.3.html)、[`mq_notify(3)`](https://man7.org/linux/man-pages/man3/mq_notify.3.html)、[`getrlimit(2)`](https://man7.org/linux/man-pages/man2/getrlimit.2.html)
- [`msgget(2)`](https://man7.org/linux/man-pages/man2/msgget.2.html)、[`msgop(2)`](https://man7.org/linux/man-pages/man2/msgop.2.html)：`msgtyp` 规则、`EIDRM`、`MSGMAX`、`MSGMNB`、XSI 标准；[`msgctl(2)`](https://man7.org/linux/man-pages/man2/msgctl.2.html)、[`ftok(3)`](https://man7.org/linux/man-pages/man3/ftok.3.html)
- [`epoll_wait(2)`](https://man7.org/linux/man-pages/man2/epoll_wait.2.html)：超时按 `CLOCK_MONOTONIC` 计
- Linux 源码 v6.6：[`ipc/msgutil.c`](https://github.com/torvalds/linux/blob/v6.6/ipc/msgutil.c)（`load_msg`、`store_msg`）、[`ipc/msg.c`](https://github.com/torvalds/linux/blob/v6.6/ipc/msg.c)（`find_msg`）、[`ipc/mqueue.c`](https://github.com/torvalds/linux/blob/v6.6/ipc/mqueue.c)（`msg_insert`、`CLOCK_REALTIME`）
- 耗时来自我写的测试程序，运行环境见开头。测试机的内核是 5.10，查源码用的是 v6.6，文中引用的这些函数在结构上我没有逐版本比对。
