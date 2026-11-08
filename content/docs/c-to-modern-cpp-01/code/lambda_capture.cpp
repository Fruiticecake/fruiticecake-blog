// lambda 的捕获方式，以及编译器把 lambda 翻译成的「匿名结构体」。
// g++ -std=c++17 -Wall -Wextra lambda_capture.cpp -o lambda_capture && ./lambda_capture
#include <iostream>

// 手写一个和 [value] { return value; } 等价的结构体
struct ByValueLambda {
    int value;                                 // 捕获的变量 = 成员，构造时拷贝
    int operator()() const { return value; }   // 函数体 = operator()，默认 const
};

// 手写一个和 [&value] { return value; } 等价的结构体
struct ByRefLambda {
    int& value;                                // 引用捕获 = 成员是引用（相当于指针）
    int operator()() const { return value; }
};

int main() {
    int value = 1;
    auto byValue = [value] { return value; };
    auto byRef = [&value] { return value; };
    ByValueLambda handByValue{value};
    ByRefLambda handByRef{value};

    value = 100;  // lambda 都已经创建好了，再改外面的变量

    std::cout << "[value]  -> " << byValue() << "  手写结构体 -> " << handByValue() << "\n";
    std::cout << "[&value] -> " << byRef() << "  手写结构体 -> " << handByRef() << "\n";

    int a = 1;
    int b = 2;
    auto allByValue = [=] { return a + b; };   // 用到的 a、b 都按值
    auto allByRef = [&] { return a + b; };     // 用到的 a、b 都按引用
    a = 10;
    std::cout << "[=] -> " << allByValue() << ", [&] -> " << allByRef() << "\n";

    auto counter = [a]() mutable { return ++a; };  // 改的是 lambda 自己那份拷贝
    int first = counter();
    int second = counter();
    std::cout << "mutable -> " << first << " " << second << ", 外面的 a = " << a << "\n";

    auto noCapture = [] { return 0; };
    std::cout << "sizeof([value]) = " << sizeof(byValue)
              << ", sizeof([&value]) = " << sizeof(byRef)
              << ", sizeof([]) = " << sizeof(noCapture) << "\n";
}
