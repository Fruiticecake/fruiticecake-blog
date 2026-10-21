// 首页星图：全站每篇文章是一个标记点，每个板块一条轨道，同板块按时间连成「骨架」。
// 时间范围可切换（30 天 / 90 天 / 1 年 / 全部）：短范围用线性时间，点均匀铺开；
// 「全部」用混合刻度（一半对数时间 + 一半发文名次），避免密集时段挤成一团。
// 悬停 / 触摸吸附最近的标记点显示标题，点击进入。数据来自页面内嵌的 JSON。

const NS = "http://www.w3.org/2000/svg";
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const DAY = 86400000;
const SNAP_PX = 22;
const MIN_TICK_GAP = 36;
const RANGES = [["30", "30 天"], ["90", "90 天"], ["365", "1 年"], ["all", "全部"]];
const TICKS = {
  30: [[0, "今天"], [7, "1 周"], [14, "2 周"], [30, "30 天"]],
  90: [[0, "今天"], [7, "1 周"], [30, "1 月"], [60, "2 月"], [90, "3 月"]],
  365: [[0, "今天"], [30, "1 月"], [90, "3 月"], [182, "半年"], [365, "1 年"]],
  all: [[0, "今天"], [7, "1 周"], [30, "1 月"], [182, "半年"], [365, "1 年"], [1825, "5 年"]],
};

const svgEl = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function timeScale(ages, range, left, right) {
  if (range !== "all") {
    const span = Number(range);
    return (age) => right - (Math.min(age, span) / span) * (right - left);
  }
  const maxAge = Math.max(30, ...ages);
  const sorted = [...ages].sort((a, b) => a - b);
  const rank = (age) => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] <= age) lo = mid + 1; else hi = mid; }
    return lo / Math.max(1, sorted.length);
  };
  return (age) => right - (0.5 * (Math.log1p(age) / Math.log1p(maxAge)) + 0.5 * rank(age)) * (right - left);
}

function layout(width, data, today, range) {
  const narrow = width < 640;
  const H = narrow ? 360 : 430;
  const left = narrow ? 18 : 150, right = width - (narrow ? 18 : 40);
  const top = narrow ? 82 : 70, bottom = H - 56;   // 窄屏多留一行给「更早 N 篇」，不压 CAM_00 标签
  const lanes = data.sections.map((s, i, all) => ({ ...s, y: top + ((bottom - top) * (i + 0.5)) / all.length }));
  const laneOf = Object.fromEntries(lanes.map((l) => [l.slug, l]));
  const all = data.posts.map((p) => ({ ...p, age: Math.max(0, (today - Date.parse(p.d)) / DAY), lane: laneOf[p.s] }))
    .filter((p) => p.lane);
  const inRange = range === "all" ? all : all.filter((p) => p.age <= Number(range));
  const xOf = timeScale(inRange.map((p) => p.age), range, left, right);
  const spread = ((bottom - top) / lanes.length) * 0.16;   // 上下错开的幅度：太大连线会变成锯齿
  const points = inRange.map((p) => ({
    ...p, x: xOf(p.age), y: p.lane.y + (((hash(p.u) % 1000) / 1000 - 0.5) * 2 * spread),
  }));
  const maxAge = Math.max(30, ...all.map((p) => p.age));
  return { W: width, H, left, right, top, bottom, lanes, points, xOf, narrow, range,
    older: all.length - inRange.length, ticks: TICKS[range].filter(([age]) => range !== "all" || age <= maxAge * 1.05) };
}

function draw(svg, L) {
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${L.W} ${L.H}`);
  const defs = svgEl("defs", {}, svg);
  const grad = svgEl("linearGradient", { id: "scan-grad" }, defs);
  svgEl("stop", { offset: 0, class: "scan-stop-a" }, grad);
  svgEl("stop", { offset: 1, class: "scan-stop-b" }, grad);

  const c = (x, y, dx, dy) => svgEl("path", { d: `M${x} ${y + dy * 18}V${y}H${x + dx * 18}`, class: "vf-corner" }, svg);
  c(12, 12, 1, 1); c(L.W - 12, 12, -1, 1); c(12, L.H - 12, 1, -1); c(L.W - 12, L.H - 12, -1, -1);
  svgEl("text", { x: 26, y: 36, class: "vf-label" }, svg).textContent = "CAM_00 · ARCHIVE";
  svgEl("text", { x: L.W - 26, y: 36, class: "vf-label hot", "text-anchor": "end" }, svg)
    .textContent = `${L.points.length} MARKERS · ${L.lanes.length} CAMS`;

  let lastLabelX = Infinity;
  for (const [age, label] of L.ticks) {                 // ticks 按年龄升序，x 从右往左
    const x = L.xOf(age);
    svgEl("line", { x1: x, x2: x, y1: L.top - 14, y2: L.bottom + 10, class: "tick" }, svg);
    if (lastLabelX - x < MIN_TICK_GAP) continue;        // 太挤就只画刻度线，不画文字
    lastLabelX = x;
    const anchor = x > L.right - 12 ? "end" : x < L.left + 12 ? "start" : "middle";   // 两端的字往里收，不压取景框角
    svgEl("text", { x, y: L.bottom + 28, class: "vf-label", "text-anchor": anchor }, svg).textContent = label;
  }
  if (L.older > 0) {
    svgEl("text", { x: L.left, y: L.top - 20, class: "vf-label older" }, svg).textContent = `← 更早 ${L.older} 篇`;
  }

  const scene = svgEl("g", {}, svg);
  for (const [i, lane] of L.lanes.entries()) {
    svgEl("line", { x1: L.left, x2: L.right, y1: lane.y, y2: lane.y, class: "lane" }, scene);
    if (!L.narrow) {
      svgEl("text", { x: 26, y: lane.y + 4, class: "vf-label" }, scene).textContent =
        `CAM_${String(i + 1).padStart(2, "0")} ${lane.tab || lane.name}`;
    }
    const pts = L.points.filter((p) => p.lane === lane).sort((a, b) => b.age - a.age);
    if (pts.length > 1) {
      svgEl("path", { d: "M" + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L"), class: "bone", pathLength: 1 }, scene);
    }
  }
  const span = Math.max(1, L.right - L.left);
  for (const p of L.points) {
    const delay = reduceMotion ? 0 : ((p.x - L.left) / span) * 1.2;
    const attrs = { cx: p.x, cy: p.y, style: `--d:${delay.toFixed(2)}s` };
    if (p.stage) {
      p.node = svgEl("circle", { ...attrs, r: 6.5, class: "mk is-stage" }, scene);
      svgEl("circle", { ...attrs, r: 2.4, class: "mk-core" }, scene);
    } else {
      p.node = svgEl("circle", { ...attrs, r: L.narrow ? 2.8 : 3.4, class: "mk" }, scene);
    }
  }
  const newest = L.points.reduce((a, b) => (!a || b.age < a.age ? b : a), null);
  if (newest) {
    newest.node.classList.add("is-hot");
    svgEl("circle", { cx: newest.x, cy: newest.y, r: 5, class: "pulse" }, svg);
  }
  if (!reduceMotion) svgEl("rect", { x: 0, y: L.top - 20, width: 70, height: L.bottom - L.top + 34, class: "scan" }, svg);
  const crossV = svgEl("line", { class: "cross", y1: L.top - 14, y2: L.bottom + 10 }, svg);
  const crossH = svgEl("line", { class: "cross", x1: L.left, x2: L.right }, svg);
  return { scene, crossV, crossH };
}

function rangeControl(figure, initial, onChange) {
  const group = document.createElement("div");
  group.className = "range";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "时间范围");
  const buttons = RANGES.map(([value, label]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-pressed", String(value === initial));
    b.addEventListener("click", () => {
      buttons.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      onChange(value);
    });
    group.appendChild(b);
    return b;
  });
  figure.querySelector(".viewer-cap")?.prepend(group);
  return (value) => buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(RANGES[i][0] === value)));
}

export function mount(figure, data, { today = Date.now() } = {}) {
  const svg = svgEl("svg", { role: "img", "aria-label": `文章星图：全站 ${data.posts.length} 篇文章按时间与板块排布` });
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.setAttribute("aria-hidden", "true");
  figure.prepend(svg);
  figure.append(tip);

  let range = RANGES.some(([v]) => v === figure.dataset.defaultRange) ? figure.dataset.defaultRange : "90";
  let L = null, parts = null, active = null;
  const render = () => {
    L = layout(Math.round(figure.clientWidth), data, today, range);
    parts = draw(svg, L);
    requestAnimationFrame(() => parts.scene.classList.add("is-captured"));
  };
  const setPressed = rangeControl(figure, range, (value) => { range = value; show(null); render(); });

  const toLocal = (evt) => {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  const nearest = (pos) => {
    let best = null, bestD = SNAP_PX;
    for (const p of L.points) {
      const d = Math.hypot(p.x - pos.x, p.y - pos.y);
      if (d < bestD) { best = p; bestD = d; }
    }
    return best;
  };
  function show(p) {
    active = p;
    figure.classList.toggle("is-hover", !!p);
    tip.classList.toggle("is-on", !!p);
    svg.style.cursor = p ? "pointer" : "";
    if (!p || !parts) return;
    parts.crossV.setAttribute("x1", p.x); parts.crossV.setAttribute("x2", p.x);
    parts.crossH.setAttribute("y1", p.y); parts.crossH.setAttribute("y2", p.y);
    const scale = svg.clientWidth / L.W;
    tip.style.left = `${Math.min(Math.max(p.x * scale, 110), svg.clientWidth - 110)}px`;
    tip.style.top = `${p.y * scale}px`;
    const label = document.createElement("small");
    label.textContent = `${p.d} · ${p.lane.name}${p.stage ? " · STAGE" : ""}`;
    tip.replaceChildren(label, document.createTextNode(p.t));
  }

  svg.addEventListener("pointermove", (e) => show(nearest(toLocal(e))));
  svg.addEventListener("pointerleave", () => show(null));
  svg.addEventListener("click", (e) => {
    const pos = toLocal(e);
    if (L.older > 0 && pos.y < L.top - 8 && pos.x < L.left + 120) {        // 点「更早 N 篇」切到全部
      range = "all"; setPressed(range); render(); return;
    }
    const p = active || nearest(pos);
    if (p) location.href = p.u;
  });

  render();
  let raf = 0, lastW = figure.clientWidth;
  new ResizeObserver(() => {
    if (Math.abs(figure.clientWidth - lastW) < 8) return;
    lastW = figure.clientWidth;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(render);
  }).observe(figure);
}
