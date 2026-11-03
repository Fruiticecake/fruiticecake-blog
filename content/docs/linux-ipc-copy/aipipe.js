// ai-pipeline：端侧视觉系统里四类数据各走一条通道。选型文字从降级内容的表格读取，原稿只写一份。

import { el, svg } from "/stage/lib/dom.js";

const NH = 50;

// 节点：[文字, 中心 x, 中心 y, 宽]；通道：[数据类型下标, 路径点]，下标对应降级表格的行序
const WIDE = {
  w: 680, h: 340,
  nodes: [
    ["模型文件", 110, 56, 130], ["摄像头驱动", 110, 170, 130], ["守护进程", 110, 284, 130],
    ["推理进程 + NPU", 340, 170, 170],
    ["界面进程", 580, 76, 120], ["告警进程", 580, 170, 120], ["上传进程", 580, 264, 120],
  ],
  links: [
    [0, [[175, 56], [340, 56], [340, 145]]],
    [1, [[175, 170], [255, 170]]],
    [2, [[425, 170], [470, 170], [470, 76], [520, 76]]],
    [2, [[425, 170], [520, 170]]],
    [2, [[425, 170], [470, 170], [470, 264], [520, 264]]],
    [3, [[175, 284], [340, 284], [340, 195]]],
  ],
};

// 窄屏改成上中下三层，文字不会缩到看不清
const NARROW = {
  w: 400, h: 340,
  nodes: [
    ["模型文件", 66, 40, 112], ["摄像头驱动", 200, 40, 112], ["守护进程", 334, 40, 112],
    ["推理进程 + NPU", 200, 170, 190],
    ["界面进程", 66, 300, 112], ["告警进程", 200, 300, 112], ["上传进程", 334, 300, 112],
  ],
  links: [
    [0, [[66, 65], [66, 110], [160, 110], [160, 145]]],
    [1, [[200, 65], [200, 145]]],
    [3, [[334, 65], [334, 110], [240, 110], [240, 145]]],
    [2, [[200, 195], [200, 240], [66, 240], [66, 275]]],
    [2, [[200, 195], [200, 275]]],
    [2, [[200, 195], [200, 240], [334, 240], [334, 275]]],
  ],
};

function readRows(fallback) {
  const rows = [...(fallback?.querySelectorAll("table tbody tr") || [])].map((tr) =>
    [...tr.querySelectorAll("td")].map((td) => td.textContent.trim()));
  if (rows.length !== 4 || rows.some((r) => r.length !== 5)) {
    throw new Error("ai-pipeline：降级内容需要一张 4 行 5 列的表格（数据、规模、频率、选什么、为什么）");
  }
  return rows.map(([name, size, rate, pick, why]) => ({ name, size, rate, pick, why }));
}

function drawGraph({ w, h, nodes, links }) {
  const pic = svg("svg", { viewBox: `0 0 ${w} ${h}`, class: "ia-svg", role: "img",
    "aria-label": "端侧视觉系统：模型文件、摄像头和守护进程连到推理进程，推理结果发给界面、告警和上传进程" });
  const drawn = links.map(([kind, pts]) => {
    const line = svg("polyline", { points: pts.map((p) => p.join(",")).join(" "), class: "ia-link" }, pic);
    return { kind, line };
  });
  for (const [text, x, y, width] of nodes) {
    const g = svg("g", { class: "ia-node" }, pic);
    svg("rect", { x: x - width / 2, y: y - NH / 2, width, height: NH, rx: 3 }, g);
    const t = svg("text", { x, y: y + 5, "text-anchor": "middle" }, g);
    t.textContent = text;
  }
  return { pic, links: drawn };
}

function field(label) {
  const value = el("dd");
  return { value, nodes: [el("dt", { text: label }), value] };
}

export function mountAiPipeline(root, ctx) {
  const rows = readRows(ctx.fallback);
  root.classList.add("w-ia");
  const { pic, links } = drawGraph(root.clientWidth < 560 ? NARROW : WIDE);

  const size = field("规模"), rate = field("频率"), pick = field("选什么"), why = field("为什么");
  const panel = el("dl", { class: "ia-panel", "aria-live": "polite" }, [...size.nodes, ...rate.nodes, ...pick.nodes, ...why.nodes]);

  function select(k) {
    buttons.forEach((b, j) => b.setAttribute("aria-pressed", String(j === k)));
    links.forEach(({ kind, line }) => line.classList.toggle("is-on", kind === k));
    size.value.textContent = rows[k].size;
    rate.value.textContent = rows[k].rate;
    pick.value.textContent = rows[k].pick;
    why.value.textContent = rows[k].why;
  }

  const buttons = rows.map((r, k) => {
    const b = el("button", { type: "button", class: "ic-btn", "aria-pressed": "false", text: r.name });
    b.addEventListener("click", () => select(k));
    return b;
  });

  root.append(el("div", { class: "ir-group ia-tabs" }, buttons), pic, panel,
    el("p", { class: "w-caption", text: "示意：进程划分是一种常见结构，不是唯一做法。" }));
  select(1);
}
