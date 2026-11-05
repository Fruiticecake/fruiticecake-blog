#!/bin/bash
# 最终实测：各方式交替运行 11 轮，降低机器状态漂移的影响，报告中位数和四分位范围
cd "$(dirname "$0")"
OUT=/tmp/ringfinal; mkdir -p $OUT/nf
CF="-std=gnu11 -O2 -g -w -pthread"
gcc $CF bench.c -o $OUT/bench || exit 1
gcc $CF -DRING_NO_CACHE=1 bench.c -o $OUT/nocache || exit 1
gcc $CF -DRING_ALIGN= bench.c -o $OUT/sameline || exit 1
gcc $CF -DRING_NO_CACHE=1 -DRING_ALIGN= bench.c -o $OUT/sameline_nocache || exit 1
gcc $CF -DRING_SPIN=1 bench.c -o $OUT/nospin || exit 1
cp bench.c $OUT/nf/
sed '/atomic_thread_fence(memory_order_seq_cst);/d' ring.h > $OUT/nf/ring.h
gcc $CF $OUT/nf/bench.c -o $OUT/nofence || exit 1

: > $OUT/tput.txt
for round in $(seq 1 11); do
    echo "spin_cached $($OUT/bench tput spin)" >> $OUT/tput.txt
    echo "spin_nocache $($OUT/nocache tput spin)" >> $OUT/tput.txt
    echo "spin_sameline $($OUT/sameline tput spin)" >> $OUT/tput.txt
    echo "spin_sameline_nocache $($OUT/sameline_nocache tput spin)" >> $OUT/tput.txt
    echo "wait_futex $($OUT/bench tput wait)" >> $OUT/tput.txt
    echo "wait_nofence $($OUT/nofence tput wait)" >> $OUT/tput.txt
    echo "mutex $($OUT/bench tput mutex)" >> $OUT/tput.txt
    echo "pipe $($OUT/bench tput pipe)" >> $OUT/tput.txt
done
echo "=== 吞吐 百万条/秒：中位数 Q1 Q3 min max"
for k in spin_cached spin_nocache spin_sameline spin_sameline_nocache wait_futex wait_nofence mutex pipe; do
    grep "^$k " $OUT/tput.txt | awk '{print $2}' | sort -n | awk -v k=$k '{a[NR]=$1} END {printf "%-24s %.1f %.1f %.1f %.1f %.1f\n", k, a[6], a[3], a[9], a[1], a[11]}'
done

: > $OUT/lat.txt
for round in $(seq 1 7); do
    echo "spin $($OUT/bench lat spin)" >> $OUT/lat.txt
    echo "spin_futex $($OUT/bench lat wait)" >> $OUT/lat.txt
    echo "futex_nospin $($OUT/nospin lat wait)" >> $OUT/lat.txt
    echo "mutex $($OUT/bench lat mutex)" >> $OUT/lat.txt
    echo "pipe $($OUT/bench lat pipe)" >> $OUT/lat.txt
done
echo "=== 单向延迟 ns：p50 中位 / p99 中位 / max 的最小和最大"
for k in spin spin_futex futex_nospin mutex pipe; do
    p50=$(grep "^$k " $OUT/lat.txt | awk '{print $2}' | sort -n | sed -n 4p)
    p99=$(grep "^$k " $OUT/lat.txt | awk '{print $3}' | sort -n | sed -n 4p)
    mx=$(grep "^$k " $OUT/lat.txt | awk '{print $4}' | sort -n | sed -n '1p;7p' | tr '\n' ' ')
    printf "%-16s %s %s max: %s\n" $k "$p50" "$p99" "$mx"
done
