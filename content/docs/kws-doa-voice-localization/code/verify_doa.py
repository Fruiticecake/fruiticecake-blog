#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""可复现数值验证脚本：PCM 带宽、TDOA 几何分辨率、普通互相关 vs GCC-PHAT 抗混响对比、ALSA 环形缓冲 XRUN 模拟。

零第三方依赖，Python 3.11+ 直接运行：
    python verify_doa.py > output.txt
"""
import cmath
import math
import random

C = 340.0  # 室温 20℃ 左右空气中声速（m/s）


def fft(x):
    """标准 Radix-2 Cooley-Tukey FFT，要求 len(x) 为 2 的幂。"""
    n = len(x)
    if n <= 1:
        return x
    even = fft(x[0::2])
    odd = fft(x[1::2])
    factors = [cmath.exp(-2j * math.pi * k / n) * odd[k] for k in range(n // 2)]
    return [even[k] + factors[k] for k in range(n // 2)] + [
        even[k] - factors[k] for k in range(n // 2)
    ]


def ifft(x):
    n = len(x)
    conj = [v.conjugate() for v in x]
    inv = fft(conj)
    return [v.conjugate() / n for v in inv]


def frac_delay(sig, delay_samples):
    """在频域对实信号施加精确的分数采样点延迟。"""
    n = len(sig)
    spec = fft([complex(v, 0.0) for v in sig])
    shifted = []
    for k in range(n):
        freq = k if k <= n // 2 else k - n
        phase = cmath.exp(-2j * math.pi * freq * delay_samples / n)
        shifted.append(spec[k] * phase)
    return [v.real for v in ifft(shifted)]


def estimate_lag(x1, x2, max_lag, phat=False):
    """计算 x2 相对 x1 的到达时间差（采样点，含抛物线子采样插值）。"""
    n = len(x1)
    X1 = fft([complex(v, 0.0) for v in x1])
    X2 = fft([complex(v, 0.0) for v in x2])
    # 互功率谱：x2(t) = x1(t - tau) 时，X2 * conj(X1) 的 IFFT 在 +tau 处取峰值
    G = []
    for a, b in zip(X2, X1):
        cross = a * b.conjugate()
        if phat:
            mag = abs(cross)
            cross = cross / (mag + 1e-12)
        G.append(cross)
    corr = [v.real for v in ifft(G)]

    # 在 [-max_lag, +max_lag] 内找主峰
    best_k = 0
    best_v = -1e30
    for k in range(-max_lag, max_lag + 1):
        val = corr[k % n]
        if val > best_v:
            best_v = val
            best_k = k

    # 三点抛物线插值获得亚采样精度
    y_l = corr[(best_k - 1) % n]
    y_0 = corr[best_k % n]
    y_r = corr[(best_k + 1) % n]
    denom = y_l - 2.0 * y_0 + y_r
    delta = 0.5 * (y_l - y_r) / denom if abs(denom) > 1e-12 else 0.0
    delta = max(-0.5, min(0.5, delta))
    return best_k, best_k + delta


def section_pcm():
    print("=== 1. PCM 音频帧与带宽 ===")
    sr = 16000
    bits = 16
    frame_ms = 20
    frames = sr * frame_ms // 1000
    bytes_1ch = frames * (bits // 8)
    bytes_4ch = bytes_1ch * 4
    print(f"采样率: {sr} Hz, 位深: {bits}-bit, 单拍时长: {frame_ms} ms")
    print(f"单拍帧数: {frames} frames")
    print(f"单声道每拍: {bytes_1ch} B ({sr * 2 / 1024:.2f} KiB/s)")
    print(f"4 麦阵列每拍: {bytes_4ch} B ({sr * 2 * 4 / 1024:.2f} KiB/s)")


def section_tdoa():
    print("\n=== 2. TDOA 几何关系（d = 6 cm, c = 340 m/s）===")
    d = 0.06
    sr16 = 16000
    sr48 = 48000
    max_dt_us = (d / C) * 1e6
    one_sample_deg_16k = math.degrees(math.asin(C / (sr16 * d)))
    one_sample_deg_48k = math.degrees(math.asin(C / (sr48 * d)))
    print(f"最大物理时间差（±90°）: {max_dt_us:.1f} us")
    print(f"16 kHz 下 1 个采样点 = {1e6 / sr16:.1f} us -> 正前方角度步进 ≈ {one_sample_deg_16k:.1f}°")
    print(f"48 kHz 下 1 个采样点 = {1e6 / sr48:.2f} us -> 正前方角度步进 ≈ {one_sample_deg_48k:.1f}°")
    print("角度(°) | 路程差(cm) | Δt(us)  | 16kHz采样差 | 48kHz采样差")
    for deg in (-90, -60, -35, 0, 35, 60, 90):
        rad = math.radians(deg)
        dl = d * math.sin(rad)
        dt = dl / C
        print(f"{deg:+7d} | {dl*100:+10.2f} | {dt*1e6:+7.1f} | {dt*sr16:+11.2f} | {dt*sr48:+11.2f}")


def section_gcc_phat():
    print("\n=== 3. 普通互相关 (CC) vs GCC-PHAT 抗室内混响实验 ===")
    sr = 16000
    d = 0.06
    n = 1024  # 64 ms 窗
    true_deg = -35.0
    true_dt = d * math.sin(math.radians(true_deg)) / C
    true_lag = true_dt * sr
    max_lag = math.ceil((d / C) * sr) + 1

    # 构造带强低频共振峰的语音类信号（模拟真实语音能量集中在低频，容易让普通互相关主峰变宽）
    rng = random.Random(20261125)
    raw = [rng.gauss(0.0, 1.0) for _ in range(n)]
    # 二阶低通滤波 + 汉宁窗，能量集中在中低频
    speech = [0.0] * n
    y1 = y2 = 0.0
    for i, x in enumerate(raw):
        y = 0.15 * x + 1.35 * y1 - 0.55 * y2
        y2, y1 = y1, y
        win = 0.5 * (1.0 - math.cos(2.0 * math.pi * i / (n - 1)))
        speech[i] = y * win

    # 麦克风 1：直达声 + 两组室内墙面反射（不同方向、不同延迟） + 窄带空调嗡嗡声 + 少量白噪声
    # 麦克风 2：直达声延迟 true_lag，但反射声来自另一侧（正角度 +55° / +70°），空调噪声几乎同相
    echo1_lag = d * math.sin(math.radians(55.0)) / C * sr
    echo2_lag = d * math.sin(math.radians(70.0)) / C * sr
    s_direct_2 = frac_delay(speech, true_lag)
    echo1_m1 = frac_delay(speech, 18.0)
    echo1_m2 = frac_delay(speech, 18.0 + echo1_lag)
    echo2_m1 = frac_delay(speech, 41.0)
    echo2_m2 = frac_delay(speech, 41.0 + echo2_lag)

    # 低频强窄带干扰（模拟机箱/空调 250 Hz 嗡嗡声，在两麦之间偏向右前方 +45°）
    hum_lag = d * math.sin(math.radians(45.0)) / C * sr
    hum1 = [0.9 * math.sin(2.0 * math.pi * 250.0 * i / sr) for i in range(n)]
    hum2 = [0.9 * math.sin(2.0 * math.pi * 250.0 * (i - hum_lag) / sr) for i in range(n)]

    m1 = [
        speech[i] + 0.55 * echo1_m1[i] + 0.35 * echo2_m1[i] + hum1[i] + rng.gauss(0.0, 0.08)
        for i in range(n)
    ]
    m2 = [
        s_direct_2[i] + 0.55 * echo1_m2[i] + 0.35 * echo2_m2[i] + hum2[i] + rng.gauss(0.0, 0.08)
        for i in range(n)
    ]

    def lag_to_deg(lag):
        ratio = max(-1.0, min(1.0, (lag / sr) * C / d))
        return math.degrees(math.asin(ratio))

    cc_int, cc_sub = estimate_lag(m1, m2, max_lag, phat=False)
    phat_int, phat_sub = estimate_lag(m1, m2, max_lag, phat=True)

    print(f"真实方位角: {true_deg:+.1f}° (真实延迟 {true_dt*1e6:+.1f} us = {true_lag:+.2f} samples)")
    print(f"普通互相关 (CC) 整数峰: lag={cc_int:+d} -> {lag_to_deg(cc_int):+.1f}° | 子采样插值: lag={cc_sub:+.2f} -> {lag_to_deg(cc_sub):+.1f}° (误差 {abs(lag_to_deg(cc_sub)-true_deg):.1f}°)")
    print(f"GCC-PHAT      整数峰: lag={phat_int:+d} -> {lag_to_deg(phat_int):+.1f}° | 子采样插值: lag={phat_sub:+.2f} -> {lag_to_deg(phat_sub):+.1f}° (误差 {abs(lag_to_deg(phat_sub)-true_deg):.1f}°)")


def section_xrun():
    print("\n=== 4. ALSA 环形缓冲与 XRUN 溢出计算 ===")
    sr = 16000
    period_frames = 320  # 20 ms
    periods = 4
    buf_frames = period_frames * periods
    buf_ms = buf_frames * 1000 / sr
    stall_ms = 120
    incoming_frames = int(sr * stall_ms / 1000)
    dropped_frames = max(0, incoming_frames - buf_frames)
    dropped_ms = dropped_frames * 1000 / sr
    print(f"配置: {sr} Hz, period={period_frames} frames (20 ms), periods={periods}, buffer={buf_frames} frames ({buf_ms:.0f} ms)")
    print(f"同线程视觉/IO 卡顿 {stall_ms} ms 期间新到音频: {incoming_frames} frames")
    print(f"超出缓冲容量: {dropped_frames} frames ({dropped_ms:.0f} ms) -> 触发 ALSA overrun (EPIPE / XRUN)")


if __name__ == "__main__":
    section_pcm()
    section_tdoa()
    section_gcc_phat()
    section_xrun()
