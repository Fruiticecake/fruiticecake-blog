---
title: C 程序员速通现代 C++（一）：lambda、std::function、移动语义与智能指针
display_title: "C 程序员速通[现代 C++]（一）"
date: 2026-11-08
section: docs
summary: "已经会 C，学 C++ 时最该先学哪几样？本文把 lambda、std::function、右值引用与移动语义、智能指针逐个对照到 C 里的手写模式：函数指针加 void* ctx、深拷贝与转移所有权、手写引用计数，并用 sizeof、堆地址和 ASan 的实测结果验证每个结论。"
tags: [C++, C, 现代C++, 移动语义, 智能指针, 嵌入式]
kicker: 技术文档 / C++ · C · 嵌入式
source: "https://github.com/changkun/modern-cpp-tutorial"
source_label: 现代 C++ 教程 · 实测
design: stage
hero: move-hero
---

::: tldr
会 C 的人学现代 C++，先学四样：**lambda** 是编译器替你写的「函数指针 + ctx 结构体」；**std::function** 是能装下任何同签名可调用对象的盒子；**右值引用和移动语义**把 C 里「深拷贝」和「转移所有权」两种约定变成了编译器按参数自动选择的规则；**智能指针**把「谁负责 free」写进了类型。四样背后是同一个思想：把 C 里靠注释和约定维持的东西，交给类型系统和析构函数来保证。
:::

学习材料是欧长坤的开源书《现代 C++ 教程》第 3、5 章（链接见文末）。本文不复述原书，而是换一个角度：每个概念先说 C 里是怎么手写的、哪里容易出错，再看 C++ 怎么解决，最后用一段可以运行的代码验证。全部示例在 x86-64 Ubuntu 24.04、g++ 13.3、`-std=c++17` 下编译运行，带内存地址的输出每次运行数值会变，相对关系不变。

## [READ] 读 C++ 之前：两个让人发懵的地方

刚从 C 过来读 C++，最容易卡在两处：到处都是 `std::`，以及类型后面出现了 `&` 和 `&&`。

**`std::` 是命名空间前缀**，表示这个名字来自标准库，作用和 C 里给库函数加 `pthread_`、`str` 前缀一样。快速阅读时可以在脑子里把它删掉：`std::string&& r = std::move(s);` 读成 `string&& r = move(s);`，结构就清楚了。写代码时要保留它，尤其不要在头文件里写 `using namespace std;`，否则所有包含这个头文件的代码都会被污染。

**引用是 C 没有的东西。** C 只有指针，C++ 在类型后面多了两种写法：

| 写法 | 含义 | C 里有没有 |
|---|---|---|
| `int* p` | 指针 | 有 |
| `int& r` | 引用：一个别名，不能为空，不能改指向 | 没有 |
| `std::string&& r` | 右值引用：只能绑定临时对象，或被 `std::move` 标记过的对象 | 没有 |

另外 `&` 在 lambda 的捕获列表里（`[&]`）表示按引用捕获，`&&` 在表达式里仍然是逻辑与。同一个符号的意思由位置决定，这是 C++ 读起来比 C 费劲的主要原因之一。

## [LAMBDA] lambda 是编译器替你写的结构体

C 里注册回调的标准写法是函数指针加一个 `void* ctx`：

```c
typedef void (*handler_fn)(const char* payload, void* ctx);
int bus_subscribe(const char* topic, handler_fn fn, void* ctx);
```

回调需要的数据塞进 `ctx`，回调里再强转回来。ctx 指向哪里、活多久、谁来释放，编译器都不管。

**lambda 把「函数」和「它需要的数据」打包成一个对象。** 编译器遇到一个 lambda，会生成一个匿名结构体：捕获的变量是成员，函数体是 `operator()`。下面两段代码效果相同：

```cpp
int value = 1;
auto byValue = [value] { return value; };

// 编译器生成的东西，大致等价于：
struct ByValueLambda {
    int value;                                 // 捕获的变量 = 成员，构造时拷贝
    int operator()() const { return value; }   // 函数体 = operator()，默认 const
};
ByValueLambda handByValue{value};
```

用「结构体」这个模型，捕获规则全都能推出来：

| 写法 | 结构体里的成员 | 结论 |
|---|---|---|
| `[value]` | `int value` | 创建 lambda 时拷贝，之后外面怎么改都和它无关 |
| `[&value]` | `int& value` | 存的是引用（底层就是地址），调用时读外面现在的值 |
| `[=]` / `[&]` | 用到的变量全部拷贝 / 全部引用 | 编译器看函数体里用了谁，就生成谁 |
| `[=, &b]` | 默认拷贝，`b` 是引用 | 可以混用 |
| `[v = std::move(p)]` | 用任意表达式初始化成员（C++14） | 能把只能移动的对象（如 `unique_ptr`）放进 lambda |

::: interactive capture-lab title="值捕获和引用捕获，差在结构体成员" hint="SWITCH / STEP" note="先选捕获方式，再按「下一步」：创建 lambda → 改外面的变量 → 调用。"
| 捕获写法 | 说明 | 调用结果 |
|---|---|---|
| `[value]` | 创建时把 value 拷进闭包，之后外面改成 100 与它无关。 | 1 |
| `[&value]` | 闭包里存的是引用，调用时读到的是外面现在的值。 | 100 |
:::

实测（`code/lambda_capture.cpp`）：创建之后把外面的 `value` 改成 100，`[value]` 返回 1，`[&value]` 返回 100，手写的两个结构体结果完全一样。`sizeof` 也印证了这个模型：捕获一个 `int` 的 lambda 是 4 字节，按引用捕获是 8 字节，正好是一个指针；什么都不捕获的 lambda 是 1 字节，C++ 里空类至少占 1 字节。

这个模型还解释了两个细节：

- **按值捕获的成员默认不能改**，因为生成的 `operator()` 是 `const` 成员函数。要改就加 `mutable`，改的也只是 lambda 自己那份拷贝：`[a]() mutable { return ++a; }` 连调两次得到 11、12，外面的 `a` 仍是 10。
- **引用捕获会悬空。** 被引用的局部变量先销毁、lambda 后调用，和 C 里 ctx 指向已经返回的栈帧是同一个错误。另一个更隐蔽的版本：在成员函数里写 `[=]`，C++17 会隐式捕获 `this` 指针，而不是成员的拷贝；对象销毁后再调用，ASan 会报 `stack-use-after-scope`（栈对象）或 `heap-use-after-free`（堆对象）。C++20 起编译器对这种写法给出弃用警告，要求写明 `[=, this]` 或 `[*this]`。

## [FUNC] std::function：一个装可调用对象的盒子

lambda 解决了「打包」，但每个 lambda 的类型都是编译器生成的、独一无二的匿名结构体。你写不出 `std::vector<那个类型>`，也就没法把一组回调放进同一个容器。

**`std::function<int(int)>` 就是那个统一的类型。** 尖括号里的 `int(int)` 是一个函数类型：返回 `int`，接收一个 `int`。C 程序员其实见过它，`typedef int fn_t(int);` 定义的就是这个类型，`int (*)(int)` 是指向它的指针。`std::function<int(int)>` 的意思是：任何能以 `int(int)` 的方式调用的东西都能放进来。

```cpp
int twice(int x) { return x * 2; }
struct AddN { int n; int operator()(int x) const { return x + n; } };

int offset = 10;
std::vector<std::function<int(int)>> calls = {
    twice,                                  // 普通函数
    AddN{3},                                // 函数对象
    [offset](int x) { return x + offset; }, // 带捕获的 lambda
};
for (const auto& f : calls) std::cout << f(5) << " ";   // 10 8 15
```

三样东西类型各不相同，装进 `std::function` 后可以放进同一个 `vector`。区别只在内部：`twice` 只是一个函数地址，没有状态；lambda 是一个带着捕获变量的闭包对象，如果它按引用捕获了局部变量，局部变量销毁后再调用它就会悬空，`std::function` 并不会替你延长被引用对象的寿命。

事件总线、定时器、GUI 回调的核心数据结构都长这样：

```cpp
std::map<std::string, std::vector<std::function<void(const std::string&)>>> table;
table["net/up"].push_back([](const std::string& p) { std::cout << "ui: " << p << "\n"; });
for (const auto& handler : table["net/up"]) handler("wlan0");
```

和 C 的关系有两点值得记住：

- **不捕获任何变量的 lambda 可以隐式转换成普通函数指针**，所以能直接传给 C 接口。示例里直接把 lambda 传给了 `qsort` 当比较函数。
- **`std::function` 有代价。** 它靠类型擦除实现，在这台机器上占 32 字节，函数指针只占 8 字节；装进去的闭包太大时还会在堆上分配，每次调用多一次间接跳转。热路径上，或者回调类型在编译期就确定时，可以直接用模板参数接收 lambda。

## [RVAL] 右值引用：区分「还要用的」和「可以拿走的」

移动语义要解决的问题，C 程序员很熟悉：同样是把 A 的内容给 B，有时 A 之后还要用，只能深拷贝一份；有时 A 马上就要销毁了，直接把指针交给 B 就行。C 靠函数名和注释区分这两种情况，C++ 让编译器根据参数的类别自动区分。

先分清两类表达式：

- **左值**：有名字、能取地址、这一行结束后还在。例如变量 `lv1`。
- **右值**：临时的、没有名字。例如 `lv1 + lv2` 拼出来的字符串、函数按值返回的对象。

`T&&` 叫右值引用，**它只能绑定右值**，意思是「这个对象没人要了，可以拿走它的资源」。由此可以理解原书里两行看起来很像、却一个合法一个非法的代码：

```cpp
std::string&& r1 = lv1;          // 非法：lv1 有名字，后面的代码可能还要用
std::string&& rv2 = lv1 + lv2;   // 合法：lv1 + lv2 是没有名字的临时对象
```

为什么不让 `&&` 直接绑定左值？假设允许，`vector` 有两个版本的 `push_back`：`push_back(const T&)` 拷贝一份，`push_back(T&&)` 拿走内容。你写 `v.push_back(name);`，编译器若选了后者，`name` 就被悄悄掏空，而代码里看不出任何搬走的痕迹。所以规定：**有名字的对象，必须由程序员亲手写 `std::move`**，表示同意交出去。

第二行还有一个效果：临时对象本来在这一行的分号处就销毁，绑定到引用之后，寿命延长到引用离开作用域。可以理解成编译器偷偷造了一个局部变量 `std::string __tmp = lv1 + lv2;`，`rv2` 是它的别名。平时天天依赖这条规则的是函数参数：`void publish(const std::string& topic)` 被 `publish("net/" + name)` 调用时，拼出来的临时字符串会一直活到函数返回。

**`std::move` 本身什么都不移动。** 它只是一次类型转换，相当于贴上一张「可以拿走」的标签。真正拿资源的，是接下来被调用的移动构造函数：

```cpp
std::string lv1 = "string,";
std::string&& rv1 = std::move(lv1);  // 只是起了个别名，没有新对象，lv1 不变
std::string s2 = std::move(lv1);     // 构造新对象，调用移动构造，lv1 被掏空
```

实测（`code/move_owner.cpp`）：绑定 `rv1` 之后 `lv1` 仍是 `"string,"`；构造 `s2` 之后 `lv1` 变成了空字符串。区别只在于左边是引用还是新对象。

## [MOVE] 移动语义：交出指针，而不是复印一份再扔掉

一个管理堆内存的类，在 C++ 里通常同时有拷贝构造和移动构造。两者的区别就是 `&` 的个数：

```cpp
class Buffer {
public:
    Buffer(const Buffer& other)                 // 拷贝构造：参数是左值
        : size_(other.size_), data_(new char[size_]) {
        std::memcpy(data_, other.data_, size_); // 再申请一块，复制内容
    }
    Buffer(Buffer&& other) noexcept             // 移动构造：参数是右值
        : size_(other.size_), data_(other.data_) {
        other.size_ = 0;
        other.data_ = nullptr;                  // 把对方置空
    }
    ~Buffer() { delete[] data_; }               // delete[] nullptr 什么都不做
    // ...
private:
    std::size_t size_;
    char* data_;
};
```

**`&` 的个数决定了这个构造函数接收哪一类参数。** 实参是左值，编译器选拷贝构造；实参是右值（临时对象，或 `std::move` 过的变量），选移动构造。这就是普通的函数重载，只是重载的依据从「参数类型」扩展到了「参数是左值还是右值」。

C 里没有引用，也不会自动选，但有完全对应的手写模式：

```c
/* 深拷贝：src 之后照常使用 */
void buf_copy(struct buf* dst, const struct buf* src) {
    dst->len = src->len;
    dst->data = malloc(src->len);
    memcpy(dst->data, src->data, src->len);
}
/* 转移所有权：拿走指针，src 置空，之后对 src 调用 free(src->data) 也安全 */
void buf_take(struct buf* dst, struct buf* src) {
    dst->len = src->len;
    dst->data = src->data;
    src->len = 0;
    src->data = NULL;
}
```

区别在于谁来保证用对。C 里调错了函数，编译器不会提醒；C++ 里有名字的变量只会触发拷贝，除非你亲手写 `std::move`。

::: interactive move-lab title="拷贝构造 vs 移动构造：堆上有几块内存" hint="SWITCH / DESTROY" note="切换拷贝和移动，再让对象离开作用域，看析构时各释放了什么。"
| 操作 | 源对象之后 | 新对象 | 析构时 |
|---|---|---|---|
| 拷贝 b = a | a 不变，仍指向块 1 | b 指向新申请的块 2，内容复制过来 | 块 1、块 2 各 delete[] 一次 |
| 移动 c = std::move(a) | a 的指针被置为 nullptr | c 直接拿走块 1，没有新申请 | c 释放块 1；a 执行 delete[] nullptr，什么也不做 |
:::

实测输出（地址只保留后几位）：拷贝时 `b` 拿到一个新地址 `…030`；移动时 `c` 用的就是 `a` 原来那块 `…010`，`a` 打印为「(空)」。程序结束时三个对象依次析构，其中一个是 `delete[] (nil)`，没有重复释放，ASan 也没有报错。

被移走的对象处于**有效但内容未指定**的状态：可以安全地析构，也可以重新赋值，但不应该再读它的内容。标准库的 `string` 和 `vector` 通常把它变成空的，但这是实现上的选择，不是保证。

### push_back(std::move(str)) 到底搬了什么

`v.push_back(std::move(str))` 分三步发生：`std::move` 把 `str` 标成右值；编译器因此选中 `push_back(std::string&&)` 这个重载；`push_back` 在 vector 里构造新元素时调用 `string` 的移动构造，拿走 `str` 的缓冲区。用堆地址可以直接看到这件事（`code/push_back_move.cpp`）：

| 操作 | 新元素的缓冲区 | 之后 str 的长度 |
|---|---|---|
| `push_back(str)`，40 个字符 | 新地址 `…050`，内容复制过去 | 40，不变 |
| `push_back(std::move(str))`，40 个字符 | `…010`，就是 str 原来那块 | 0 |
| `push_back(std::move(small))`，12 个字符 | 新地址，在堆上新建 | 0 |

最后一行说明「移动等于偷指针」并不总成立。12 个字符的短字符串根本不在堆上，而是存在 `string` 对象内部的一个小缓冲区里，这叫**短字符串优化**（SSO，g++ 的阈值是 15 个字符）。移动它时没有指针可偷，只能把那十几个字节复制过去，再把源字符串清空。移动快不快，取决于这个类型怎么实现。

## [OWN] 智能指针：把「谁负责 free」写进类型

C 里一块 `malloc` 出来的内存由谁 `free`，全靠函数文档和团队约定：返回值要不要调用方释放、传进去的指针会不会被接管、多个模块共享时谁最后释放。智能指针把这些约定变成了三种类型，释放由析构函数自动完成，这就是 RAII（资源获取即初始化）：

| 类型 | 所有权 | 能拷贝吗 | C 里的对应做法 |
|---|---|---|---|
| `std::unique_ptr<T>` | 独占 | 不能，只能移动 | 一个指针只有一个 owner，交出去时把自己置为 NULL |
| `std::shared_ptr<T>` | 共享，引用计数 | 能，每拷贝一份计数加一 | 结构体里放 refcount，配一对 `ref()` / `unref()` |
| `std::weak_ptr<T>` | 不拥有，只观察 | 能，不影响计数 | 句柄表、代际计数这类「对方还活着才用」的机制 |

`unique_ptr` 就是上一节 `Buffer` 的通用版：拷贝构造被删除，移动构造把指针交出去。`auto u2 = u1;` 编译不过，`auto u2 = std::move(u1);` 之后 `u1` 为空。（`std::make_unique` 是 C++14 才补上的，所以 C++11 的代码里常见 `std::unique_ptr<T>(new T)`。）

### reset 之后，这个指针还能用吗

要分清「智能指针这个变量」和「它原来指向的对象」。`p2.reset()` 让 `p2` 放弃所有权、变成空：

- **变量还能用**：可以 `if (p2)` 判断，也可以重新赋值，`p2 = p;` 或 `p2 = std::make_shared<int>(1);`。
- **但不能再通过它访问原来的对象**：对空的 `shared_ptr` 解引用就是空指针解引用。
- **原来的对象不一定被销毁**：只要还有别的 `shared_ptr` 拥有它，它就活着，计数归零时才析构。

实测（`code/smart_ptr.cpp`）：`use_count` 为 2；`p2.reset()` 后 `p2` 为空、`p` 的计数变成 1；`p2 = p` 后又能读到 42，计数回到 2。还有一个坑：`p.get()` 拿到的裸指针不增加计数，最后一个 `shared_ptr` 释放之后它就悬空了。所以裸指针只用来临时访问，不要保存。

### 弱引用能打破循环，为什么不全用弱引用

两个对象用 `shared_ptr` 互相指着，计数永远到不了 0，谁也不会被释放。这是引用计数的经典缺陷，`weak_ptr` 就是为它准备的。

**但弱引用不拥有对象。** 一个对象如果只有 `weak_ptr` 指着，强引用计数就是 0，它会立刻被销毁。总要有人用 `shared_ptr` 声明「我需要它活着」，`weak_ptr` 只能观察：

| | `shared_ptr`（强引用） | `weak_ptr`（弱引用） |
|---|---|---|
| 含义 | 我拥有它，我在它就在 | 我只是看着它，它可能已经没了 |
| 怎么用 | 直接解引用 | 先 `lock()` 换成 `shared_ptr`，可能拿到空，必须判断 |
| 好处 | 用法简单，保证对象活着 | 不阻止释放，能打破循环；能检测对象是否还在，不会悬空 |
| 坏处 | 互相持有就泄漏 | 每次使用都要 `lock()` 和判空，多一次原子操作 |

::: interactive owner-graph title="循环引用：把一条边换成 weak_ptr" hint="SWITCH / LEAVE SCOPE" note="A、B 是两个链表节点。切换 b->prev 的类型，再让两个局部变量离开作用域。"
| b->prev 的类型 | 离开作用域前 | 离开作用域后 |
|---|---|---|
| shared_ptr | A 的强引用 2（局部变量 a、b->prev），B 的强引用 2（局部变量 b、a->next） | 局部变量销毁后两边各剩 1，谁也到不了 0，A 和 B 都不析构：内存泄漏 |
| weak_ptr | A 的强引用 1（weak_ptr 不计数），B 的强引用 2 | A 先归零并析构，释放 a->next，B 随之归零并析构 |
:::

实测：双向链表的 `next` 用 `shared_ptr`、`prev` 用 `weak_ptr` 时，`a.use_count` 为 1、`b.use_count` 为 2，离开作用域后依次打印 `~Node(a)`、`~Node(b)`。另一个两边都用 `shared_ptr` 的对照组，离开作用域后一个析构都没打印，程序退出时 ASan 报告 `64 byte(s) leaked in 2 allocation(s)`。`weak_ptr` 在对象销毁后 `expired()` 返回 true、`lock()` 返回空，这正是它比裸指针安全的地方：它知道对方已经不在了。

设计时的规则：**把所有权关系画成一棵树。** 父指向子用强引用；反方向的边，比如子指向父、观察者指向被观察者、缓存指向数据，用弱引用。一个具体的例子是事件总线的订阅句柄：句柄离开作用域时要去总线上取消订阅，但它不该让总线一直活着，所以句柄持有总线的 `weak_ptr`，析构时先 `lock()`，拿到空就什么都不做。

## [NOTE] 小结

::: ledger
- [+] **lambda** 把「函数指针 + ctx」打包成一个对象，捕获规则可以用「编译器生成的结构体」完整推出来。
- [+] **std::function** 让不同类型的可调用对象有了统一类型，回调表可以直接用标准容器写。
- [+] **移动语义** 把深拷贝和转移所有权交给重载规则自动选择，有名字的变量只有写了 std::move 才会被拿走。
- [+] **智能指针** 把释放责任写进类型，unique_ptr 独占、shared_ptr 计数、weak_ptr 观察。
- [-] **std::function 有开销** 32 字节、可能堆分配、多一次间接调用，热路径要掂量。
- [-] **移动不一定便宜** 短字符串优化等实现细节下，移动退化为复制几个字节。
- [-] **shared_ptr 不是垃圾回收** 环形强引用照样泄漏，需要人为把一条边换成 weak_ptr。
:::

::: lessons
1. **先找 C 里的手写对应物。**lambda 对应函数指针加 ctx，移动对应 buf_take，shared_ptr 对应手写 refcount。找到对应物，新语法就只是把老约定交给编译器检查。
2. **用实验代替记规则。**sizeof 能看出 lambda 存了什么，堆地址能看出移动有没有发生，ASan 能看出谁泄漏、谁悬空。一条规则拿不准，就写十行代码跑一遍。
3. **区分「变量」和「它管的资源」。**右值引用只是别名，reset 只是让变量放弃所有权，被移走的对象仍然要析构。很多困惑来自把这两者混为一谈。
4. **所有权画成树，反向用弱引用。**无论用不用智能指针，先画出谁拥有谁，循环引用和悬空指针在图上一眼就能看出来。
:::

## [REF] 参考

- 欧长坤，《现代 C++ 教程：高速上手 C++11/14/17/20》，第 3 章「语言运行期的强化」、第 5 章「智能指针与内存管理」：https://github.com/changkun/modern-cpp-tutorial
- cppreference：值类别 https://zh.cppreference.com/w/cpp/language/value_category ，`std::function` https://zh.cppreference.com/w/cpp/utility/functional/function ，`std::weak_ptr` https://zh.cppreference.com/w/cpp/memory/weak_ptr
- 本文示例代码：文章目录下的 `code/`（`lambda_capture.cpp`、`function_box.cpp`、`move_owner.cpp`、`push_back_move.cpp`、`smart_ptr.cpp`，`run_all.sh` 一次编译运行全部，`output.txt` 是本文引用的输出）。
