// 拷贝构造 vs 移动构造：一个管理堆内存的 Buffer。
// g++ -std=c++17 -Wall -Wextra -fsanitize=address,undefined move_owner.cpp -o move_owner && ./move_owner
#include <cstdio>
#include <cstring>
#include <iostream>
#include <string>
#include <utility>

class Buffer {
public:
    explicit Buffer(const char* text) : size_(std::strlen(text) + 1), data_(new char[size_]) {
        std::memcpy(data_, text, size_);
        std::printf("  构造  data=%p\n", static_cast<void*>(data_));
    }
    Buffer(const Buffer& other) : size_(other.size_), data_(new char[size_]) {   // 拷贝：再申请一块
        std::memcpy(data_, other.data_, size_);
        std::printf("  拷贝  data=%p（新申请）\n", static_cast<void*>(data_));
    }
    Buffer(Buffer&& other) noexcept : size_(other.size_), data_(other.data_) {    // 移动：直接拿走
        other.size_ = 0;
        other.data_ = nullptr;                                                     // 对方置空
        std::printf("  移动  data=%p（拿走对方的）\n", static_cast<void*>(data_));
    }
    Buffer& operator=(const Buffer&) = delete;  // 本例只演示构造，赋值先禁掉
    Buffer& operator=(Buffer&&) = delete;
    ~Buffer() {
        std::printf("  析构  data=%p\n", static_cast<void*>(data_));
        delete[] data_;                         // delete[] nullptr 什么都不做
    }
    const char* c_str() const { return data_ ? data_ : "(空)"; }

private:
    std::size_t size_;
    char* data_;
};

int main() {
    std::cout << "1. 拷贝\n";
    Buffer a("hello");
    Buffer b = a;               // a 是有名字的左值 -> 选中 Buffer(const Buffer&)
    std::cout << "  a=" << a.c_str() << " b=" << b.c_str() << "\n";

    std::cout << "2. 移动\n";
    Buffer c = std::move(a);    // std::move 把 a 标成右值 -> 选中 Buffer(Buffer&&)
    std::cout << "  a=" << a.c_str() << " c=" << c.c_str() << "\n";

    std::cout << "3. 右值引用只是别名，不会移动\n";
    std::string lv1 = "string,";
    std::string&& rv1 = std::move(lv1);         // 没有新对象，没有调用任何构造函数
    std::cout << "  绑定之后 lv1=\"" << lv1 << "\"\n";
    std::string s2 = std::move(lv1);            // 构造新对象，调用 string 的移动构造
    std::cout << "  构造之后 lv1=\"" << lv1 << "\" s2=\"" << s2 << "\"\n";
    (void)rv1;

    std::cout << "4. 临时对象绑到右值引用上，寿命延长到引用的作用域结束\n";
    std::string lv2 = "tail";
    std::string&& rv2 = s2 + lv2;               // s2 + lv2 是没有名字的临时 string
    rv2 += "!";
    std::cout << "  rv2=\"" << rv2 << "\"\n";

    std::cout << "main 结束，按逆序析构：\n";
}
