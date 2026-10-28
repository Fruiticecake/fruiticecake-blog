// 总流程图：socket → bind → listen → epoll_create1 → epoll_ctl → epoll_wait 循环，
// 两个分支（listen_fd → accept；conn_fd → read → write / close）。按场景依次点亮经过的节点和连线。

import { svg, el, reduceMotion, onceVisible, whileVisible } from "/stage/lib/dom.js";

const W = 580, NW = 230, NH = 40, BW = 190, SW = 110;
// 节点：[id, 文字, 中心 x, 中心 y, 宽, 形状]
const NODES = [
  ["socket", "socket()", 280, 34, NW],
  ["bind", "bind(:8888)", 280, 94, NW],
  ["listen", "listen(fd, 128)", 280, 154, NW],
  ["create", "epoll_create1(0)", 280, 214, NW],
  ["ctl", "epoll_ctl(ADD, listen_fd)", 280, 274, NW],
  ["wait", "epoll_wait() → n", 280, 354, NW + 20, "hub"],
  ["is", "fd == listen_fd ?", 280, 444, 220, "dia"],
  ["accept", "accept() → conn_fd", 135, 540, BW],
  ["ctl2", "epoll_ctl(ADD, conn_fd)", 135, 610, BW],
  ["read", "read(fd)", 425, 540, BW],
  ["pos", "r > 0 ?", 425, 618, 150, "dia"],
  ["write", "write() 回显", 350, 704, SW],
  ["close", "close(fd)", 500, 704, SW],
];
const BY = Object.fromEntries(NODES.map((n) => [n[0], n]));

// 连线：[id, 路径点, 标签]
const EDGES = [
  ["e1", [[280, 54], [280, 74]]], ["e2", [[280, 114], [280, 134]]], ["e3", [[280, 174], [280, 194]]],
  ["e4", [[280, 234], [280, 254]]], ["e5", [[280, 294], [280, 334]]], ["e6", [[280, 374], [280, 418]]],
  ["yes", [[170, 444], [135, 444], [135, 520]], "是"],
  ["no", [[390, 444], [425, 444], [425, 520]], "否"],
  ["e7", [[135, 560], [135, 590]]], ["e8", [[425, 560], [425, 596]]],
  ["gt", [[350, 618], [350, 684]], "> 0"], ["le", [[500, 618], [500, 684]], "≤ 0"],
  ["back1", [[135, 630], [135, 660], [18, 660], [18, 354], [155, 354]]],
  ["back2", [[350, 724], [350, 760], [570, 760], [570, 354], [405, 354]]],
  ["back3", [[500, 724], [500, 760]]],   // 汇入 back2，不画箭头
];

const SCENES = [
  { key: "boot", label: "启动", path: ["socket", "e1", "bind", "e2", "listen", "e3", "create", "e4", "ctl", "e5", "wait"],
    cap: "启动：建监听 socket、建 epoll、登记 listen_fd，然后阻塞在 epoll_wait。这部分只执行一次。" },
  { key: "conn", label: "新连接", path: ["wait", "e6", "is", "yes", "accept", "e7", "ctl2", "back1", "wait"],
    cap: "新连接：listen_fd 就绪 → accept 拿到 conn_fd → 也登记进 epoll → 回到 epoll_wait。" },
  { key: "data", label: "收到数据", path: ["wait", "e6", "is", "no", "read", "e8", "pos", "gt", "write", "back2", "wait"],
    cap: "收到数据：某个 conn_fd 就绪 → read 返回字节数 > 0 → 原样 write 回去 → 回到 epoll_wait。" },
  { key: "bye", label: "对方断开", path: ["wait", "e6", "is", "no", "read", "e8", "pos", "le", "close", "back3", "back2", "wait"],
    cap: "对方断开：read 返回 0（出错时返回 -1）→ close(fd)，这个 fd 从 epoll 里消失 → 回到 epoll_wait。" },
];
const STEP_MS = 260;

function drawNode(root, [id, text, x, y, w, kind]) {
  const g = svg("g", { class: `fl-node${kind ? ` is-${kind}` : ""}`, "data-id": id }, root);
  if (kind === "dia") {
    const hw = w / 2, hh = 26;
    svg("polygon", { points: `${x - hw},${y} ${x},${y - hh} ${x + hw},${y} ${x},${y + hh}` }, g);
  } else {
    svg("rect", { x: x - w / 2, y: y - NH / 2, width: w, height: NH, rx: kind === "hub" ? 20 : 3 }, g);
  }
  svg("text", { x, y: y + 5, "text-anchor": "middle" }, g).textContent = text;
  return g;
}

function drawEdge(root, [id, pts, label]) {
  const g = svg("g", { class: "fl-edge", "data-id": id }, root);
  svg("polyline", { points: pts.map((p) => p.join(",")).join(" "), pathLength: 1 }, g);
  if (id !== "back3") {
    const [a, b] = pts.slice(-2);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), s = 7;
    const p = (d) => `${b[0] - s * Math.cos(ang + d)},${b[1] - s * Math.sin(ang + d)}`;
    svg("polygon", { points: `${b[0]},${b[1]} ${p(0.5)} ${p(-0.5)}`, class: "fl-head" }, g);
  }
  if (label) {
    const [x, y] = pts[pts.length > 2 ? 1 : 0];
    const left = x < 280;
    svg("text", { x: x + (left ? -8 : 8), y: y + (pts.length > 2 ? -8 : 22), "text-anchor": left ? "end" : "start", class: "fl-lab" }, g).textContent = label;
  }
  return g;
}

export function mountEchoFlow(root) {
  root.classList.add("w-fl");
  const pic = svg("svg", { viewBox: `0 0 ${W} 780`, class: "fl-svg", role: "img",
    "aria-label": "demo.c 总流程：启动后循环 epoll_wait，就绪的是 listen_fd 就 accept，是连接 fd 就 read，read 大于 0 则 write 回显，否则 close" });
  svg("text", { x: 566, y: 340, "text-anchor": "end", class: "fl-loop" }, pic).textContent = "LOOP";
  const parts = {};
  for (const e of EDGES) parts[e[0]] = drawEdge(pic, e);
  for (const n of NODES) parts[n[0]] = drawNode(pic, n);

  const caption = el("p", { class: "fl-cap", "aria-live": "polite" });
  const btns = SCENES.map((s) => el("button", { type: "button", class: "fl-btn", "aria-pressed": "false", text: s.label }));
  let timers = [], current = 0, stopAuto = null;

  function play(k, instant) {
    timers.forEach(clearTimeout); timers = [];
    current = k;
    const scene = SCENES[k];
    btns.forEach((b, j) => b.setAttribute("aria-pressed", String(j === k)));
    caption.textContent = scene.cap;
    Object.values(parts).forEach((g) => g.classList.remove("is-on", "is-head"));
    scene.path.forEach((id, j) => {
      const light = () => {
        parts[id].classList.add("is-on");
        scene.path.forEach((p) => parts[p].classList.toggle("is-head", p === id && BY[p]));
      };
      if (instant || reduceMotion) light(); else timers.push(setTimeout(light, j * STEP_MS));
    });
  }
  btns.forEach((b, k) => b.addEventListener("click", () => { stopAuto?.(); stopAuto = null; play(k); }));

  root.append(el("div", { class: "fl-bar" }, btns), pic, caption);
  play(0, true);
  onceVisible(root, () => {
    play(0);
    stopAuto = whileVisible(root, () => play((current + 1) % SCENES.length), 4200);
  });
}
