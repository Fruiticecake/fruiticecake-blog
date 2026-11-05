#!/bin/bash
# 三个版本：正确、去掉 fence、不比较值（内核不再检查下标）
cd "$(dirname "$0")"
OUT=/tmp/ringlost; mkdir -p $OUT
CF="-std=gnu11 -O2 -g -pthread -w"
build() {
    mkdir -p $OUT/$1; cp lost_wake.c $OUT/$1/
    sed "$2" ring.h > $OUT/$1/ring.h
    gcc $CF -DROUNDS=$3 $OUT/$1/lost_wake.c -o $OUT/$1/run
}
build ok 's/@@none@@//' 2000000u
build nofence '/atomic_thread_fence(memory_order_seq_cst);/d' 2000000u
build nocmp 's/^struct ring_slot {/static _Atomic uint32_t g_park;\n&/; s/futex_wait(word, seen, \&ts);/futex_wait(\&g_park, 0, \&ts);/; s/futex_wake(word, 1);/futex_wake(\&g_park, 1);/' 100000u
for i in 1 2 3; do echo "正确版本:   $($OUT/ok/run)"; done
for i in 1 2 3; do echo "去掉 fence: $(timeout 150 $OUT/nofence/run)"; done
for i in 1 2 3; do echo "不比较值:   $(timeout 150 $OUT/nocmp/run)"; done
