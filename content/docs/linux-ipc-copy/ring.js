// shm-ring：共享内存环形缓冲区的模拟。写一帧、读一帧都要若干拍，所以能看到「读到一半被覆盖」。
// 三种策略：不同步 / 满了等 / 满了丢最旧。速度和拍数是图解用的，不是实测。

import { el, reduceMotion, whileVisible } from "/stage/lib/dom.js";

const SLOTS = 8;
const TICK_MS = 220;
const READER_DELAY = 4;   // 读方晚几拍启动，否则两边从第 0 格同时开始，「一样快」也会每帧都撞上
const SPEEDS = [
  { key: "w", label: "写方快", wTicks: 2, rTicks: 5 },
  { key: "e", label: "一样快", wTicks: 3, rTicks: 3 },
  { key: "r", label: "读方快", wTicks: 5, rTicks: 2 },
];
const POLICIES = [
  { key: "none", label: "不同步", note: "两边各写各读，互不检查。速度一样时可能一直没事，这正是它难查的原因。写方追上读方时会覆盖未读和正在读的帧；读方追上写方时会读到空格或没写完的帧。" },
  { key: "block", label: "满了就等", note: "每帧都不丢，适合命令和结果。代价是读方慢时写方也被拖慢，摄像头这类不能等的来源会丢在更上游。" },
  { key: "drop", label: "满了丢最旧", note: "写方永远不等，读方总是拿到较新的帧，适合视频帧。正在读的那一格不能覆盖，写方会跳过它。" },
];

function freshState() {
  return {
    slots: Array.from({ length: SLOTS }, () => ({ state: "empty", frame: 0 })),
    frame: 0, wAt: 0, rAt: 0, wLeft: 0, rLeft: 0, rFrame: 0, rSlot: -1, rBad: false,
    rDelay: READER_DELAY,
    written: 0, read: 0, dropped: 0, bad: 0, wWait: 0, rSleep: 0,
  };
}

function finishWrite(s) {
  const slot = s.slots[s.wAt];
  slot.state = "ready";
  s.written += 1;
  s.wAt = (s.wAt + 1) % SLOTS;
}

function beginWrite(s, policy) {
  // 丢最旧时不能覆盖正在读的那一格，跳到下一格
  if (policy === "drop" && s.slots[s.wAt].state === "reading") s.wAt = (s.wAt + 1) % SLOTS;
  const slot = s.slots[s.wAt];
  if (policy === "block" && slot.state !== "empty") { s.wWait += 1; return false; }
  if (policy === "drop" && slot.state === "ready") s.dropped += 1;
  if (policy === "none" && slot.state === "reading") s.rBad = true;
  if (policy === "none" && slot.state === "ready") s.dropped += 1;
  s.frame += 1;
  slot.state = "writing";
  slot.frame = s.frame;
  return true;
}

function stepWriter(s, policy, ticks) {
  if (s.wLeft === 0) {
    if (!beginWrite(s, policy)) return;
    s.wLeft = ticks;
  }
  s.wLeft -= 1;
  if (s.wLeft === 0) finishWrite(s);
}

/** 按帧号找最旧的就绪帧；同步策略下读方只取它，避免读到没写完的。 */
function oldestReady(s) {
  let best = -1;
  s.slots.forEach((slot, i) => {
    if (slot.state === "ready" && (best < 0 || slot.frame < s.slots[best].frame)) best = i;
  });
  return best;
}

function beginRead(s, policy) {
  const at = policy === "none" ? s.rAt : oldestReady(s);
  if (at < 0) { s.rSleep += 1; return false; }
  const slot = s.slots[at];
  s.rBad = policy === "none" && (slot.state !== "ready");
  s.rSlot = at;
  s.rFrame = slot.frame;
  if (slot.state === "ready") slot.state = "reading";
  return true;
}

function finishRead(s, policy) {
  const slot = s.slots[s.rSlot];
  if (slot.state === "reading") slot.state = "empty";
  if (s.rBad) s.bad += 1; else s.read += 1;
  if (policy === "none") s.rAt = (s.rAt + 1) % SLOTS;
  s.rSlot = -1;
  s.rBad = false;
}

function stepReader(s, policy, ticks) {
  if (s.rDelay > 0) { s.rDelay -= 1; return; }
  if (s.rLeft === 0) {
    if (!beginRead(s, policy)) return;
    s.rLeft = ticks;
  }
  s.rLeft -= 1;
  if (s.rLeft === 0) finishRead(s, policy);
}

function cellClass(slot, i, s) {
  const reading = s.rSlot === i;
  const writing = slot.state === "writing";
  if (reading && writing) return "is-torn";
  if (reading) return "is-reading";
  return `is-${slot.state}`;
}

function buttonGroup(items, onPick) {
  const buttons = items.map((item, i) => {
    const b = el("button", { type: "button", class: "ic-btn", "aria-pressed": "false", text: item.label });
    b.addEventListener("click", () => onPick(i));
    return b;
  });
  return { buttons, box: el("div", { class: "ir-group" }, buttons), mark: (k) => buttons.forEach((b, j) => b.setAttribute("aria-pressed", String(j === k))) };
}

export function mountShmRing(root) {
  root.classList.add("w-ir");
  let s = freshState(), policy = 0, speed = 0;

  const cells = Array.from({ length: SLOTS }, () => {
    const num = el("span", { class: "ir-num" });
    const cell = el("div", { class: "ir-cell" }, [num]);
    return { cell, num };
  });
  const ring = el("div", { class: "ir-ring", role: "img", "aria-label": "8 格环形缓冲区，显示每格是空、写入中、就绪还是读取中" }, cells.map((c) => c.cell));
  const markers = el("div", { class: "ir-markers" });
  const wMark = el("span", { class: "ir-mark is-w", text: "写" });
  const rMark = el("span", { class: "ir-mark is-r", text: "读" });
  markers.append(wMark, rMark);

  const read = (label) => { const v = el("b"); return { v, box: el("span", { class: "ir-stat" }, [label, " ", v]) }; };
  const written = read("写入"), consumed = read("读到"), dropped = read("丢弃"), bad = read("坏帧"), wWait = read("写方等待"), rSleep = read("读方睡眠");
  const statBox = el("div", { class: "ir-stats", "aria-live": "off" }, [written, consumed, dropped, bad, wWait, rSleep].map((x) => x.box));
  const note = el("p", { class: "ic-cap", "aria-live": "polite" });

  function paint() {
    s.slots.forEach((slot, i) => {
      cells[i].cell.className = `ir-cell ${cellClass(slot, i, s)}`;
      cells[i].num.textContent = slot.state === "empty" ? "" : slot.frame;
    });
    const pct = (i) => `${((i + 0.5) / SLOTS) * 100}%`;
    wMark.style.left = pct(s.wAt);
    rMark.style.left = pct(s.rSlot >= 0 ? s.rSlot : s.rAt);
    written.v.textContent = s.written;
    consumed.v.textContent = s.read;
    dropped.v.textContent = s.dropped;
    bad.v.textContent = s.bad;
    bad.box.classList.toggle("is-alert", s.bad > 0);
    wWait.v.textContent = s.wWait;
    rSleep.v.textContent = s.rSleep;
  }

  function tick() {
    const p = POLICIES[policy].key, sp = SPEEDS[speed];
    stepWriter(s, p, sp.wTicks);
    stepReader(s, p, sp.rTicks);
    paint();
  }

  /** 减弱动效时不自动播放：直接跑 60 拍，给出完整的结果。 */
  function reset() {
    s = freshState();
    if (reduceMotion) for (let i = 0; i < 60; i += 1) tick();
    paint();
  }

  const policies = buttonGroup(POLICIES, (i) => { policy = i; policies.mark(i); note.textContent = POLICIES[i].note; reset(); });
  const speeds = buttonGroup(SPEEDS, (i) => { speed = i; speeds.mark(i); reset(); });
  const stepBtn = el("button", { type: "button", class: "ic-btn", text: "单步" });
  const pauseBtn = el("button", { type: "button", class: "ic-btn", "aria-pressed": "false", text: "暂停" });
  let paused = false;
  stepBtn.addEventListener("click", tick);
  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.setAttribute("aria-pressed", String(paused));
    pauseBtn.textContent = paused ? "继续" : "暂停";
  });

  const legend = el("p", { class: "ic-legend" }, [
    ["is-writing", "写入中"], ["is-ready", "就绪"], ["is-reading", "读取中"], ["is-torn", "边写边读"],
  ].map(([cls, label]) => el("span", {}, [el("i", { class: `ir-key ${cls}` }), label])));

  root.append(
    el("div", { class: "ir-bar" }, [policies.box, speeds.box, el("div", { class: "ir-group" }, [pauseBtn, stepBtn])]),
    el("div", { class: "ir-track" }, [ring, markers]),
    legend, statBox, note,
    el("p", { class: "w-caption", text: "示意：格数、读写速度和计数都是模拟，用来对比三种策略，不是实测数据。坏帧指读到空格、没写完或被覆盖的数据。" }),
  );

  policies.mark(0); speeds.mark(0);
  note.textContent = POLICIES[0].note;
  reset();
  whileVisible(root, () => { if (!paused) tick(); }, TICK_MS);
}
