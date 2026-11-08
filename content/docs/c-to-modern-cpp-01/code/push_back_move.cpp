// v.push_back(str) 和 v.push_back(std::move(str)) 到底搬了什么：看堆缓冲区地址。
// g++ -std=c++17 -Wall -Wextra push_back_move.cpp -o push_back_move && ./push_back_move
#include <cstdio>
#include <string>
#include <utility>
#include <vector>

static const void* addr(const std::string& s) { return static_cast<const void*>(s.data()); }

int main() {
    std::vector<std::string> v;
    v.reserve(4);  // 先留好位置，避免 vector 扩容时再搬一次，干扰观察

    std::string str(40, 'x');  // 40 个字符，超过短字符串优化的容量，一定在堆上
    std::printf("str 的缓冲区        %p\n", addr(str));

    v.push_back(str);
    std::printf("拷贝后 v[0] 的缓冲区 %p，str 长度 %zu\n", addr(v[0]), str.size());

    v.push_back(std::move(str));
    std::printf("移动后 v[1] 的缓冲区 %p，str 长度 %zu\n", addr(v[1]), str.size());

    std::string small = "Hello world.";  // 12 个字符，放得进对象内部的小缓冲区
    std::printf("短字符串 small 的缓冲区 %p（在 small 对象内部 %p 附近）\n",
                addr(small), static_cast<const void*>(&small));
    v.push_back(std::move(small));
    std::printf("移动后 v[2] 的缓冲区   %p，small 长度 %zu\n", addr(v[2]), small.size());
}
