// rtos-heap：一个缩小版的 FreeRTOS heap_4——首次适配、按地址排序、相邻空闲块合并、每块带 8 字节头。
// 两个场景逐步播放，读数对应 vPortGetHeapStats() 的字段。堆大小、块大小都是示意。

import { svg, el, onceVisible, reduceMotion } from "/stage/lib/dom.js";

const HEAP = 4096, HDR = 8, ALIGN = 8, MIN_BLOCK = 2 * HDR;
const BAR_Y = 8, BAR_H = 56;

const align = (n) => Math.ceil(n / ALIGN) * ALIGN;

/** 堆模型：blocks 按地址排序，state 为 free / used / leak。 */
function createHeap() {
  const h = { blocks: [{ start: 0, size: HEAP, state: "free", label: "" }], allocs: 0, frees: 0, minEver: HEAP };
  const freeBytes = () => h.blocks.filter((b) => b.state === "free").reduce((s, b) => s + b.size, 0);
  h.stats = () => {
    const free = h.blocks.filter((b) => b.state === "free");
    return { free: freeBytes(), largest: Math.max(0, ...free.map((b) => b.size)), nFree: free.length,
      minEver: h.minEver, outstanding: h.allocs - h.frees };
  };
  h.alloc = (n, label) => {
    const want = align(n + HDR);
    const i = h.blocks.findIndex((b) => b.state === "free" && b.size >= want);
    if (i < 0) return null;
    const b = h.blocks[i];
    if (b.size - want >= MIN_BLOCK) {
      h.blocks.splice(i + 1, 0, { start: b.start + want, size: b.size - want, state: "free", label: "" });
      b.size = want;
    }
    b.state = "used"; b.label = label; h.allocs += 1;
    h.minEver = Math.min(h.minEver, freeBytes());
    return b;
  };
  h.free = (blk) => {
    blk.state = "free"; blk.label = ""; h.frees += 1;
    for (let i = h.blocks.length - 2; i >= 0; i--) {      // 合并相邻空闲块（heap_4 的 prvInsertBlockIntoFreeList）
      const a = h.blocks[i], c = h.blocks[i + 1];
      if (a.state === "free" && c.state === "free") { a.size += c.size; h.blocks.splice(i + 1, 1); }
    }
  };
  return h;
}

/** 每个场景是一串步骤；每步改动堆并返回一行日志。 */
const SCENARIOS = {
  leak: {
    name: "泄漏",
    build(h) {
      const steps = [
        () => { h.alloc(1016, "任务栈"); h.alloc(504, "队列"); return "启动：创建任务和队列（长期占用）。"; },
      ];
      for (let k = 1; k <= 24; k++) {
        steps.push(() => {
          const m = h.alloc(240, `msg${k}`);
          if (!m) return { text: `第 ${k} 轮：pvPortMalloc(240) 返回 NULL → vApplicationMallocFailedHook()`, fail: true };
          if (k % 2 === 0) { m.state = "leak"; return `第 ${k} 轮：处理出错提前 return，忘了 vPortFree(msg${k})。`; }
          h.free(m); return `第 ${k} 轮：分配 msg${k}，处理完 vPortFree，空间被下一轮复用。`;
        });
      }
      return steps;
    },
  },
  frag: {
    name: "碎片",
    build(h) {
      const big = [];
      const steps = [() => { h.alloc(1016, "任务栈"); h.alloc(504, "队列"); return "启动：创建任务和队列（长期占用）。"; }];
      for (let k = 1; k <= 5; k++) {
        steps.push(() => { big.push(h.alloc(376, `帧${k}`)); h.alloc(56, `句柄${k}`); return `交替分配：帧${k}（376 B）和连接句柄${k}（56 B，长期占用）。`; });
      }
      for (let k = 1; k <= 5; k++) {
        steps.push(() => { h.free(big[k - 1]); return `帧${k} 处理完，vPortFree。它两边的句柄还在，空闲块无法合并。`; });
      }
      steps.push(() => {
        const s = h.stats();
        const ok = h.alloc(600, "大缓冲");
        return ok ? "pvPortMalloc(600) 成功。"
          : { text: `pvPortMalloc(600) 失败：总空闲 ${s.free} B，远大于 600，但最大的一块只有 ${s.largest} B。`, fail: true };
      });
      return steps;
    },
  },
};

export function mountRtosHeap(root) {
  root.classList.add("w-rh");
  const W = root.clientWidth < 560 ? 330 : 640;   // 窄屏换小 viewBox，文字不至于缩到 9px 以下
  let key = "leak", heap, steps, idx, timer = null;
  const scBtns = Object.entries(SCENARIOS).map(([k, s]) => el("button", { type: "button", class: "rh-sc", "aria-pressed": "false", "data-k": k, text: s.name }));
  const stepBtn = el("button", { type: "button", class: "rh-btn is-primary", text: "单步 →" });
  const playBtn = el("button", { type: "button", class: "rh-btn", text: "自动播放 ▶" });
  const resetBtn = el("button", { type: "button", class: "rh-btn", text: "重置" });
  const pic = svg("svg", { viewBox: `0 0 ${W} ${BAR_Y + BAR_H + 22}`, class: "rh-svg", role: "img" });
  const readouts = ["free", "largest", "min_ever", "free blocks", "outstanding"].map((name) =>
    el("div", { class: "rh-stat" }, [el("span", { text: name }), el("b", { text: "0" })]));
  const log = el("p", { class: "rh-log", "aria-live": "polite" });
  const counter = el("span", { class: "rh-count" });

  function render() {
    pic.replaceChildren();
    const sx = W / HEAP;
    for (const b of heap.blocks) {
      const g = svg("g", { class: `rh-blk s-${b.state}` }, pic);
      svg("rect", { x: b.start * sx + 0.5, y: BAR_Y, width: Math.max(1, b.size * sx - 1), height: BAR_H }, g);
      if (b.label && b.size * sx > 34) {
        svg("text", { x: (b.start + b.size / 2) * sx, y: BAR_Y + BAR_H / 2 + 4, "text-anchor": "middle" }, g).textContent = b.label;
      }
    }
    for (const kb of [0, 1, 2, 3, 4]) {
      svg("text", { x: Math.min(W - 2, kb * 1024 * sx + 2), y: BAR_Y + BAR_H + 16, class: "rh-ax", "text-anchor": kb === 4 ? "end" : "start" }, pic).textContent = `${kb} KB`;
    }
    const s = heap.stats();
    [s.free, s.largest, s.minEver, s.nFree, s.outstanding].forEach((v, i) => {
      readouts[i].querySelector("b").textContent = i < 3 ? `${v} B` : String(v);
    });
    readouts[1].classList.toggle("is-warn", s.free > 0 && s.largest < s.free / 3);
    readouts[4].classList.toggle("is-warn", key === "leak" && s.outstanding > 4);
    pic.setAttribute("aria-label", `堆状态：空闲 ${s.free} 字节，最大空闲块 ${s.largest} 字节，空闲块 ${s.nFree} 个`);
    counter.textContent = `STEP ${String(idx).padStart(2, "0")} / ${String(steps.length).padStart(2, "0")}`;
    stepBtn.disabled = idx >= steps.length;
    playBtn.disabled = idx >= steps.length;
  }

  function step() {
    if (idx >= steps.length) { stop(); return; }
    const r = steps[idx]();
    idx += 1;
    const text = typeof r === "string" ? r : r.text;
    log.textContent = text;
    log.classList.toggle("is-fail", typeof r === "object" && r.fail);
    if (typeof r === "object" && r.fail) idx = steps.length;
    render();
  }

  const stop = () => { clearInterval(timer); timer = null; playBtn.textContent = "自动播放 ▶"; };
  function reset(k) {
    stop(); key = k; heap = createHeap(); steps = SCENARIOS[k].build(heap); idx = 0;
    scBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === k)));
    log.textContent = "空堆：4096 字节。点「单步」或「自动播放」。"; log.classList.remove("is-fail");
    render();
  }
  function play() {
    if (timer) { stop(); return; }
    if (reduceMotion) { while (idx < steps.length) step(); return; }
    playBtn.textContent = "暂停 ❚❚";
    timer = setInterval(step, 650);
  }

  scBtns.forEach((b) => b.addEventListener("click", () => reset(b.dataset.k)));
  stepBtn.addEventListener("click", () => { stop(); step(); });
  playBtn.addEventListener("click", play);
  resetBtn.addEventListener("click", () => reset(key));

  root.append(
    el("div", { class: "rh-bar" }, [el("div", { class: "rh-group", role: "group", "aria-label": "场景" }, scBtns), counter, stepBtn, playBtn, resetBtn]),
    pic,
    el("div", { class: "rh-legend" }, [
      el("span", {}, [el("i", { class: "k-used" }), "在用"]), el("span", {}, [el("i", { class: "k-leak" }), "泄漏"]),
      el("span", {}, [el("i", { class: "k-free" }), "空闲"]),
    ]),
    el("div", { class: "rh-stats" }, readouts),
    log,
    el("p", { class: "w-caption", text: "示意：4 KB 的堆和各块大小为图解；分配算法按 heap_4 的规则（首次适配、8 字节对齐、块头 8 字节、相邻空闲块合并）简化实现。outstanding = 成功分配次数 − 成功释放次数。" }));
  reset("leak");
  onceVisible(root, () => { if (!reduceMotion && idx === 0) play(); });
}
