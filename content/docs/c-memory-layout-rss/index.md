---
title: C 变量住在哪里，进程内存为什么越来越大：从 .data / .bss 到 smaps 排查内存增长
display_title: "C 变量住在哪里，内存为什么[越来越大]"
date: 2026-10-28
section: docs
summary: "全局、静态、const、局部、malloc 出来的变量分别落在 .data、.bss、.rodata、栈还是堆，在 Linux 进程和单片机的 Flash / RAM 里各是什么样；进程内存越涨越大时，怎样从 /proc 的 VmRSS 曲线、smaps 快照对比一路定位到某一行代码，FreeRTOS 和嵌入式 Linux 上又该怎么查。"
tags: [C, Linux, FreeRTOS, 内存, ELF, 嵌入式, 排障]
kicker: 技术文档 / C · Linux · FreeRTOS
source: "https://docs.kernel.org/filesystems/proc.html"
source_label: proc(5) · GCC 13 · FreeRTOS
design: stage
hero: addr-space
---

::: tldr
一个变量放在哪，只看两件事：**活多久**、**能不能改**。全局和 static 变量活一辈子，有非零初值进 `.data`，零或没初值进 `.bss`，const 和字符串字面量进 `.rodata`；局部变量在栈上，malloc 的在堆上。排查内存增长时只盯 **RssAnon 的长期趋势**，按「整机 → 进程 → 哪类内存 → 哪个映射 → 泄漏还是碎片 → 哪行代码」一层层缩小范围。
:::

这篇是我自己的复习笔记。第一部分讲 C 变量的存储位置，第二部分讲进程内存越来越大时怎么定位，覆盖 Linux 用户态、嵌入式 Linux 和 FreeRTOS。文中的命令输出都来自真实运行：x86-64 Ubuntu 24.04、GCC 13.3、glibc 2.39；单片机部分以 Cortex-M + GNU 链接脚本为例。两部分是连着的：第二部分在 smaps 里看到的 `[heap]`、`[stack]`、匿名映射，就是第一部分讲的那些区域。

## [ELF] 放在哪个段，看寿命和能不能改

C 标准只规定变量的**存储期**，不规定段名；段是编译器和链接器的约定。按存储期分三类：

- **静态存储期**：全局变量、`static` 变量（不管写在函数里还是外面）。程序启动前就存在，一直活到退出。它们住在 ELF 文件的数据段里。
- **自动存储期**：函数里的普通局部变量、参数。进函数时在**栈**上分配，返回时随栈帧一起消失。
- **动态存储期**：`malloc` / `new` 出来的内存，在**堆**上，`free` 之前一直存在。

静态存储期的变量再按「初值」和「能不能改」细分：

| 变量 | 段 | 原因 |
|---|---|---|
| 有非零初值的全局 / static | `.data` | 初值要存进文件，运行时可改 |
| 初值为 0 或没写初值的全局 / static | `.bss` | 全是 0 不用存，文件里只记一个大小 |
| `const` 全局、字符串字面量 | `.rodata` | 只读，映射成不可写的页 |
| 需要在加载时重定位、之后只读的指针 | `.data.rel.ro` | 位置无关（PIE）程序启动时要改一次，改完再设为只读 |
| 函数的机器码 | `.text` | 只读可执行 |

用一个小程序验证（只列出声明部分，函数里的打印语句省略）：

```c
int g_init = 42;                   /* .data */
int g_zero = 0;                    /* .bss：显式写 0 也进 .bss */
int g_uninit;                      /* .bss */
static int s_file = 7;             /* .data，局部符号 */
const int g_const = 100;           /* .rodata */
const char *g_ptr = "hello";       /* 指针 g_ptr 在 .data，"hello" 在 .rodata */
char g_arr[] = "world";            /* 整个数组在 .data，可以改 */
int g_big[1024];                   /* .bss，4096 字节 */
const int *const g_cptr = &g_init; /* .data.rel.ro */

int func(int arg) {
    static int s_cnt = 0;          /* .bss，只初始化一次 */
    static int s_one = 1;          /* .data */
    int local = arg + 1;           /* 栈 */
    const int lconst = 5;          /* 栈：const 不改变局部变量的位置 */
    char buf[16];                  /* 栈 */
    char *p = malloc(32);          /* p 本身在栈，*p 在堆 */
    const char *lit = "literal";   /* "literal" 在 .rodata */
    /* ... */
}
```

`gcc -O0 -g` 编译后用 `nm` 看符号落在哪个段（大写是全局符号，小写是本文件内的局部符号）：

```text
$ nm -n layout | grep -E ' (g_|s_|func|main)'
0000000000001229 T func          # T = .text
0000000000001437 T main
0000000000002004 R g_const       # R = .rodata
0000000000003d88 D g_cptr        # .data.rel.ro（nm 也标 D）
0000000000004010 D g_init        # D = .data
0000000000004014 d s_file
0000000000004018 D g_arr
0000000000004020 d s_one.0       # 函数内 static：名字被加上编号
0000000000004028 D g_ptr
0000000000004060 B g_zero        # B = .bss
0000000000004064 B g_uninit
0000000000004080 B g_big
0000000000005080 b s_cnt.1

$ size -A layout | grep -E 'text|data|bss|rodata'
.text                 881    4416
.rodata               109    8192
.data.rel.ro            8   15752
.data                  48   16384
.bss                 4168   16448
```

`.bss` 有 4168 字节，但它们**不占文件空间**：ELF 里只记录「需要 4168 字节、全部清零」，加载时由内核给零页。这就是 `.bss` 存在的意义——一个 1 MB 的全零数组不会让可执行文件变大 1 MB。

::: interactive var-placer title="把变量放进它的段" hint="CLICK / SWITCH VIEW"
**每个声明落在哪里**（三种视角：ELF 文件里的段、Linux 进程运行时的映射、单片机的 Flash / RAM）：

| 声明 | ELF 段 | Linux 进程 | 单片机 | 说明 |
|---|---|---|---|---|
| `int g_init = 42;` | .data | rw-p 数据段 | Flash→RAM | 有非零初值：初值存在文件 / Flash 里，运行时可改 |
| `int g_zero = 0;` | .bss | rw-p 数据段 | RAM .bss | 显式写 0 也进 .bss，不占文件空间 |
| `int g_uninit;` | .bss | rw-p 数据段 | RAM .bss | 没写初值的全局变量保证为 0 |
| `static int s_cnt = 0;`（函数内） | .bss | rw-p 数据段 | RAM .bss | 函数内 static 和全局变量同处一地，只初始化一次 |
| `static int s_one = 1;`（函数内） | .data | rw-p 数据段 | Flash→RAM | 有非零初值，和 g_init 一样 |
| `const int g_const = 100;` | .rodata | r--p 只读数据 | Flash | 只读；在单片机上不占 RAM |
| `"hello"` 字符串字面量 | .rodata | r--p 只读数据 | Flash | 改它会触发段错误（Linux）或写 Flash 失败（单片机） |
| `const char *g_ptr = "hello";` | .data | rw-p 数据段 | Flash→RAM | 指针变量本身可改，所以在 .data；它指向的字符串在 .rodata |
| `char g_arr[] = "world";` | .data | rw-p 数据段 | Flash→RAM | 数组是字符串的一份可写拷贝 |
| `const int *const g_cptr = &g_init;` | .data.rel.ro | r--p RELRO | Flash | PIE 程序加载时要重定位一次，之后设为只读；单片机固定地址，直接进只读区 |
| `int func(int)` 函数体 | .text | r-xp 代码段 | Flash | 机器码，只读可执行 |
| `int local;`（局部变量） | 不在文件里 | [stack] | RAM 栈 | 进函数时分配，返回即失效；RTOS 下是当前任务的栈 |
| `malloc(32)` 返回的内存 | 不在文件里 | [heap] | RAM 堆 | 小块走 brk 堆；≥128 KB 的大块走单独的匿名 mmap；RTOS 下来自 pvPortMalloc 的堆 |
:::

### 几个反直觉的点

- **`= 0` 也进 `.bss`。**GCC 默认把零初始化的变量放进 `.bss`（`-fno-zero-initialized-in-bss` 可以关掉）。所以 `int a = 0;` 和 `int a;` 在全局作用域下没有区别。
- **函数里的 `static` 只初始化一次。**`s_cnt` 不是每次调用都清零，它在程序加载时就已经是 0，和全局变量住在同一个地方，只是名字只在函数里可见。
- **`const` 不一定进 `.rodata`。**局部的 `const int lconst` 仍然在栈上，const 只是禁止你通过这个名字修改它；开优化后它很可能直接变成立即数，根本不占内存。
- **指针和它指向的东西分开放。**`const char *g_ptr = "hello"` 里，`g_ptr` 是一个可以改指向的变量（`.data`），`"hello"` 在 `.rodata`；`g_ptr[0] = 'H'` 在 Linux 上直接段错误。想要可改的字符串，用 `char g_arr[] = "world"`。
- **`int g_uninit;` 在老代码里可能链接报错。**C 里这种写法叫「暂定定义」，GCC 10 之前放在 COMMON 块，多个 `.c` 文件各写一份也能链接成功；GCC 10 起默认 `-fno-common`，直接进 `.bss`，同名的两份定义会报 `multiple definition`。正确的写法是头文件里 `extern int g_x;`，只在一个 `.c` 里定义。

## [ELF] 运行起来：段变成映射

程序运行后，内核按 ELF 的程序头把文件映射进进程的虚拟地址空间。`cat /proc/<pid>/maps` 能看到它们（地址每次运行都不同，因为有 ASLR）：

```text
55a60cafb000-55a60cafc000 r--p 00000000  .../layout     # ELF 头等
55a60cafc000-55a60cafd000 r-xp 00001000  .../layout     # .text
55a60cafd000-55a60cafe000 r--p 00002000  .../layout     # .rodata
55a60cafe000-55a60caff000 r--p 00002000  .../layout     # .data.rel.ro / .got（RELRO，改完设成只读）
55a60caff000-55a60cb00000 rw-p 00003000  .../layout     # .data + .bss 开头
55a60cb00000-55a60cb01000 rw-p 00000000  00:00 0        # .bss 超出文件页的部分：匿名零页
55a60d530000-55a60d551000 rw-p 00000000  00:00 0  [heap]
7f64d32fc000-7f64d3324000 r--p 00000000  .../libc.so.6  # 共享库也是同样的几段
...
7fff57d77000-7fff57d98000 rw-p 00000000  00:00 0  [stack]
```

程序自己打印的地址正好落在对应的映射里：

```text
&g_init    0x55a60caff010   # rw-p 文件映射（.data）
&g_zero    0x55a60caff060   # 同一页（.bss 的开头和 .data 共用最后一页）
&g_const   0x55a60cafd004   # r--p（.rodata）
literal    0x55a60cafd00e   # r--p（.rodata）
func       0x55a60cafc229   # r-xp（.text）
&s_cnt     0x55a60cb00080   # 匿名映射（.bss 的后半段）
heap p     0x55a60d5302a0   # [heap]
&local     0x7fff57d96154   # [stack]
&lconst    0x7fff57d96158   # [stack]
```

几个和第二部分有关的要点：

- **`[heap]` 就是 brk 堆。**glibc 的 `malloc` 对小块从这里切；`free` 之后内存回到 malloc 的空闲链表，**不一定还给内核**——只有堆顶连续空闲超过阈值（默认 128 KB）才会收缩。
- **大块走 mmap。**单次申请 ≥ `M_MMAP_THRESHOLD`（默认 128 KB，会随使用动态上调，64 位上最大 32 MB）时，glibc 直接 mmap 一块匿名映射，`free` 时立刻 munmap。它们在 maps 里是没有名字的 `rw-p` 匿名映射。
- **每个线程一个栈。**主线程用 `[stack]`（上限由 `ulimit -s` 决定，通常 8 MB）；其他线程的栈是 pthread mmap 出来的匿名映射，默认也是 8 MB 虚拟空间。
- **多线程还有 arena。**glibc 为了减少锁竞争，给线程分配独立的分配区（arena），每个在 64 位上预留 64 MB 虚拟空间，后面会看到它们的样子。

## [MCU] 没有 MMU 的单片机：同一张表，落在 Flash 和 RAM

单片机上没有虚拟地址、没有 maps，段直接对应物理存储。链接脚本说了算：

```ld
MEMORY {
  FLASH (rx)  : ORIGIN = 0x08000000, LENGTH = 512K
  RAM   (xrw) : ORIGIN = 0x20000000, LENGTH = 128K
}
SECTIONS {
  .text   : { KEEP(*(.isr_vector)) *(.text*) *(.rodata*) } > FLASH
  _sidata = LOADADDR(.data);                         /* .data 初值在 Flash 里的位置 */
  .data   : { _sdata = .; *(.data*) _edata = .; } > RAM AT> FLASH
  .bss    : { _sbss = .; *(.bss*) *(COMMON) _ebss = .; } > RAM
  ._user_heap_stack : { . = ALIGN(8); . += _Min_Heap_Size; . += _Min_Stack_Size; } > RAM
}
```

关键是 `.data` 那一行的 `> RAM AT> FLASH`：它有两个地址。**运行地址（VMA）在 RAM**，代码按这个地址读写；**加载地址（LMA）在 Flash**，烧录时初值存在这里。断电后 RAM 什么都不剩，所以上电后必须有人把初值从 Flash 搬到 RAM——这就是启动代码的活：

```c
extern uint32_t _sidata, _sdata, _edata, _sbss, _ebss;

void Reset_Handler(void) {
    uint32_t *src = &_sidata, *dst = &_sdata;
    while (dst < &_edata) *dst++ = *src++;      /* 1. 把 .data 的初值从 Flash 拷到 RAM */
    for (dst = &_sbss; dst < &_ebss; ) *dst++ = 0;  /* 2. 把 .bss 清零 */
    SystemInit();                               /* 3. 时钟等 */
    __libc_init_array();                        /* 4. C++ 全局构造、constructor 函数 */
    main();
}
```

::: interactive pipeline title="单片机从上电到 main" hint="CLICK / ← →"
1. **取向量表**（硬件）：CPU 从 Flash 起始处读出初始 SP 和 Reset_Handler 的地址。→ SP 指向 RAM 顶部的栈
2. **复制 .data**（Reset_Handler）：把 _sidata 起的初值从 Flash 逐字拷到 RAM 的 _sdata～_edata。→ 有初值的全局变量就位
3. **清零 .bss**（Reset_Handler）：把 _sbss～_ebss 全部写 0。→ 没有初值的全局变量为 0
4. **初始化时钟**（SystemInit）：配置 PLL、Flash 等待周期等。→ 全速运行
5. **全局构造**（__libc_init_array）：调用 C++ 全局对象构造函数和 constructor 属性的函数。→ C/C++ 运行时就绪
6. **进入 main**（应用）：创建任务、启动调度器；RTOS 的堆 ucHeap 其实是 .bss 里的一个大数组。→ 系统运行
:::

由此可以直接算出资源占用。`arm-none-eabi-size` 输出的三列 `text / data / bss` 里：

- **Flash 占用 = text + data**（`.data` 的初值也要存在 Flash 里）；
- **静态 RAM 占用 = data + bss**，再加上链接脚本里预留的堆和主栈。

在单片机上值得记住的几件事：

- **大查找表一定加 `const`。**不加 `const` 的初始化数组进 `.data`，**Flash 和 RAM 各占一份**；加了 `const` 就只在 Flash 里。一张 4 KB 的 CRC 表，加不加 const 就差 4 KB RAM。
- **大的局部数组会撑爆栈。**任务栈常常只有 1～2 KB，函数里一个 `char buf[2048]` 就溢出了。改成 `static` 会把它挪进 `.bss`（代价是函数不再可重入），或者从堆上申请。
- **FreeRTOS 的堆就在 `.bss` 里。**heap_4 的 `ucHeap[configTOTAL_HEAP_SIZE]` 是一个普通的静态数组，所以 `configTOTAL_HEAP_SIZE` 调大，`size` 输出里的 bss 就跟着变大。`xTaskCreate` 创建的任务，栈和 TCB 都从这个堆里切。
- **想让变量在软复位后保留**（比如记录崩溃原因），放进一个启动代码不清零的段：`__attribute__((section(".noinit")))`，并在链接脚本里给 `.noinit` 单独安排位置。

## [RSS] 内存越来越大：先分清是哪个数字在涨

「内存涨了」至少有四种说法，含义完全不同：

| 指标 | 含义 | 能不能当泄漏依据 |
|---|---|---|
| **VSZ / VmSize** | 虚拟地址空间总大小，包括只预留、从没碰过的部分 | 不能。线程栈、arena、mmap 的文件都会让它很大 |
| **RSS / VmRSS** | 当前驻留在物理内存里的页 | 能看趋势，但包含共享库等共享页 |
| **PSS** | 共享页按共享进程数平摊后的 RSS | 多进程时比较谁占得多更公平 |
| **USS / Private_Dirty** | 只属于本进程的私有页 | 最接近「这个进程自己吃掉的内存」 |

`/proc/<pid>/status` 里把 RSS 又拆成三份：`VmRSS = RssAnon + RssFile + RssShmem`。

- **RssAnon**：匿名内存——堆、栈、匿名 mmap。泄漏几乎总是体现在这里。
- **RssFile**：映射文件的页，比如代码段、共享库、mmap 的数据文件。内存紧张时内核可以丢掉再读回来。
- **RssShmem**：共享内存、tmpfs、memfd。

一个直观的例子：起 8 个线程、每个只做几千次小块分配，`VmSize` 从 4 MB 涨到 **594 MB**，`VmRSS` 只从 1 MB 涨到 3 MB：

```text
[start]      VmSize:   4236 kB  VmRSS:  1020 kB  RssAnon:   88 kB
[8 threads]  VmSize: 594092 kB  VmRSS:  3068 kB  RssAnon: 2136 kB
```

多出来的 590 MB 是 8 个线程栈（各 8 MB）加上 glibc 给线程分配的 arena（各预留 64 MB），绝大部分从没被碰过。

::: quote
判断泄漏只看*RssAnon 的长期趋势*，不看 VSZ，也不看某一个瞬间的值。
:::

## [STEP] 方法论：从整机一路缩小到一行代码

::: interactive pipeline title="内存增长的定位路线" hint="CLICK / ← →"
1. **确认是谁在涨**（/proc/meminfo）：看 MemAvailable 的趋势，再看 Slab、Shmem 有没有涨；各进程 RSS 之和解释不了，就去查内核和 tmpfs。→ 用户态还是内核
2. **锁定进程、画 VmRSS 曲线**（/proc/pid/status）：定时记录 VmRSS、RssAnon、Threads，看曲线形状。→ 是哪个进程、怎么涨的
3. **看涨的是哪类内存**（RssAnon / RssFile / RssShmem）：匿名内存涨多半是堆，Shmem 涨查共享内存和 tmpfs，Threads 涨查线程泄漏。→ 内存类型
4. **定位到映射**（smaps 快照对比）：隔一段时间抓两次 smaps，按映射算差值。→ [heap]、匿名映射还是文件
5. **区分泄漏和碎片**（malloc_trim）：手动 trim 一次，RSS 大幅回落说明是 malloc 没有归还，不是泄漏。→ 泄漏还是碎片
6. **定位到代码**（ASan / valgrind / heaptrack / mtrace）：拿到分配点的调用栈。→ 哪一行
:::

### 第 1 步：先确认是用户态还是内核在涨

```bash
free -m
grep -E 'MemTotal|MemAvailable|^Cached|Shmem:|Slab|SUnreclaim|AnonPages' /proc/meminfo
```

- **看 `MemAvailable`，不看 `MemFree`。**Linux 会把空闲内存拿去做页缓存，`MemFree` 小是正常的；`MemAvailable` 估算的是「不换出就还能给应用用多少」。
- **`AnonPages` 在涨**：大概率是某个进程的堆，进入第 2 步。
- **`Shmem` 在涨**：查 `/dev/shm` 和挂成 tmpfs 的目录（`df -h -t tmpfs`）。嵌入式设备上把 `/tmp`、`/var/log` 挂成 tmpfs 很常见，**日志一直写不清理，内存就一直涨，但哪个进程的 RSS 都不涨**。
- **`SUnreclaim` 在涨**：内核里不可回收的 slab，用 `slabtop` 看是哪种对象，这是驱动或内核模块的问题，不在本文范围。

### 第 2 步：锁定进程，画出 VmRSS 曲线

先按 RSS 排序找到嫌疑进程（`ps -eo pid,rss,vsz,comm --sort=-rss | head`），然后**持续记录**。一个瞬间的值说明不了什么，曲线形状才是线索。下面这个脚本只用 `awk`，busybox 上也能跑：

```sh
#!/bin/sh
# rss_log.sh <pid> [间隔秒]：定时记录一个进程的内存指标
pid=$1; iv=${2:-60}
while kill -0 "$pid" 2>/dev/null; do
  printf '%s ' "$(date +%F_%T)"
  awk '/^(VmRSS|RssAnon|RssFile|RssShmem|VmSwap|Threads):/{printf "%s %s ", $1, $2}' /proc/$pid/status
  echo
  sleep "$iv"
done
```

跑一晚上，把 RssAnon 一列画成图，对照下面几种典型形状：

::: interactive rss-trend title="VmRSS 曲线的五种形状" hint="SWITCH PATTERN"
**看曲线形状判断原因**：

- **持续线性上涨**，负载降下来也不回落：泄漏。实测：每处理 20 万次请求、其中 2 万次走错误路径漏掉 1 KB，RSS 稳定涨约 20 MB。
- **涨到峰值后不回落**，但不再继续涨：malloc 没把内存还给内核（碎片 / 堆顶被占）。实测：分配 100 MB 小块后释放 99.99%，RSS 仍是 106 MB；调用 malloc_trim(0) 后降到 3 MB。
- **先涨后走平**：缓存预热、连接池建满，属于正常。
- **随负载上下起伏的锯齿**：正常，峰值取决于并发。
- **VSZ 暴涨、RSS 几乎不动**：线程栈和 arena 只是预留了虚拟空间。实测：8 个线程让 VmSize 从 4 MB 到 594 MB，VmRSS 只从 1 MB 到 3 MB。
:::

### 第 3 步：看涨的是哪类内存

还是 `/proc/<pid>/status`，对比曲线的起点和终点：

```bash
grep -E 'VmRSS|RssAnon|RssFile|RssShmem|VmData|VmStk|Threads' /proc/<pid>/status
```

- **RssAnon 涨、VmData 跟着涨**：堆或匿名 mmap，继续第 4 步。
- **Threads 一直涨**：线程泄漏（创建了不 join、也没 detach，或者线程卡死不退出）。每个线程带走一个 8 MB 的虚拟栈和可能的 arena。
- **RssShmem 涨**：进程映射的共享内存或 tmpfs 文件在涨。
- **RssFile 涨**：一般是 mmap 了一个越写越大的文件，内存紧张时可以回收，通常不是问题。

### 第 4 步：用 smaps 快照对比，定位到映射

`/proc/<pid>/smaps` 给出**每一个映射**的 Rss、Pss、Private_Dirty 等。`smaps_rollup`（内核 4.14 起）是全部映射的汇总，适合快速看总数；要定位，还是得按映射做差：

```bash
# 每个映射一行：起始地址  Rss(kB)  名字
snap() {
  awk '/^[0-9a-f]+-[0-9a-f]+ /{addr=$1; name=($6=="" ? "[anon]" : $6)}
       /^Rss:/{print addr, $2, name}' /proc/$1/smaps
}
snap $PID > s1; sleep 600; snap $PID > s2
# 找出涨得最多的映射（新出现的映射整块算作增长）
awk 'NR==FNR{a[$1]=$2; next} {d=$2-a[$1]; if (d>0) printf "%8d kB  %s %s\n", d, $1, $3}' s1 s2 | sort -rn | head
```

对一个每秒漏 1000 个 1 KB 小块、外加一个 256 KB 大块的程序，间隔 10 秒的结果：

```text
   11176 kB  55db1059d000-55db11092000 [heap]
    2868 kB  7fed880ab000-7fed88379000 [anon]
```

小块的泄漏体现在 `[heap]`，大块走 mmap，体现在匿名映射。相邻的匿名 mmap 会被内核合并成一个映射、而且向低地址长，起始地址会变，所以脚本把它当成「新映射」整块算——总量仍然是对的。

看单个映射的细节（这是前面那个泄漏程序跑完三轮后的 `[heap]`）：

```text
$ grep -A22 '\[heap\]' /proc/$PID/smaps | grep -E 'heap|^Size|^Rss|^Pss|Private_Dirty|Anonymous'
561c20836000-561c243c4000 rw-p 00000000 00:00 0      [heap]
Size:              60984 kB
Rss:               60944 kB
Pss:               60944 kB
Private_Dirty:     60944 kB
Anonymous:         60944 kB
```

`Size ≈ Rss ≈ Private_Dirty`：堆的每一页都被写过、都是本进程私有的，这就是泄漏的样子。`pmap -x <pid> | sort -k3 -n -r | head` 是同样信息的快捷版。

对比一下多线程 arena 在 smaps 里的样子——每个 arena 是一小段可写区加一大段 `---p` 的预留区，加起来正好 64 MB，Rss 几乎为 0：

```text
132 kB size, rss 8 kB   7f81b8000000-7f81b8021000 rw-p   # arena 已启用部分
65404 kB size, rss 0 kB 7f81b8021000-7f81bc000000 ---p   # 预留，不可访问，不占物理内存
```

### 第 5 步：泄漏还是碎片？手动 trim 一次

`[heap]` 很大不一定是泄漏。glibc 的 `free` 只把内存还给 malloc 自己的空闲链表，堆只有**顶部**连续空闲时才会收缩；只要堆顶还有一个块在用，下面释放掉的几十 MB 都还算在 RSS 里。

实测：申请 20 万个 512 字节的块（约 100 MB），释放掉除最后一个以外的全部：

```text
[alloc 100MB]  VmRSS: 106008 kB
[free 99.99%]  VmRSS: 106008 kB    # 释放了，但 RSS 一点没降
[malloc_trim]  VmRSS:   3088 kB    # malloc_trim(0) 把空闲页还给内核
```

线上不能改代码时，可以用 gdb 对正在运行的进程调一次（会短暂暂停进程）：

```bash
grep VmRSS /proc/$PID/status                          # VmRSS: 105696 kB
gdb -p $PID -batch -ex 'call (int)malloc_trim(0)'     # $1 = 1，表示有内存被归还
grep VmRSS /proc/$PID/status                          # VmRSS:   3188 kB
```

- **trim 后 RSS 大幅回落**：不是泄漏，是 malloc 没归还。可以定期调用 `malloc_trim(0)`，调小 `M_TRIM_THRESHOLD`（`mallopt` 或环境变量 `MALLOC_TRIM_THRESHOLD_`），或者换 jemalloc / tcmalloc；大量同尺寸的小对象用对象池。
- **线程多、arena 多**：用 `MALLOC_ARENA_MAX=2` 限制 arena 数量。实测同样 8 个线程，VmSize 从 594 MB 降到 135 MB。代价是线程间分配锁竞争变多。
- **trim 后几乎不降**：内存确实还被引用着，进入第 6 步。

### 第 6 步：定位到代码

**还原现场的泄漏**（有调试符号的构建）首选 AddressSanitizer，它自带 LeakSanitizer，进程退出时报告：

```text
$ gcc -g -O0 -fsanitize=address -o grow_asan grow.c && ./grow_asan leak
==86==ERROR: LeakSanitizer: detected memory leaks

Direct leak of 61440000 byte(s) in 60000 object(s) allocated from:
    #0 0x7f804abab9c7 in malloc
    #1 0x55a37bbab6fd in handle_request grow.c:23
    #2 0x55a37bbab81d in leak grow.c:34
    #3 0x55a37bbabcff in main grow.c:73
```

对应的代码就是错误路径上忘了 `free`：

```c
static int handle_request(int id) {
    char *ctx = malloc(1024);          /* grow.c:23 */
    memset(ctx, 'x', 1024);
    if (id % 10 == 0)
        return -1;                     /* BUG：这里漏了 free(ctx) */
    free(ctx);
    return 0;
}
```

不能重新编译时用 valgrind（慢 20～50 倍，适合在测试环境复现）：

```text
$ valgrind --leak-check=full ./grow leak
==93== 61,438,976 bytes in 59,999 blocks are definitely lost in loss record 2 of 2
==93==    at 0x4846828: malloc
==93==    by 0x10951E: handle_request (grow.c:23)
==93==    by 0x1095C6: leak (grow.c:34)
==93==    by 0x1098B1: main (grow.c:73)
```

**一个大坑：「还能访问到」的增长，泄漏检测器看不见。**没有上限的缓存、只进不出的队列、忘了删的 map 条目——这些内存始终被某个指针引用着，ASan 和 valgrind 都认为它们「still reachable」，不会报 definitely lost。这类问题要看「哪个分配点的存活内存一直在涨」：

- **heaptrack**：记录每次分配的调用栈，`heaptrack_gui` 能按调用点画出存活内存随时间的曲线，开销比 valgrind 小得多。
- **在应用层加计数**：给缓存、队列、连接池加长度指标，和 VmRSS 曲线放在一起看。

## [EMB] 嵌入式 Linux：工具少、内存小时怎么查

模组和小型网关上通常没有 valgrind，ASan 的额外内存开销（影子内存 + 隔离区）也可能直接把设备撑爆。思路是：**设备上只做观测，复现和定位尽量搬到 PC 上**。

- **busybox 的 `top` / `ps` 显示的是 VSZ。**很多人看到 VSZ 几百 MB 就以为泄漏了。直接读 `/proc/<pid>/status` 的 VmRSS 和 RssAnon，用前面的 `rss_log.sh` 记录曲线。
- **老内核没有 `smaps_rollup`**（4.14 之前），用 awk 把 smaps 里的 Rss 加起来，或者直接用上面的快照对比脚本。
- **业务逻辑拿到 PC 上跑 ASan。**把协议解析、状态机这些平台无关的代码编成主机上的单元测试，用 `-fsanitize=address` 跑一遍，大部分泄漏在这一步就能抓到。
- **设备上用 glibc 的 mtrace。**开销很小，只记录地址、大小和调用点。注意 glibc 2.34 起 mtrace 挪到了单独的 `libc_malloc_debug.so`，要用 `LD_PRELOAD` 加载：

```bash
# 程序开头调用 mtrace()（#include <mcheck.h>），然后：
MALLOC_TRACE=/tmp/mt.log LD_PRELOAD=/lib/x86_64-linux-gnu/libc_malloc_debug.so.0 ./app
mtrace ./app /tmp/mt.log          # mtrace 脚本可以在 PC 上跑，需要带符号的同一份可执行文件
```

```text
Memory not freed:
-----------------
           Address     Size     Caller
0x000055784c7f64a0     0x40  at mt.c:3
0x000055784c7f64f0     0x40  at mt.c:3
0x000055784c7f6540     0x40  at mt.c:3
```

- **libc 不一定是 glibc。**`malloc_trim`、`mallopt`、`MALLOC_ARENA_MAX`、mtrace 都是 glibc 特有的；用 musl 或 uClibc-ng 的系统，malloc 的归还策略不同，以实际的 libc 为准。
- **注意 OOM。**设备一般不开 swap，涨到头会被 OOM killer 杀掉，`dmesg | grep -i 'out of memory'` 能看到被杀的进程和当时的 RSS。看到进程莫名重启，先查这里。

## [RTOS] FreeRTOS：没有 /proc，就自己埋点

RTOS 上「内存越来越大」的说法要反过来：**剩余堆越来越小**，直到 `pvPortMalloc` 返回 NULL。FreeRTOS 自带五种堆实现，选哪种决定了你能看到什么：

| 实现 | 能否释放 | 特点 |
|---|---|---|
| heap_1 | 不能 | 只分配不释放，不会有碎片，适合启动时一次建好所有对象 |
| heap_2 | 能，但不合并相邻空闲块 | 已被视为过时，用 heap_4 代替 |
| heap_3 | 能 | 只是给标准库 malloc / free 加锁 |
| heap_4 | 能，合并相邻空闲块 | 最常用，支持 `vPortGetHeapStats()` |
| heap_5 | 能，合并 | 在 heap_4 基础上支持多块不连续的 RAM |

### 定时打印堆统计

heap_4 / heap_5 提供 `vPortGetHeapStats()`，一次拿到全部指标：

```c
void vMemMonitorTask(void *arg) {
    HeapStats_t s;
    for (;;) {
        vPortGetHeapStats(&s);
        printf("free=%u largest=%u min_ever=%u blocks=%u outstanding=%u\n",
               (unsigned)s.xAvailableHeapSpaceInBytes,      /* 所有空闲块的总和 */
               (unsigned)s.xSizeOfLargestFreeBlockInBytes,  /* 最大的一块空闲块 */
               (unsigned)s.xMinimumEverFreeBytesRemaining,  /* 开机以来的最低水位 */
               (unsigned)s.xNumberOfFreeBlocks,
               (unsigned)(s.xNumberOfSuccessfulAllocations - s.xNumberOfSuccessfulFrees));
        vTaskDelay(pdMS_TO_TICKS(10000));
    }
}
```

怎么读这几个数：

- **outstanding（分配次数 − 释放次数）一直涨**：泄漏，和 Linux 上 RssAnon 线性上涨是一回事。
- **free 总量还够，但 largest 很小、空闲块数很多**：碎片。这时申请一个大块会失败，哪怕总空闲远大于它。
- **min_ever 接近 0**：峰值时差点用完，堆该调大，或者削峰。

::: interactive rtos-heap title="heap_4：泄漏和碎片长什么样" hint="RUN SCENARIO / STEP"
**两个场景**（heap_4，首次适配 + 相邻空闲块合并）：

- **泄漏**：每轮分配一条 200 字节的消息，处理完后有一条路径忘了 vPortFree。outstanding 每轮 +1，free 稳定下降，最终 pvPortMalloc 返回 NULL。
- **碎片**：大块和小块交替分配，之后只释放大块。free 总量仍有一半以上，但每块空闲区都夹在两个长期占用的小块之间，largest 只有一个大块的大小，再申请更大的块就失败。
- 调用 vPortGetHeapStats() 能同时看到 free（总空闲）、largest（最大空闲块）和 min_ever（最低水位），三者一起看才能区分这两种情况。
:::

### 找到泄漏的分配点

FreeRTOS 在 `pvPortMalloc` / `vPortFree` 里留了跟踪宏，在 `FreeRTOSConfig.h` 里定义它们就能记录每次分配。宏展开在 `pvPortMalloc` 内部，所以 `__builtin_return_address(0)` 正好是调用者的地址，拿到后在 map 文件或 `addr2line` 里查函数名：

```c
/* FreeRTOSConfig.h */
void vTraceAlloc(void *addr, size_t size, void *caller);
void vTraceFree(void *addr);
#define traceMALLOC(pvAddress, uiSize)  vTraceAlloc((pvAddress), (uiSize), __builtin_return_address(0))
#define traceFREE(pvAddress, uiSize)    vTraceFree(pvAddress)
#define configUSE_MALLOC_FAILED_HOOK    1   /* 分配失败时调用 vApplicationMallocFailedHook() */
```

`vTraceAlloc` 往一个固定大小的表里登记（地址、大小、调用者），`vTraceFree` 按地址删除；隔一段时间把表打印出来，**按调用者聚合后一直在变多的那一项，就是泄漏点**。这个表本身用静态数组，不要在里面再调 `pvPortMalloc`。

### 栈：另一种「内存不够」

任务栈溢出不会让剩余堆变少，但症状常常是随机死机、变量被改。

- `uxTaskGetStackHighWaterMark(NULL)` 返回当前任务**历史上剩余最少的栈空间**，单位是字（`StackType_t`，Cortex-M 上是 4 字节），越接近 0 越危险。
- `configCHECK_FOR_STACK_OVERFLOW` 设为 2，调度器在切换任务时检查栈尾的填充图案，溢出时调用 `vApplicationStackOverflowHook()`。
- `vTaskList()` 一次列出所有任务的状态和高水位（需要 `configUSE_TRACE_FACILITY` 和 `configUSE_STATS_FORMATTING_FUNCTIONS`）。

### 两个容易被忽略的来源

- **newlib 的 `malloc` 是另一个堆。**`printf` 打印浮点、`sprintf`、`strdup` 以及很多第三方库调用的是标准库 `malloc`，它通过 `_sbrk` 从链接脚本里的 heap 区分配，**不计入 `xPortGetFreeHeapSize()`**。两个堆各管各的，FreeRTOS 的统计再健康，newlib 那边也可能在涨。解决办法是重写 `malloc` / `free` 让它们调用 `pvPortMalloc` / `vPortFree`，或者统一用 heap_3；多任务下 newlib 还需要 `__malloc_lock` 或 `configUSE_NEWLIB_REENTRANT`。
- **删除的任务要等空闲任务来回收。**任务调用 `vTaskDelete(NULL)` 删除自己时，它的 TCB 和栈由**空闲任务**释放。如果高优先级任务一直占着 CPU，空闲任务得不到运行，这些内存就迟迟不还，看起来就像泄漏。动态创建的队列、信号量、软件定时器同理：不用了要 `vQueueDelete` / `vSemaphoreDelete` / `xTimerDelete`。

## [NOTE] 结论与速查

::: ledger
- [+] **看趋势不看瞬间** 用 rss_log.sh 记录一晚上的 RssAnon，曲线形状比任何一次的数值都有用。
- [+] **smaps 做差** 两次快照按映射相减，十分钟就能把范围缩小到 [heap]、某个匿名映射或某个文件。
- [+] **先 trim 再下结论** 手动 malloc_trim(0) 一次，能区分「真泄漏」和「malloc 没归还」。
- [-] **不要拿 VSZ 当证据** 线程栈和 arena 只是预留，busybox top 默认显示的就是它。
- [-] **还能访问到的增长检测器看不见** 无上限缓存、只进不出的队列不会被 ASan / valgrind 报出来，要靠 heaptrack 或应用层计数。
- [-] **RTOS 上两个堆分开算** FreeRTOS 的堆统计不包含 newlib 的 malloc。
:::

::: stats
- LEAK / 20万次请求 | 20 MB | 2 万次漏 1 KB，RSS 线性上涨（实测）
- MALLOC_TRIM | ~~106~~3 MB | 释放 99.99% 后 RSS 不降，trim 后回落（实测）
- 8 THREADS VmSize | ~~594~~135 MB | MALLOC_ARENA_MAX=2 前后（实测）
:::

::: lessons
1. **存储位置只由寿命和可写性决定。**全局 / static 看初值和 const 分进 .data、.bss、.rodata；局部在栈，malloc 在堆。遇到新写法，先问这两个问题。
2. **单片机上 .data 要付两次钱。**Flash 存初值，RAM 存运行值；只读的表加 const，就只付一次。
3. **从大到小逐层缩小范围。**整机 → 进程 → 内存类型 → 映射 → 分配点，每一步都有对应的 /proc 文件，不要一上来就挂 valgrind。
4. **涨不等于漏。**先区分泄漏、碎片、缓存和预留；只有「持续上涨且 trim 也降不下来」才是真泄漏。
5. **没有工具，就自己埋点。**RTOS 和小设备上，一个定时打印的统计任务、一组跟踪宏，比任何外部工具都可靠。
:::

## [REF] 参考

- [Linux 内核文档：The /proc Filesystem](https://docs.kernel.org/filesystems/proc.html)——`status` 各字段、`smaps` / `smaps_rollup`
- `man 5 proc`、`man 1 nm`、`man 1 size`、`man 1 pmap`
- [GNU C Library：Memory Allocation Tunables](https://www.gnu.org/software/libc/manual/html_node/Memory-Allocation-Tunables.html)——`M_MMAP_THRESHOLD`、`M_TRIM_THRESHOLD`、arena
- `man 3 malloc_trim`、`man 3 mallopt`、`man 3 mtrace`
- [GCC 10 Release Notes](https://gcc.gnu.org/gcc-10/changes.html)——默认改为 `-fno-common`
- [GNU ld：Output Section LMA](https://sourceware.org/binutils/docs/ld/Output-Section-LMA.html)——`AT>` 与加载地址
- [AddressSanitizer / LeakSanitizer](https://github.com/google/sanitizers/wiki/AddressSanitizerLeakSanitizer)、[Valgrind Memcheck](https://valgrind.org/docs/manual/mc-manual.html)、[heaptrack](https://github.com/KDE/heaptrack)
- [FreeRTOS：Heap Memory Management](https://www.freertos.org/Documentation/02-Kernel/02-Kernel-features/09-Memory-management/01-Memory-management)——heap_1～5、`vPortGetHeapStats()`
- [FreeRTOS：Stack Usage and Stack Overflow Checking](https://www.freertos.org/Documentation/02-Kernel/02-Kernel-features/09-Memory-management/02-Stack-usage-and-stack-overflow-checking)
- 文中的 `nm`、`maps`、`status`、`smaps`、ASan、valgrind、mtrace、gdb 输出均为在 x86-64 Ubuntu 24.04（GCC 13.3、glibc 2.39）上实际运行所得；示例程序 `layout.c`（变量位置）和 `grow.c`（泄漏 / 碎片 / 多线程三种模式）的关键代码已在正文中给出。单片机链接脚本与启动代码为通用写法的简化版；交互组件里标注「示意」的数值和图形为图解，不是实测数据。
