// 公共件：逐步播放的控制条（← 计数 → ▶）。进入视口后自动播放，手动操作即停止自动播放。
// load(count) 换一组步骤；copy-path 切换 IPC 方式时用。

import { el, reduceMotion, onceVisible } from "/stage/lib/dom.js";

const pad = (n) => String(n).padStart(2, "0");

export function stepper(root, { render, interval = 2600 }) {
  const prev = el("button", { type: "button", class: "ic-btn", "aria-label": "上一步", text: "←" });
  const next = el("button", { type: "button", class: "ic-btn is-primary", "aria-label": "下一步", text: "→" });
  const play = el("button", { type: "button", class: "ic-btn ic-play", "aria-pressed": "false", text: "▶ 播放" });
  const counter = el("span", { class: "ic-count", "aria-live": "polite" });
  const bar = el("div", { class: "ic-ctrl" }, [prev, counter, next, play]);

  let count = 1, step = 0, timer = null, touched = false;

  function go(s) {
    const previous = step;
    step = Math.max(0, Math.min(count - 1, s));
    counter.textContent = `STEP ${pad(step)} / ${pad(count - 1)}`;
    prev.disabled = step === 0;
    next.disabled = step === count - 1;
    render(step, step === previous + 1);
  }
  function stop() {
    clearTimeout(timer); timer = null;
    play.setAttribute("aria-pressed", "false"); play.textContent = "▶ 播放";
  }
  function tick() {
    if (step >= count - 1) { stop(); return; }
    go(step + 1);
    timer = setTimeout(tick, interval);
  }
  function start() {
    if (step >= count - 1) { step = 0; go(0); }
    play.setAttribute("aria-pressed", "true"); play.textContent = "❚❚ 暂停";
    clearTimeout(timer); timer = setTimeout(tick, interval);
  }
  const manual = () => { touched = true; stop(); };

  prev.addEventListener("click", () => { manual(); go(step - 1); });
  next.addEventListener("click", () => { manual(); go(step + 1); });
  play.addEventListener("click", () => { touched = true; if (timer) stop(); else start(); });
  root.addEventListener("keydown", (e) => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (d) { e.preventDefault(); manual(); go(step + d); }
  });

  if (!reduceMotion) onceVisible(root, () => { if (!touched) start(); });

  return {
    bar,
    /** 换一组步骤并回到第 0 步；autoplay 为真且允许动效时从头播放。 */
    load(n, autoplay) {
      stop();
      count = n; step = 0;
      go(0);
      if (autoplay && !reduceMotion) start();
    },
  };
}
