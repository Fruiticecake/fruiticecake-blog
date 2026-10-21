// 通用组件 pipeline：可点击 / 方向键切换的步骤流水线，进入视口后自动播放。
// 数据来自交互块降级内容里的第一个有序列表（原稿只写一份），每一项：
//   1. **标题**（工具）：说明 → 产出
// 「（工具）」和「→ 产出」都可以省略。props.interval 可调自动播放间隔（毫秒，默认 3200）。

import { el, reduceMotion, textOf } from "../lib/dom.js";

const TOOL = /^\s*[（(]([^）)]+)[）)]\s*/;
const LEAD = /^\s*[:：]\s*/;
const OUT = /\s*→\s*([^→]+)$/;

export function parseSteps(fallback) {
  const items = fallback?.querySelectorAll("ol > li");
  if (!items?.length) throw new Error("pipeline：降级内容里需要一个有序列表，每项「**标题**（工具）：说明 → 产出」");
  return [...items].map((li) => {
    const strong = li.querySelector("strong");
    const title = textOf(strong) || textOf(li);
    let rest = strong ? textOf(li).slice(textOf(li).indexOf(title) + title.length) : "";
    const tool = rest.match(TOOL)?.[1] || "";
    rest = rest.replace(TOOL, "").replace(LEAD, "");
    const out = rest.match(OUT)?.[1]?.trim() || "";
    return { title, tool, out, body: rest.replace(OUT, "").trim() };
  });
}

export function mount(root, ctx) {
  const steps = parseSteps(ctx.fallback);
  const interval = Number(ctx.props.interval) || 3200;
  root.classList.add("w-pipe");
  let active = 0, timer = null;

  const rail = el("div", { class: "pipe-rail", role: "tablist", "aria-label": "流水线步骤", style: `--n:${steps.length}` });
  const panel = el("div", { class: "pipe-panel", role: "tabpanel", "aria-live": "polite" });
  const progress = el("span", { class: "pipe-progress", "aria-hidden": "true" });
  rail.appendChild(progress);

  const tabs = steps.map((s, i) => {
    const b = el("button", { type: "button", role: "tab", class: "pipe-node", "aria-selected": "false",
      tabindex: "-1", "aria-label": `第 ${i + 1} 步：${s.title}` }, [
      el("span", { class: "pipe-num", text: String(i + 1) }),
      el("span", { class: "pipe-node-title", text: s.title }),
      el("span", { class: "pipe-node-tool", text: s.tool }),
    ]);
    b.addEventListener("click", () => { stop(); select(i); });
    rail.appendChild(b);
    return b;
  });

  rail.addEventListener("keydown", (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault(); stop();
    select((active + d + steps.length) % steps.length);
    tabs[active].focus();
  });

  function select(i) {
    active = i;
    tabs.forEach((t, j) => {
      t.setAttribute("aria-selected", String(j === i));
      t.setAttribute("tabindex", j === i ? "0" : "-1");
      t.classList.toggle("is-done", j < i);
    });
    progress.style.setProperty("--p", steps.length > 1 ? i / (steps.length - 1) : 0);
    const s = steps[i];
    const pad = (n) => String(n).padStart(2, "0");
    const children = [
      el("p", { class: "pipe-step", text: `STEP ${pad(i + 1)} / ${pad(steps.length)}${s.tool ? ` · ${s.tool}` : ""}` }),
      el("h4", { class: "pipe-title", text: s.title }),
      el("p", { class: "pipe-body", text: s.body }),
    ];
    if (s.out) children.push(el("p", { class: "pipe-out" }, [el("span", { text: "产出 → " }), el("b", { text: s.out })]));
    panel.replaceChildren(...children);
    panel.classList.remove("is-in"); void panel.offsetWidth; panel.classList.add("is-in");
  }
  function stop() { clearInterval(timer); timer = null; root.classList.add("is-manual"); }

  root.append(rail, panel);
  select(0);
  if (!reduceMotion) {
    new IntersectionObserver(([en]) => {
      if (en.isIntersecting && !timer && !root.classList.contains("is-manual")) {
        timer = setInterval(() => select((active + 1) % steps.length), interval);
      } else if (!en.isIntersecting && timer) { clearInterval(timer); timer = null; }
    }, { threshold: 0.4 }).observe(root);
  }
}
