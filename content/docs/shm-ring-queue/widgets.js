// 本文专属组件：ring-sim / order-sim / wake-race / bench-bars
// 首屏：ring-orbit

import { el, svg, whileVisible, reduceMotion } from "/stage/lib/dom.js";

/* ---------- 公共 ---------- */

function readTable(ctx, name) {
  const table = ctx.fallback?.querySelector("table");
  if (!table) throw new Error(`${name}：降级内容里需要一张表格`);
  const head = [...table.querySelectorAll("thead th")].map((n) => n.textContent.trim());
  const rows = [...table.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((n) => n.textContent.trim()));
  if (!rows.length) throw new Error(`${name}：表格没有数据行`);
  return { head, rows };
}

function tabButtons(labels, onPick, ariaLabel) {
  const bar = el("div", { class: "rq-tabs", role: "group", "aria-label": ariaLabel });
  const buttons = labels.map((label, i) => {
    const b = el("button", { type: "button", class: "rq-btn", text: label });
    b.addEventListener("click", () => select(i));
    bar.append(b);
    return b;
  });
  function select(i) {
    buttons.forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
    onPick(i);
  }
  return { bar, select };
}

/* ---------- ring-sim：自由递增下标 ---------- */

const RING_CAP = 8;

function mountRingSim(root) {
  let head = 4294967290; // 接近 2^32，几下就能看到回绕
  let tail = head;
  const slots = Array.from({ length: RING_CAP }, (_, i) => {
    const n = el("div", { class: "rq-slot" }, [el("span", { class: "rq-idx", text: String(i) }), el("b", { text: "" })]);
    return n;
  });
  const push = el("button", { type: "button", class: "rq-btn is-primary", text: "写一条" });
  const pop = el("button", { type: "button", class: "rq-btn", text: "读一条" });
  const reset = el("button", { type: "button", class: "rq-btn", text: "重置" });
  const stats = el("dl", { class: "rq-stats", "aria-live": "polite" });
  let seq = 0;
  const data = new Array(RING_CAP).fill("");
  const u32 = (x) => (x >>> 0);

  function render() {
    const count = u32(tail - head);
    slots.forEach((n, i) => {
      const offset = u32(i - (head & (RING_CAP - 1))) % RING_CAP;
      const used = offset < count;
      n.classList.toggle("is-used", used);
      n.classList.toggle("is-head", count > 0 && offset === 0);
      n.classList.toggle("is-tail", count < RING_CAP && i === (tail & (RING_CAP - 1)));
      n.querySelector("b").textContent = used ? data[i] : "";
    });
    push.disabled = count === RING_CAP;
    pop.disabled = count === 0;
    const rows = [
      ["tail（生产者写）", String(tail)],
      ["head（消费者写）", String(head)],
      ["tail - head", `${count}${count === RING_CAP ? "，满" : count === 0 ? "，空" : ""}`],
      ["写入槽位 tail & 7", String(tail & (RING_CAP - 1))],
    ];
    stats.replaceChildren(...rows.flatMap(([k, v]) => [el("dt", { text: k }), el("dd", { text: v })]));
  }

  push.addEventListener("click", () => {
    if (u32(tail - head) === RING_CAP) return;
    seq += 1;
    data[tail & (RING_CAP - 1)] = `m${seq}`;
    tail = u32(tail + 1);
    render();
  });
  pop.addEventListener("click", () => {
    if (tail === head) return;
    head = u32(head + 1);
    render();
  });
  reset.addEventListener("click", () => { head = 4294967290; tail = head; seq = 0; render(); });

  root.append(el("div", { class: "w-rq" }, [
    el("div", { class: "rq-slots" }, slots),
    el("div", { class: "rq-tabs" }, [push, pop, reset]),
    stats,
  ]));
  render();
}

/* ---------- order-sim：内存序 ---------- */

const ORDER_CASES = [
  {
    label: "release + acquire",
    steps: [
      ["生产者", "写槽位：slot.data = 42", "data=42 还只在生产者这边", ""],
      ["生产者", "release 写：tail = 1", "release 保证：之前的写，不会排到这一步之后", ""],
      ["消费者", "acquire 读：tail 读到 1", "读到新 tail，就和那次 release 建立了先后关系", ""],
      ["消费者", "读槽位：slot.data", "一定读到 42", "ok"],
    ],
  },
  {
    label: "全部 relaxed",
    steps: [
      ["生产者", "写 tail = 1（被排到前面）", "relaxed 只保证这个变量本身原子，编译器和 CPU 可以调换顺序", ""],
      ["消费者", "读 tail 读到 1", "以为数据已经准备好了", ""],
      ["消费者", "读槽位：slot.data", "读到 0，是旧数据，并且 C 标准认定这是数据竞争", "bad"],
      ["生产者", "写槽位：slot.data = 42", "这次写来得太晚了", ""],
    ],
  },
];

function mountOrderSim(root) {
  let current = ORDER_CASES[0];
  let at = 0;
  const lanes = el("ol", { class: "rq-steps", "aria-live": "polite" });
  const next = el("button", { type: "button", class: "rq-btn is-primary", text: "下一步" });
  const again = el("button", { type: "button", class: "rq-btn", text: "重来" });

  function render() {
    lanes.replaceChildren(...current.steps.slice(0, at).map(([who, what, why, flag]) =>
      el("li", { class: `rq-step is-${who === "生产者" ? "p" : "c"}${flag ? ` is-${flag}` : ""}` }, [
        el("span", { class: "rq-who", text: who }),
        el("b", { text: what }),
        el("p", { text: why }),
      ])));
    next.disabled = at >= current.steps.length;
  }
  next.addEventListener("click", () => { at += 1; render(); });
  again.addEventListener("click", () => { at = 0; render(); });
  const tabs = tabButtons(ORDER_CASES.map((c) => c.label), (i) => { current = ORDER_CASES[i]; at = 1; render(); }, "选择内存序");
  root.append(el("div", { class: "w-rq" }, [tabs.bar, lanes, el("div", { class: "rq-tabs" }, [next, again])]));
  tabs.select(0);
  root.append(el("p", { class: "w-caption", text: "示意：第二种是允许发生的一种执行顺序，不是每次都会这样。" }));
}

/* ---------- wake-race：丢失唤醒 ---------- */

const WAKE_CASES = [
  {
    label: "先检查，再睡（没有比较）",
    verdict: "丢失唤醒：数据已经在队列里，消费者却要睡到超时",
    bad: true,
    events: [
      ["c", "读 tail，发现队列是空的", "决定睡觉，但还没进内核"],
      ["p", "写入消息，tail 加 1", ""],
      ["p", "调用 futex_wake", "现在没有人在等，这次唤醒没有效果"],
      ["c", "进入内核睡眠", "内核不检查任何值，直接睡下去"],
    ],
  },
  {
    label: "futex：内核比较后再睡",
    verdict: "安全：下标已变，FUTEX_WAIT 立刻返回 EAGAIN，消费者不会睡",
    bad: false,
    events: [
      ["c", "读 tail = 5，发现队列是空的", "决定睡觉，但还没进内核"],
      ["p", "写入消息，tail 变成 6", ""],
      ["p", "调用 futex_wake", "现在没有人在等，这次唤醒没有效果"],
      ["c", "FUTEX_WAIT(&tail, 5)", "内核发现 tail 是 6，不等于 5，直接返回"],
    ],
  },
  {
    label: "省掉唤醒，又没有 fence",
    verdict: "仍可能丢失：两边都读到旧值，下一次通知之前没有人叫醒它",
    bad: true,
    events: [
      ["c", "写 sleeping = 1", "这个写还在消费者的存储缓冲区里"],
      ["p", "写 tail = 6", "这个写也还在生产者的存储缓冲区里"],
      ["p", "读 sleeping，读到 0", "以为没人睡，跳过 futex_wake"],
      ["c", "读 tail，读到 5，进入 FUTEX_WAIT", "内核比较时如果 tail 的写还没生效，就会睡下去"],
    ],
  },
];

function mountWakeRace(root) {
  const list = el("ol", { class: "rq-steps", "aria-live": "polite" });
  const verdict = el("p", { class: "rq-verdict" });
  const tabs = tabButtons(WAKE_CASES.map((c) => c.label), (i) => {
    const c = WAKE_CASES[i];
    list.replaceChildren(...c.events.map(([who, what, why]) =>
      el("li", { class: `rq-step is-${who}` }, [
        el("span", { class: "rq-who", text: who === "p" ? "生产者" : "消费者" }),
        el("b", { text: what }),
        why ? el("p", { text: why }) : "",
      ])));
    verdict.textContent = c.verdict;
    verdict.classList.toggle("is-bad", c.bad);
  }, "选择写法");
  root.append(el("div", { class: "w-rq" }, [tabs.bar, list, verdict]));
  tabs.select(0);
}

/* ---------- bench-bars：实测柱状图，数据来自表格 ---------- */

function mountBenchBars(root, ctx) {
  const { head, rows } = readTable(ctx, "bench-bars");
  const metricIdx = head.map((h, i) => (i > 0 && !/范围/.test(h) ? i : -1)).filter((i) => i > 0);
  const log = ctx.props.scale === "log";
  const chart = el("div", { class: "rq-bars" });
  const unit = ctx.props.unit || "";
  const lines = rows.map((r) => {
    const fill = el("span", { class: "rq-bar" });
    const value = el("b", {});
    const row = el("div", { class: "rq-line" }, [
      el("span", { class: "rq-line-name", text: r[0] }),
      el("span", { class: "rq-track" }, [fill]),
      value,
    ]);
    chart.append(row);
    return { fill, value, r };
  });

  function show(col) {
    const values = rows.map((r) => {
      const v = Number(r[col].replace(/,/g, ""));
      if (!Number.isFinite(v)) throw new Error(`bench-bars：「${r[col]}」不是数字`);
      return v;
    });
    const max = Math.max(...values);
    const min = Math.min(...values);
    lines.forEach((line, i) => {
      const ratio = log ? (Math.log10(values[i]) - Math.log10(min) + 0.3) / (Math.log10(max) - Math.log10(min) + 0.3) : values[i] / max;
      line.fill.style.transform = `scaleX(${ratio})`;
      line.fill.classList.toggle("is-best", ctx.props.best === "low" ? values[i] === min : values[i] === max);
      line.value.textContent = `${line.r[col]}${unit ? ` ${unit}` : ""}`;
    });
  }

  const parts = [];
  if (metricIdx.length > 1) {
    const tabs = tabButtons(metricIdx.map((i) => head[i]), (k) => show(metricIdx[k]), "选择指标");
    parts.push(tabs.bar);
    parts.push(chart);
    root.append(el("div", { class: "w-rq" }, parts));
    tabs.select(0);
  } else {
    root.append(el("div", { class: "w-rq" }, [chart]));
    show(metricIdx[0]);
  }
  if (log) root.append(el("p", { class: "w-caption", text: "柱长按对数比例绘制，否则最短的柱子会看不见。具体数值以右侧数字为准。" }));
}

/* ---------- 首屏：两个指针绕环追逐 ---------- */

function mountRingOrbit(figure) {
  const narrow = figure.clientWidth < 560;
  const w = narrow ? 420 : 1000;
  const h = narrow ? 420 : 380;
  const cx = w / 2;
  const cy = h / 2 + (narrow ? 0 : 4);
  const r = narrow ? 138 : 132;
  const N = 16;
  const root = svg("svg", { viewBox: `0 0 ${w} ${h}`, class: "rqh-svg", role: "img",
    "aria-label": "16 个槽位围成一个环，生产者的 tail 在前面写，消费者的 head 在后面追" });
  const cells = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const c = svg("circle", { cx: cx + Math.cos(a) * r, cy: cy + Math.sin(a) * r, r: narrow ? 17 : 18, class: "rqh-cell" }, root);
    cells.push(c);
  }
  const center = svg("text", { x: cx, y: cy - 6, "text-anchor": "middle", class: "rqh-center", "font-size": 18 }, root);
  center.textContent = "tail - head";
  const count = svg("text", { x: cx, y: cy + 26, "text-anchor": "middle", class: "rqh-count", "font-size": 30 }, root);
  figure.append(root, el("figcaption", { class: "viewer-cap" }, [
    el("span", { text: "绿色是待读的消息：生产者只写 tail，消费者只写 head" }),
  ]));
  let head = 0;
  let tail = 5;
  function render() {
    cells.forEach((c, i) => c.classList.toggle("is-used", ((i - head + N * 64) % N) < tail - head));
    count.textContent = String(tail - head);
  }
  render();
  if (reduceMotion) return;
  let beat = 0;
  whileVisible(figure, () => {
    beat += 1;
    // 用确定的节奏模拟：写得快时积压变多，读得快时积压变少
    const burst = Math.sin(beat / 6) > 0;
    if (tail - head < N && (burst || beat % 3 === 0)) tail += 1;
    if (tail - head > 0 && (!burst || beat % 3 === 0)) head += 1;
    if (head >= N * 64) { head -= N * 64; tail -= N * 64; }
    render();
  }, 240);
}

export const widgets = {
  "ring-sim": mountRingSim,
  "order-sim": mountOrderSim,
  "wake-race": mountWakeRace,
  "bench-bars": mountBenchBars,
};
export const heroes = { "ring-orbit": mountRingOrbit };
