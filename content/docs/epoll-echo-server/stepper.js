// 公共件：逐步播放的控制条（← 计数 → ▶），进入视口后自动播放，手动操作即停止自动播放。
// accept-queue、select-vs-epoll、data-tag 共用。

import { el, reduceMotion, onceVisible } from "/stage/lib/dom.js";

const pad = (n) => String(n).padStart(2, "0");

/**
 * 在 root 上挂一个步进器。
 * count：步数；render(step)：画第 step 步；interval：自动播放间隔（毫秒），可以是 (step) => ms。
 * 返回 { bar, go(step), stop() }；bar 由调用方放进 DOM。
 */
export function stepper(root, { count, render, interval = 2400, extra = [] }) {
  const prev = el("button", { type: "button", class: "ep-btn", "aria-label": "上一步", text: "←" });
  const next = el("button", { type: "button", class: "ep-btn is-primary", "aria-label": "下一步", text: "→" });
  const play = el("button", { type: "button", class: "ep-btn ep-play", "aria-pressed": "false", text: "▶ 播放" });
  const counter = el("span", { class: "ep-count", "aria-live": "polite" });
  const bar = el("div", { class: "ep-ctrl" }, [prev, counter, next, play, ...extra]);

  let step = 0, timer = null, touched = false;   // 读者动过手，就不再自动播放
  const wait = (s) => (typeof interval === "function" ? interval(s) : interval);

  function go(s) {
    step = Math.max(0, Math.min(count - 1, s));
    counter.textContent = `STEP ${pad(step)} / ${pad(count - 1)}`;
    prev.disabled = step === 0;
    next.disabled = step === count - 1;
    render(step);
  }
  function stop() {
    clearTimeout(timer); timer = null;
    play.setAttribute("aria-pressed", "false"); play.textContent = "▶ 播放";
  }
  function tick() {
    if (step >= count - 1) { stop(); return; }
    go(step + 1);
    timer = setTimeout(tick, wait(step));
  }
  function start(fromStart) {
    if (fromStart || step >= count - 1) go(0);
    play.setAttribute("aria-pressed", "true"); play.textContent = "❚❚ 暂停";
    clearTimeout(timer); timer = setTimeout(tick, wait(step));
  }

  const manual = () => { touched = true; stop(); };
  prev.addEventListener("click", () => { manual(); go(step - 1); });
  next.addEventListener("click", () => { manual(); go(step + 1); });
  play.addEventListener("click", () => { touched = true; if (timer) stop(); else start(false); });
  root.addEventListener("keydown", (e) => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (d && !e.target.closest("input, textarea")) { e.preventDefault(); manual(); go(step + d); }
  });

  go(0);
  if (!reduceMotion) onceVisible(root, () => { if (!touched) start(true); });
  return { bar, go, stop: manual, get step() { return step; } };
}
