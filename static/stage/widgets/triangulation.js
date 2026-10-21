// 通用组件 triangulation：双机位三角测量。俯视舞台上拖动关节，两台相机的视线交于一点；
// 切到「只有侧面相机」时，视线上的所有点在画面里重合 → 深度未知。无 props。

import { svg, el, reduceMotion } from "../lib/dom.js";

/* ------------------------------------------------------------------
   1. 双机位三角测量：俯视舞台上拖动关节，两台相机的视线交于一点。
   切到「只有侧面相机」时，视线上的所有点在画面里都一样 → 深度未知。
------------------------------------------------------------------ */
// 布局（viewBox 680×400）：舞台 64..304，正面相机在舞台下方 y≈352，侧面相机在右方 x≈376，
// 右侧画面从 x=424 开始，三者互不重叠。
const STAGE = { x0: 64, y0: 40, size: 240 };        // 俯视舞台（世界坐标 -1..1）
const CAM_FRONT = { wx: 0, wz: -1.6 };              // 正面相机：在舞台前方，看向 +z
const CAM_SIDE = { wx: 1.6, wz: 0 };                // 侧面相机：在舞台右侧，看向 -x
const RAY_CLIP = { x: 0, y: 0, width: 404, height: 400 };
const FOCAL = 1.25;

const toPx = (wx, wz) => ({
  x: STAGE.x0 + ((wx + 1) / 2) * STAGE.size,
  y: STAGE.y0 + ((1 - wz) / 2) * STAGE.size,        // z 越大越远 = 越靠上
});
const toWorld = (px, py) => ({
  wx: ((px - STAGE.x0) / STAGE.size) * 2 - 1,
  wz: 1 - ((py - STAGE.y0) / STAGE.size) * 2,
});
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 透视投影到各自画面的横坐标（-1..1）
const projectFront = (p) => (p.wx - CAM_FRONT.wx) / (p.wz - CAM_FRONT.wz) * FOCAL;
const projectSide = (p) => (p.wz - CAM_SIDE.wz) / (CAM_SIDE.wx - p.wx) * FOCAL;

// 从相机穿过 p 的射线，延伸到舞台边界外
function rayEnd(cam, p, length = 4.2) {
  const dx = p.wx - cam.wx, dz = p.wz - cam.wz;
  const n = Math.hypot(dx, dz) || 1;
  return { wx: cam.wx + (dx / n) * length, wz: cam.wz + (dz / n) * length };
}

export function mount(root) {
  root.classList.add("w-tri");
  let mode = "both";
  let p = { wx: 0.28, wz: 0.18 };
  let userTouched = false;

  const controls = el("div", { class: "tri-controls", role: "group", "aria-label": "相机模式" });
  const btnBoth = el("button", { type: "button", class: "tri-mode", "aria-pressed": "true", text: "双机位" });
  const btnSide = el("button", { type: "button", class: "tri-mode", "aria-pressed": "false", text: "只有侧面相机" });
  controls.append(btnBoth, btnSide);

  // 窄容器（手机）改为竖排：舞台在上，两块画面在下，避免整体缩到看不清
  const tall = root.clientWidth > 0 && root.clientWidth < 560;
  const fig = svg("svg", { viewBox: tall ? "0 0 420 720" : "0 0 680 400", class: "tri-svg", role: "img",
    "aria-label": "俯视图：两台相机的视线在关节处相交" });
  const defs = svg("defs", {}, fig);
  const uid = Math.random().toString(36).slice(2, 7);
  const grid = svg("pattern", { id: `tri-grid-${uid}`, width: 24, height: 24, patternUnits: "userSpaceOnUse",
    x: STAGE.x0, y: STAGE.y0 }, defs);
  svg("path", { d: "M24 0H0V24", fill: "none", class: "tri-gridline" }, grid);
  const clip = svg("clipPath", { id: `tri-clip-${uid}` }, defs);
  svg("rect", RAY_CLIP, clip);

  svg("rect", { x: STAGE.x0, y: STAGE.y0, width: STAGE.size, height: STAGE.size,
    fill: `url(#${grid.id})`, class: "tri-stage" }, fig);
  svg("text", { x: STAGE.x0, y: STAGE.y0 - 12, class: "tri-label" }, fig).textContent = "俯视舞台 · 拖动关节";

  const rays = svg("g", { "clip-path": `url(#${clip.id})` }, fig);
  const rayFront = svg("line", { class: "tri-ray tri-ray-front" }, rays);
  const raySide = svg("line", { class: "tri-ray tri-ray-side" }, rays);
  const ghosts = svg("g", { class: "tri-ghosts" }, fig);

  const camGlyph = (cam, rot, label, cls) => {
    const c = toPx(cam.wx, cam.wz);
    const g = svg("g", { transform: `translate(${c.x} ${c.y}) rotate(${rot})`, class: `tri-cam ${cls}` }, fig);
    svg("rect", { x: -13, y: -9, width: 20, height: 18, rx: 3 }, g);
    svg("path", { d: "M7 -6 L17 -11 L17 11 L7 6 Z" }, g);
    svg("text", { x: c.x, y: c.y + (rot === -90 ? 36 : -22), class: "tri-label tri-cam-label",
      "text-anchor": "middle" }, fig).textContent = label;
  };
  camGlyph(CAM_FRONT, -90, "正面相机", "is-front");
  camGlyph(CAM_SIDE, 180, "侧面相机", "is-side");

  const halo = svg("circle", { r: 22, class: "tri-halo" }, fig);
  const joint = svg("circle", { r: 9, class: "tri-joint", tabindex: 0, role: "slider",
    "aria-label": "关节位置，用方向键移动", "aria-valuetext": "" }, fig);

  // 右侧：两台相机各自看到的画面
  const screens = svg("g", { transform: tall ? "translate(90 410)" : "translate(428 40)" }, fig);
  const makeScreen = (y, title) => {
    const g = svg("g", { transform: `translate(0 ${y})` }, screens);
    svg("rect", { width: 240, height: 120, rx: 6, class: "tri-screen" }, g);
    svg("line", { x1: 0, x2: 240, y1: 84, y2: 84, class: "tri-floor" }, g);
    svg("text", { x: 10, y: 20, class: "tri-label" }, g).textContent = title;
    const dot = svg("circle", { cy: 64, r: 6, class: "tri-screen-dot" }, g);
    const tick = svg("line", { y1: 92, y2: 104, class: "tri-tick" }, g);
    return { g, dot, tick };
  };
  const scrFront = makeScreen(0, "正面画面：看到 左右 x");
  const scrSide = makeScreen(150, "侧面画面：看到 前后 z");

  const readout = el("p", { class: "tri-readout", "aria-live": "polite" });
  root.append(controls, fig, readout);

  function render() {
    const P = toPx(p.wx, p.wz);
    joint.setAttribute("cx", P.x); joint.setAttribute("cy", P.y);
    halo.setAttribute("cx", P.x); halo.setAttribute("cy", P.y);

    const setRay = (line, cam) => {
      const a = toPx(cam.wx, cam.wz), b = toPx(...Object.values(rayEnd(cam, p)));
      line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
      line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
    };
    setRay(rayFront, CAM_FRONT); setRay(raySide, CAM_SIDE);

    const both = mode === "both";
    rayFront.style.opacity = both ? 1 : 0;
    scrFront.g.style.opacity = both ? 1 : 0.25;
    halo.classList.toggle("is-solved", both);

    ghosts.replaceChildren();
    if (!both) {
      // 侧面视线上的其他点：在侧面画面里和真关节落在同一个位置
      for (const t of [-0.55, -0.28, 0.3, 0.6]) {
        const g = { wx: p.wx + t, wz: p.wz + (t * (p.wz - CAM_SIDE.wz)) / (p.wx - CAM_SIDE.wx) };
        if (Math.abs(g.wx) > 1 || Math.abs(g.wz) > 1) continue;
        const G = toPx(g.wx, g.wz);
        svg("circle", { cx: G.x, cy: G.y, r: 7, class: "tri-ghost" }, ghosts);
        svg("text", { x: G.x + 11, y: G.y + 4, class: "tri-label tri-ghost-q" }, ghosts).textContent = "?";
      }
    }

    const u = (v) => 120 + clamp(v, -1, 1) * 105;
    for (const [scr, val] of [[scrFront, projectFront(p)], [scrSide, projectSide(p)]]) {
      scr.dot.setAttribute("cx", u(val));
      scr.tick.setAttribute("x1", u(val)); scr.tick.setAttribute("x2", u(val));
    }

    const fmt = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2);
    readout.replaceChildren(...(both
      ? [el("b", { text: `x ${fmt(p.wx)}` }), " · ", el("b", { text: `z ${fmt(p.wz)}` }), " — 两条视线只交于一点，关节的 3D 位置被唯一确定。"]
      : [el("b", { text: "z ?" }), " — 侧面画面里，这条视线上的每个点看起来都一样：近处的腿和远处的腿无从分辨。"]));
    joint.setAttribute("aria-valuetext", `x ${fmt(p.wx)}，z ${fmt(p.wz)}`);
  }

  function setMode(next) {
    mode = next;
    btnBoth.setAttribute("aria-pressed", String(next === "both"));
    btnSide.setAttribute("aria-pressed", String(next !== "both"));
    render();
  }
  btnBoth.addEventListener("click", () => setMode("both"));
  btnSide.addEventListener("click", () => setMode("side"));

  const svgPoint = (evt) => {
    const pt = fig.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(fig.getScreenCTM().inverse());
  };
  const moveTo = (evt) => {
    const s = svgPoint(evt), w = toWorld(s.x, s.y);
    p = { wx: clamp(w.wx, -0.95, 0.95), wz: clamp(w.wz, -0.95, 0.95) };
    render();
  };
  let dragging = false;
  joint.addEventListener("pointerdown", (e) => {
    dragging = userTouched = true;
    joint.setPointerCapture(e.pointerId);
    root.classList.add("is-dragging");
  });
  joint.addEventListener("pointermove", (e) => dragging && moveTo(e));
  joint.addEventListener("pointerup", () => { dragging = false; root.classList.remove("is-dragging"); });
  fig.addEventListener("click", (e) => {
    const s = svgPoint(e);
    if (s.x > STAGE.x0 && s.x < STAGE.x0 + STAGE.size && s.y > STAGE.y0 && s.y < STAGE.y0 + STAGE.size) {
      userTouched = true; moveTo(e);
    }
  });
  joint.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 0.15 : 0.05;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (!d) return;
    e.preventDefault(); userTouched = true;
    p = { wx: clamp(p.wx + d[0], -0.95, 0.95), wz: clamp(p.wz + d[1], -0.95, 0.95) };
    render();
  });

  // 待机演示：用户碰过之前，关节沿一条步态轨迹缓慢移动
  if (!reduceMotion) {
    const t0 = performance.now();
    const idle = (now) => {
      if (userTouched) return;
      const t = (now - t0) / 2600;
      p = { wx: 0.3 + Math.sin(t) * 0.42, wz: 0.12 + Math.sin(t * 2) * 0.3 };
      if (isVisible) render();
      requestAnimationFrame(idle);
    };
    let isVisible = false;
    new IntersectionObserver(([en]) => { isVisible = en.isIntersecting; }).observe(root);
    requestAnimationFrame(idle);
  }
  render();
}
