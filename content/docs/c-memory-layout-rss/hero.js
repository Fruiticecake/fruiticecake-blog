// 首屏：进程地址空间。变量先逐个「落」进各自的段，随后一段泄漏让 [heap] 越长越高，右侧 VmRSS 曲线同步上涨。
// VmRSS 的四个关键点来自正文的实测（1.0 / 21.8 / 42.2 / 62.5 MB），点与点之间线性插值。

import { svg, el, reduceMotion } from "/stage/lib/dom.js";

const RSS_REAL = [1.0, 21.8, 42.2, 62.5];   // MB：start、round 1～3
const SAMPLES = 48;
const RSS_MAX = 64;

/** 从低地址到高地址的区域；grow 表示会随 RSS 变化的堆。 */
const REGIONS = [
  { key: "text", name: ".text", h: 34 },
  { key: "rodata", name: ".rodata", h: 28 },
  { key: "data", name: ".data", h: 24 },
  { key: "bss", name: ".bss", h: 24 },
  { key: "heap", name: "[heap] ↑", grow: true },
  { key: "mmap", name: "libc.so · mmap", h: 40, gapBefore: true },
  { key: "stack", name: "[stack] ↓", h: 36, gapBefore: true },
];

const LANDINGS = [
  { text: "func()", to: "text" },
  { text: "\"hello\"", to: "rodata" },
  { text: "g_init = 42", to: "data" },
  { text: "s_cnt", to: "bss" },
  { text: "malloc(1024)", to: "heap" },
  { text: "int local", to: "stack" },
];

function geometry(narrow) {
  return narrow
    ? { w: 420, h: 520, colX: 128, colW: 120, top: 34, bottom: 484, chart: { x: 300, y: 64, w: 108, h: 400 }, font: 14, small: 13 }
    : { w: 1000, h: 400, colX: 150, colW: 190, top: 28, bottom: 372, chart: { x: 560, y: 70, w: 400, h: 260 }, font: 14, small: 12 };
}

/** 生成 VmRSS 曲线：按实测点线性插值，加一点确定性的抖动。 */
function rssSeries() {
  return Array.from({ length: SAMPLES }, (_, i) => {
    const t = (i / (SAMPLES - 1)) * (RSS_REAL.length - 1);
    const k = Math.min(RSS_REAL.length - 2, Math.floor(t));
    const v = RSS_REAL[k] + (RSS_REAL[k + 1] - RSS_REAL[k]) * (t - k);
    return Math.max(RSS_REAL[0], v + Math.sin(i * 1.7) * 0.6);
  });
}

function drawColumn(root, geo) {
  const fixed = REGIONS.filter((r) => !r.grow).reduce((s, r) => s + r.h + (r.gapBefore ? 46 : 0), 0);
  const heapMax = geo.bottom - geo.top - fixed - 10;
  const boxes = {};
  let y = geo.bottom;
  for (const r of REGIONS) {
    if (r.gapBefore) y -= 46;
    const h = r.grow ? heapMax : r.h;
    y -= h;
    const g = svg("g", { class: `as-reg as-${r.key}` }, root);
    if (r.grow) {
      svg("rect", { x: geo.colX, y, width: geo.colW, height: h, class: "as-heap-room" }, g);
      const fill = svg("rect", { x: geo.colX, y: y + h, width: geo.colW, height: 0, class: "as-heap" }, g);
      boxes[r.key] = { g, y, h, fill, base: y + h };
    } else {
      svg("rect", { x: geo.colX, y, width: geo.colW, height: h, class: "as-box" }, g);
      boxes[r.key] = { g, y, h };
    }
    const label = svg("text", { x: geo.colX - 12, y: (r.grow ? y + h - 8 : y + h / 2 + 5), "text-anchor": "end",
      class: "as-name", "font-size": geo.font }, g);
    label.textContent = r.name;
  }
  const lo = svg("text", { x: geo.colX + geo.colW, y: geo.bottom + 18, "text-anchor": "end", class: "as-addr", "font-size": geo.small }, root);
  lo.textContent = "0x55…  低地址";
  const hi = svg("text", { x: geo.colX + geo.colW, y: geo.top - 8, "text-anchor": "end", class: "as-addr", "font-size": geo.small }, root);
  hi.textContent = "0x7fff…  高地址";
  return boxes;
}

function drawChart(root, geo) {
  const c = geo.chart;
  const g = svg("g", { class: "as-chart" }, root);
  svg("rect", { x: c.x, y: c.y, width: c.w, height: c.h, class: "as-plot" }, g);
  for (const mb of [0, 32, 64]) {
    const y = c.y + c.h - (mb / RSS_MAX) * c.h;
    svg("line", { x1: c.x, x2: c.x + c.w, y1: y, y2: y, class: "as-grid" }, g);
    // 宽屏把刻度放在图外左侧；窄屏没有空间，放在图内网格线上方
    const inside = geo.w < 600;
    const t = svg("text", { x: inside ? c.x + 4 : c.x - 8, y: inside ? y - 4 : y + 4, "text-anchor": inside ? "start" : "end",
      class: "as-addr", "font-size": geo.small }, g);
    t.textContent = `${mb}M`;
  }
  const title = svg("text", { x: c.x, y: c.y - 34, class: "as-name", "font-size": geo.font }, g);
  title.textContent = "VmRSS";
  const read = svg("text", { x: c.x + c.w, y: c.y - 12, "text-anchor": "end", class: "as-read", "font-size": geo.font + 2 }, g);
  const line = svg("polyline", { points: "", class: "as-line" }, g);
  const dot = svg("circle", { r: 4.5, class: "as-dot", cx: c.x, cy: c.y + c.h }, g);
  return { line, dot, read };
}

function chartPoint(geo, i, mb) {
  const c = geo.chart;
  return [c.x + (i / (SAMPLES - 1)) * c.w, c.y + c.h - (mb / RSS_MAX) * c.h];
}

export function mountAddrSpaceHero(figure) {
  const narrow = figure.clientWidth < 560;
  const geo = geometry(narrow);
  const root = svg("svg", { viewBox: `0 0 ${geo.w} ${geo.h}`, class: "as-hero", role: "img",
    "aria-label": "进程地址空间：.text、.rodata、.data、.bss、堆、共享库和栈；一段泄漏让堆持续增长，VmRSS 从 1 MB 涨到 62.5 MB" });
  const boxes = drawColumn(root, geo);
  const chart = drawChart(root, geo);
  const chips = LANDINGS.map((l) => {
    const b = boxes[l.to];
    const y = l.to === "heap" ? b.base - 12 : b.y + b.h / 2 + 5;
    const t = svg("text", { x: geo.colX + geo.colW / 2, y, "text-anchor": "middle", class: "as-chip", "font-size": geo.font - 1 }, root);
    t.textContent = l.text;
    return t;
  });
  const series = rssSeries();
  figure.append(root, el("figcaption", { class: "viewer-cap" }, [
    el("span", {}, [el("i", { class: "k-static" }), "静态区（文件映射）"]),
    el("span", {}, [el("i", { class: "k-heap" }), "堆：handle_request 每 10 次漏 1 KB"]),
    el("span", { text: "曲线 = 实测 VmRSS" }),
  ]));

  const heap = boxes.heap;
  function show(n) {
    const mb = series[Math.max(0, n - 1)] ?? series[0];
    const hh = (mb / RSS_MAX) * heap.h;
    heap.fill.setAttribute("y", heap.base - hh);
    heap.fill.setAttribute("height", hh);
    const pts = series.slice(0, Math.max(1, n)).map((v, i) => chartPoint(geo, i, v).join(","));
    chart.line.setAttribute("points", pts.join(" "));
    const [cx, cy] = chartPoint(geo, Math.max(0, n - 1), mb);
    chart.dot.setAttribute("cx", cx); chart.dot.setAttribute("cy", cy);
    chart.read.textContent = `${Math.round(mb * 1024).toLocaleString("en-US")} kB`;
    chips[4].setAttribute("y", Math.min(heap.base - 12, heap.base - hh / 2 + 5));
  }

  if (reduceMotion) { chips.forEach((c) => c.classList.add("is-on")); show(SAMPLES); return; }

  let phase = 0, n = 0, visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(figure);
  show(1);
  const tick = () => {
    if (visible) {
      if (phase < chips.length) { chips[phase].classList.add("is-on"); phase += 1; }
      else if (n < SAMPLES) { n += 1; show(n); }
      else if (n < SAMPLES + 12) { n += 1; }                       // 停在顶部几拍
      else { n = 0; phase = chips.length; show(1); }               // 「重启进程」，从头再涨
    }
    setTimeout(tick, phase < chips.length ? 380 : 110);
  };
  setTimeout(tick, 900);
}
