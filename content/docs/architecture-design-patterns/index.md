---
title: 怎样设计一个好架构：八个评价维度、四层思考深度，以及 23 种设计模式各自解决什么问题
display_title: "好架构，是让[变化]变便宜"
date: 2026-11-06
section: docs
summary: "架构要解决的是变化、理解、故障和协作的成本。本文从耦合、可迁移、可适配、复杂度等八个维度讲怎么评价架构，讲维度之间怎么取舍、架构思考可以分几层，再用可编译的 C 代码过一遍 23 种设计模式。"
tags: [架构设计, 设计模式, C语言, 嵌入式, 软件工程]
kicker: 技术文档 / 软件架构 · 设计模式
source: "https://en.wikipedia.org/wiki/Design_Patterns"
source_label: GoF · Parnas · Brooks · Ousterhout
design: stage
hero: pattern-field
---

::: tldr
好架构不是层数多、模式多，而是**常见的变化只改一处，故障只影响一块，新人能顺着一条路读懂**。评价它要同时看耦合、可迁移、可适配、复杂度、可测试、可靠性、性能和可演进八个维度，这些维度会互相冲突，所以架构设计的核心工作是**判断什么会变、什么不能错，然后为此付出合适的代价**。设计模式是这个判断之后才用得上的工具，每一种都在隔离某一类变化。
:::

这篇写给两类读者：想系统梳理架构思路的工程师，和准备复习设计模式的人。前半部分讲判断，后半部分讲工具。文中的 C 示例全部用 GCC 13.3（`-std=c11 -Wall -Wextra -Werror`，打开 ASan 和 UBSan）编译运行过，注释里的输出就是实际输出。示例围绕一台通信设备展开，因为这是我最熟悉的领域。

## [WHY] 架构要解决的，不是「怎么跑起来」

程序跑起来只说明功能是对的，架构决定的是**以后每次改动要花多少钱**。一个几百行的工具不需要架构，因为全部内容都能装进脑子，改错了重写也不贵。系统变大、活得变久、参与的人变多以后，下面四种成本开始超过写功能本身的成本：

- **变化的成本：** 换一颗芯片、加一种协议，要改多少文件，要重新测多少东西。
- **理解的成本：** 新同事要读多少代码，才敢改一行。
- **故障的成本：** 一个模块出错，会带倒多少别的模块，要多久才能定位。
- **协作的成本：** 两个人同时改，多久撞车一次，一个接口变化要拉多少人开会。

Martin Fowler 在《Who Needs an Architect?》里转述过 Ralph Johnson 的看法：架构就是那些你希望项目早期就做对的决定。这个定义抓住了一点：**架构关心的是以后难改的东西**。函数名以后可以改，进程怎么划分、消息格式怎么定、谁拥有状态，这些很难改。

所以检验一个架构，最直接的办法是拿几个真实会发生的变化去试，数一数要动几个模块：

::: interactive change-ripple title="一个变化，要改几个模块" hint="切换架构和变化" note="模块划分和影响范围是示意，用来说明思路，不是某个项目的统计。"
| 变化 | 模块直接调用 | 加平台适配层 | 再加消息和注册表 |
|---|---|---|---|
| 换一颗芯片 | 连接管理、设备管理、数据上报、日志恢复 | 平台适配层 | 平台适配层 |
| 新增一种上报协议 | 数据上报、连接管理、主流程 | 数据上报、连接管理、主流程 | 数据上报 |
| 新增一种恢复策略 | 日志恢复、连接管理、设备管理、主流程 | 日志恢复、连接管理、设备管理 | 日志恢复 |
| 调整连接重试时序 | 连接管理、数据上报、设备管理 | 连接管理、数据上报、设备管理 | 连接管理 |

没有隔离时，换芯片这种变化会穿透所有直接调用芯片接口的模块。加一层平台适配，它就被挡在一处。协议和恢复策略要靠消息解耦和注册表才能收敛。调整重试时序这一行也说明，适配层只挡平台差异，挡不住业务之间的时序依赖。
:::

## [DIM] 八个维度：评价架构要问的问题

只说「解耦」或「可扩展」没法评审架构。下面这八个维度，每个都可以落到一个能回答的问题上。ISO/IEC 25010 的 2011 版也把软件质量分成几大类，比如可靠性、可维护性、可迁移性（2023 版调整了部分分类），这里按写系统软件时的实际决策重新组织。安全和易用性同样重要，它们的权重更依赖具体产品，这里不单独展开。

### 耦合与内聚：改一处，要动几处

耦合是模块之间互相知道多少，内聚是一个模块内部的东西是不是为同一件事存在。两者要一起看：把一个大模块拆成十个，如果它们每次都要一起改，耦合没有下降，只是多了十个文件。

耦合由弱到强大致可以排成：只传数据，传控制标志，共享全局变量，直接改别人的内部。最难发现的是**隐含耦合**：两个模块没有任何函数调用，但其中一个依赖「另一个一定先初始化」，或者依赖消息到达的顺序。这种依赖在头文件里看不到，出问题时最难查。

可以量的指标有：一个需求平均改几个模块，依赖图有没有环，最底层的模块有没有反向 `#include` 上层头文件。

### 可迁移性：换环境，要重写多少

可迁移性回答的是**运行环境**变化时的成本，比如换芯片、换操作系统、换编译器。常规做法是把平台相关的代码收进一层适配层，上层只见统一接口。一个简单的检查：除了适配层，业务代码里还有多少 `#ifdef PLATFORM_X`。

它的代价是**最小公分母陷阱**：统一接口往往只能表达所有平台的共同能力，某个平台独有的硬件能力就用不上了。比较实际的做法是接口按上层需要的语义来定，同时允许查询能力，让少数场景走可选的扩展。

### 可适配性：换需求，要改多少

可适配性回答的是**需求和外部对接**变化时的成本，比如加一种协议、换一家云平台、按客户改一段行为。它和可迁移性常被混在一起，区别在于变的是什么：环境变还是需求变。

手段是把差异变成数据或注册项：配置表、回调注册、插件。判断标准是新增一种情况时，**只新增代码，还是要修改已有分支**。如果每加一个客户都要在十处 `switch` 里加 `case`，可适配性就是差的。代价是多了一层间接，运行时才知道调用到哪里，读代码和单步调试都会变难。

### 复杂度：要记住多少东西，才敢改

Fred Brooks 在《No Silver Bullet》里把软件开发的困难分成**本质的**和**偶然的**：前者来自问题本身，后者来自我们选的工具和解法。复杂度也可以这样看：多模多频的通信协议是本质复杂的，架构做不到让它变简单，只能把它关进一个模块；三层只转发一次调用的包装是偶然复杂的，可以直接删掉。

John Ousterhout 在《A Philosophy of Software Design》里给了三个可观察的症状：改一处要连带改很多处，要记很多东西才能完成一个任务，不知道该改哪里、改完会影响什么。他还提出**深模块**的说法：好模块的接口小、背后的实现多。Unix 文件接口就是例子：几个函数背后是整套文件系统。反过来，接口和实现几乎一样长的「浅模块」只增加了读者要记的东西。

评价时可以问：一个新人顺着一条主路径读懂要多久；一个接口的调用方需要知道多少实现细节。

### 可测试性：离开硬件，能跑多少

可测试性是架构耦合情况的直接反映。如果一个状态机要插上真实模组才能测，说明它和硬件绑死了。如果它只接收事件、输出动作，就可以在 PC 上把几百种异常序列跑一遍，这在真实设备上很难复现。

架构上要留的是**接缝**：时钟、网络、文件和平台接口都能替换。检查方法很简单：核心业务逻辑能不能在开发机上不接硬件编译运行。

### 可靠性：出错时，影响多大、多久能恢复

可靠性设计的前提是接受错误一定会发生，要回答三个问题：**错误传播多远**（故障域），**怎么被发现**（超时、心跳、日志），**怎么恢复**（重试、重启模块、整机复位）。

线程和进程的划分首先是可靠性决定：同一进程里一个段错误会带倒全部线程，换成多进程能隔离故障，但要付出 IPC 成本。[《共享内存 IPC 怎么设计》](/docs/shm-ring-queue.html)里有这部分开销的实测。没有超时的等待是最常见的隐患：对方死了，等的人也跟着卡死，并且看起来和正常运行没有区别。

### 性能与资源：抽象的钱，花在哪一层

每一层抽象都有成本：一次间接调用、一次拷贝、一次上下文切换。架构要做的是区分**热路径和冷路径**：配置和建连可以慢且灵活，每条消息都要走的路径要短且可预测。

在嵌入式设备上还要预先定预算：Flash、RAM、CPU 占用分给谁，超了谁让步。没有预算时，每个模块单独看都合理，加起来就超了。

### 可演进性：系统活着的时候，怎么改

产品发布之后，架构要回答：老设备和新固件的消息格式怎么兼容，接口怎么带版本，能不能分批升级，失败了怎么回滚。很多系统的初版设计没有问题，问题出在第一次不能停机改的时候。

可演进性还涉及人。Melvin Conway 在 1968 年提出：系统的结构会趋向于复制设计它的组织的沟通结构。两个团队共用一个模块，这个模块迟早变成矛盾集中的地方，划模块边界时也要考虑谁来维护它。

## [TRADE] 维度会打架，所以没有通用的好架构

这八个维度不能同时拉满，不同场景的优先级也不同。下面是我对几种常见场景的判断：

::: interactive arch-dims title="不同系统，优先级不一样" hint="选一个场景" note="权重是我的经验判断，不是统计数据。"
| 场景 | 耦合内聚 | 可迁移 | 可适配 | 控制复杂度 | 可测试 | 可靠性 | 性能资源 | 可演进 | 最该先想清楚的事 |
|---|---|---|---|---|---|---|---|---|---|
| 单片机固件 | 中 | 低 | 低 | 高 | 中 | 高 | 高 | 低 | 内存和实时预算。功能固定时，多一层抽象往往只是多一份开销。 |
| 通信模组中间件 | 高 | 高 | 高 | 高 | 高 | 高 | 中 | 高 | 平台差异和异常恢复。芯片会换，网络一定会断，设备还没人值守。 |
| 云端后台服务 | 高 | 低 | 高 | 高 | 高 | 高 | 中 | 高 | 服务边界和数据归属。可以随时发布，但数据迁移很难回头。 |
| 高频低延迟组件 | 中 | 低 | 低 | 中 | 中 | 高 | 高 | 中 | 热路径上的每一次拷贝和唤醒。这里灵活性通常要为性能让路。 |
| 一次性原型 | 低 | 低 | 低 | 中 | 低 | 低 | 低 | 低 | 验证想法的速度。先想好它什么时候被丢掉，别让它悄悄变成产品。 |
:::

典型的冲突有这几对：

| 冲突 | 为什么 | 怎么处理 |
|---|---|---|
| 可迁移 vs 性能 | 统一接口多一次间接调用和数据转换 | 控制面走抽象；数据面的热路径允许穿透，并把例外写清楚 |
| 可适配 vs 复杂度 | 每个扩展点都是读者要记的东西 | 没有第二个实现时，不留扩展点 |
| 解耦 vs 可调试 | 事件和回调拆散了调用栈，看不到「谁触发了我」 | 消息带来源和目标，留可追踪的日志 |
| 隔离 vs 延迟 | 多进程隔离故障，但每次通信都有成本 | 按故障后果分进程，不是每个模块都要拆 |
| 可靠性 vs 资源 | 日志和冗余占 Flash、内存 | 分级保存，只保留定位问题需要的状态 |

做取舍时，我常用三条规则：

- **先区分能不能回头。** 亚马逊的 Jeff Bezos 把决定分成单向门和双向门。消息格式、持久化数据、对外接口是单向门，值得多花时间；内部函数怎么拆是双向门，先做了再说。
- **抽象晚一点提取。** 重构领域有个「事不过三」的经验：第一次直接写，第二次忍一忍，第三次再抽象。只有一个实现时猜出来的接口，通常会在第二个实现到来时改掉。
- **把决定和理由写下来。** 记下当时的约束和放弃的方案。条件变了以后，后来的人才知道这个决定可以改。

## [DEPTH] 架构思考的四层深度

同样讨论架构，关注点可以分成四层。越往下越难改，也越能体现设计者的判断。

::: quote
前两层决定代码好不好读，后两层决定系统*出事时和十年后*怎么样。
:::

**第一层：代码组织。** 目录、文件、函数和命名。这一层看得见，也最容易讨论，但它改起来最便宜，单靠它不足以称为架构。

**第二层：依赖方向。** 谁知道谁。David Parnas 1972 年的论文《On the Criteria To Be Used in Decomposing Systems into Modules》给出了至今仍然成立的标准：**不要按流程步骤拆模块，要按「可能变化的设计决定」拆**，每个模块隐藏一个决定。依赖倒置是同一个思路：业务逻辑定义它需要的接口，平台代码去实现，依赖箭头指向更稳定的一侧。

**第三层：运行时结构。** 静态的依赖图不能回答这些问题：有几个线程和进程，谁拥有哪份状态，谁在等谁，数据走哪条路，一个模块卡住后谁会跟着卡住。死锁、优先级反转、队列积压都发生在这一层，只看类图和目录是发现不了的。

**第四层：决策与演进。** 哪些决定以后难改，现在掌握的信息够不够下结论，系统要怎样从现在的样子逐步变成想要的样子，由谁维护。这一层关心的不是某个时刻的结构，而是结构变化的路径。

落到实际设计，我会按这个顺序回答六个问题：

1. **什么会变？** 列出未来一两年最可能的变化，并按可能性排序。
2. **什么不能错？** 比如数据不能丢、设备不能变砖、延迟不能超过多少。
3. **边界划在哪？** 每个模块隐藏一个决定，接口按调用方的需要来定。
4. **运行时怎么跑？** 线程、进程、队列、状态归属和等待关系都画出来。
5. **失败了怎么办？** 每个等待都有超时，每种错误都有明确的恢复等级。
6. **怎么验证？** 拿第一步列出的变化走一遍，再看能不能离开硬件测试。

## [CASE] 一个通信设备的架构取舍

下面是我做通信模组中间件时的架构：多个芯片平台上的量产项目，单进程多线程，主控负责模块初始化、回调注册和业务编排，每个特性线程有自己的消息队列。

| 面对的问题 | 做的决定 | 得到什么 | 付出什么 |
|---|---|---|---|
| 不同芯片平台的原生接口各不相同 | 平台适配层，向上提供切卡槽、拨号、MBIM、AT 通道等统一能力 | 上层组件可以跨平台复用 | 平台独有的能力要单独开口子 |
| 多个模块要协作，直接调用会互相纠缠 | 模块之间传消息，消息带类型、来源、目标和 Payload；主控只转发和编排，不做耗时操作 | 模块不需要互相认识，状态只由所在线程修改，基本不用加锁 | 调用链变长，要靠日志还原流程；主控成为单点 |
| 定时器回调做太多事 | 回调只发消息，由线程处理 | 不会占用回调栈，也不会阻塞定时器 | 处理有一点延迟 |
| 对端可能不响应 | 内部等待都配定时器超时，超时也是一种事件 | 不会无声地卡死 | 每个状态都要考虑超时分支 |
| 现场设备无人值守 | 按错误码和异常等级恢复：轻的重启网络、重新初始化 SIM，最严重的整机重启；关键日志离线保存 | 大部分故障能自愈，事后可定位 | 恢复路径本身需要测试，日志占 Flash |

其中「回调只发消息」来自一次真实故障：RTOS 平台上某个业务稳定崩溃，通过打点和 dump 栈定位到定时器回调里操作太多、局部变量太大，把回调所在的栈撑爆了。修复时把回调里的操作改成发消息，并写进了设计规范。一次故障修好是修 bug，把它变成规则才是架构层面的收获。

单进程多线程也有明确的代价：一个段错误，整个进程都会退出。如果今天重新设计，我会优先做三件事：给主控加独立的看门狗，把高风险模块放到独立进程，给每个队列定义满了以后的策略（丢弃、覆盖还是阻塞）。这三件事分别对应可靠性、隔离成本和背压，也正好说明同一个架构换个维度看，结论就不同。

这些决定也可以用设计模式的语言来概括：平台适配层是适配器加外观，回调注册是观察者，主控是中介者，分级恢复是策略或责任链，连接流程是状态模式。下面就逐个看这些工具。

## [RULE] 模式背后的几条原则

《设计模式》（Gamma、Helm、Johnson、Vlissides，1994，常被称为 GoF）开篇给了两条原则：**面向接口编程，而不是面向实现**；**优先组合对象，而不是继承类**。后来 Robert Martin 整理的 SOLID 是更细的版本：

| 原则 | 一句话 | 在 C 项目里的样子 |
|---|---|---|
| 单一职责 S | 一个模块只因一种原因而改变 | 协议解析和网络收发分开 |
| 开闭 O | 新增功能时加代码，不改已有代码 | 新协议注册进表，不改 `switch` |
| 里氏替换 L | 实现要守接口的约定，能互相替换 | 所有 `send` 的返回值含义和超时行为一致 |
| 接口隔离 I | 不让调用方依赖它用不到的函数 | 只读模块拿只读的操作表 |
| 依赖倒置 D | 高层和低层都依赖抽象 | 业务层定义 `uplink` 接口，平台层实现 |

这些原则都有适用条件。套用得太早，就会变成上面说的偶然复杂度。

C 没有类，但接口很好表达：一个装着函数指针的结构体。Linux 内核的 `struct file_operations` 就是这样实现「一切皆文件」的：同一个 `read()`，背后可以是磁盘、管道或驱动。后面的示例都基于这个写法：

```c
#include <stdio.h>

struct uplink { // 接口：一张函数指针表
    const char *name;
    int (*send)(const struct uplink *self, const char *data);
};

static int mqtt_send(const struct uplink *self, const char *data) {
    printf("%s: %s\n", self->name, data);
    return 0;
}

int main(void) {
    const struct uplink u = { "mqtt", mqtt_send };
    return u.send(&u, "hello"); // 调用方只认接口
}
// 输出：mqtt: hello
```

## [MAP] 23 种模式：按「隔离了什么变化」来记

背定义很快就会忘，记它隔离了什么变化更持久。三大类的分工是：创建型隔离「怎么造对象」，结构型隔离「对象怎么拼」，行为型隔离「对象怎么协作」。

::: interactive pattern-map title="23 种模式速查" hint="点格子看详情" note="书里的 23 种：创建型 5、结构型 7、行为型 11。"
| 类别 | 模式 | 隔离的变化 | 一句话 | 什么时候不用 |
|---|---|---|---|---|
| 创建型 | 工厂方法 | 具体造哪种产品 | 流程固定，创建哪一种交给实现方决定 | 只有一种产品 |
| 创建型 | 抽象工厂 | 一整套配套产品 | 一次切换一族，保证不混搭 | 产品之间不需要配套 |
| 创建型 | 建造者 | 复杂对象的构造步骤 | 分步设置，最后统一校验 | 字段少，一次初始化就够 |
| 创建型 | 原型 | 对象的初始配置 | 复制一个模板再改 | 复制不比新建省事 |
| 创建型 | 单例 | 实例的数量和访问点 | 全局只有一个，且只初始化一次 | 只是为了省传参 |
| 结构型 | 适配器 | 别人的接口形状 | 把不兼容的接口转成需要的样子 | 能直接改被调用方 |
| 结构型 | 桥接 | 两个独立变化的维度 | 用组合拆开两个维度，避免 M×N 个组合 | 只有一个维度在变 |
| 结构型 | 组合 | 单个对象和整棵树的差别 | 叶子和分组用同一个接口 | 数据不是树形 |
| 结构型 | 装饰器 | 可叠加的附加功能 | 一层包一层，运行时选择叠哪些 | 附加功能固定不变 |
| 结构型 | 外观 | 子系统的内部步骤 | 给复杂子系统一个简单入口 | 子系统本来就简单 |
| 结构型 | 享元 | 大量重复的共享状态 | 把不变的部分抽出来共用 | 对象不多，不缺内存 |
| 结构型 | 代理 | 访问对象的时机和权限 | 接口不变，中间加懒加载、缓存或鉴权 | 不需要控制访问 |
| 行为型 | 责任链 | 由谁处理请求 | 沿链传递，谁能处理谁处理 | 处理方固定 |
| 行为型 | 命令 | 请求什么时候、怎么执行 | 把请求变成数据：可排队、可撤销 | 调用后立刻完成，也不用撤销 |
| 行为型 | 解释器 | 简单语言的规则 | 每条语法规则一个节点 | 语法复杂，应该用解析器 |
| 行为型 | 迭代器 | 容器的内部结构 | 遍历不暴露存储方式 | 只有数组，直接循环 |
| 行为型 | 中介者 | 对象之间的交互关系 | 网状依赖变成星形 | 只有两三个对象 |
| 行为型 | 备忘录 | 状态的保存和恢复 | 存快照，不破坏封装 | 状态很大或很容易重建 |
| 行为型 | 观察者 | 谁关心这个事件 | 发布方不认识订阅方 | 只有一个固定接收方 |
| 行为型 | 状态 | 不同状态下的行为 | 每个状态一组处理，切换对象代替分支 | 状态只有两三个 |
| 行为型 | 策略 | 可替换的算法 | 算法变成参数 | 算法只有一种 |
| 行为型 | 模板方法 | 流程中的个别步骤 | 骨架固定，少数步骤可替换 | 流程差异很大 |
| 行为型 | 访问者 | 对稳定结构的新操作 | 不改节点也能加操作 | 节点类型经常增加 |
:::

## [CREATE] 创建型：把「怎么造」藏起来

调用方一旦直接写出具体类型，就和它绑定了。这五种模式解决的都是这件事。

### 工厂方法：流程固定，具体造什么交给实现方

上报流程是固定的，用什么通道发由具体的上报器决定。流程代码不需要改。

```c
#include <stdio.h>

struct uplink { void (*send)(const char *data); };
struct reporter { struct uplink (*create_uplink)(void); }; // 工厂方法

static void report(const struct reporter *r, const char *data) {
    struct uplink u = r->create_uplink(); // 流程不知道具体类型
    u.send(data);
}

static void mqtt_send(const char *d) { printf("mqtt: %s\n", d); }
static void sms_send(const char *d) { printf("sms: %s\n", d); }
static struct uplink make_mqtt(void) { return (struct uplink){ mqtt_send }; }
static struct uplink make_sms(void) { return (struct uplink){ sms_send }; }

int main(void) {
    report(&(struct reporter){ make_mqtt }, "online");
    report(&(struct reporter){ make_sms }, "alarm");
    return 0;
}
// 输出：mqtt: online
// 输出：sms: alarm
```

C 项目里更常见的是它的简化版：一张「名字到构造函数」的注册表，新增类型只加一行。

### 抽象工厂：一次切换一整族

换平台时，modem 和 GNSS 要一起换，不能混搭。抽象工厂把「配套」这个约束放进了一个结构。

```c
#include <stdio.h>

struct modem { void (*dial)(void); };
struct gnss { void (*fix)(void); };
struct platform_factory { // 抽象工厂：创建一族产品的接口
    struct modem (*create_modem)(void);
    struct gnss (*create_gnss)(void);
};

static void a_dial(void) { puts("A dial"); }
static void a_fix(void) { puts("A fix"); }
static void b_dial(void) { puts("B dial"); }
static void b_fix(void) { puts("B fix"); }

static struct modem a_modem(void) { return (struct modem){ a_dial }; }
static struct gnss a_gnss(void) { return (struct gnss){ a_fix }; }
static struct modem b_modem(void) { return (struct modem){ b_dial }; }
static struct gnss b_gnss(void) { return (struct gnss){ b_fix }; }

static const struct platform_factory plat_a = { a_modem, a_gnss };
static const struct platform_factory plat_b = { b_modem, b_gnss };

static void app_run(const struct platform_factory *f) { // 业务不知道是哪个平台
    struct modem m = f->create_modem();
    struct gnss g = f->create_gnss();
    m.dial();
    g.fix();
}

int main(void) {
    app_run(&plat_a);
    app_run(&plat_b);
    return 0;
}
// 输出：A dial
// 输出：A fix
// 输出：B dial
// 输出：B fix
```

代价是增加一种新产品时，每一族都要跟着改。如果平台只在编译期确定，用链接不同的实现文件更简单，也没有运行时开销。

### 建造者：分步设置，最后统一校验

参数很多、彼此还有约束时，把校验放到最后一步，就不会产生半成品。libcurl 的 `curl_easy_setopt` 也是类似的分步思路。

```c
#include <stdio.h>
#include <string.h>

struct conn { char host[32]; int port; int tls; };
struct conn_builder { struct conn c; };

static void b_host(struct conn_builder *b, const char *h) {
    strncpy(b->c.host, h, sizeof b->c.host - 1);
}
static void b_port(struct conn_builder *b, int p) { b->c.port = p; }
static void b_tls(struct conn_builder *b, int on) { b->c.tls = on; }

static int b_build(const struct conn_builder *b, struct conn *out) {
    if (b->c.host[0] == '\0' || b->c.port <= 0) return -1; // 统一校验
    if (b->c.tls && b->c.port == 1883) return -1;          // 字段之间的约束
    *out = b->c;
    return 0;
}

int main(void) {
    struct conn_builder b = { 0 };
    struct conn c;
    b_host(&b, "broker.local");
    b_tls(&b, 1);
    b_port(&b, 1883);
    printf("tls on 1883: %d\n", b_build(&b, &c));
    b_port(&b, 8883);
    printf("tls on 8883: %d\n", b_build(&b, &c));
    return 0;
}
// 输出：tls on 1883: -1
// 输出：tls on 8883: 0
```

### 原型：复制一个模板再改

默认配置复杂时，复制模板比从头构造更简单。关键点是**深拷贝**：结构体赋值只复制指针，两份数据会指向同一块内存。

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

struct profile { char *apn; int retries; };

static struct profile profile_clone(const struct profile *p) {
    struct profile c = *p;
    size_t n = strlen(p->apn) + 1;
    c.apn = malloc(n); // 只赋值结构体的话，两份会共用一个 apn
    if (c.apn) memcpy(c.apn, p->apn, n);
    return c;
}

int main(void) {
    char apn[] = "default";
    const struct profile tmpl = { apn, 3 };
    struct profile a = profile_clone(&tmpl);
    if (!a.apn) return 1;
    a.apn[0] = 'D';
    a.retries = 5;
    printf("%s %d / %s %d\n", tmpl.apn, tmpl.retries, a.apn, a.retries);
    free(a.apn);
    return 0;
}
// 输出：default 3 / Default 5
```

### 单例：全局一个，且只初始化一次

它是争议最大的模式：解决了「只有一份」，也带来了隐藏依赖，测试时很难替换。真正只能有一份的资源（一个硬件外设、一份全局日志）才适合。多线程下要保证初始化只跑一次。

```c
#include <pthread.h>
#include <stdio.h>

struct logger { int level; };

static struct logger g_logger;
static pthread_once_t g_once = PTHREAD_ONCE_INIT;

static void logger_init(void) {
    g_logger.level = 2;
    puts("logger init");
}

static struct logger *logger_get(void) {
    pthread_once(&g_once, logger_init); // 多线程同时进来也只初始化一次
    return &g_logger;
}

int main(void) {
    printf("%d\n", logger_get()->level);
    printf("%d\n", logger_get()->level);
    return 0;
}
// 输出：logger init
// 输出：2
// 输出：2
```

这是语言特性影响写法的典型例子。C++11 起，函数内静态变量的初始化由语言保证线程安全，同样的功能只要几行：

```cpp
#include <iostream>

class Logger {
public:
    static Logger& instance() {
        static Logger inst; // C++11 保证只初始化一次且线程安全
        return inst;
    }
    Logger(const Logger&) = delete;
    Logger& operator=(const Logger&) = delete;
    int level = 2;
private:
    Logger() { std::cout << "logger init\n"; }
};

int main() {
    std::cout << Logger::instance().level << "\n";
    std::cout << Logger::instance().level << "\n";
}
// 输出：logger init
// 输出：2
// 输出：2
```

## [STRUCT] 结构型：把「怎么拼」变成可替换

这七种模式都在处理对象怎么拼。其中适配器、桥接、装饰器、外观、代理形状相似，都是一个对象包着另一个，区别在**包的目的**。后面的「易混对比」会把它们放在一起比较。

### 适配器：接口对不上，加一层转换

第三方库的函数是 `vendor_log(level, msg)`，而系统要求的接口是 `sink.write(sink, msg)`。适配器只做形状转换，不增加功能。平台适配层的基本单元就是它。

```c
#include <stdio.h>

// 第三方接口，不能改
static void vendor_log(int level, const char *msg) { printf("[%d] %s\n", level, msg); }

// 系统要求的接口
struct sink { void (*write)(const struct sink *self, const char *msg); int level; };

static void vendor_adapter(const struct sink *self, const char *msg) {
    vendor_log(self->level, msg); // 只做转换
}

static void app_log(const struct sink *s, const char *msg) { s->write(s, msg); }

int main(void) {
    const struct sink s = { vendor_adapter, 3 };
    app_log(&s, "link up");
    return 0;
}
// 输出：[3] link up
```

### 桥接：两个维度分开变化

消息有心跳和告警两种，通道有 MQTT 和短信两种。如果每种组合写一份，就是 2×2 个函数，再多一种通道就成了 2×3。桥接用组合把两个维度拆开，变成 2+3。

```c
#include <stdio.h>

struct channel { void (*send)(const char *text); }; // 实现侧：怎么发
struct message { // 抽象侧：发什么，通过组合持有实现侧
    const struct channel *ch;
    void (*deliver)(const struct message *self);
};

static void mqtt(const char *t) { printf("mqtt %s\n", t); }
static void sms(const char *t) { printf("sms %s\n", t); }

static void heartbeat(const struct message *m) { m->ch->send("heartbeat"); }
static void urgent(const struct message *m) { m->ch->send("ALARM"); }

int main(void) {
    const struct channel c1 = { mqtt }, c2 = { sms };
    const struct message a = { &c1, heartbeat }, b = { &c2, urgent };
    a.deliver(&a);
    b.deliver(&b);
    return 0;
}
// 输出：mqtt heartbeat
// 输出：sms ALARM
```

它和适配器的区别是时间点：适配器用来补救已经存在的不兼容，桥接是一开始就预料到两个维度都要变。

### 组合：叶子和分组一视同仁

统计 Flash 占用时，调用方不用区分单个文件和整个分区，树的遍历写在结构内部。

```c
#include <stdio.h>

struct node {
    const char *name;
    int size;                  // 叶子的大小
    const struct node *const *kids; // 分组的子节点，以 NULL 结尾
};

static int node_size(const struct node *n) {
    int total = n->size;
    for (const struct node *const *k = n->kids; k && *k; k++)
        total += node_size(*k); // 不用区分子节点是叶子还是分组
    return total;
}

int main(void) {
    const struct node kernel = { "kernel", 4096, NULL }, app = { "app", 1024, NULL }, log = { "log", 512, NULL };
    const struct node *const data_kids[] = { &app, &log, NULL };
    const struct node data = { "data", 0, data_kids };
    const struct node *const root_kids[] = { &kernel, &data, NULL };
    const struct node root = { "flash", 0, root_kids };
    printf("%d %d\n", node_size(&log), node_size(&root));
    return 0;
}
// 输出：512 5632
```

### 装饰器：运行时一层层叠功能

加时间戳、加校验、再落盘，每一项都可选。写成继承要为每种组合写一个子类，写成装饰器只要几层自由叠放。

下面这个演示和代码是同样的结构：

::: interactive decorator-chain title="叠几层，消息就变成什么样" hint="点按钮增减一层" note="校验值是演示用的简单求和，不是真正的 CRC。"
可以叠加的三层是：加序号、加校验、转大写。消息 `link up` 只加序号时变成 `#1 link up`，三层都加且校验放在最外层时，每层只负责自己的一件事，最后交给底层写出。层的先后顺序会影响结果：校验放在转大写之前还是之后，算出来的值不同。
:::

```c
#include <stdio.h>

struct writer {
    void (*write)(const struct writer *self, const char *msg);
    const struct writer *next; // 被包的那一层
};

static void to_console(const struct writer *self, const char *msg) {
    (void)self;
    printf("%s\n", msg);
}

static void with_seq(const struct writer *self, const char *msg) {
    static int seq;
    char buf[64];
    snprintf(buf, sizeof buf, "#%d %s", ++seq, msg);
    self->next->write(self->next, buf);
}

static void with_tag(const struct writer *self, const char *msg) {
    char buf[64];
    snprintf(buf, sizeof buf, "[net] %s", msg);
    self->next->write(self->next, buf);
}

int main(void) {
    const struct writer con = { to_console, NULL };
    const struct writer seq = { with_seq, &con };
    const struct writer tag = { with_tag, &seq };
    tag.write(&tag, "link up"); // 外层先处理
    return 0;
}
// 输出：#1 [net] link up
```

### 外观：给复杂子系统一个简单入口

连网要查 SIM、配 APN、发起拨号。上层只想说「连上」。外观不增加能力，只是把顺序和细节收进一个函数。

```c
#include <stdio.h>

static int sim_ready(void) { puts("sim ok"); return 1; }
static void apn_set(const char *apn) { printf("apn %s\n", apn); }
static int dial(void) { puts("dial ok"); return 0; }

// 外观：调用方不需要知道顺序和细节
static int modem_connect(const char *apn) {
    if (!sim_ready()) return -1;
    apn_set(apn);
    return dial();
}

int main(void) {
    return modem_connect("cmnet");
}
// 输出：sim ok
// 输出：apn cmnet
// 输出：dial ok
```

### 享元：共用不变的部分

上万条日志记录，模块名只有十几种。把重复的字符串存一份，记录里只放指针，这就是字符串驻留，也是享元最常见的形式。

```c
#include <stdio.h>
#include <string.h>

#define MAX_NAMES 16
static char names[MAX_NAMES][16];
static int name_count;

static const char *intern(const char *s) {
    for (int i = 0; i < name_count; i++)
        if (strcmp(names[i], s) == 0) return names[i]; // 已有，共用这一份
    if (name_count == MAX_NAMES) return NULL;
    strncpy(names[name_count], s, sizeof names[0] - 1);
    return names[name_count++];
}

struct record { const char *module; int code; }; // 只存指针

int main(void) {
    struct record a = { intern("conn"), 1 }, b = { intern("conn"), 2 }, c = { intern("gnss"), 3 };
    printf("shared=%d names=%d\n", a.module == b.module, name_count);
    printf("%s %d\n", c.module, c.code);
    return 0;
}
// 输出：shared=1 names=2
// 输出：gnss 3
```

共享的部分必须不可变，否则改一处会影响全部引用方。

### 代理：接口不变，控制访问

调用方拿到的接口和真实对象一样，中间可以加懒加载、缓存、鉴权或远程调用。Android Binder 的客户端代理和 `mmap` 的按需加载都是这个思路。

```c
#include <stdio.h>

struct store { int (*read)(struct store *self, int key); };

static int flash_read(struct store *self, int key) {
    (void)self;
    printf("flash read %d\n", key); // 假设这一步很慢
    return key * 10;
}

struct cache_proxy {
    struct store base; // 第一个成员，指针可以互转
    struct store *real;
    int key, value, valid;
};

static int proxy_read(struct store *self, int key) {
    struct cache_proxy *p = (struct cache_proxy *)self;
    if (!p->valid || p->key != key) {
        p->value = p->real->read(p->real, key);
        p->key = key;
        p->valid = 1;
    }
    return p->value;
}

int main(void) {
    struct store flash = { flash_read };
    struct cache_proxy proxy = { { proxy_read }, &flash, 0, 0, 0 };
    struct store *s = &proxy.base; // 调用方只看到 store
    printf("%d\n", s->read(s, 7));
    printf("%d\n", s->read(s, 7));
    return 0;
}
// 输出：flash read 7
// 输出：70
// 输出：70
```

## [BEHAV] 行为型：把「谁做、什么时候做」拆开

### 责任链：沿链传递，谁能处理谁处理

异常恢复很适合写成链：先尝试最轻的办法，不行再升级。Linux 的 netfilter 钩子也是链式处理数据包。

```c
#include <stdio.h>

struct handler {
    int (*handle)(int level); // 返回 1 表示已处理
    const struct handler *next;
};

static int restart_net(int level) { if (level > 1) return 0; puts("restart net"); return 1; }
static int reinit_sim(int level) { if (level > 2) return 0; puts("reinit sim"); return 1; }
static int reboot_all(int level) { (void)level; puts("reboot"); return 1; }

static void recover(const struct handler *h, int level) {
    for (; h; h = h->next)
        if (h->handle(level)) return;
}

int main(void) {
    const struct handler c = { reboot_all, NULL }, b = { reinit_sim, &c }, a = { restart_net, &b };
    recover(&a, 1);
    recover(&a, 3);
    return 0;
}
// 输出：restart net
// 输出：reboot
```

### 命令：把请求变成数据

函数调用一发出就执行了，变成结构体以后，它可以排队、记录、重试或撤销。消息队列里的每一条消息，本质上都是一个命令。

```c
#include <stdio.h>

struct radio { int power; };
struct cmd {
    void (*exec)(struct radio *r, int arg);
    void (*undo)(struct radio *r, int arg);
    int arg;
};

static void add_power(struct radio *r, int d) { r->power += d; }
static void sub_power(struct radio *r, int d) { r->power -= d; }

int main(void) {
    struct radio r = { 10 };
    const struct cmd q[] = { { add_power, sub_power, 5 }, { add_power, sub_power, 3 } };
    for (int i = 0; i < 2; i++) q[i].exec(&r, q[i].arg); // 可以排队到别的线程执行
    printf("%d\n", r.power);
    q[1].undo(&r, q[1].arg); // 撤销最后一条
    printf("%d\n", r.power);
    return 0;
}
// 输出：18
// 输出：15
```

### 解释器：每条语法规则一个节点

告警规则想让现场工程师配置，比如 `temp > 80 && rssi < -100`。把语法规则做成节点就能求值。语法再复杂一些，就该用专门的解析器了，这个模式只适合很小的语言。

```c
#include <stdbool.h>
#include <stdio.h>

struct ctx { int temp, rssi; };
struct expr {
    bool (*eval)(const struct expr *e, const struct ctx *c);
    const struct expr *l, *r;
    int limit;
};

static bool temp_gt(const struct expr *e, const struct ctx *c) { return c->temp > e->limit; }
static bool rssi_lt(const struct expr *e, const struct ctx *c) { return c->rssi < e->limit; }
static bool and_op(const struct expr *e, const struct ctx *c) {
    return e->l->eval(e->l, c) && e->r->eval(e->r, c);
}

int main(void) {
    const struct expr hot = { temp_gt, NULL, NULL, 80 }, weak = { rssi_lt, NULL, NULL, -100 };
    const struct expr rule = { and_op, &hot, &weak, 0 }; // temp > 80 && rssi < -100
    const struct ctx a = { 90, -110 }, b = { 90, -70 };
    printf("%d %d\n", rule.eval(&rule, &a), rule.eval(&rule, &b));
    return 0;
}
// 输出：1 0
```

### 迭代器：遍历不暴露存储

调用方只需要「下一个」，容器换成数组、链表或者带空槽的表都不影响。Linux 的 `list_for_each_entry` 也是这个思路，用宏实现。

```c
#include <stdio.h>

struct sensor { int id; int used; };
struct iter { const struct sensor *table; int n, i; };

static const struct sensor *iter_next(struct iter *it) {
    while (it->i < it->n) {
        const struct sensor *s = &it->table[it->i++];
        if (s->used) return s; // 空槽的细节留在这里
    }
    return NULL;
}

int main(void) {
    const struct sensor t[] = { { 1, 1 }, { 2, 0 }, { 3, 1 } };
    struct iter it = { t, 3, 0 };
    for (const struct sensor *s; (s = iter_next(&it)); )
        printf("%d\n", s->id);
    return 0;
}
// 输出：1
// 输出：3
```

### 中介者：网状依赖变星形

连接、定位、上报两两直接调用，3 个模块最多有 6 条单向依赖，10 个模块就有 90 条。全部经过一个主控，依赖数量就变成线性的。代价是复杂度集中到了主控，所以它只能做转发和编排，不能做耗时操作。

```c
#include <stdio.h>
#include <string.h>

enum event { NET_UP, FIX_DONE };

static void gnss_start(void) { puts("gnss start"); }
static void report_send(void) { puts("report send"); }

// 模块之间互不认识，只把事件交给主控
static void mediator_on_event(enum event e) {
    switch (e) {
    case NET_UP: gnss_start(); break;
    case FIX_DONE: report_send(); break;
    }
}

int main(void) {
    mediator_on_event(NET_UP);
    mediator_on_event(FIX_DONE);
    return 0;
}
// 输出：gnss start
// 输出：report send
```

### 备忘录：存快照，出错时恢复

配置更新失败要回到原样。对象自己生成快照，外部只负责保管，不需要了解内容。

```c
#include <stdio.h>

struct config { int port; int retries; };
struct memento { struct config saved; }; // 外部只保管，不解读

static struct memento config_save(const struct config *c) { return (struct memento){ *c }; }
static void config_restore(struct config *c, const struct memento *m) { *c = m->saved; }

static int apply_update(struct config *c, int port) {
    c->port = port;
    return port > 65535 ? -1 : 0; // 校验失败
}

int main(void) {
    struct config c = { 1883, 3 };
    struct memento m = config_save(&c);
    if (apply_update(&c, 70000) != 0) config_restore(&c, &m);
    printf("%d\n", c.port);
    return 0;
}
// 输出：1883
```

### 观察者：发布方不认识订阅方

网络状态变化时，几个模块都要知道。发布方只遍历回调表，增减订阅方不用改它。Linux 内核的 notifier chain 就是这个模式。回调要短：它运行在发布方的上下文里，一个慢回调会拖住所有人，这也是「回调只发消息」的另一个理由。

```c
#include <stdio.h>

#define MAX_OBS 4
typedef void (*observer_fn)(int state);
static observer_fn observers[MAX_OBS];
static int observer_count;

static int subscribe(observer_fn fn) {
    if (observer_count == MAX_OBS) return -1;
    observers[observer_count++] = fn;
    return 0;
}

static void publish(int state) {
    for (int i = 0; i < observer_count; i++) observers[i](state);
}

static void on_report(int s) { printf("report sees %d\n", s); }
static void on_log(int s) { printf("log sees %d\n", s); }

int main(void) {
    subscribe(on_report);
    subscribe(on_log);
    publish(1);
    return 0;
}
// 输出：report sees 1
// 输出：log sees 1
```

### 状态：切换状态对象，代替一堆分支

连接流程在不同状态下，对同一个事件的反应不同。每个状态一组处理函数，「超时」也只是一个普通事件。状态只有两三个时，`switch` 更直观；状态和事件都多的时候，表或状态对象更不容易漏掉组合。

```c
#include <stdio.h>

enum event { EV_START, EV_OK, EV_TIMEOUT };
struct state {
    const char *name;
    const struct state *(*on_event)(enum event e);
};

static const struct state IDLE, DIALING, ONLINE;

static const struct state *idle_on(enum event e) { return e == EV_START ? &DIALING : &IDLE; }
static const struct state *dialing_on(enum event e) {
    if (e == EV_OK) return &ONLINE;
    if (e == EV_TIMEOUT) return &IDLE; // 超时也只是一个事件
    return &DIALING;
}
static const struct state *online_on(enum event e) { return e == EV_TIMEOUT ? &IDLE : &ONLINE; }

static const struct state IDLE = { "idle", idle_on };
static const struct state DIALING = { "dialing", dialing_on };
static const struct state ONLINE = { "online", online_on };

int main(void) {
    const struct state *s = &IDLE;
    const enum event seq[] = { EV_START, EV_TIMEOUT, EV_START, EV_OK };
    for (int i = 0; i < 4; i++) {
        s = s->on_event(seq[i]);
        printf("%s\n", s->name);
    }
    return 0;
}
// 输出：dialing
// 输出：idle
// 输出：dialing
// 输出：online
```

### 策略：算法变成参数

重连的等待时间可以固定，也可以指数退避。C 标准库的 `qsort` 就是策略模式：比较函数由调用方传入。

```c
#include <stdio.h>

typedef int (*backoff_fn)(int attempt);

static int fixed(int attempt) { (void)attempt; return 5; }
static int exponential(int attempt) { return attempt >= 6 ? 60 : 1 << attempt; }

static void retry(backoff_fn wait, int times) {
    for (int i = 0; i < times; i++) printf("%d ", wait(i));
    printf("\n");
}

int main(void) {
    retry(fixed, 4);
    retry(exponential, 4);
    return 0;
}
// 输出：5 5 5 5
// 输出：1 2 4 8
```

### 模板方法：骨架固定，个别步骤可换

升级流程永远是下载、校验、应用，顺序不能错，只有个别步骤因平台而异。骨架由框架控制，这种控制反转也是框架和库的主要区别：库由你调用，框架调用你。

```c
#include <stdio.h>

struct ota_ops {
    int (*download)(void);
    int (*apply)(void);
};

static int verify(void) { puts("verify"); return 0; } // 不允许替换

static int ota_run(const struct ota_ops *ops) { // 骨架固定
    if (ops->download() != 0) return -1;
    if (verify() != 0) return -1;
    return ops->apply();
}

static int http_download(void) { puts("http download"); return 0; }
static int ab_apply(void) { puts("switch slot"); return 0; }

int main(void) {
    const struct ota_ops ops = { http_download, ab_apply };
    return ota_run(&ops);
}
// 输出：http download
// 输出：verify
// 输出：switch slot
```

C++ 里通常写成非虚的公有函数加上虚函数，骨架由基类锁定，所以这种写法也叫 NVI：

```cpp
#include <iostream>

class Ota {
public:
    virtual ~Ota() = default;
    int run() { // 非虚：骨架不能被子类改掉
        if (download() != 0) return -1;
        std::cout << "verify\n";
        return apply();
    }
private:
    virtual int download() = 0;
    virtual int apply() = 0;
};

class HttpAbOta : public Ota {
    int download() override { std::cout << "http download\n"; return 0; }
    int apply() override { std::cout << "switch slot\n"; return 0; }
};

int main() {
    HttpAbOta ota;
    return ota.run();
}
// 输出：http download
// 输出：verify
// 输出：switch slot
```

### 访问者：不改节点，增加操作

节点类型稳定、操作经常增加时才合算。比如采样数据类型固定，今天要转 JSON，明天要算大小。反过来，如果新增节点类型，所有访问者都要改。编译器处理语法树是它的典型场景。

```c
#include <stdio.h>

struct temp; struct gps;
struct visitor {
    void (*temp)(const struct temp *t);
    void (*gps)(const struct gps *g);
};
struct sample { void (*accept)(const struct sample *s, const struct visitor *v); };
struct temp { struct sample base; int c; };
struct gps { struct sample base; int lat; };

static void temp_accept(const struct sample *s, const struct visitor *v) { v->temp((const struct temp *)s); }
static void gps_accept(const struct sample *s, const struct visitor *v) { v->gps((const struct gps *)s); }

// 新增一种操作，只要多写一个 visitor
static void json_temp(const struct temp *t) { printf("{\"temp\":%d}\n", t->c); }
static void json_gps(const struct gps *g) { printf("{\"lat\":%d}\n", g->lat); }

int main(void) {
    const struct visitor to_json = { json_temp, json_gps };
    const struct temp t = { { temp_accept }, 25 };
    const struct gps g = { { gps_accept }, 31 };
    const struct sample *all[] = { &t.base, &g.base };
    for (int i = 0; i < 2; i++) all[i]->accept(all[i], &to_json);
    return 0;
}
// 输出：{"temp":25}
// 输出：{"lat":31}
```

## [DIFF] 容易混淆的模式，看目的

这些模式的代码结构很像，区分它们要看**设计目的**。代码评审和技术讨论中，能说出「为什么不是另一个」比背定义有用。

::: interactive pattern-diff title="相似的模式放在一起比" hint="切换分组"
**都在包一层对象**

| 模式 | 目的 | 接口变不变 | 典型时机 |
|---|---|---|---|
| 适配器 | 让接口对得上 | 变 | 接入已有的第三方代码 |
| 装饰器 | 增加功能 | 不变 | 功能需要自由叠加 |
| 代理 | 控制访问 | 不变 | 懒加载、缓存、鉴权、远程 |
| 外观 | 简化使用 | 变得更简单 | 子系统步骤太多 |
| 桥接 | 拆开两个变化维度 | 由自己设计 | 设计之初就知道两边都会变 |

**都用函数指针换行为**

| 模式 | 替换的是什么 | 谁来决定切换 | 例子 |
|---|---|---|---|
| 策略 | 一个算法 | 调用方选好传入 | 重连退避算法 |
| 状态 | 当前状态下的整组行为 | 状态自己转移 | 连接状态机 |
| 模板方法 | 固定流程里的几个步骤 | 流程由框架控制 | 升级流程 |
| 命令 | 把一次请求变成数据 | 调用者决定何时执行，比如消费队列的线程 | 消息队列 |

**都在造对象**

| 模式 | 关注点 | 产出 | 例子 |
|---|---|---|---|
| 工厂方法 | 造哪一种 | 一个产品 | 选择上报通道 |
| 抽象工厂 | 造哪一族 | 一套配套的产品 | 一个平台的全部驱动 |
| 建造者 | 怎么一步步造 | 一个复杂产品 | 连接配置 |
| 原型 | 从谁复制 | 一个副本 | 配置模板 |

**都在解开调用关系**

| 模式 | 拓扑 | 接收方数量 | 例子 |
|---|---|---|---|
| 观察者 | 一对多广播 | 全部订阅者都收到 | 网络状态通知 |
| 中介者 | 星形，中间有逻辑 | 中介决定发给谁 | 主控编排 |
| 责任链 | 线性传递 | 通常一个处理者 | 分级恢复 |
:::

## [TEST] 自测：看场景选模式

复习时不要只看定义，试试看到场景能不能马上想到它，并说出理由。

::: interactive pattern-quiz title="场景选模式" hint="选一个答案" note="有的场景不止一种合理解法，这里给的是最贴切的一个。"
| 场景 | 模式 | 理由 |
|---|---|---|
| 同一套业务要跑在两种芯片上，它们的驱动接口完全不同 | 适配器 | 把各自的接口转成统一形状，业务不用改 |
| 切换平台时，modem、GNSS 和电源管理必须一起换，不能混用 | 抽象工厂 | 关键词是「一族」和「不能混搭」 |
| 连接配置有十几个可选项，有些选项之间还有约束 | 建造者 | 分步设置，在最后一步统一校验 |
| 网络恢复时，上报、日志和定位模块都要知道，而且以后还会增加 | 观察者 | 发布方不应该认识每个订阅方 |
| 十个模块互相调用，改一个牵连一片 | 中介者 | 把网状依赖收成星形 |
| 设备在空闲、拨号、在线、恢复之间切换，同一事件在不同阶段处理不同 | 状态 | 行为取决于当前状态，而且状态会自己转移 |
| 重连的等待时间，不同客户想用不同算法 | 策略 | 只替换一个算法，由调用方选择 |
| 请求要先放进队列，由另一个线程执行，失败了还能重试 | 命令 | 把调用变成可以排队的数据 |
| 异常先尝试轻量恢复，不行再逐级升级 | 责任链 | 沿链传递，直到有人处理 |
| 读 Flash 很慢，想加缓存，但不能改调用方代码 | 代理 | 接口不变，在中间控制访问 |
| 日志要按需组合时间戳、校验和压缩 | 装饰器 | 功能能任意叠加 |
| 每种消息要能走每种通道，组合数量已经爆炸 | 桥接 | 两个独立变化的维度，用组合拆开 |
:::

## [NOTE] 结论与速查

::: lessons
1. **架构的价值看变化的成本。** 拿真实会发生的变化去试，数要改几个模块。
2. **维度必须放在一起看。** 解耦、灵活和性能会互相冲突，好架构是在具体约束下做的取舍。
3. **按变化来拆模块。** 每个模块隐藏一个可能变化的决定，这是 Parnas 半个世纪前的标准，今天依然适用。
4. **多看运行时结构。** 目录和依赖图之外，还要看线程、状态归属和等待关系。多数严重的问题都发生在这一层。
5. **模式是结果，不是目标。** 先有变化点，再选模式。如果说不出它隔离了什么变化，这个模式多半不该用。
:::

评审一份架构设计时，可以直接问这几个问题：

| 维度 | 问题 |
|---|---|
| 耦合内聚 | 最常见的三类需求，各要改几个模块？ |
| 可迁移 | 换芯片或操作系统时，哪些代码要动？ |
| 可适配 | 新增一种协议或客户，是只加代码还是要改分支？ |
| 复杂度 | 新人多久能读懂主路径？这一层能不能删掉？ |
| 可测试 | 核心逻辑能不离开硬件运行吗？ |
| 可靠性 | 一个模块卡死，谁会跟着卡死？有超时吗？ |
| 性能资源 | 热路径上有几次拷贝和切换？预算分给了谁？ |
| 可演进 | 新老版本怎么共存？失败了怎么回滚？ |

## [REF] 参考

- Gamma、Helm、Johnson、Vlissides，《[Design Patterns](https://en.wikipedia.org/wiki/Design_Patterns)》，1994：23 种模式的分类，以及面向接口、组合优于继承两条原则
- David Parnas，《[On the Criteria To Be Used in Decomposing Systems into Modules](https://dl.acm.org/doi/10.1145/361598.361623)》，1972：按设计决定划分模块
- Fred Brooks，《[No Silver Bullet](https://en.wikipedia.org/wiki/No_Silver_Bullet)》，1986：本质复杂度和偶然复杂度
- John Ousterhout，《[A Philosophy of Software Design](https://web.stanford.edu/~ouster/cgi-bin/aposd.php)》：复杂度的症状和深模块
- Martin Fowler，《[Who Needs an Architect?](https://martinfowler.com/ieeeSoftware/whoNeedsArchitect.pdf)》，2003：转述 Ralph Johnson 对架构的看法
- Melvin Conway，《[How Do Committees Invent?](https://www.melconway.com/Home/Committees_Paper.html)》，1968：康威定律
- [ISO/IEC 25010:2011](https://www.iso.org/standard/35733.html)、[2023 版](https://www.iso.org/standard/78176.html)：软件产品质量模型
- Jeff Bezos，[2015 年致股东信](https://www.sec.gov/Archives/edgar/data/1018724/000119312516530910/d168744dex991.htm)：单向门和双向门
- 组件里的影响范围和场景权重是我的图解和判断，文中已标注，不是统计数据。
