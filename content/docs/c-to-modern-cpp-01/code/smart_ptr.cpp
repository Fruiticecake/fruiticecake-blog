// unique_ptr / shared_ptr / weak_ptr：所有权、reset 之后、循环引用。
// g++ -std=c++17 -Wall -Wextra -fsanitize=address,undefined smart_ptr.cpp -o smart_ptr && ./smart_ptr
#include <iostream>
#include <memory>
#include <utility>

struct Node {
    const char* name;
    std::shared_ptr<Node> next;   // 强引用：我拥有它
    std::weak_ptr<Node> prev;     // 弱引用：我只是看着它
    explicit Node(const char* n) : name(n) {}
    ~Node() { std::cout << "  ~Node(" << name << ")\n"; }
};

struct Strong;
struct Strong {
    std::shared_ptr<Strong> other;
    ~Strong() { std::cout << "  ~Strong\n"; }
};

int main() {
    std::cout << "1. unique_ptr 只能移动\n";
    auto u1 = std::make_unique<int>(10);
    // auto u2 = u1;              // 编译错误：拷贝构造被 delete
    auto u2 = std::move(u1);       // 所有权交给 u2
    std::cout << "  u1 " << (u1 ? "非空" : "为空") << ", *u2 = " << *u2 << "\n";

    std::cout << "2. shared_ptr 计数，reset 之后这个变量还能再用\n";
    auto p = std::make_shared<int>(42);
    auto p2 = p;
    std::cout << "  use_count = " << p.use_count() << "\n";
    p2.reset();                    // p2 放弃所有权，变成空；对象还在，因为 p 还拥有它
    std::cout << "  reset 后 p2 " << (p2 ? "非空" : "为空") << ", p.use_count = " << p.use_count() << "\n";
    p2 = p;                        // 空的 shared_ptr 可以重新赋值
    std::cout << "  重新赋值后 *p2 = " << *p2 << ", use_count = " << p.use_count() << "\n";

    std::cout << "3. weak_ptr 用之前要 lock()\n";
    std::weak_ptr<int> w = p;
    std::cout << "  weak_ptr 不加计数：use_count = " << p.use_count() << "\n";
    if (auto locked = w.lock()) {
        std::cout << "  lock 成功，值 = " << *locked << "\n";
    }
    p.reset();
    p2.reset();                    // 最后一个强引用没了，对象销毁
    std::cout << "  全部 reset 后 expired = " << std::boolalpha << w.expired()
              << ", lock() " << (w.lock() ? "非空" : "为空") << "\n";

    std::cout << "4. 双向链表：next 用强引用，prev 用弱引用\n";
    {
        auto a = std::make_shared<Node>("a");
        auto b = std::make_shared<Node>("b");
        a->next = b;
        b->prev = a;
        std::cout << "  a.use_count = " << a.use_count() << ", b.use_count = " << b.use_count() << "\n";
    }
    std::cout << "  离开作用域，两个都析构了\n";

    std::cout << "5. 两边都用强引用：离开作用域谁也不析构（ASan 会在退出时报泄漏）\n";
    {
        auto x = std::make_shared<Strong>();
        auto y = std::make_shared<Strong>();
        x->other = y;
        y->other = x;
    }
    std::cout << "  没有看到 ~Strong" << std::endl;  // 先刷新输出，ASan 报泄漏时会直接退出
}
