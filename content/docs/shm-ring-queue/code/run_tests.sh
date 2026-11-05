#!/bin/bash
# 普通构建、ASan+UBSan、TSan 各跑一遍；再把代码改坏，确认工具能抓到
cd "$(dirname "$0")"
OUT=/tmp/ringtest; mkdir -p $OUT
gcc -std=gnu11 -O2 -g -Wall -Wextra -Werror test_ring.c -o $OUT/plain -pthread || exit 1
echo "== plain"; timeout 120 $OUT/plain; echo "exit=$?"
gcc -std=gnu11 -O1 -g -Wall -Wextra -fsanitize=address,undefined test_ring.c -o $OUT/asan -pthread || exit 1
echo "== asan+ubsan"; timeout 200 $OUT/asan; echo "exit=$?"
gcc -std=gnu11 -O1 -g -fsanitize=thread test_ring.c -o $OUT/tsan -pthread || exit 1
echo "== tsan"; timeout 250 $OUT/tsan notfork 2>&1 | tail -12; echo "exit=${PIPESTATUS[0]}"

echo "== mutation: release -> relaxed on tail"
mkdir -p $OUT/m1; cp test_ring.c $OUT/m1/
sed 's/atomic_store_explicit(&r->tail, t + 1, memory_order_release)/atomic_store_explicit(\&r->tail, t + 1, memory_order_relaxed)/' ring.h > $OUT/m1/ring.h
gcc -std=gnu11 -O1 -g -fsanitize=thread $OUT/m1/test_ring.c -o $OUT/m1/tsan -pthread
timeout 60 $OUT/m1/tsan notfork 2>&1 | grep -E 'WARNING|Write of|Previous|Read of|SUMMARY' | head -6
