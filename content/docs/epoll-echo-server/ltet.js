// LT 与 ET：对端一次发来 3000 字节，服务端每次被唤醒读 1024。切换触发方式和读法，
// 时间线逐行展开每次 epoll_wait 的结果，缓冲区条显示剩余字节。数字来自 WSL2（内核 5.10）实测。

import { el, reduceMotion, onceVisible } from "/stage/lib/dom.js";

const TOTAL = 3000, CHUNK = 1024, ROW_MS = 750;

/** 生成时间线：每行 { kind, text, left }，kind 为 data / wake / read / idle / stuck / again。 */
function timeline(mode, drain, extra) {
  const rows = [{ kind: "data", text: `对端发来 ${TOTAL} 字节，进入接收缓冲区`, left: TOTAL }];
  let left = TOTAL, wakes = 0;
  const readOnce = () => {
    const r = Math.min(CHUNK, left); left -= r;
    rows.push({ kind: "read", text: `read() = ${r}`, left });
  };
  const readAll = () => {
    while (left > 0) readOnce();
    rows.push({ kind: "read", text: "read() = -1，errno = EAGAIN：读空了", left });
  };
  wakes += 1; rows.push({ kind: "wake", text: `epoll_wait 返回 #${wakes}`, left });
  if (drain) readAll(); else readOnce();
  while (mode === "lt" && left > 0) {
    wakes += 1; rows.push({ kind: "wake", text: `epoll_wait 返回 #${wakes}：缓冲区还有数据，LT 再报告一次`, left });
    readOnce();
  }
  if (left > 0) {
    rows.push({ kind: "stuck", text: `还剩 ${left} 字节，但没有新数据到达：ET 不再报告，epoll_wait 一直睡`, left });
    if (extra) {
      left += 2;
      rows.push({ kind: "data", text: "对端又发来 2 字节：新的「边缘」", left });
      wakes += 1; rows.push({ kind: "wake", text: `epoll_wait 返回 #${wakes}`, left });
      readOnce();
      rows.push({ kind: "stuck", text: `又只读了一次：剩下 ${left} 字节继续等下一次新数据`, left });
    }
  } else {
    rows.push({ kind: "idle", text: "缓冲区空了，epoll_wait 继续睡眠", left });
  }
  return { rows, wakes, read: TOTAL + (extra && mode === "et" && !drain ? 2 : 0) - left, left };
}

function toggle(label, options, onPick) {
  const btns = options.map(([key, text]) => el("button", { type: "button", class: "lt-btn", "data-k": key, "aria-pressed": "false", text }));
  btns.forEach((b) => b.addEventListener("click", () => onPick(b.dataset.k)));
  const set = (key) => btns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === key)));
  return { node: el("div", { class: "lt-group" }, [el("span", { class: "lt-lab", text: label }), ...btns]), set };
}

export function mountLtEt(root) {
  root.classList.add("w-lt");
  const state = { mode: "lt", drain: false, extra: false };
  const modeT = toggle("触发方式", [["lt", "LT 水平触发"], ["et", "ET 边缘触发"]], (k) => { state.mode = k; state.extra = false; run(); });
  const readT = toggle("每次唤醒", [["once", "只读一次 1024"], ["all", "读到 EAGAIN"]], (k) => { state.drain = k === "all"; state.extra = false; run(); });
  const more = el("button", { type: "button", class: "lt-btn lt-more", text: "对端再发 2 字节" });
  more.addEventListener("click", () => { state.extra = true; run(); });

  const fill = el("span", { class: "lt-fill" });
  const bufText = el("span", { class: "lt-buftext" });
  const buffer = el("div", { class: "lt-buf", role: "img", "aria-label": "接收缓冲区剩余字节" }, [fill, bufText]);
  const list = el("ol", { class: "lt-rows" });
  const sum = el("p", { class: "lt-sum", "aria-live": "polite" });
  let timers = [];

  function showBuffer(left) {
    fill.style.transform = `scaleX(${left / TOTAL})`;
    bufText.textContent = `接收缓冲区：${left} 字节`;
  }

  function run(instant) {
    timers.forEach(clearTimeout); timers = [];
    modeT.set(state.mode); readT.set(state.drain ? "all" : "once");
    const t = timeline(state.mode, state.drain, state.extra);
    list.replaceChildren(); sum.textContent = "";
    more.hidden = true;
    root.classList.toggle("is-stuck", false);
    const finish = () => {
      const stuck = t.left > 0;
      root.classList.toggle("is-stuck", stuck);
      sum.textContent = `epoll_wait 返回 ${t.wakes} 次，读到 ${t.read} 字节${stuck ? `，${t.left} 字节卡在缓冲区` : ""}`;
      more.hidden = !(stuck && !state.extra);
    };
    t.rows.forEach((row, i) => {
      const add = () => {
        list.append(el("li", { class: `lt-row k-${row.kind}` }, [el("span", { class: "lt-tag", text: row.kind === "read" ? "READ" : row.kind === "wake" ? "WAKE" : row.kind === "data" ? "DATA" : row.kind === "stuck" ? "STUCK" : "IDLE" }), el("span", { text: row.text })]));
        showBuffer(row.left);
        if (i === t.rows.length - 1) finish();
      };
      if (instant || reduceMotion) add(); else timers.push(setTimeout(add, i * ROW_MS));
    });
  }

  root.append(el("div", { class: "lt-bar" }, [modeT.node, readT.node]), buffer, list, el("div", { class: "lt-foot" }, [sum, more]));
  run(true);
  onceVisible(root, () => run());
}
