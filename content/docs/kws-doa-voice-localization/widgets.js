// 本文专属组件：vad-kws-gate / tdoa-lab / xrun-lab
// 首屏：doa-radar-hero
// 物理公式（c = 340 m/s, d = 6 cm, 16 kHz）与 ALSA 80ms/120ms 溢出数均来自 code/verify_doa.py。

import { el, svg, onceVisible, whileVisible, reduceMotion } from "/stage/lib/dom.js";

const C_SOUND = 340.0;
const SR_16K = 16000;

/* ---------- 公共小工具 ---------- */

function readTable(ctx, name, minRows) {
  const table = ctx.fallback?.querySelector("table");
  if (!table) throw new Error(`${name}：降级内容里需要一张表格`);
  const rows = [...table.querySelectorAll("tbody tr")].map((tr) =>
    [...tr.children].map((n) => n.textContent.trim()),
  );
  if (rows.length < minRows) throw new Error(`${name}：表格至少需要 ${minRows} 行数据`);
  return rows;
}

function toggleGroup(labels, onPick, ariaLabel) {
  const bar = el("div", { class: "kd-tabs", role: "group", "aria-label": ariaLabel });
  const buttons = labels.map((label, i) => {
    const b = el("button", { type: "button", class: "kd-btn", text: label });
    b.addEventListener("click", () => select(i));
    bar.append(b);
    return b;
  });
  function select(i) {
    buttons.forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
    onPick(i);
  }
  return { bar, select };
}

function mkBtn(text, primary = false) {
  return el("button", { type: "button", class: primary ? "kd-btn is-primary" : "kd-btn", text });
}

/* ---------- 首屏 doa-radar-hero：声波打到麦阵 → 算 Δt → 机器人转头对准 ---------- */

function mountDoaRadarHero(figure, ctx) {
  const root = svg("svg", {
    viewBox: "0 0 1000 380",
    role: "img",
    "aria-label": "声源发出声波到达机器人四麦阵列，计算微秒级时间差并驱动机器人转头对准声源方位角",
  });
  root.classList.add("dh-svg");
  figure.append(
    root,
    el("figcaption", { class: "viewer-cap" }, [
      el("span", {}, [el("i", { class: "k-wave" }), "声源波前"]),
      el("span", {}, [el("i", { class: "k-beam" }), "DOA 对准波束"]),
      el("span", { text: "LIVE · KWS + DOA FAST LOOP" }),
    ]),
  );

  const mk = (tag, attrs, parent = root) => svg(tag, attrs, parent);
  const txt = (x, y, text, cls, anchor = "middle") => {
    const n = mk("text", { x, y, class: cls, "text-anchor": anchor });
    n.textContent = text;
    return n;
  };

  // 左半区：声学雷达舞台（中心 310, 210）
  const cx = 310;
  const cy = 215;
  const radarR = 148;
  [52, 100, 148].forEach((r) => {
    mk("circle", { cx, cy, r, class: "dh-ring", "aria-hidden": "true" });
  });
  mk("line", { x1: cx - radarR - 14, y1: cy, x2: cx + radarR + 14, y2: cy, class: "dh-axis", "aria-hidden": "true" });
  mk("line", { x1: cx, y1: cy - radarR - 14, x2: cx, y2: cy + radarR + 14, class: "dh-axis", "aria-hidden": "true" });
  txt(cx, cy - radarR - 20, "0° FRONT", "dh-mono");
  txt(cx - radarR - 22, cy + 4, "-90°", "dh-mono", "end");
  txt(cx + radarR + 22, cy + 4, "+90°", "dh-mono", "start");

  // 旋转对准波束组
  const beamGroup = mk("g", { transform: `translate(${cx} ${cy})` });
  mk("path", { d: "M0,0 L-34,-142 A146,146 0 0,1 34,-142 Z", class: "dh-beam" }, beamGroup);
  mk("line", { x1: 0, y1: 0, x2: 0, y2: -146, class: "dh-beam-line" }, beamGroup);

  // 中心 4 麦环形阵
  mk("circle", { cx, cy, r: 24, class: "dh-hub" });
  const micOffsets = [
    [0, -16],
    [16, 0],
    [0, 16],
    [-16, 0],
  ];
  micOffsets.forEach(([dx, dy]) => {
    mk("circle", { cx: cx + dx, cy: cy + dy, r: 3.6, class: "dh-mic" });
  });

  // 声源标记 + 扩散波纹
  const srcGroup = mk("g", {});
  const w1 = mk("circle", { cx: 0, cy: 0, r: 16, class: "dh-wave" }, srcGroup);
  const w2 = mk("circle", { cx: 0, cy: 0, r: 34, class: "dh-wave dh-wave-2" }, srcGroup);
  mk("circle", { cx: 0, cy: 0, r: 7, class: "dh-src" }, srcGroup);
  const srcTag = mk("text", { x: 0, y: -14, class: "dh-src-tag", "text-anchor": "middle" }, srcGroup);
  srcTag.textContent = "SPEAKER";

  // 右半区：实时遥测读数面板（x = 550..955）
  mk("rect", { x: 550, y: 42, width: 410, height: 298, rx: 4, class: "dh-panel" });
  txt(572, 74, "AUDIO_FRONT_END // 16kHz PCM", "dh-mono-mark", "start");
  mk("line", { x1: 572, y1: 86, x2: 938, y2: 86, class: "dh-div" });

  // 4 行遥测条
  txt(572, 118, "VAD GATE", "dh-mono", "start");
  const vadVal = txt(938, 118, "SPEECH · 0.96", "dh-val-mark", "end");
  txt(572, 154, "KWS MATCH", "dh-mono", "start");
  const kwsVal = txt(938, 154, "HIT · \"小智同学\"", "dh-val", "end");
  txt(572, 190, "TDOA  Δt", "dh-mono", "start");
  const dtVal = txt(938, 190, "-101.2 us", "dh-val-mark", "end");
  txt(572, 226, "DOA YAW θ", "dh-mono", "start");
  const degVal = txt(938, 226, "-35.0°", "dh-val-mark", "end");

  // 底部双麦波形相位差示意
  mk("line", { x1: 572, y1: 248, x2: 938, y2: 248, class: "dh-div" });
  txt(572, 270, "MIC_L vs MIC_R PHASE LAG (示意)", "dh-mono", "start");
  const wavePath1 = mk("path", { d: "", class: "dh-sig-1" });
  const wavePath2 = mk("path", { d: "", class: "dh-sig-2" });

  const presets = [
    { deg: -35, label: "LEFT · -35°" },
    { deg: 42, label: "RIGHT · +42°" },
    { deg: -60, label: "SIDE · -60°" },
    { deg: 15, label: "FRONT · +15°" },
  ];

  function drawSine(phaseRad, yBase) {
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const x = 574 + (i / 48) * 362;
      const t = (i / 48) * Math.PI * 5;
      const env = Math.sin((i / 48) * Math.PI);
      const y = yBase + Math.sin(t + phaseRad) * 14 * env;
      pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  }

  let idx = 0;
  function applyPreset(p) {
    const rad = (p.deg * Math.PI) / 180;
    const sx = cx + Math.sin(rad) * 124;
    const sy = cy - Math.cos(rad) * 124;
    srcGroup.setAttribute("transform", `translate(${sx.toFixed(1)} ${sy.toFixed(1)})`);
    beamGroup.setAttribute("transform", `translate(${cx} ${cy}) rotate(${p.deg})`);
    const dtUs = ((0.06 * Math.sin(rad)) / C_SOUND) * 1e6;
    dtVal.textContent = `${dtUs >= 0 ? "+" : ""}${dtUs.toFixed(1)} us`;
    degVal.textContent = `${p.deg >= 0 ? "+" : ""}${p.deg.toFixed(1)}°`;
    srcTag.textContent = p.label;
    const lagRad = (dtUs / 176.5) * 1.4;
    wavePath1.setAttribute("d", drawSine(0, 296));
    wavePath2.setAttribute("d", drawSine(-lagRad, 316));
    if (ctx?.clock) {
      ctx.clock.textContent = `DOA ${p.deg >= 0 ? "+" : ""}${String(p.deg).padStart(2, "0")}°`;
    }
  }

  applyPreset(presets[0]);
  if (reduceMotion) return;

  let pulse = 0;
  whileVisible(
    figure,
    () => {
      pulse += 1;
      const r1 = 14 + (pulse % 18) * 2.2;
      const r2 = 14 + ((pulse + 9) % 18) * 2.2;
      w1.setAttribute("r", r1.toFixed(1));
      w1.style.opacity = String(Math.max(0.08, 1 - r1 / 56));
      w2.setAttribute("r", r2.toFixed(1));
      w2.style.opacity = String(Math.max(0.08, 1 - r2 / 56));
      if (pulse % 24 === 0) {
        idx = (idx + 1) % presets.length;
        applyPreset(presets[idx]);
      }
    },
    110,
  );
}

/* ---------- 组件 1：vad-kws-gate（VAD 门卫开关对比） ---------- */

const SCENE_PROFILES = [
  { prob: 0.05, bars: [10, 12, 11, 13, 10, 12, 11, 12, 10, 11, 13, 12], speech: false, wake: false, cpuRaw: "12%", cpuVad: "0.4%" },
  { prob: 0.12, bars: [8, 52, 10, 9, 46, 11, 8, 58, 9, 10, 40, 8], speech: false, wake: false, cpuRaw: "12%", cpuVad: "0.5%" },
  { prob: 0.88, bars: [18, 44, 62, 54, 70, 48, 60, 52, 66, 40, 28, 16], speech: true, wake: false, cpuRaw: "12%", cpuVad: "9.5%" },
  { prob: 0.96, bars: [14, 38, 76, 88, 64, 92, 84, 72, 60, 42, 22, 12], speech: true, wake: true, cpuRaw: "12%", cpuVad: "10.2%" },
];

function mountVadKwsGate(root, ctx) {
  const rows = readTable(ctx, "vad-kws-gate", 4);
  let scene = 0;
  let vadOn = true;

  const vadToggle = mkBtn("VAD 门卫：已开启", true);
  vadToggle.setAttribute("aria-pressed", "true");
  const tabs = toggleGroup(
    rows.map((r) => r[0]),
    (i) => {
      scene = i;
      render();
    },
    "选择环境声音",
  );

  const stage = el("div", { class: "vk-grid" });
  const barsWrap = el("div", { class: "vk-bars", role: "img", "aria-label": "20 毫秒音频帧能量柱状图" });
  const barEls = Array.from({ length: 12 }, (_, i) => {
    const col = el("div", { class: "vk-col" }, [
      el("span", { class: "vk-bar" }),
      el("small", { text: `${(i + 1) * 20}` }),
    ]);
    barsWrap.append(col);
    return col;
  });

  const meters = el("div", { class: "vk-meters" });
  const mProb = el("div", { class: "vk-card" });
  const mGate = el("div", { class: "vk-card" });
  const mKws = el("div", { class: "vk-card" });
  const mCpu = el("div", { class: "vk-card" });
  meters.append(mProb, mGate, mKws, mCpu);

  const desc = el("p", { class: "kd-result", "aria-live": "polite" });

  function setCard(node, label, val, state = "") {
    node.className = `vk-card${state ? ` is-${state}` : ""}`;
    node.replaceChildren(el("small", { text: label }), el("strong", { text: val }));
  }

  function render() {
    const row = rows[scene];
    const prof = SCENE_PROFILES[scene] || SCENE_PROFILES[0];
    vadToggle.textContent = vadOn ? "VAD 门卫：已开启" : "VAD 门卫：已关闭（裸跑 KWS）";
    vadToggle.setAttribute("aria-pressed", String(vadOn));
    vadToggle.classList.toggle("is-primary", vadOn);

    const kwsRuns = !vadOn || prof.speech;
    barEls.forEach((col, i) => {
      const h = prof.bars[i] || 10;
      const bar = col.firstChild;
      bar.style.height = `${h}%`;
      bar.classList.toggle("is-pass", kwsRuns && (prof.wake || prof.speech));
      bar.classList.toggle("is-block", vadOn && !prof.speech);
      bar.classList.toggle("is-waste", !vadOn && !prof.speech);
    });

    setCard(mProb, "VAD SPEECH PROB", prof.prob.toFixed(2), prof.speech ? "mark" : "");
    setCard(
      mGate,
      "VAD 门卫决策",
      !vadOn ? "旁路（未启用）" : prof.speech ? "放行 + 300ms 拖尾" : "直接丢弃",
      !vadOn ? "warn" : prof.speech ? "mark" : "",
    );
    setCard(
      mKws,
      "KWS 哨兵状态",
      !kwsRuns ? "休眠（0 次推理）" : prof.wake ? "命中唤醒词 → 触发" : "运行匹配 → 未命中",
      prof.wake ? "mark" : !vadOn && !prof.speech ? "warn" : "",
    );
    setCard(mCpu, "小核 CPU 估算", vadOn ? prof.cpuVad : prof.cpuRaw, !vadOn && !prof.speech ? "warn" : "");

    desc.textContent = `${row[0]}（${row[1]}）：${vadOn ? row[3] : row[2]}`;
  }

  vadToggle.addEventListener("click", () => {
    vadOn = !vadOn;
    render();
  });

  stage.append(barsWrap, meters);
  root.append(
    el("div", { class: "kd-bar" }, [tabs.bar, el("div", { class: "kd-acts" }, [vadToggle])]),
    stage,
    desc,
    el("p", { class: "w-caption", text: "示意：能量条、人声概率与 CPU 占比为原理图解，展示 VAD 门卫对非人声帧的短路效果。" }),
  );
  tabs.select(0);
  onceVisible(root, () => root.classList.add("is-in"));
}

/* ---------- 组件 2：tdoa-lab（可拖动声源 + 2 麦镜像模糊 + 4 麦消歧 + GCC-PHAT 峰） ---------- */

function mountTdoaLab(root, ctx) {
  const rows = readTable(ctx, "tdoa-lab", 2);
  let arrayMode = 0; // 0 = 2-mic linear, 1 = 4-mic circular
  let phatMode = true;
  let angleDeg = -35; // -180 .. +180, 0 = 正前（上方）

  const W = 620;
  const H = 310;
  const cx = 165;
  const cy = 158;
  const orbitR = 114;

  const pic = svg("svg", {
    viewBox: `0 0 ${W} ${H}`,
    role: "img",
    class: "td-svg",
    "aria-label": "声源定位几何与互相关峰值图解",
  });
  const mk = (tag, attrs, parent = pic) => svg(tag, attrs, parent);
  const txt = (x, y, text, cls, anchor = "middle") => {
    const n = mk("text", { x, y, class: cls, "text-anchor": anchor });
    n.textContent = text;
    return n;
  };

  // 左图：俯视麦阵舞台
  mk("circle", { cx, cy, r: orbitR, class: "td-orbit", "aria-hidden": "true" });
  mk("line", { x1: cx - orbitR - 14, y1: cy, x2: cx + orbitR + 14, y2: cy, class: "td-axis", "aria-hidden": "true" });
  mk("line", { x1: cx, y1: cy - orbitR - 14, x2: cx, y2: cy + orbitR + 14, class: "td-axis", "aria-hidden": "true" });
  txt(cx, cy - orbitR - 18, "前 0°", "td-small");
  txt(cx, cy + orbitR + 24, "后 180°", "td-small");
  txt(cx - orbitR - 18, cy + 4, "-90°", "td-mono", "end");
  txt(cx + orbitR + 18, cy + 4, "+90°", "td-mono", "start");

  // 射线与镜像虚影
  const rayMain = mk("line", { x1: cx, y1: cy, x2: cx, y2: cy - orbitR, class: "td-ray" });
  const rayMirror = mk("line", { x1: cx, y1: cy, x2: cx, y2: cy + orbitR, class: "td-ray-mirror" });
  const mirrorDot = mk("circle", { cx, cy, r: 7, class: "td-mirror-dot" });
  const mirrorLbl = txt(cx, cy, "镜像歧义", "td-ir-txt");

  // 麦克风点组
  const micGroup = mk("g", {});

  // 可拖动声源节点
  const handle = mk("g", {
    class: "td-handle",
    tabindex: "0",
    role: "slider",
    "aria-label": "声源方位角",
    "aria-valuemin": "-180",
    "aria-valuemax": "180",
  });
  mk("circle", { cx: 0, cy: 0, r: 16, class: "td-hit" }, handle);
  mk("circle", { cx: 0, cy: 0, r: 8, class: "td-src" }, handle);

  // 右图：物理读数 + CC vs GCC-PHAT 峰值曲线
  const rx = 340;
  mk("rect", { x: rx, y: 18, width: 266, height: 112, rx: 4, class: "td-box" });
  const rdTitle = txt(rx + 14, 40, "TDOA READOUT · 16 kHz", "td-mono-mark", "start");
  const rdAngle = txt(rx + 14, 66, "", "td-read", "start");
  const rdLag = txt(rx + 14, 90, "", "td-read", "start");
  const rdAmb = txt(rx + 14, 114, "", "td-read-sub", "start");

  // 互相关曲线框
  mk("rect", { x: rx, y: 146, width: 266, height: 144, rx: 4, class: "td-box" });
  const corrTitle = txt(rx + 14, 168, "GCC-PHAT 互相关峰（抗混响示意）", "td-small-mark", "start");
  mk("line", { x1: rx + 18, y1: 264, x2: rx + 248, y2: 264, class: "td-axis" });
  const trueTick = mk("line", { x1: rx + 133, y1: 182, x2: rx + 133, y2: 264, class: "td-true-line" });
  const corrCurve = mk("path", { d: "", class: "td-curve" });
  txt(rx + 22, 280, "-3", "td-mono", "start");
  txt(rx + 133, 280, "0 samples", "td-mono", "middle");
  txt(rx + 244, 280, "+3", "td-mono", "end");

  const modeTabs = toggleGroup(
    ["2 麦线性阵 (d=6cm)", "4 麦环形阵 (r=3.5cm)"],
    (i) => {
      arrayMode = i;
      render();
    },
    "麦克风阵列类型",
  );
  const phatBtn = mkBtn("算法：GCC-PHAT（抗混响）", true);
  phatBtn.setAttribute("aria-pressed", "true");
  const backBtn = mkBtn("测试后方 +145°");

  const desc = el("p", { class: "kd-result", "aria-live": "polite" });

  function drawCorr(trueSamples) {
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const lag = -3.0 + (i / 60) * 6.0;
      const x = rx + 18 + (i / 60) * 230;
      let val = 0;
      if (phatMode) {
        // 尖锐脉冲峰 + 极低混响旁瓣
        const dMain = lag - trueSamples;
        val = 0.92 * Math.exp(-(dMain * dMain) / 0.08) + 0.14 * Math.exp(-((lag - 1.9) ** 2) / 0.16);
      } else {
        // 普通互相关：宽胖主峰 + 强低频嗡嗡声伪峰拉偏到 0 ~ +0.8 附近
        const dMain = lag - trueSamples;
        const dHum = lag - 0.35;
        val = 0.42 * Math.exp(-(dMain * dMain) / 1.4) + 0.62 * Math.exp(-(dHum * dHum) / 1.6);
      }
      const y = 264 - Math.min(1, val) * 76;
      pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    corrCurve.setAttribute("d", pts.join(" "));
    corrCurve.classList.toggle("is-warn", !phatMode);
    const tx = rx + 18 + ((trueSamples + 3.0) / 6.0) * 230;
    trueTick.setAttribute("x1", tx.toFixed(1));
    trueTick.setAttribute("x2", tx.toFixed(1));
  }

  function render() {
    const rad = (angleDeg * Math.PI) / 180;
    const sx = cx + Math.sin(rad) * orbitR;
    const sy = cy - Math.cos(rad) * orbitR;
    handle.setAttribute("transform", `translate(${sx.toFixed(1)} ${sy.toFixed(1)})`);
    handle.setAttribute("aria-valuenow", String(Math.round(angleDeg)));
    handle.setAttribute("aria-valuetext", `${angleDeg >= 0 ? "+" : ""}${Math.round(angleDeg)} 度`);

    rayMain.setAttribute("x2", sx.toFixed(1));
    rayMain.setAttribute("y2", sy.toFixed(1));

    // 画麦克风位置
    micGroup.replaceChildren();
    if (arrayMode === 0) {
      mk("line", { x1: cx - 22, y1: cy, x2: cx + 22, y2: cy, class: "td-bar-line" }, micGroup);
      [-22, 22].forEach((dx) => {
        mk("circle", { cx: cx + dx, cy, r: 5, class: "td-mic" }, micGroup);
      });
    } else {
      mk("circle", { cx, cy, r: 22, class: "td-hub-ring" }, micGroup);
      [
        [0, -22],
        [22, 0],
        [0, 22],
        [-22, 0],
      ].forEach(([dx, dy]) => {
        mk("circle", { cx: cx + dx, cy: cy + dy, r: 4.5, class: "td-mic" }, micGroup);
      });
    }

    // 水平轴向（左右麦）时间差：对 2 麦线性阵 d = 0.06 m，4 麦对径 d = 0.07 m
    const d = arrayMode === 0 ? 0.06 : 0.07;
    const sinA = Math.sin(rad);
    const dtUs = ((d * sinA) / C_SOUND) * 1e6;
    const samples = (dtUs * 1e-6) * SR_16K;

    // 2 麦镜像角度：180 - deg（归一化到 -180..180）
    let mirrorDeg = angleDeg >= 0 ? 180 - angleDeg : -180 - angleDeg;
    const showMirror = arrayMode === 0 && Math.abs(Math.abs(angleDeg) - 90) > 4;
    const mRad = (mirrorDeg * Math.PI) / 180;
    const mx = cx + Math.sin(mRad) * orbitR;
    const my = cy - Math.cos(mRad) * orbitR;

    [rayMirror, mirrorDot, mirrorLbl].forEach((n) => (n.style.opacity = showMirror ? "1" : "0"));
    rayMirror.setAttribute("x2", mx.toFixed(1));
    rayMirror.setAttribute("y2", my.toFixed(1));
    mirrorDot.setAttribute("cx", mx.toFixed(1));
    mirrorDot.setAttribute("cy", my.toFixed(1));
    mirrorLbl.setAttribute("x", mx.toFixed(1));
    mirrorLbl.setAttribute("y", (my + (my > cy ? 20 : -14)).toFixed(1));

    const frontEst = (Math.asin(Math.max(-1, Math.min(1, sinA))) * 180) / Math.PI;
    rdTitle.textContent = arrayMode === 0 ? "2-MIC LINEAR · d = 6 cm" : "4-MIC CIRCULAR · r = 3.5 cm";
    rdAngle.textContent = `真实角度: ${angleDeg >= 0 ? "+" : ""}${Math.round(angleDeg)}°`;
    rdLag.textContent = `左右麦 Δt: ${dtUs >= 0 ? "+" : ""}${dtUs.toFixed(1)} us (${samples >= 0 ? "+" : ""}${samples.toFixed(2)} 采样点)`;
    if (arrayMode === 0) {
      const behind = Math.abs(angleDeg) > 90;
      rdAmb.textContent = behind
        ? `镜像冲突：2 麦误判为前方 ${frontEst >= 0 ? "+" : ""}${frontEst.toFixed(0)}°`
        : `与后方 ${mirrorDeg >= 0 ? "+" : ""}${Math.round(mirrorDeg)}° 拥有完全相同的 Δt`;
      rdAmb.classList.toggle("is-ir", behind);
    } else {
      const dtFb = ((d * Math.cos(rad)) / C_SOUND) * 1e6;
      rdAmb.textContent = `前后麦 Δt: ${dtFb >= 0 ? "+" : ""}${dtFb.toFixed(1)} us → 360° 唯一锁定`;
      rdAmb.classList.remove("is-ir");
    }

    corrTitle.textContent = phatMode
      ? "GCC-PHAT 峰：频域白化，锁死真实延迟（示意）"
      : "普通互相关 CC：被低频噪音与混响拉偏（示意）";
    phatBtn.textContent = phatMode ? "算法：GCC-PHAT（抗混响）" : "算法：普通互相关 CC（易拉偏）";
    phatBtn.setAttribute("aria-pressed", String(phatMode));
    phatBtn.classList.toggle("is-primary", phatMode);
    drawCorr(Math.max(-2.9, Math.min(2.9, samples)));

    const row = rows[arrayMode];
    desc.textContent = `${row[0]}（${row[1]}）：${row[3]}`;
    pic.setAttribute(
      "aria-label",
      `${row[0]}，当前声源角度 ${Math.round(angleDeg)} 度，时间差 ${dtUs.toFixed(1)} 微秒`,
    );
  }

  function setFromClient(clientX, clientY) {
    const rect = pic.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W - cx;
    const y = ((clientY - rect.top) / rect.height) * H - cy;
    angleDeg = (Math.atan2(x, -y) * 180) / Math.PI;
    render();
  }

  let dragging = false;
  handle.addEventListener("pointerdown", (e) => {
    dragging = true;
    handle.setPointerCapture?.(e.pointerId);
    setFromClient(e.clientX, e.clientY);
  });
  pic.addEventListener("pointermove", (e) => {
    if (dragging) setFromClient(e.clientX, e.clientY);
  });
  window.addEventListener("pointerup", () => {
    dragging = false;
  });
  handle.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 15 : 5;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      angleDeg = angleDeg - step < -180 ? angleDeg - step + 360 : angleDeg - step;
      render();
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      angleDeg = angleDeg + step > 180 ? angleDeg + step - 360 : angleDeg + step;
      render();
    }
  });

  phatBtn.addEventListener("click", () => {
    phatMode = !phatMode;
    render();
  });
  backBtn.addEventListener("click", () => {
    angleDeg = 145;
    render();
  });

  root.append(
    el("div", { class: "kd-bar" }, [modeTabs.bar, el("div", { class: "kd-acts" }, [backBtn, phatBtn])]),
    pic,
    desc,
    el("p", {
      class: "w-caption",
      text: "示意：左侧时间差按 c = 340 m/s、16 kHz 实时计算；右下互相关曲线为室内强混响与 250 Hz 噪声下的原理对比图解。",
    }),
  );
  modeTabs.select(0);
}

/* ---------- 组件 3：xrun-lab（ALSA 环形缓冲与 120ms 视觉卡顿模拟） ---------- */

const WAKE_CHARS = ["小", "智", "同", "学"];

function mountXrunLab(root, ctx) {
  const rows = readTable(ctx, "xrun-lab", 2);
  let isolated = false;
  let stalled = false;

  const tabs = toggleGroup(
    ["单线程混跑（视觉阻塞音频）", "独立音频线程（硬隔离）"],
    (i) => {
      isolated = i === 1;
      stalled = false;
      render();
    },
    "线程隔离架构",
  );
  const stallBtn = mkBtn("注入 120 ms 视觉卡顿", true);
  const resetBtn = mkBtn("复位");

  const board = el("div", { class: "xr-board" });
  const slotsWrap = el("div", { class: "xr-slots" });
  const slotEls = Array.from({ length: 4 }, (_, i) =>
    el("div", { class: "xr-slot" }, [
      el("small", { text: `PERIOD ${i + 1}` }),
      el("span", { text: "320f · 20ms" }),
    ]),
  );
  slotsWrap.append(...slotEls);

  const badge = el("div", { class: "xr-badge" });
  const wakeRow = el("div", { class: "xr-wake" });
  const charEls = WAKE_CHARS.map((ch) => el("span", { class: "xr-ch", text: ch }));
  wakeRow.append(el("small", { text: "KWS 实际收到：" }), ...charEls);

  const desc = el("p", { class: "kd-result", "aria-live": "polite" });

  function render() {
    const isXrun = stalled && !isolated;
    slotEls.forEach((slot, i) => {
      slot.classList.toggle("is-fill", isXrun || (!stalled && i === 0) || (isolated && i === 0));
      slot.classList.toggle("is-overflow", isXrun);
    });

    if (!stalled) {
      badge.className = "xr-badge";
      badge.textContent = "ALSA BUFFER 80 ms（4 × 20 ms）：正常运转，水位 25%";
    } else if (isXrun) {
      badge.className = "xr-badge is-ir";
      badge.textContent = "EPIPE (XRUN) OVERRUN！120 ms 内新到 1920 frames，溢出丢弃 640 frames (40 ms)";
    } else {
      badge.className = "xr-badge is-mark";
      badge.textContent = "视觉线程卡顿 120 ms，但独立音频线程每 20 ms 照常取帧，0 XRUN";
    }

    charEls.forEach((n, i) => {
      const dropped = isXrun && (i === 1 || i === 2);
      n.classList.toggle("is-drop", dropped);
      n.classList.toggle("is-hit", stalled && isolated);
    });

    const row = rows[isolated ? 1 : 0];
    desc.textContent = stalled
      ? `${row[0]} → ${row[2]}；${row[3]}`
      : `当前模式：${row[0]}。按「注入 120 ms 视觉卡顿」看 80 ms 环形缓冲会发生什么。`;
    stallBtn.disabled = stalled;
  }

  stallBtn.addEventListener("click", () => {
    stalled = true;
    render();
  });
  resetBtn.addEventListener("click", () => {
    stalled = false;
    render();
  });

  board.append(badge, slotsWrap, wakeRow);
  root.append(
    el("div", { class: "kd-bar" }, [tabs.bar, el("div", { class: "kd-acts" }, [stallBtn, resetBtn])]),
    board,
    desc,
    el("p", { class: "w-caption", text: "说明：缓冲 1280 frames (80 ms) 与 120 ms 溢出 640 frames 的数值来自 code/verify_doa.py；字块缺失位置为示意。" }),
  );
  tabs.select(0);
}

export const widgets = {
  "vad-kws-gate": mountVadKwsGate,
  "tdoa-lab": mountTdoaLab,
  "xrun-lab": mountXrunLab,
};

export const heroes = {
  "doa-radar-hero": mountDoaRadarHero,
};
