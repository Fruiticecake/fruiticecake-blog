// rss-trend：五种 VmRSS 曲线形状。泄漏、碎片、多线程三条用正文的实测点；缓存预热和锯齿是示意。
// 横轴是相对时间（0～1），纵轴 MB（按 /proc 的 kB ÷ 1000，和正文一致）。碎片场景可以点「malloc_trim(0)」看曲线回落。

import { svg, el, onceVisible, reduceMotion } from "/stage/lib/dom.js";

// 窄屏换一套更小的 viewBox，保证坐标轴文字不小于约 9px
const SIZES = { wide: { W: 560, H: 260 }, narrow: { W: 340, H: 230 } };
const PAD = { l: 52, r: 12, t: 18, b: 30 };

/** 每个场景：rss / vsz 是 [t, MB] 折线；real 表示关键点是实测值。 */
const PATTERNS = [
  {
    key: "leak", name: "持续上涨", real: true,
    rss: [[0, 1.1], [0.33, 21.8], [0.66, 42.2], [1, 62.5]],
    vsz: [[0, 4.2], [0.33, 24.4], [0.66, 44.8], [1, 65.1]],
    verdict: "泄漏：每轮稳定 +20 MB，负载停了也不回落。",
    next: "第 4 步 smaps 做差会指向 [heap]；第 6 步 ASan 报 handle_request() 第 23 行。",
  },
  {
    key: "frag", name: "涨上去不回落", real: true,
    rss: [[0, 1.0], [0.3, 106.0], [0.62, 106.0], [1, 106.0]],
    trimmed: [[0, 1.0], [0.3, 106.0], [0.62, 106.0], [0.66, 3.1], [1, 3.1]],
    vsz: [[0, 4.2], [0.3, 107.3], [1, 107.2]],
    marks: [[0.3, "分配 100 MB"], [0.62, "free 掉 99.99%"]],
    verdict: "malloc 没把内存还给内核：堆顶最后一块还在用，下面的空闲页都算在 RSS 里。",
    trimVerdict: "malloc_trim(0) 后从 106008 kB 回落到 3088 kB：不是泄漏，是碎片 / 堆顶被占。",
    next: "试一下右上角的 malloc_trim(0)。线上可以用 gdb -p 对运行中的进程调一次。",
  },
  {
    key: "cache", name: "先涨后走平",
    rss: Array.from({ length: 21 }, (_, i) => [i / 20, 4 + 46 * (1 - Math.exp(-i / 4))]),
    vsz: [[0, 60], [0.15, 120], [1, 120]],
    verdict: "缓存预热、连接池建满：涨到容量上限就停，属于正常。",
    next: "确认缓存有上限（条数或字节数）；没有上限的缓存会变成第一条曲线，而且 ASan 报不出来。",
  },
  {
    key: "saw", name: "锯齿起伏",
    rss: Array.from({ length: 41 }, (_, i) => [i / 40, 24 + 12 * Math.max(0, Math.sin(i * 0.8)) + 6 * Math.sin(i * 0.31)]),
    vsz: [[0, 90], [1, 90]],
    verdict: "随负载上下：请求来了申请，处理完释放，谷底稳定。",
    next: "关注峰值是否逼近内存上限；谷底如果一个周期比一个周期高，才需要怀疑。",
  },
  {
    key: "arena", name: "VSZ 暴涨、RSS 不动", real: true,
    rss: [[0, 1.0], [0.3, 1.0], [0.36, 3.1], [1, 3.1]],
    vsz: [[0, 4.2], [0.3, 4.2], [0.36, 594.1], [1, 594.1]],
    marks: [[0.33, "起 8 个线程"]],
    verdict: "8 个线程栈（各 8 MB）+ 8 个 arena（各预留 64 MB）：只是虚拟空间，几乎没有物理页。",
    next: "不是问题；想让数字好看可以 MALLOC_ARENA_MAX=2（实测 VmSize 降到 135 MB）。",
  },
];

const niceMax = (v) => { const steps = [10, 20, 50, 80, 120, 150, 200, 400, 600, 800]; return steps.find((s) => s >= v * 1.08) || v; };

export function mountRssTrend(root) {
  root.classList.add("w-rt");
  const { W, H } = root.clientWidth < 560 ? SIZES.narrow : SIZES.wide;
  let cur = PATTERNS[0], trimmed = false;
  const tabs = PATTERNS.map((p) => el("button", { type: "button", class: "rt-tab", "aria-pressed": "false", text: p.name }));
  const trimBtn = el("button", { type: "button", class: "rt-trim", text: "malloc_trim(0)" });
  const pic = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "rt-svg", role: "img" });
  const verdict = el("p", { class: "rt-verdict", "aria-live": "polite" });
  const next = el("p", { class: "rt-next" });
  const legend = el("div", { class: "rt-legend" }, [
    el("span", {}, [el("i", { class: "k-rss" }), "VmRSS"]), el("span", {}, [el("i", { class: "k-vsz" }), "VmSize"]),
  ]);
  const tag = el("span", { class: "rt-tag" });
  const caption = el("p", { class: "w-caption" });

  function draw(animate) {
    const rss = cur.key === "frag" && trimmed ? cur.trimmed : cur.rss;
    const ymax = niceMax(Math.max(...cur.rss.map((p) => p[1]), ...cur.vsz.map((p) => p[1])));
    const x = (t) => PAD.l + t * (W - PAD.l - PAD.r);
    const y = (mb) => H - PAD.b - (mb / ymax) * (H - PAD.t - PAD.b);
    pic.replaceChildren();
    pic.setAttribute("aria-label", `${cur.name}：${cur.verdict}`);
    for (let i = 0; i <= 4; i++) {
      const mb = (ymax / 4) * i;
      svg("line", { x1: PAD.l, x2: W - PAD.r, y1: y(mb), y2: y(mb), class: "rt-grid" }, pic);
      svg("text", { x: PAD.l - 8, y: y(mb) + 4, "text-anchor": "end", class: "rt-ax" }, pic).textContent = `${Math.round(mb)} MB`;
    }
    svg("text", { x: W - PAD.r, y: H - 8, "text-anchor": "end", class: "rt-ax" }, pic).textContent = "时间 →";
    for (const [t, text] of cur.marks || []) {
      svg("line", { x1: x(t), x2: x(t), y1: PAD.t, y2: H - PAD.b, class: "rt-mark" }, pic);
      svg("text", { x: x(t) + 5, y: PAD.t + 12, class: "rt-ax" }, pic).textContent = text;
    }
    const pts = (arr) => arr.map(([t, mb]) => `${x(t).toFixed(1)},${y(mb).toFixed(1)}`).join(" ");
    svg("polyline", { points: pts(cur.vsz), class: "rt-vsz", pathLength: 1 }, pic);
    const line = svg("polyline", { points: pts(rss), class: "rt-rss", pathLength: 1 }, pic);
    if (cur.real) for (const [t, mb] of (cur.key === "frag" && trimmed ? cur.trimmed : cur.rss)) svg("circle", { cx: x(t), cy: y(mb), r: 3.5, class: "rt-pt" }, pic);
    if (animate && !reduceMotion) { line.classList.add("is-draw"); }
    tabs.forEach((b, i) => b.setAttribute("aria-pressed", String(PATTERNS[i] === cur)));
    trimBtn.hidden = cur.key !== "frag";
    trimBtn.disabled = trimmed;
    verdict.textContent = cur.key === "frag" && trimmed ? cur.trimVerdict : cur.verdict;
    next.textContent = `下一步：${cur.next}`;
    tag.textContent = cur.real ? "REAL · 实测点" : "示意";
    tag.classList.toggle("is-real", Boolean(cur.real));
    caption.textContent = cur.real
      ? "圆点是正文里的实测值，点与点之间的连线和时间轴比例为示意。"
      : "示意：这条曲线为图解，不是实测数据。";
  }

  tabs.forEach((b, i) => b.addEventListener("click", () => { cur = PATTERNS[i]; trimmed = false; draw(true); }));
  trimBtn.addEventListener("click", () => { trimmed = true; draw(true); });
  root.append(
    el("div", { class: "rt-tabs", role: "group", "aria-label": "曲线形状" }, tabs),
    el("div", { class: "rt-head" }, [legend, tag, trimBtn]),
    pic, verdict, next, caption);
  draw(false);
  onceVisible(root, () => draw(true));
}
