// 首页「海藻场」：仿 Stripe 首页统计区。同一池细长条，随上方四个数字切换成四种有含义的形态
// （见 strands-forms.js），切换时每根线错开一点时间平滑变形过去。
// 指针附近的线轻轻让开、变亮；鼠标划过时，被划到的线会顺着划动力度泛起一道沿线传播的波纹，随后平息。
// 悬停显示这根线代表什么，有链接的点击进入。
// 右下角按「时段」换配色（破晓 / 日间 / 黄昏 / 夜间 / 棚内），默认「棚内」站点荧光绿，选择记在 localStorage。
// 减弱动效时直接切换、不做微动；画布离开视口或页面隐藏时停止绘制。

import { FORMS, POOL, PTS } from "./strands-forms.js";

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const KEY = "strands-tod";
const MORPH_MS = reduceMotion ? 0 : 1500;
const STAGGER = 0.35;        // 变形时最后一根线比第一根晚出发的比例
const REACH = 70;            // 指针影响半径（CSS 像素）
const NUDGE = 7;             // 指针处最多让开的距离：轻轻让，不弹
const PICK = 14;             // 悬停拾取距离
const RIPPLE = 6;            // 波纹最大振幅（CSS 像素）
const RIPPLE_GAIN = 0.006;   // 每像素划动速度注入多少波纹能量
const RIPPLE_DECAY = 0.955;  // 每帧能量保留比例：约 1 秒平息

// 时段配色：背景上下两色、线色、根部光晕色；add=叠加发光（深色背景用）
const TIMES = [
  ["predawn", "破晓", { bg: ["#0b1736", "#2a4689"], line: [176, 204, 255], glow: [140, 190, 255], add: true }],
  ["day", "日间", { bg: ["#f7f9ff", "#d3e2ff"], line: [36, 98, 222], glow: [255, 255, 255], add: false }],
  ["dusk", "黄昏", { bg: ["#271642", "#b9567a"], line: [255, 216, 192], glow: [255, 168, 118], add: true }],
  ["night", "夜间", { bg: ["#13115a", "#3b30d2"], line: [236, 239, 255], glow: [255, 255, 255], add: true }],
  ["studio", "棚内", { bg: ["#0a0c0b", "#18221c"], line: [200, 255, 62], glow: [200, 255, 62], add: true }],
];
const DEFAULT_TOD = "studio";
const ease = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);

export function mount(figure, data) {
  const canvas = figure.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const note = figure.querySelector(".strands-note");
  const controls = figure.querySelector(".strands-ctl");
  const cells = [...document.querySelectorAll(".telemetry [data-form]")];
  let tod = null;
  try { tod = localStorage.getItem(KEY); } catch { /* 无法读取：用默认 */ }
  if (!TIMES.some(([k]) => k === tod)) tod = DEFAULT_TOD;

  let W = 0, H = 0, form = "burst", target = null;
  const pool = Array.from({ length: POOL }, (_, i) => ({
    cur: new Float32Array(PTS * 2), from: new Float32Array(PTS * 2), a: 0, aFrom: 0,
    delay: (i / POOL) * STAGGER + Math.random() * 0.08, phase: Math.random() * Math.PI * 2,
    ripple: 0, nx: 0, ny: 0,                            // 波纹能量 0~1，及沿线的法向
  }));
  const ptr = { x: 0, y: 0, on: false, amt: 0, speed: 0 };
  let morphStart = -1e9, hovered = -1, visible = true, raf = 0;

  /* ---------- 形态 ---------- */
  function setForm(name, animate = true) {
    form = name;
    target = FORMS[name](data, W, H);
    morphStart = animate && MORPH_MS ? performance.now() : -1e9;
    for (const s of pool) { s.from.set(s.cur); s.aFrom = s.a; }
    if (!animate || !MORPH_MS) pool.forEach((s, i) => { s.cur.set(target.strands[i].pts); s.a = target.strands[i].a; });
    cells.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.form === name)));
    note.textContent = target.note;
    hovered = -1;
    wake();
  }

  function resize() {
    const box = canvas.getBoundingClientRect();
    if (!box.width) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = box.width; H = box.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    setForm(form, false);
  }

  /* ---------- 每帧 ---------- */
  function update(now) {
    const k = Math.max(0, (now - morphStart) / MORPH_MS);
    let moving = false;
    pool.forEach((s, i) => {
      const t = target.strands[i];
      const e = ease(Math.min(1, Math.max(0, (k - s.delay) / (1 - STAGGER))));
      if (e < 1) moving = true;
      for (let j = 0; j < PTS * 2; j++) s.cur[j] = s.from[j] + (t.pts[j] - s.from[j]) * e;
      s.a = s.aFrom + (t.a - s.aFrom) * e;
      s.ripple = s.ripple > 0.002 ? s.ripple * RIPPLE_DECAY : 0;
      if (s.ripple) moving = true;
    });
    ptr.amt += ((ptr.on ? 1 : 0) - ptr.amt) * 0.12;      // 指针影响淡入淡出，避免突跳
    return moving || Math.abs(ptr.amt - (ptr.on ? 1 : 0)) > 0.01;
  }

  // 根部固定，越往梢让得越多；空闲时梢部极轻微地呼吸
  function point(s, j, now, out) {
    let x = s.cur[j * 2], y = s.cur[j * 2 + 1];
    const w = j / (PTS - 1);
    if (!reduceMotion) { x += Math.sin(now / 1400 + s.phase) * 1.2 * w; y += Math.cos(now / 1700 + s.phase) * 0.8 * w; }
    if (s.ripple) {                                     // 波从根部往梢传，根不动、越往梢摆得越开
      const off = s.ripple * RIPPLE * w ** 1.3 * Math.sin(now / 150 - w * 7 + s.phase);
      x += s.nx * off; y += s.ny * off;
    }
    if (ptr.amt > 0.01) {
      const dx = x - ptr.x, dy = y - ptr.y, d = Math.hypot(dx, dy);
      if (d < REACH && d > 0.001) {
        const f = (1 - d / REACH) ** 2 * NUDGE * ptr.amt * w;
        x += (dx / d) * f; y += (dy / d) * f;
      }
    }
    out[0] = x; out[1] = y;
  }

  function draw(now) {
    const pal = TIMES.find(([k]) => k === tod)[2];
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, pal.bg[0]); bg.addColorStop(1, pal.bg[1]);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const { x: fx, y: fy } = target.focus;
    const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, Math.max(W, H) * 0.55);
    glow.addColorStop(0, `rgba(${pal.glow},${pal.add ? 0.55 : 0.9})`);
    glow.addColorStop(1, `rgba(${pal.glow},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = pal.add ? "lighter" : "source-over";
    const hoverGroup = hovered >= 0 ? target.strands[hovered].group : undefined;
    const p = [0, 0];
    ctx.lineWidth = 1;
    pool.forEach((s, i) => {
      if (s.a < 0.01) return;
      const t = target.strands[i];
      const on = i === hovered || (hoverGroup && t.group === hoverGroup);
      const a = Math.min(1, s.a * (on ? 1.6 : hovered >= 0 ? 0.55 : 1));
      if (s.ripple) {                                   // 法向：垂直于根→梢
        const ex = s.cur[PTS * 2 - 2] - s.cur[0], ey = s.cur[PTS * 2 - 1] - s.cur[1], l = Math.hypot(ex, ey) || 1;
        s.nx = -ey / l; s.ny = ex / l;
      }
      ctx.strokeStyle = `rgba(${pal.line},${a * (pal.add ? 0.55 : 0.9)})`;   // 浅底不叠加发光，线要更实
      ctx.lineWidth = on ? 1.6 : 1;
      ctx.beginPath();
      for (let j = 0; j < PTS; j++) { point(s, j, now, p); j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
      ctx.stroke();
      ctx.fillStyle = `rgba(${pal.line},${a})`;
      ctx.beginPath();
      ctx.arc(p[0], p[1], t.dot * (on ? 1.6 : 1), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function frame(now) {
    raf = 0;
    const busy = update(now);
    draw(now);
    // 有微动时持续画；减弱动效时等变形结束就停帧
    if (visible && !document.hidden && (!reduceMotion || busy)) raf = requestAnimationFrame(frame);
  }
  function wake() { if (!raf && visible && target) raf = requestAnimationFrame(frame); }

  /* ---------- 悬停 / 点击 ---------- */
  // 指针到一段线的距离：长曲线上采样点相隔几十像素，只量到点会漏掉
  function segDist(ax, ay, bx, by) {
    const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
    const k = l2 ? Math.max(0, Math.min(1, ((ptr.x - ax) * ex + (ptr.y - ay) * ey) / l2)) : 0;
    return Math.hypot(ax + ex * k - ptr.x, ay + ey * k - ptr.y);
  }
  // 找最近的线做悬停；顺带给指针划过的线注入波纹能量，划得越快越强
  function pick() {
    let best = -1, bestD = PICK;
    const kick = reduceMotion ? 0 : ptr.speed * RIPPLE_GAIN;
    pool.forEach((s, i) => {
      if (s.a < 0.05) return;
      let near = Infinity;
      for (let j = 1; j < PTS; j++) {
        near = Math.min(near, segDist(s.cur[j * 2 - 2], s.cur[j * 2 - 1], s.cur[j * 2], s.cur[j * 2 + 1]));
      }
      if (near < bestD) { bestD = near; best = i; }
      if (kick && near < REACH) s.ripple = Math.min(1, s.ripple + kick * (1 - near / REACH));
    });
    if (best === hovered) return;
    hovered = best;
    note.textContent = best >= 0 ? target.strands[best].label : target.note;
    canvas.style.cursor = best >= 0 && target.strands[best].href ? "pointer" : "";
  }
  // 首次布局（ResizeObserver 回调）之前还没有形态，指针事件一律忽略
  canvas.addEventListener("pointermove", (e) => {
    if (!target) return;
    const box = canvas.getBoundingClientRect();
    const x = e.clientX - box.left, y = e.clientY - box.top;
    ptr.speed = ptr.on ? Math.min(60, Math.hypot(x - ptr.x, y - ptr.y)) : 0;   // 本次移动的像素数，封顶防止跳变
    ptr.x = x; ptr.y = y; ptr.on = true;
    pick();
    wake();
  });
  canvas.addEventListener("pointerleave", () => {
    if (!target) return;
    ptr.on = false; hovered = -1;
    note.textContent = target.note; canvas.style.cursor = "";
    wake();
  });
  canvas.addEventListener("click", () => {
    const href = hovered >= 0 && target.strands[hovered].href;
    if (href) location.href = href;
  });

  /* ---------- 控件：上方数字切形态，右下角切时段 ---------- */
  document.querySelector(".telemetry")?.classList.add("is-menu");
  cells.forEach((c) => {
    c.setAttribute("role", "button");
    c.tabIndex = 0;
    c.addEventListener("click", () => setForm(c.dataset.form));
    c.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setForm(c.dataset.form); }
    });
  });
  controls.innerHTML = `<span class="range" role="group" aria-label="时段配色">${TIMES.map(([k, text]) =>
    `<button type="button" data-tod="${k}" aria-pressed="${k === tod}">${text}</button>`).join("")}</span>`;
  controls.hidden = false;
  controls.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tod]");
    if (!btn) return;
    tod = btn.dataset.tod;
    controls.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    try { localStorage.setItem(KEY, tod); } catch { /* 无法存储：只在本页生效 */ }
    wake();
  });

  resize();                                             // 先按当前尺寸摆好，不必等 ResizeObserver 首次回调
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; wake(); }).observe(canvas);
  document.addEventListener("visibilitychange", wake);
}
