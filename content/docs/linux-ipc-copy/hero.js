// 首屏：两条车道。上面数据穿过内核，被拷贝两次；下面数据留在共享区，只有一个 8 字节的通知穿过内核。

import { svg, el, reduceMotion } from "/stage/lib/dom.js";

const BEAT_MS = 900;

function geometry(narrow) {
  return narrow
    ? { w: 420, h: 400, a: 72, m: 210, b: 348, y1: 96, k1: 170, y2: 262, k2: 346, bw: 100, bh: 46, font: 14, small: 12.5 }
    : { w: 1000, h: 400, a: 170, m: 500, b: 830, y1: 92, k1: 170, y2: 262, k2: 340, bw: 170, bh: 54, font: 15, small: 13 };
}

function box(root, x, y, g, label, cls = "") {
  const group = svg("g", { class: `ih-box ${cls}` }, root);
  svg("rect", { x: x - g.bw / 2, y: y - g.bh / 2, width: g.bw, height: g.bh, rx: 3 }, group);
  const t = svg("text", { x, y: y - g.bh / 2 - 8, "text-anchor": "middle", "font-size": g.small }, group);
  t.textContent = label;
}

function chip(root, label, cls, g) {
  const group = svg("g", { class: `ih-chip ${cls}` }, root);
  const w = cls === "is-bell" ? 36 : 56;
  svg("rect", { x: -w / 2, y: -12, width: w, height: 24, rx: 2 }, group);
  const t = svg("text", { x: 0, y: 4.5, "text-anchor": "middle", "font-size": g.small }, group);
  t.textContent = label;
  return group;
}

const at = (n, x, y) => { n.style.transform = `translate(${x}px, ${y}px)`; };

function laneLabel(root, x, y, g, text) {
  const t = svg("text", { x, y, "font-size": g.small, class: "ih-lane" }, root);
  t.textContent = text;
  return t;
}

export function mountIpcHero(figure) {
  const g = geometry(figure.clientWidth < 560);
  const root = svg("svg", { viewBox: `0 0 ${g.w} ${g.h}`, class: "ih-svg", role: "img",
    "aria-label": "两种 IPC 对比：socket 的数据经过内核，拷贝两次；共享内存的数据留在共享区，只有通知经过内核" });

  laneLabel(root, 12, 26, g, "SOCKET / PIPE");
  const c1 = laneLabel(root, g.w - 12, 26, g, "");
  c1.setAttribute("text-anchor", "end");
  box(root, g.a, g.y1, g, "进程 A");
  box(root, g.b, g.y1, g, "进程 B");
  box(root, g.m, g.k1, g, "内核缓冲区", "is-kernel");

  laneLabel(root, 12, g.y2 - 52, g, "SHARED MEMORY");
  const c2 = laneLabel(root, g.w - 12, g.y2 - 52, g, "");
  c2.setAttribute("text-anchor", "end");
  box(root, g.a, g.y2, g, "进程 A");
  box(root, g.b, g.y2, g, "进程 B");
  box(root, g.m, g.y2, g, "共享区", "is-shared");
  box(root, g.m, g.k2, g, "eventfd", "is-kernel");

  const srcA = chip(root, "DATA", "is-data", g);
  const inKernel = chip(root, "DATA", "is-data", g);
  const fly = chip(root, "DATA", "is-fly", g);
  const dstB = chip(root, "DATA", "is-data", g);
  const inShared = chip(root, "DATA", "is-data", g);
  const bell = chip(root, "8B", "is-bell", g);
  at(srcA, g.a, g.y1); at(inKernel, g.m, g.k1); at(dstB, g.b, g.y1); at(inShared, g.m, g.y2);

  figure.append(root, el("figcaption", { class: "viewer-cap" }, [
    el("span", {}, [el("i", { class: "ih-key is-data" }), "数据"]),
    el("span", {}, [el("i", { class: "ih-key is-bell" }), "通知（不带数据）"]),
    el("span", { text: "图中是拷贝路径，不代表速度比例" }),
  ]));

  const show = (n, on) => n.classList.toggle("is-on", on);
  const move = (n, x, y) => { n.classList.add("is-on"); at(n, x, y); };

  const SCRIPT = [
    () => { [inKernel, dstB, fly, bell].forEach((n) => show(n, false)); show(srcA, true); show(inShared, true); c1.textContent = "拷贝 0 次"; c2.textContent = "拷贝 0 次"; },
    () => { fly.classList.add("no-anim"); at(fly, g.a, g.y1); fly.getBoundingClientRect(); fly.classList.remove("no-anim"); move(fly, g.m, g.k1); bell.classList.add("no-anim"); at(bell, g.a, g.y2); bell.getBoundingClientRect(); bell.classList.remove("no-anim"); move(bell, g.m, g.k2); c1.textContent = "拷贝 1 次"; },
    () => { show(inKernel, true); fly.classList.add("no-anim"); at(fly, g.m, g.k1); fly.getBoundingClientRect(); fly.classList.remove("no-anim"); move(fly, g.b, g.y1); move(bell, g.b, g.y2); c1.textContent = "拷贝 2 次"; },
    () => { show(dstB, true); show(fly, false); show(bell, false); c2.textContent = "拷贝 0 次 · B 直接读"; },
    () => {},
  ];

  if (reduceMotion) {
    [srcA, inKernel, dstB, inShared].forEach((n) => show(n, true));
    c1.textContent = "拷贝 2 次";
    c2.textContent = "拷贝 0 次 · B 直接读";
    return;
  }

  let beat = 0, visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(figure);
  SCRIPT[0]();
  setInterval(() => {
    if (!visible) return;
    beat = (beat + 1) % SCRIPT.length;
    SCRIPT[beat]();
  }, BEAT_MS);
}
