// 时序图公共件：两条生命线 + 斜向报文 + RTT 条带。widgets.js 与 auth.js 共用。

import { svg } from "/stage/lib/dom.js";

/* ------------------------------------------------------------------
   公共：时序图（两条生命线 + 斜向报文）
------------------------------------------------------------------ */
export const C2S = 1, S2C = -1;

/** 画一条报文：从一侧生命线斜向下到另一侧，末端是手画的箭头（不依赖 marker）。 */
export function drawMsg(parent, m, geo, y) {
  const [xa, xb] = m.dir === C2S ? [geo.left, geo.right] : [geo.right, geo.left];
  const y2 = y + geo.drop;
  const g = svg("g", { class: `lad-msg k-${m.kind || "tcp"}${m.enc ? " is-enc" : ""}${m.flag ? " is-flag" : ""}` }, parent);
  svg("line", { x1: xa, y1: y, x2: xb, y2, pathLength: 1, class: "lad-line" }, g);
  const ang = Math.atan2(y2 - y, xb - xa), s = geo.head;
  const p = (a) => `${xb - s * Math.cos(ang + a)},${y2 - s * Math.sin(ang + a)}`;
  svg("polygon", { points: `${xb},${y2} ${p(0.45)} ${p(-0.45)}`, class: "lad-head" }, g);
  const label = svg("text", { x: (xa + xb) / 2, y: (y + y2) / 2 - geo.font * 0.55, "text-anchor": "middle",
    class: "lad-label", "font-size": geo.font }, g);
  label.textContent = (m.flag ? "＋ " : "") + (m.enc ? "🔒 " : "") + m.text;
  return g;
}

/** 两条生命线和顶部标签。 */
export function drawLifelines(parent, geo, names) {
  for (const [x, name] of [[geo.left, names[0]], [geo.right, names[1]]]) {
    svg("line", { x1: x, x2: x, y1: geo.top - 6, y2: geo.bottom, class: "lad-life" }, parent);
    svg("text", { x, y: geo.top - 14, "text-anchor": "middle", class: "lad-name", "font-size": geo.font }, parent)
      .textContent = name;
  }
}

/** 按 RTT 画底色条带：每两条报文（去 + 回）算一个往返。 */
export function drawRttBands(parent, geo, count) {
  for (let i = 0; i < count; i++) {
    const y = geo.top + i * 2 * geo.row - geo.row * 0.25;
    const g = svg("g", { class: "lad-band" }, parent);
    svg("rect", { x: geo.left, y, width: geo.right - geo.left, height: geo.row * 2, class: i % 2 ? "odd" : "" }, g);
    svg("text", { x: geo.right + 8, y: y + geo.row, class: "lad-rtt", "font-size": geo.font * 0.85 }, g)
      .textContent = `RTT ${i + 1}`;
  }
}
