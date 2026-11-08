#!/usr/bin/env bash
# 编译并运行本文全部示例。环境：Ubuntu 24.04，g++ 13.3，-std=c++17。
set -u
cd "$(dirname "$0")"
OUT=$(mktemp -d)
for src in lambda_capture function_box move_owner push_back_move smart_ptr; do
  echo "===== $src.cpp"
  if g++ -std=c++17 -Wall -Wextra -g -fsanitize=address,undefined "$src.cpp" -o "$OUT/$src"; then
    ASAN_OPTIONS=detect_leaks=1 "$OUT/$src" 2>&1 | grep -v "^    #\|^$\|^Indirect\|^Direct\|allocated from" || true
  else
    echo "编译失败"
  fi
done
