// 首屏：epoll 的兴趣列表里登记了 24 个连接，偶尔有几个收到数据，被回调挂上就绪链表；
// epoll_wait 返回时只带走就绪的那几个，循环往复。就绪的 fd 序列是固定的（示意）。

import { svg, el, reduceMotion } from "/stage/lib/dom.js";

const COLS = 6, ROWS = 4, FIRST_FD = 5;
const ROUNDS = [[7, 19, 12], [23, 9], [14, 26, 6, 17], [11]];   // 每轮就绪的 fd（示意）

function geometry(narrow) {
  return narrow
    ? { w: 520, h: 560, gx: 40, gy: 70, cw: 72, ch: 54, gap: 8, rx: 40, ry: 380, rw: 440, font: 16 }
    : { w: 1000, h: 380, gx: 60, gy: 80, cw: 76, ch: 56, gap: 10, rx: 620, ry: 120, rw: 330, font: 16 };
}

export function mountEpollReadyHero(figure) {
  const narrow = figure.clientWidth < 600;
  const g = geometry(narrow);
  const root = svg("svg", { viewBox: `0 0 ${g.w} ${g.h}`, class: "er-hero", role: "img",
    "aria-label": "epoll 兴趣列表里有 24 个连接，只有收到数据的几个被挂上就绪链表，epoll_wait 只返回它们" });

  svg("text", { x: g.gx, y: g.gy - 26, class: "er-lab" }, root).textContent = `INTEREST LIST · ${COLS * ROWS} FDS`;
  const cells = new Map();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const fd = FIRST_FD + r * COLS + c;
      const x = g.gx + c * (g.cw + g.gap), y = g.gy + r * (g.ch + g.gap);
      const cell = svg("g", { class: "er-cell" }, root);
      svg("rect", { x, y, width: g.cw, height: g.ch, rx: 3 }, cell);
      svg("text", { x: x + g.cw / 2, y: y + g.ch / 2 + 6, "text-anchor": "middle", "font-size": g.font }, cell).textContent = `fd ${fd}`;
      cells.set(fd, { cell, cx: x + g.cw / 2, cy: y + g.ch / 2 });
    }
  }

  const lane = svg("g", { class: "er-lane" }, root);
  svg("text", { x: g.rx, y: g.ry - 18, class: "er-lab hot" }, lane).textContent = "READY LIST";
  svg("rect", { x: g.rx, y: g.ry, width: g.rw, height: 70, rx: 3, class: "er-lane-box" }, lane);
  const status = svg("text", { x: g.rx, y: g.ry + 120, class: "er-status", "font-size": 22 }, root);
  const sub = svg("text", { x: g.rx, y: g.ry + 150, class: "er-sub", "font-size": 15 }, root);
  const chipsLayer = svg("g", {}, root);

  figure.append(root, el("figcaption", { class: "viewer-cap" }, [
    el("span", {}, [el("i", { class: "k-idle" }), "已登记、没数据"]),
    el("span", {}, [el("i", { class: "k-hot" }), "收到数据 → 回调挂上就绪链表"]),
    el("span", { text: "epoll_wait 只返回就绪的 n 个 · 示意" }),
  ]));

  const slotX = (k) => g.rx + 14 + k * 78;
  function chip(fd, k) {
    const { cx, cy } = cells.get(fd);
    const node = svg("g", { class: "er-chip" }, chipsLayer);
    svg("rect", { x: -34, y: -20, width: 68, height: 40, rx: 3 }, node);
    svg("text", { x: 0, y: 6, "text-anchor": "middle", "font-size": g.font }, node).textContent = `fd ${fd}`;
    node.style.transform = `translate(${cx}px, ${cy}px)`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      node.style.transform = `translate(${slotX(k) + 34}px, ${g.ry + 35}px)`;
    }));
    return node;
  }
  const setStatus = (a, b) => { status.textContent = a; sub.textContent = b; };

  if (reduceMotion) {
    ROUNDS[0].forEach((fd, k) => { cells.get(fd).cell.classList.add("is-hot"); chip(fd, k); });
    setStatus(`epoll_wait → n = ${ROUNDS[0].length}`, `24 个连接里只有 ${ROUNDS[0].length} 个就绪`);
    return;
  }

  let round = 0, visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(figure);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const whenVisible = async () => { while (!visible) await wait(400); };

  async function loop() {
    for (;;) {
      await whenVisible();
      const ready = ROUNDS[round % ROUNDS.length];
      setStatus("epoll_wait() · 睡眠中", "就绪链表为空");
      await wait(900);
      const nodes = [];
      for (const [k, fd] of ready.entries()) {
        await whenVisible();
        cells.get(fd).cell.classList.add("is-hot");
        nodes.push(chip(fd, k));
        sub.textContent = `fd ${fd} 收到数据 → ep_poll_callback`;
        await wait(650);
      }
      setStatus(`epoll_wait → n = ${ready.length}`, `for 循环只跑 ${ready.length} 次`);
      await wait(1700);
      nodes.forEach((n) => n.classList.add("is-out"));
      ready.forEach((fd) => cells.get(fd).cell.classList.remove("is-hot"));
      await wait(500);
      nodes.forEach((n) => n.remove());
      round += 1;
    }
  }
  setTimeout(loop, 1200);
}
