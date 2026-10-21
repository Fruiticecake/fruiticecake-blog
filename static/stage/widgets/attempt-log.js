// 通用组件 attempt-log：「试过但走不通的方法」日志。
// 数据来自交互块降级内容里的第一张表格（原稿只写一份）：
//   | 方法 | 思路 | 为什么失败 | 结论（可选） |
// 「方法」列里括号中的内容作为出处，例如「点追踪（Google DeepMind）」；
// 「结论」里出现 N/10 时画成比例条。

import { el, textOf } from "../lib/dom.js";

const NAME_BY = /^(.*?)\s*[（(](.+)[）)]\s*$/;
const SCORE = /(\d+(?:\.\d+)?)\s*\/\s*10\b/;

export function parseAttempts(fallback) {
  const table = fallback?.querySelector("table");
  if (!table) throw new Error("attempt-log：降级内容里需要一张「方法 | 思路 | 为什么失败 | 结论」表格");
  return [...table.querySelectorAll("tbody tr")].map((tr) => {
    const [method, idea, fail, verdict = ""] = [...tr.children].map(textOf);
    const m = method.match(NAME_BY);
    const score = verdict.match(SCORE);
    return {
      name: m ? m[1] : method, by: m ? m[2] : "", idea, fail,
      verdict: verdict || "失败", score: score ? Number(score[1]) / 10 : null,
    };
  });
}

export function mount(root, ctx) {
  const rows = parseAttempts(ctx.fallback);
  root.classList.add("w-methods");
  const list = el("ol", { class: "mb-list" });
  rows.forEach((m, i) => {
    const verdict = [document.createTextNode(m.verdict)];
    if (m.score != null) verdict.unshift(el("span", { class: "mb-meter", style: `--score:${m.score}`, "aria-hidden": "true" }));
    list.appendChild(el("li", { class: "mb-item", style: `--i:${i}` }, [
      el("span", { class: "mb-idx", text: String(i + 1).padStart(2, "0") }),
      el("div", { class: "mb-head" }, [el("h4", { class: "mb-name", text: m.name }), el("span", { class: "mb-by", text: m.by })]),
      el("p", { class: "mb-idea", text: m.idea }),
      el("p", { class: "mb-fail", text: m.fail }),
      el("span", { class: "mb-verdict" }, verdict),
    ]));
  });
  root.appendChild(list);
}
