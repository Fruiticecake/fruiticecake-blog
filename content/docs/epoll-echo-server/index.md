---
title: epoll 回显服务器是怎么工作的：从 accept 队列到就绪链表，以及它和 select / poll 的区别
display_title: epoll 只把[就绪的 fd]交给你
date: 2026-10-28
section: docs
summary: "一个 epoll 回显服务器里，listen_fd 为什么「可读」就代表有新连接：三次握手由内核完成，连接排进 accept 队列，队列非空监听 socket 就可读；epoll_wait 返回后仍要写 for 循环，但循环的是就绪的 fd 而不是全部连接——这正是它和 select / poll 的区别。附 WSL 实测和面试答法。"
tags: [Linux, 网络, epoll, select, poll, TCP, 嵌入式, 面试]
kicker: 技术文档 / Linux · 网络编程 · I/O 多路复用
source: "https://man7.org/linux/man-pages/man7/epoll.7.html"
source_label: epoll(7) · listen(2) · Linux 5.10
design: stage
hero: epoll-ready
---

::: tldr
`listen_fd` 这个整数从来不变，变的是它背后那个监听 socket 的 **accept 队列**：三次握手由内核独立完成，握手成功的连接排进队列，队列非空，监听 socket 就「可读」。epoll 把「登记 fd」和「等待事件」拆开，fd 就绪时内核通过回调把它挂到**就绪链表**，`epoll_wait` 只把就绪的那几个交给你；select 每次都要把整个集合拷进内核、两边各扫一遍。所以 `for (i = 0; i < n; i++)` 里的 n 是就绪数，不是连接总数。
:::

这篇是我自己的复习笔记，围绕一份 epoll 回显服务器（下文称 demo.c）讲清两个问题：监听 fd 可读到底意味着什么，以及 epoll 和 select / poll 的区别到底在哪。事实以 Linux man pages（epoll(7)、select(2)、poll(2)、listen(2)）和内核源码为准；文中的命令输出来自 WSL2 Ubuntu 24.04（内核 5.10）上的真实运行。TCP 握手本身的序号细节见另一篇[《从三次握手到 TLS 1.3》](/docs/tcp-handshake-tls.html)。

## [NOTE] 先用一家餐厅把全貌讲一遍

把服务器想成一家餐厅：

| 餐厅 | 服务器里的真实概念 |
|---|---|
| 门口的前台，只负责接客，不点菜 | 监听 socket（`listen_fd`） |
| 在门口确认预约、还没确认完的客人 | 半连接队列（SYN 队列）里的连接 |
| 确认完、站在门口等领位的客人 | 全连接队列（accept 队列）里的连接 |
| 领位：把客人带到一张桌子 | `accept()`，返回一个新的 `conn_fd` |
| 一张张桌子 | 已连接的 socket（`conn_fd`） |
| 服务员 | epoll 实例（`epfd`） |
| 服务员的登记本：要照看哪些桌子 | 兴趣列表（`epoll_ctl` 登记的 fd） |
| 客人按下桌上的呼叫铃 | socket 收到数据，内核回调把它挂上就绪链表 |
| 桌号牌 | `ev.data.fd`：你自己写、服务员原样念给你听的标签 |

这家餐厅运转起来是这样：前台在门口接待新客人（内核做握手），客人在门口排好队；服务员不用挨桌去问「要不要点菜」，而是谁按铃就去谁那里（epoll 的就绪通知）。服务员每次回到厨房（`epoll_wait` 返回），手里拿着的是「这几桌按了铃」的单子：如果是前台按的铃，就去领位（`accept`）；如果是某张桌子按的，就去上菜（`read` / `write`）。

select 的服务员则是另一种工作方式：每一轮都把所有桌号抄一遍交给经理，经理挨桌问一遍，再把单子还回来，服务员自己还要从头到尾再看一遍是谁举了手。

**类比到此为止。**下面讲技术细节时都回到真实概念：fd、socket、队列、回调。餐厅里没有「内核态和用户态之间的拷贝」，而这恰恰是 select 和 epoll 差别最大的地方。

## [FLOW] 整个程序：一个循环，两个分支

demo.c 的结构可以压成一句话：先建好监听 socket 和 epoll，然后永远循环 `epoll_wait`，返回的每个就绪 fd 只有两种可能——是监听 fd 就 `accept`，是连接 fd 就 `read`。

::: interactive echo-flow title="demo.c 的总流程" hint="CLICK SCENARIO"
1. `socket()` 创建 TCP socket，得到 `listen_fd`（通常是 3）。
2. `bind()` 绑定 `0.0.0.0:8888`。
3. `listen(listen_fd, 128)`：socket 变成监听状态，内核开始替它完成三次握手。
4. `epoll_create1(0)` 创建 epoll 实例，得到 `epfd`（通常是 4）。
5. `epoll_ctl(ADD, listen_fd)`：把监听 fd 登记进 epoll，关心 `EPOLLIN`。
6. 循环 `epoll_wait()`：阻塞到至少一个 fd 就绪，返回就绪数 n；对每个就绪事件取出 `fd = events[i].data.fd`。
7. 分支一，`fd == listen_fd`：有新连接 → `accept()` 得到 `conn_fd` → `epoll_ctl(ADD, conn_fd)` 也登记进 epoll。
8. 分支二，其他 fd：某个连接有数据 → `read()`；返回值大于 0 就 `write()` 原样写回，返回 0（对方关闭）或小于 0（出错）就 `close(fd)`。
9. 处理完 n 个事件，回到 `epoll_wait()`。
:::

对应到代码，循环体就是下面这一段（摘自 demo.c，省略了打印和错误处理）：

```c
for (;;) {
    int n = epoll_wait(epfd, events, MAX_EVENTS, -1);
    for (int i = 0; i < n; i++) {
        int fd = events[i].data.fd;
        if (fd == listen_fd) {
            int conn_fd = accept(listen_fd, (struct sockaddr *)&cli, &len);
            ev.events = EPOLLIN;
            ev.data.fd = conn_fd;
            epoll_ctl(epfd, EPOLL_CTL_ADD, conn_fd, &ev);
        } else {
            ssize_t r = read(fd, buf, sizeof(buf));
            if (r <= 0) { close(fd); continue; }
            write(fd, buf, r);  // 回显
        }
    }
}
```

两个问题都藏在这段代码里：为什么 `listen_fd` 会出现在 `events` 里（下一节），以及外层这个 `for` 和 select 的循环有什么不同（再下一节）。

## [Q1] listen_fd 为什么「可读」就说明有新连接

### fd 只是一个下标

`listen_fd = 3` 是进程 fd 表里的下标，它指向内核里的一个 socket 对象。整数本身没有状态，状态都在它指向的对象上。运行中的 demo 可以直接看到这张表：

```bash
$ ls -l /proc/$(pidof demo)/fd | awk '{print $9, $10, $11}'
0 -> /dev/pts/0
1 -> /dev/pts/0
2 -> /dev/pts/0
3 -> socket:[19642]
4 -> anon_inode:[eventpoll]
5 -> socket:[19643]
```

0、1、2 是标准输入输出，3 是监听 socket，4 是 epoll 实例，5 是第一个 `accept` 出来的连接。方括号里是 socket 的 inode 号：3 和 5 是两个**不同的 socket 对象**。这也是第一个连接的 `conn_fd` 通常是 5 的原因——Linux 总是分配当前最小的空闲 fd。

### listen 之后，握手由内核独立完成

`listen(listen_fd, 128)` 把 socket 变成监听状态。从这一刻起，内核会替这个 socket 处理所有到达 8888 端口的 SYN，而且整个握手过程不需要用户程序执行任何一行代码：

1. 客户端的 SYN 到达，内核记下这个「半连接」（概念上叫 **SYN 队列**），回 SYN+ACK；
2. 客户端回 ACK，握手完成，内核为它创建一个新的 socket，放进监听 socket 的**全连接队列**（accept 队列）；
3. `accept()` 只做一件事：从 accept 队列头部取走一个已经建好的连接，给它分配一个新 fd。

`listen` 的第二个参数 128 限制的是 accept 队列的长度，并且会被 `/proc/sys/net/core/somaxconn` 截断（Linux 5.4 起默认 4096，更早是 128）。半连接的数量由另外的参数管：`tcp_max_syn_backlog`，开启 syncookies 时没有逻辑上限——这一段 listen(2) 的手册写得很清楚。

### 「可读」对监听 socket 的定义

对普通连接 socket，可读的意思是「接收缓冲区里有数据」；对监听 socket，内核把可读定义成 **accept 队列非空**（内核源码 `inet_csk_listen_poll()`：队列不空就返回 `EPOLLIN`）。所以 demo.c 里那行注释是准确的：

```c
ev.events = EPOLLIN;      // 关心「可读」事件（对监听 fd 来说 = 有新连接）
```

握手完成、新连接入队的那一刻，内核还会唤醒在这个 socket 上等待的人——epoll 就是在这里收到通知的（下一节细讲回调）。下面把客户端、内核、用户程序三个区域放在一起，一步步走一遍：

::: interactive accept-queue title="三次握手与 accept 队列" hint="CLICK / ← →"
**客户端（nc）、内核、用户程序三方的时间线：**

1. 程序执行 `socket → bind → listen`：内核里出现一个监听 socket（fd 3），它带着两个队列：SYN 队列和 accept 队列，accept 队列上限 128。
2. 程序执行 `epoll_create1`（fd 4）和 `epoll_ctl(ADD, 3)`，然后阻塞在 `epoll_wait`。
3. 客户端发 SYN：连接进入 SYN 队列。用户程序仍阻塞在 `epoll_wait`，一行代码都没执行。
4. 内核回 SYN+ACK，客户端回 ACK：连接从 SYN 队列移到 accept 队列。客户端的 `connect()` 已经返回，nc 认为自己连上了。用户程序还是一行代码都没执行。
5. accept 队列从空变成非空：监听 socket 变成可读。`listen_fd = 3` 这个数字没变，变的是它背后 socket 的状态。
6. epoll 的回调把 fd 3 挂上就绪链表，`epoll_wait` 返回 1，`events[0].data.fd == 3`。
7. 程序调用 `accept()`：从 accept 队列取走这个连接，得到新的 `conn_fd = 5`。队列又空了，监听 socket 不再可读。
8. 实验：如果程序一直不 `accept`，第二、第三个客户端照样能握手成功，只是排在 accept 队列里。
9. 队列满了以后，新来的 SYN 会被丢弃，客户端只能重传 SYN；具体行为取决于内核参数（见下文）。
:::

::: quote
`listen_fd` 这个数字从头到尾都是 3，*变的是它背后那条 accept 队列是空还是不空*。
:::

### accept 队列满了会怎样：取决于内核参数

这是容易被问、也容易说错的地方。以 Linux 5.x 的实现为准，分两种情况：

- **队列满时又来一个 SYN**：内核直接丢掉这个 SYN，不回任何东西，计数器 `ListenOverflows` / `ListenDrops` 加一。客户端收不到 SYN+ACK，会按指数退避重传 SYN，表现为 `connect()` 卡住，最后可能超时。
- **握手的最后一个 ACK 到达时队列已满**：默认（`net.ipv4.tcp_abort_on_overflow = 0`）内核丢掉这个 ACK，连接留在半连接状态，稍后重传 SYN+ACK，如果到时候队列有空位就能「自愈」；设为 1 时，内核直接回 RST，客户端会看到 `Connection reset by peer`。

不同内核版本在细节上有差别（比如队列的判满条件），所以面试时说「取决于 `tcp_abort_on_overflow`，默认是丢弃而不是 RST」就够了，不要说死。下文「动手验证」里有一个把 backlog 改成 1 的实验，可以亲眼看到 SYN 被丢。

## [Q2] epoll_wait 之后还要写 for 循环，和 select 有什么区别

区别不在「有没有循环」，而在**循环的对象是谁、循环之前内核做了多少事**。先把三种机制各自在一次调用里做了什么摆出来。

### select：每次都交出整张表，再拿回整张表

```c
select(maxfd + 1, &readfds, NULL, NULL, NULL);
```

`fd_set` 是一个位图，每个 bit 代表一个 fd。每次调用：

1. 把整个位图从用户态**拷贝进内核**；
2. 内核从 0 扫到 `maxfd`，对每个置位的 fd 调一次它的 poll 函数，问「你现在可读吗」；都没就绪，就把自己挂到每个 fd 的等待队列上睡眠；
3. 任何一个 fd 就绪都会把它唤醒，醒来后内核**再扫一遍**所有 fd，把没就绪的 bit 清零；
4. 把位图**拷回用户态**，返回就绪数；
5. 用户程序只知道「有几个」，不知道「是哪几个」，必须再用 `FD_ISSET` 把每个 fd 检查一遍；
6. 位图被内核改写了，下一轮调用前要用 `FD_ZERO` / `FD_SET` 重新设置。

另外，`fd_set` 的大小固定为 `FD_SETSIZE`（1024），编号大于等于 1024 的 fd 不能用 select 监视。

### poll：换了数据结构，没换工作方式

poll 用 `struct pollfd` 数组代替位图：`events` 写你关心什么，内核把结果写到另一个字段 `revents`。所以 poll 解决了两个问题——没有 1024 的上限，也不用每轮重建集合。但每次调用依然要把整个数组拷进内核、内核依然要逐个检查、用户依然要逐个看 `revents`，开销仍然和**监视的 fd 总数**成正比。

### epoll：登记一次，就绪时回调

epoll 把 select 一个调用里的事拆成三个调用：

- `epoll_create1`：在内核里建一个 epoll 实例，里面有两样东西——**兴趣列表**（你登记了哪些 fd，内核用红黑树存）和**就绪链表**（哪些 fd 已经就绪）。
- `epoll_ctl`：登记、修改、删除一个 fd。登记时内核把一个回调函数（`ep_poll_callback`）挂到这个 socket 的等待队列上。**只在登记时做一次**，之后每次等待都不用再交出集合。
- `epoll_wait`：只看就绪链表。链表空就睡，非空就把就绪的事件拷给用户，返回个数。

socket 收到数据时，网络协议栈唤醒它的等待队列，回调函数就把对应的条目挂到就绪链表尾部。于是 `epoll_wait` 返回时，`events` 数组里**只有就绪的 fd**。

::: interactive select-vs-epoll title="select 与 epoll：10 个连接，2 个有数据" hint="PLAY / ← → / NEXT ROUND"
**场景：已连接 10 个 fd（fd 5～14），其中只有 fd 7 和 fd 12 收到数据。**

| 步骤 | select | epoll |
|---|---|---|
| 准备 | 用户 `FD_SET` 10 次，组好位图 | `epoll_ctl` 登记 10 次（只在开始时做一次） |
| 进内核 | 整个位图拷进内核 | 什么都不拷 |
| 等待 | 内核逐个检查 10 个 fd，都没数据，挂到 10 个等待队列上睡眠 | 就绪链表为空，睡眠 |
| 数据到达 | fd 7、fd 12 收到数据，唤醒；内核再逐个检查 10 个 | fd 7、fd 12 收到数据，回调把它们挂到就绪链表 |
| 返回 | 位图拷回用户态，返回 2 | 只拷回 2 个 `epoll_event`，返回 2 |
| 用户处理 | `FD_ISSET` 逐个检查 10 个，才找到那 2 个 | `for` 只跑 2 次 |
| 下一轮 | 位图被改写，要重新 `FD_ZERO` / `FD_SET` | 什么都不用做 |

一轮下来，按「逐个检查一个 fd」计数：select 内核检查 20 次、用户检查 10 次；epoll 内核只确认就绪链表上的 2 个，用户循环 2 次。
:::

### 那个 for 和 if 到底在做什么

回到 demo.c：

```c
int n = epoll_wait(epfd, events, MAX_EVENTS, -1);
for (int i = 0; i < n; i++) {
    int fd = events[i].data.fd;
    if (fd == listen_fd) {
```

- `n` 是这一次**就绪的事件数**，不是连接总数。1 万个连接里只有 3 个有数据，`n` 就是 3，循环跑 3 次。select 的用户循环则要从 0 扫到 `maxfd`。
- `if (fd == listen_fd)` 不是在「搜索」哪个 fd 就绪了——`events` 里的每一项都已经是就绪的。它只是在已就绪的 fd 里**分类型**：这个是监听 socket（去 accept），那个是连接 socket（去 read）。select 版本里同样需要这个判断，而且是在 `FD_ISSET` 找到之后。

所以两者的差别是：select 的循环长度是「监视了多少个 fd」，epoll 的循环长度是「就绪了多少个 fd」；select 每次调用都要把整个集合在用户态和内核态之间来回拷贝、由内核扫一遍，epoll 只在 `epoll_ctl` 时付一次登记成本。

| | select | poll | epoll |
|---|---|---|---|
| 集合放在哪 | 用户态位图，每次拷进内核 | 用户态数组，每次拷进内核 | 内核里的兴趣列表，登记一次 |
| fd 数量上限 | `FD_SETSIZE`（1024） | 无固定上限 | 无固定上限（受打开文件数限制） |
| 每轮要重建集合 | 要（位图被改写） | 不用（`events` / `revents` 分开） | 不用 |
| 内核怎么知道谁就绪 | 每次调用逐个检查 | 每次调用逐个检查 | fd 就绪时回调，挂上就绪链表 |
| 返回后用户要看几个 | 全部 | 全部 | 只有就绪的 n 个 |
| 可移植性 | POSIX，几乎处处可用 | POSIX | Linux 专有 |

### epoll 不是在所有情况下都更快

::: ledger
- [+] **连接多、活跃少时优势最大** 等待的开销跟就绪数走，而不是跟连接总数走，上万个空闲长连接的服务器最受益。
- [-] **连接全都很活跃时优势变小** 每次大部分 fd 都就绪，epoll 也要把它们逐个交给你，和 select / poll 的线性扫描差不了多少。
- [-] **登记本身有成本** 每个 `epoll_ctl` 都是一次系统调用，大量短连接频繁增删时这部分开销会显现出来。
- [-] **fd 很少时没有明显差别** 只盯几个 fd 的程序（很多嵌入式应用就是这样），select / poll 足够用，而且可移植。
- **只是「等」的部分更快** epoll 不会让 `read` / `write` 本身变快，业务处理慢的瓶颈它解决不了。
:::

## [TAG] ev.data.fd：你自己贴的标签，内核原样还给你

`epoll_event` 的定义（来自 epoll_ctl(2)）是这样的：

```c
typedef union epoll_data {
    void     *ptr;
    int       fd;
    uint32_t  u32;
    uint64_t  u64;
} epoll_data_t;

struct epoll_event {
    uint32_t     events;  /* Epoll events */
    epoll_data_t data;    /* User data variable */
};
```

`data` 是一个联合体，内核**不解释它的内容**，只负责存下来、在事件发生时原样还给你。真正决定「监视哪个 fd」的是 `epoll_ctl` 的第三个参数，不是 `data.fd`：

```c
ev.events = EPOLLIN;      // 关心「可读」事件（对监听 fd 来说 = 有新连接）
ev.data.fd = listen_fd;   // 事件发生时，靠这个知道是哪个 fd
if (epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev) < 0) die("epoll_ctl listen");
```

demo.c 把 fd 本身当标签，所以 `events[i].data.fd` 正好就是那个 fd——这是约定，不是 epoll 的规定。更复杂的服务器常常在 `data.ptr` 里放一个指向连接结构体的指针，事件来了直接拿到这个连接的缓冲区和状态，省掉一次查表。

::: interactive data-tag title="ev.data 这张标签怎么来回走" hint="CLICK / SWITCH TAG"
**标签的一次往返：**

1. 用户填好 `ev`：`events = EPOLLIN`，`data.fd = 3`。
2. `epoll_ctl(epfd, EPOLL_CTL_ADD, 3, &ev)`：内核按第三个参数 3 找到要监视的 socket，同时把整个 `ev`（包括 `data`）拷贝一份存进兴趣列表里的条目。
3. fd 3 背后的 socket 就绪：这个条目被挂上就绪链表。
4. `epoll_wait` 把条目里存着的 `events` 和 `data` 原样拷进用户的 `events[0]`。
5. 用户读到 `events[0].data.fd == 3`——就是第 1 步自己写进去的那个值。

如果第 1 步写的是 `data.u64 = 0xBEEF` 或者一个指针，第 5 步拿回来的就是 `0xBEEF` 或那个指针；如果故意写成 `data.fd = 99`，epoll 也照样还给你 99，它不检查。
:::

这也解释了 demo.c 里两个容易让人犯嘀咕的地方：

- **同一个 `ev` 变量被反复使用**：先给监听 fd 用，后面每 `accept` 一个连接又改写一次。这是安全的，因为 `epoll_ctl` 在调用时就把内容拷进了内核，之后你改用户态的 `ev` 不会影响已经登记的条目。
- **「close 之后 epoll 会自动把这个 fd 移除」**：在 demo.c 里成立，但有前提。epoll 跟踪的其实是 fd 背后的「打开文件」，只有当指向它的所有 fd 都关闭了（没有被 `dup` 过、没有 `fork` 出去的子进程还拿着）才会自动移除——这是 epoll(7) 问答部分专门提醒的一条。稳妥的写法是先 `epoll_ctl(EPOLL_CTL_DEL)` 再 `close`。

## [LAB] 动手验证：两个终端，亲眼看内核做握手

### 1. 跑起来

终端 A 编译并运行：

```bash
gcc demo.c -o demo
./demo
```

终端 B 连上去，输入什么就会回什么：

```bash
nc 127.0.0.1 8888
```

终端 A 会打印 `new client 127.0.0.1:xxxxx (fd=5)`。再开一个终端连第二个，就是 `fd=6`。

### 2. 看监听队列：ss -lnt

```bash
ss -lnt 'sport = :8888'
```

```
State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process
LISTEN 0      128          0.0.0.0:8888      0.0.0.0:*
```

对 **LISTEN 状态的 socket**，这两列的含义和普通连接不一样：

- `Recv-Q`：accept 队列里**当前排着**多少个已完成握手、还没被 `accept` 的连接；
- `Send-Q`：accept 队列的**上限**，也就是 `min(backlog, somaxconn)`，这里是 128。

demo 正常运行时 `accept` 很及时，`Recv-Q` 基本一直是 0。

### 3. 不 accept，nc 依然能连上

把 5a 分支改成「只打印、不 accept」：在 `if (fd == listen_fd) {` 下面加一行，原来的代码不用删，只是执行不到了：

```c
            if (fd == listen_fd) {
                puts("listen_fd 可读，但我不 accept"); fflush(stdout); sleep(1); continue;
                // ── 5a：新连接 → accept，拿到一个专门和这个客户端说话的新 fd
```

重新编译运行，然后开三个终端分别 `nc 127.0.0.1 8888`，每个都输入一行字（比如 `msg1`）。能观察到三件事。

**第一，三个 nc 都没有报错**，客户端认为自己已经连上了。握手是内核做的，跟程序有没有 `accept` 无关。

第二，监听 socket 的 `Recv-Q` 变成 3：三个连接都排在 accept 队列里。

```
State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process
LISTEN 3      128          0.0.0.0:8888      0.0.0.0:*
```

第三，连客户端发来的数据都已经被内核收下了。看服务端这一侧的三个连接，每个的 `Recv-Q` 都是 5（`msg1` 加换行正好 5 个字节）——数据躺在内核的接收缓冲区里，等着一个永远不来的 `read`：

```bash
ss -tn state established '( sport = :8888 )'
```

```
Recv-Q Send-Q Local Address:Port Peer Address:Port Process
5      0          127.0.0.1:8888    127.0.0.1:34192
5      0          127.0.0.1:8888    127.0.0.1:34190
5      0          127.0.0.1:8888    127.0.0.1:34188
```

终端 A 还会每秒打印一次 `listen_fd 可读，但我不 accept`：队列一直不空，监听 socket 一直可读，epoll 默认的**水平触发**就会每次 `epoll_wait` 都报告它。这就是那行 `sleep(1)` 的用途——去掉它，程序会在 `epoll_wait` 和 `continue` 之间空转，把一个 CPU 核跑满。

### 4. （可选）把队列撑满

再把 `listen(listen_fd, 128)` 临时改成 `listen(listen_fd, 1)`，保持不 accept，连续开 5 个 nc。实测（内核 5.10）：

- 监听 socket 显示 `Recv-Q 2`、`Send-Q 1`——队列里排了 2 个，比 backlog 多一个，这和内核的判满条件有关，不同版本可能不同；
- 另外 3 个客户端停在 `SYN-SENT`（`ss -tn state syn-sent`），说明它们的 SYN 被直接丢掉了，正在重传；
- `nstat -az TcpExtListenOverflows TcpExtListenDrops` 两个计数器都在涨。

做完记得把 128 改回来。

## [INTERVIEW] 面试怎么答

### 30 秒版本

> select、poll、epoll 都是 I/O 多路复用：一个线程同时等多个 fd。select 用位图，每次调用都要把整个集合拷进内核，内核逐个检查，返回后用户还要用 FD_ISSET 再扫一遍，集合被改写、每轮要重建，而且最多 1024 个 fd。poll 把位图换成 pollfd 数组，去掉了 1024 的限制、不用重建，但拷贝和线性扫描还在。epoll 把登记和等待分开：epoll_ctl 只登记一次，fd 就绪时内核通过回调把它挂到就绪链表，epoll_wait 只返回就绪的 fd，所以每次等待的开销跟就绪数有关，而不是跟连接总数有关。

### 再加一句进阶

> 不过如果大部分连接一直都很活跃，就绪数接近总数，epoll 的优势会变小；连接很少时三者差别也不大。另外 epoll 有水平触发 LT 和边缘触发 ET 两种模式：LT 是默认的，只要还有数据没读完每次都会通知；ET 只在状态变化时通知一次，要配合非阻塞 fd 把数据一次读完。

如果对方追问「监听 fd 为什么可读」，就用第一节的说法：握手由内核完成，连接进 accept 队列，队列非空监听 socket 就可读，`accept` 只是从队列里取一个。

## [NOTE] 速查

::: stats
- FD_SETSIZE | 1024 | select 能监视的 fd 编号上限
- SOMAXCONN | 4096 | Linux 5.4 起的默认值，backlog 会被它截断
- FIRST CONN_FD | 5 | 0/1/2 标准流、3 监听 socket、4 epoll 之后的最小空闲 fd
:::

::: lessons
1. **fd 是下标，状态在对象上。**看到一个 fd「变得可读」，要去想它背后那个内核对象发生了什么，而不是这个整数。
2. **内核替你做的事，程序看不见。**握手、收数据、排队都发生在用户代码之外；不 accept 的实验能把这一层直接摆在眼前。
3. **先分清「登记」和「等待」。**select 每次都把两件事一起做，epoll 把登记拆出去只做一次，这是两者全部差别的根源。
4. **循环长度看的是谁。**同样是 for，select 跟着连接总数走，epoll 跟着就绪数走。
5. **「更快」要带条件。**说 epoll 快时，一并说清是在连接多、活跃少的场景下。
:::

## [REF] 参考

- epoll(7)、epoll_ctl(2)、epoll_wait(2)：https://man7.org/linux/man-pages/man7/epoll.7.html
- select(2)：https://man7.org/linux/man-pages/man2/select.2.html
- poll(2)：https://man7.org/linux/man-pages/man2/poll.2.html
- listen(2)（backlog、somaxconn、tcp_max_syn_backlog）：https://man7.org/linux/man-pages/man2/listen.2.html
- ss(8)：https://man7.org/linux/man-pages/man8/ss.8.html
- 内核参数 `tcp_abort_on_overflow`、`somaxconn`：https://docs.kernel.org/networking/ip-sysctl.html
- 内核源码：`fs/eventpoll.c`（`ep_poll_callback`、就绪链表）、`net/ipv4/inet_connection_sock.c`（`inet_csk_listen_poll`）、`net/ipv4/tcp_input.c`（`tcp_conn_request` 的队列满判断）
- 同系列：[《从三次握手到 TLS 1.3》](/docs/tcp-handshake-tls.html)

文中命令输出来自 WSL2 Ubuntu 24.04（内核 5.10.16）上的实际运行。交互演示里的计数、就绪顺序和「排满 128 个」等为图解，标注了「示意」的部分不是实测数据。
