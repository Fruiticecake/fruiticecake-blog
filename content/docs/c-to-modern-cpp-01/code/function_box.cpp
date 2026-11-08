// std::function：把「各种能调用的东西」装进同一个类型。
// g++ -std=c++17 -Wall -Wextra function_box.cpp -o function_box && ./function_box
#include <cstdlib>
#include <functional>
#include <iostream>
#include <map>
#include <string>
#include <vector>

int twice(int x) { return x * 2; }

struct AddN {                      // 重载了 operator() 的类，也叫函数对象
    int n;
    int operator()(int x) const { return x + n; }
};

int main() {
    int offset = 10;
    std::vector<std::function<int(int)>> calls = {
        twice,                                  // 普通函数
        AddN{3},                                // 函数对象
        [offset](int x) { return x + offset; }, // 带捕获的 lambda
    };
    for (const auto& f : calls) {
        std::cout << f(5) << " ";
    }
    std::cout << "\n";

    // 一个最小的「话题 -> 回调列表」表，事件总线的核心就是它
    std::map<std::string, std::vector<std::function<void(const std::string&)>>> table;
    int received = 0;
    table["net/up"].push_back([&received](const std::string& p) { ++received; std::cout << "ui: " << p << "\n"; });
    table["net/up"].push_back([](const std::string& p) { std::cout << "uploader: " << p << "\n"; });
    for (const auto& handler : table["net/up"]) {
        handler("wlan0");
    }
    std::cout << "received = " << received << "\n";

    // 不捕获任何变量的 lambda 可以直接当 C 函数指针用，比如传给 qsort
    int arr[] = {5, 1, 4, 2, 3};
    std::qsort(arr, 5, sizeof(int), [](const void* l, const void* r) {
        return *static_cast<const int*>(l) - *static_cast<const int*>(r);
    });
    for (int x : arr) {
        std::cout << x << " ";
    }
    std::cout << "\n";

    std::cout << "sizeof(int(*)(int)) = " << sizeof(int (*)(int))
              << ", sizeof(std::function<int(int)>) = " << sizeof(std::function<int(int)>) << "\n";
}
