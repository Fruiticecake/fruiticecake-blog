// 本文专属组件：首屏两条队列 / 取法对比 / 积压耗时 / 队列生命周期 / 选型问答。
// 约定：导出 widgets 与 heroes，键是组件名，值是 mount(root, ctx)。

import { el, svg, whileVisible, reduceMotion } from "/stage/lib/dom.js";

/* ---------- 公共：从降级内容读表格 ---------- */

function readTable(ctx, name) {
  const table = ctx.fallback?.querySelector("table");
  if (!table) throw new Error(`${name}：降级内容里需要一张表格`);
  const rows = [...table.querySelectorAll("tbody tr")].map((tr) => [...tr.children]);
  if (!rows.length) throw new Error(`${name}：表格没有数据行`);
  return rows;
}

/** 把单元格里的文字和 code 原样搬进新节点，不用 innerHTML。 */
function cloneInline(cell, tag = "span", attrs = {}) {
  const node = el(tag, attrs);
  cell.childNodes.forEach((child) => node.append(child.cloneNode(true)));
  return node;
}

/* ---------- 取法对比 ---------- */

const MESSAGES = [
  { text: "log", prio: 1, type: 3 },
  { text: "alarm", prio: 5, type: 1 },
  { text: "state", prio: 3, type: 2 },
  { text: "log2", prio: 1, type: 3 },
];

const earliest = (queue, test) => queue.find(test) ?? null;
const lowestType = (queue, limit) => queue
  .filter((m) => m.type <= limit)
  .reduce((best, m) => (best === null || m.type < best.type ? m : best), null);

const MODES = [
  {
    id: "posix", label: "POSIX", call: "mq_receive", tag: (m) => `prio ${m.prio}`,
    pick: (q) => q.reduce((best, m) => (best === null || m.prio > best.prio ? m : best), null),
    show: (m) => `prio=${m.prio}`,
    empty: () => "队列空了：默认阻塞，非阻塞模式返回 EAGAIN",
  },
  {
    id: "sysv0", label: "msgtyp = 0", call: "msgrcv(0)", tag: (m) => `type ${m.type}`,
    pick: (q) => q[0] ?? null,
    show: (m) => `type=${m.type}`,
    empty: () => "队列空了：默认阻塞，IPC_NOWAIT 时返回 ENOMSG",
  },
  {
    id: "sysv2", label: "msgtyp = 2", call: "msgrcv(2)", tag: (m) => `type ${m.type}`,
    pick: (q) => earliest(q, (m) => m.type === 2),
    show: (m) => `type=${m.type}`,
    empty: (q) => (q.length
      ? `队列里还有 ${q.length} 条，但没有类型 2：照样阻塞，IPC_NOWAIT 时返回 ENOMSG`
      : "队列空了：默认阻塞，IPC_NOWAIT 时返回 ENOMSG"),
  },
  {
    id: "sysv-3", label: "msgtyp = -3", call: "msgrcv(-3)", tag: (m) => `type ${m.type}`,
    pick: (q) => lowestType(q, 3),
    show: (m) => `type=${m.type}`,
    empty: () => "队列空了：默认阻塞，IPC_NOWAIT 时返回 ENOMSG",
  },
];

function mountPickOrder(root) {
  let mode = MODES[0];
  let queue = [];
  const tabs = el("div", { class: "mq-tabs", role: "group", "aria-label": "选择取法" });
  const row = el("ol", { class: "mq-queue" });
  const recv = el("button", { type: "button", class: "mq-btn is-primary", text: "收一条" });
  const reset = el("button", { type: "button", class: "mq-btn", text: "重置" });
  const log = el("ol", { class: "mq-log", "aria-live": "polite" });

  function renderQueue() {
    const next = mode.pick(queue);
    row.replaceChildren(...MESSAGES.map((m) => {
      const gone = !queue.includes(m);
      const cls = `mq-msg${gone ? " is-gone" : ""}${m === next ? " is-next" : ""}`;
      return el("li", { class: cls }, [
        el("b", { text: m.text }),
        el("span", { text: mode.tag(m) }),
      ]);
    }));
    recv.disabled = next === null;
  }

  function start(nextMode) {
    mode = nextMode;
    queue = [...MESSAGES];
    log.replaceChildren();
    [...tabs.children].forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === mode.id)));
    renderQueue();
    log.append(el("li", { class: "is-note", text: "下一条会取到高亮的那条。" }));
  }

  recv.addEventListener("click", () => {
    const got = mode.pick(queue);
    if (!got) return;
    queue = queue.filter((m) => m !== got);
    log.querySelector(".is-note")?.remove();
    log.append(el("li", { text: `${mode.call} → ${got.text}（${mode.show(got)}）` }));
    if (!mode.pick(queue)) log.append(el("li", { class: "is-stop", text: mode.empty(queue) }));
    renderQueue();
  });
  reset.addEventListener("click", () => start(mode));

  MODES.forEach((m) => {
    const b = el("button", { type: "button", class: "mq-btn", "data-id": m.id, text: m.label });
    b.addEventListener("click", () => start(m));
    tabs.append(b);
  });

  root.append(el("div", { class: "w-mq" }, [
    tabs, el("p", { class: "mq-label", text: "发送顺序，从左到右" }), row,
    el("div", { class: "mq-actions" }, [recv, reset]), log,
  ]));
  start(MODES[0]);
}

/* ---------- 积压耗时 ---------- */

function mountBacklogCost(root, ctx) {
  const data = readTable(ctx, "backlog-cost").map((cells) => {
    const [backlog, posix, sysv] = cells.map((c) => Number(c.textContent.trim()));
    if (![backlog, posix, sysv].every(Number.isFinite)) throw new Error("backlog-cost：表格里要全是数字");
    return { backlog, posix, sysv };
  });
  const FLOOR_NS = 100;   // 对数刻度的起点，所有实测值都大于它
  const top = Math.log10(Math.max(...data.map((d) => d.sysv)) / FLOOR_NS);
  const scale = (ns) => Math.log10(ns / FLOOR_NS) / top;
  const fmt = (ns) => (ns >= 10000 ? `${(ns / 1000).toFixed(1)} µs` : `${ns} ns`);

  const tabs = el("div", { class: "mq-tabs", role: "group", "aria-label": "选择积压条数" });
  const barP = el("i", { class: "mq-bar is-p" });
  const barS = el("i", { class: "mq-bar is-s" });
  const valP = el("b");
  const valS = el("b");
  const ratio = el("p", { class: "mq-ratio", "aria-live": "polite" });

  function select(d) {
    [...tabs.children].forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.n) === d.backlog)));
    barP.style.transform = `scaleX(${scale(d.posix)})`;
    barS.style.transform = `scaleX(${scale(d.sysv)})`;
    valP.textContent = fmt(d.posix);
    valS.textContent = fmt(d.sysv);
    const r = d.sysv / d.posix;
    ratio.textContent = r < 1.1
      ? `积压 ${d.backlog} 条：两者没有差别。`
      : `积压 ${d.backlog} 条：System V 是 POSIX 的 ${r.toFixed(1)} 倍。`;
  }

  data.forEach((d) => {
    const b = el("button", { type: "button", class: "mq-btn", "data-n": String(d.backlog), text: String(d.backlog) });
    b.addEventListener("click", () => select(d));
    tabs.append(b);
  });

  const line = (label, bar, val) => el("div", { class: "mq-line" }, [
    el("span", { class: "mq-line-name", text: label }),
    el("span", { class: "mq-track" }, [bar]),
    val,
  ]);
  root.append(el("div", { class: "w-mq" }, [
    tabs, line("POSIX", barP, valP), line("System V", barS, valS), ratio,
  ]));
  select(data[data.length - 2] ?? data[0]);
}

/* ---------- 队列生命周期 ---------- */

function mountQueueLife(root, ctx) {
  const steps = readTable(ctx, "queue-life");
  if (steps.some((cells) => cells.length !== 3)) throw new Error("queue-life：表格要有三列");
  const prev = el("button", { type: "button", class: "mq-btn", "aria-label": "上一步", text: "←" });
  const next = el("button", { type: "button", class: "mq-btn is-primary", "aria-label": "下一步", text: "→" });
  const counter = el("span", { class: "mq-count", "aria-live": "polite" });
  const action = el("p", { class: "mq-action" });
  const panes = el("div", { class: "mq-panes" });
  let step = 0;

  function go(s) {
    step = Math.max(0, Math.min(steps.length - 1, s));
    const [act, posix, sysv] = steps[step];
    counter.textContent = `STEP ${step + 1} / ${steps.length}`;
    prev.disabled = step === 0;
    next.disabled = step === steps.length - 1;
    action.replaceChildren(...[...act.childNodes].map((n) => n.cloneNode(true)));
    panes.replaceChildren(
      el("div", { class: "mq-pane" }, [el("h4", { text: "POSIX" }), cloneInline(posix, "p")]),
      el("div", { class: "mq-pane" }, [el("h4", { text: "System V" }), cloneInline(sysv, "p")]),
    );
  }

  prev.addEventListener("click", () => go(step - 1));
  next.addEventListener("click", () => go(step + 1));
  const wrap = el("div", { class: "w-mq", tabindex: "0", "aria-label": "队列生命周期，方向键切换步骤" }, [
    action, panes, el("div", { class: "mq-actions" }, [prev, counter, next]),
  ]);
  wrap.addEventListener("keydown", (e) => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (d) { e.preventDefault(); go(step + d); }
  });
  root.append(wrap);
  go(0);
}

/* ---------- 选型问答 ---------- */

function mountChooser(root, ctx) {
  const rows = readTable(ctx, "mq-chooser");
  if (rows.length < 2) throw new Error("mq-chooser：至少要有一个问题和一个默认结论");
  if (rows.some((cells) => cells.length !== 3)) throw new Error("mq-chooser：表格要有三列");
  const questions = rows.slice(0, -1);
  const fallback = rows[rows.length - 1];
  const path = el("ol", { class: "mq-path" });
  const area = el("div", { class: "mq-ask", "aria-live": "polite" });
  const again = el("button", { type: "button", class: "mq-btn", text: "重新选择" });

  function result([, answer, why]) {
    area.replaceChildren(el("div", { class: "mq-result" }, [
      el("span", { class: "mq-label", text: "建议" }),
      cloneInline(answer, "strong"),
      cloneInline(why, "p"),
    ]), again);
  }

  function ask(i) {
    if (i === questions.length) { result(fallback); return; }
    const [question] = questions[i];
    const yes = el("button", { type: "button", class: "mq-btn is-primary", text: "是" });
    const no = el("button", { type: "button", class: "mq-btn", text: "否" });
    const record = (answer) => path.append(el("li", {}, [cloneInline(question), el("b", { text: answer })]));
    yes.addEventListener("click", () => { record("是"); result(questions[i]); });
    no.addEventListener("click", () => { record("否"); ask(i + 1); });
    area.replaceChildren(
      el("span", { class: "mq-count", text: `Q${i + 1} / ${questions.length}` }),
      cloneInline(question, "p", { class: "mq-question" }),
      el("div", { class: "mq-actions" }, [yes, no]),
    );
  }

  again.addEventListener("click", () => { path.replaceChildren(); ask(0); });
  root.append(el("div", { class: "w-mq" }, [path, area]));
  ask(0);
}

/* ---------- 首屏：两条队列 ---------- */

const LANES = [
  { title: "POSIX · /demo_cmd", note: "先取最高优先级", key: "prio" },
  { title: "SYSTEM V · msgtyp=2", note: "只取类型 2", key: "type" },
];

function mountTwoLanes(figure) {
  const narrow = figure.clientWidth < 560;
  const g = narrow
    ? { w: 420, h: 380, lx: 22, x0: 71, gap: 72, cw: 62, ch: 44, font: 13, lift: 34 }
    : { w: 1000, h: 380, lx: 40, x0: 253, gap: 130, cw: 104, ch: 56, font: 15, lift: 34 };
  const root = svg("svg", { viewBox: `0 0 ${g.w} ${g.h}`, class: "mqh-svg", role: "img",
    "aria-label": "两条消息队列：POSIX 总是先取最高优先级的消息，System V 按类型取，队列里还有别的消息也不影响" });
  const chips = [];

  LANES.forEach((lane, li) => {
    const y = 110 + li * 170;
    const name = svg("text", { x: g.lx, y: y - g.ch / 2 - 30, class: "mqh-lane", "font-size": g.font }, root);
    name.textContent = lane.title;
    const note = svg("text", { x: g.w - g.lx, y: y - g.ch / 2 - 30, class: "mqh-note", "text-anchor": "end", "font-size": g.font }, root);
    note.textContent = lane.note;
    svg("line", { x1: g.lx, x2: g.w - g.lx, y1: y + g.ch / 2 + 12, y2: y + g.ch / 2 + 12, class: "mqh-rail" }, root);
    MESSAGES.forEach((m, mi) => {
      const group = svg("g", { class: "mqh-chip" }, root);
      group.style.transform = `translate(${g.x0 + mi * g.gap}px, ${y - g.ch / 2}px)`;
      svg("rect", { width: g.cw, height: g.ch, rx: 2 }, group);
      const t = svg("text", { x: g.cw / 2, y: g.ch / 2 - 2, "text-anchor": "middle", "font-size": g.font }, group);
      t.textContent = m.text;
      const sub = svg("text", { x: g.cw / 2, y: g.ch / 2 + 15, "text-anchor": "middle", "font-size": g.font - 2, class: "mqh-sub" }, group);
      sub.textContent = `${lane.key} ${m[lane.key]}`;
      chips.push({ group, lane: li, m, mi, y: y - g.ch / 2 });
    });
  });

  figure.append(root, el("figcaption", { class: "viewer-cap" }, [
    el("span", { text: "同一批消息、同样的发送顺序，取出来的顺序不同" }),
  ]));

  const mark = (li, m) => chips.filter((c) => c.lane === li).forEach((c) => c.group.classList.toggle("is-next", c.m === m));
  const posixOrder = [MESSAGES[1], MESSAGES[2], MESSAGES[0], MESSAGES[3]];
  mark(0, posixOrder[0]);
  mark(1, MESSAGES[2]);
  if (reduceMotion) return;

  let beat = 0;
  const eject = (c) => { c.group.classList.remove("is-next"); c.group.classList.add("is-out"); c.group.style.transform = `translate(${g.x0 + c.mi * g.gap}px, ${c.y - g.lift}px)`; };
  const chip = (li, m) => chips.find((c) => c.lane === li && c.m === m);
  whileVisible(figure, () => {
    beat = (beat + 1) % 6;
    if (beat === 5) {
      chips.forEach((c) => {
        c.group.classList.remove("is-out");
        c.group.style.transform = `translate(${g.x0 + c.mi * g.gap}px, ${c.y}px)`;
      });
      mark(0, posixOrder[0]);
      mark(1, MESSAGES[2]);
    } else if (beat < 5) {
      if (beat <= 4 && posixOrder[beat - 1]) eject(chip(0, posixOrder[beat - 1]));
      if (posixOrder[beat]) mark(0, posixOrder[beat]);
      if (beat === 1) eject(chip(1, MESSAGES[2]));
    }
  }, 1100);
}

export const widgets = {
  "pick-order": mountPickOrder,
  "backlog-cost": mountBacklogCost,
  "queue-life": mountQueueLife,
  "mq-chooser": mountChooser,
};
export const heroes = { "mq-two-lanes": mountTwoLanes };
