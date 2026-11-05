// 本文专属组件：change-ripple / arch-dims / pattern-map / decorator-chain / pattern-diff / pattern-quiz
// 首屏：pattern-field

import { el, svg, whileVisible, reduceMotion } from "/stage/lib/dom.js";

/* ---------- 公共 ---------- */

function readRows(ctx, name) {
  const table = ctx.fallback?.querySelector("table");
  if (!table) throw new Error(`${name}：降级内容里需要一张表格`);
  const head = [...table.querySelectorAll("thead th")].map((n) => n.textContent.trim());
  const rows = [...table.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((n) => n.textContent.trim()));
  if (!rows.length) throw new Error(`${name}：表格没有数据行`);
  return { head, rows };
}

function tabButtons(labels, onPick, ariaLabel) {
  const bar = el("div", { class: "ap-tabs", role: "group", "aria-label": ariaLabel });
  const buttons = labels.map((label, i) => {
    const b = el("button", { type: "button", class: "ap-btn", text: label });
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

/* ---------- change-ripple：一个变化穿透多少模块 ---------- */

const RIPPLE_MODULES = ["主流程", "连接管理", "设备管理", "数据上报", "日志恢复", "平台适配层"];

function mountChangeRipple(root, ctx) {
  const { head, rows } = readRows(ctx, "change-ripple");
  if (head.length !== 4) throw new Error("change-ripple：表格需要 4 列");
  const hits = rows.map((r) => r.slice(1).map((cell) => cell.split("、").map((s) => s.trim())));
  let arch = 0;
  let change = 0;
  const grid = el("div", { class: "ap-mods" });
  const cells = RIPPLE_MODULES.map((name) => {
    const n = el("div", { class: "ap-mod", text: name });
    grid.append(n);
    return n;
  });
  const count = el("p", { class: "ap-count", "aria-live": "polite" });

  function render() {
    const touched = hits[change][arch];
    cells.forEach((n, i) => n.classList.toggle("is-hit", touched.includes(RIPPLE_MODULES[i])));
    count.replaceChildren(
      el("b", { text: String(touched.length) }),
      el("span", { text: ` 个模块要改：${touched.join("、")}` }),
    );
  }

  const archTabs = tabButtons(head.slice(1), (i) => { arch = i; render(); }, "选择架构");
  const changeTabs = tabButtons(rows.map((r) => r[0]), (i) => { change = i; render(); }, "选择变化");
  root.append(el("div", { class: "w-ap" }, [
    el("p", { class: "ap-label", text: "架构" }), archTabs.bar,
    el("p", { class: "ap-label", text: "变化" }), changeTabs.bar,
    grid, count,
  ]));
  archTabs.select(0);
  changeTabs.select(0);
  root.append(el("p", { class: "w-caption", text: "示意：模块划分和影响范围为图解。" }));
}

/* ---------- arch-dims：场景与维度权重 ---------- */

const LEVEL = { 低: 1, 中: 2, 高: 3 };

function mountArchDims(root, ctx) {
  const { head, rows } = readRows(ctx, "arch-dims");
  const dims = head.slice(1, -1);
  const lines = dims.map((name) => {
    const fill = el("span", { class: "ap-fill" });
    const value = el("b", {});
    const row = el("div", { class: "ap-dim" }, [
      el("span", { class: "ap-dim-name", text: name }),
      el("span", { class: "ap-track" }, [fill]),
      value,
    ]);
    return { row, fill, value };
  });
  const why = el("p", { class: "ap-why", "aria-live": "polite" });
  const tabs = tabButtons(rows.map((r) => r[0]), (i) => {
    const r = rows[i];
    lines.forEach((line, k) => {
      const text = r[k + 1];
      const level = LEVEL[text];
      if (!level) throw new Error(`arch-dims：不认识的权重「${text}」`);
      line.fill.style.transform = `scaleX(${level / 3})`;
      line.fill.classList.toggle("is-high", level === 3);
      line.value.textContent = text;
    });
    why.textContent = r[r.length - 1];
  }, "选择场景");
  root.append(el("div", { class: "w-ap" }, [
    tabs.bar,
    el("div", { class: "ap-dims" }, lines.map((l) => l.row)),
    why,
  ]));
  tabs.select(0);
}

/* ---------- pattern-map：23 种模式速查 ---------- */

function mountPatternMap(root, ctx) {
  const { rows } = readRows(ctx, "pattern-map");
  if (rows.length !== 23) throw new Error(`pattern-map：应该有 23 行，实际 ${rows.length}`);
  const name = el("h4", { class: "ap-d-name" });
  const kind = el("span", { class: "ap-d-kind" });
  const vary = el("p", { class: "ap-d-text" });
  const line = el("p", { class: "ap-d-text" });
  const skip = el("p", { class: "ap-d-text" });
  const detail = el("div", { class: "ap-detail", "aria-live": "polite" }, [kind, name, vary, line, skip]);
  const buttons = [];

  function pick(i) {
    const [k, n, v, l, s] = rows[i];
    buttons.forEach((b, x) => b.setAttribute("aria-pressed", String(x === i)));
    kind.textContent = k;
    name.textContent = n;
    vary.replaceChildren(el("b", { text: "隔离的变化：" }), v);
    line.replaceChildren(el("b", { text: "做法：" }), l);
    skip.replaceChildren(el("b", { text: "不用的时候：" }), s);
  }

  const groups = ["创建型", "结构型", "行为型"].map((group) => {
    const box = el("div", { class: "ap-group" });
    rows.forEach((r, i) => {
      if (r[0] !== group) return;
      const b = el("button", { type: "button", class: "ap-tile", text: r[1] });
      b.addEventListener("click", () => pick(i));
      buttons[i] = b;
      box.append(b);
    });
    return el("div", { class: "ap-col" }, [el("p", { class: "ap-label", text: group }), box]);
  });
  root.append(el("div", { class: "w-ap" }, [el("div", { class: "ap-cols" }, groups), detail]));
  pick(0);
}

/* ---------- decorator-chain：叠加层 ---------- */

const checksum = (s) => [...s].reduce((sum, c) => (sum + c.charCodeAt(0)) % 256, 0).toString(16).padStart(2, "0");
const LAYERS = [
  { id: "seq", label: "加序号", code: "with_seq", run: (m) => `#1 ${m}` },
  { id: "crc", label: "加校验", code: "with_sum", run: (m) => `${m} *${checksum(m)}` },
  { id: "upper", label: "转大写", code: "with_upper", run: (m) => m.toUpperCase() },
];

function mountDecoratorChain(root) {
  let stack = [];
  const buttons = LAYERS.map((layer) => {
    const b = el("button", { type: "button", class: "ap-btn", text: layer.label, "aria-pressed": "false" });
    b.addEventListener("click", () => {
      stack = stack.includes(layer) ? stack.filter((x) => x !== layer) : [...stack, layer];
      render();
    });
    return b;
  });
  const reverse = el("button", { type: "button", class: "ap-btn", text: "调换顺序" });
  reverse.addEventListener("click", () => { stack = [...stack].reverse(); render(); });
  const flow = el("ol", { class: "ap-flow", "aria-live": "polite" });

  function render() {
    buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(stack.includes(LAYERS[i]))));
    reverse.disabled = stack.length < 2;
    let msg = "link up";
    const steps = [el("li", {}, [el("span", { text: "原始消息" }), el("code", { text: msg })])];
    stack.forEach((layer) => {
      msg = layer.run(msg);
      steps.push(el("li", {}, [el("span", { text: layer.code }), el("code", { text: msg })]));
    });
    steps.push(el("li", { class: "is-end" }, [el("span", { text: "to_console 写出" }), el("code", { text: msg })]));
    flow.replaceChildren(...steps);
  }

  root.append(el("div", { class: "w-ap" }, [
    el("div", { class: "ap-tabs", role: "group", "aria-label": "选择要叠加的层" }, [...buttons, reverse]),
    flow,
  ]));
  stack = [LAYERS[0]];
  render();
}

/* ---------- pattern-diff：易混对比 ---------- */

function mountPatternDiff(root, ctx) {
  const titles = [...ctx.fallback.querySelectorAll("p > strong")].map((n) => n.textContent.trim());
  const tables = [...ctx.fallback.querySelectorAll("table")];
  if (!tables.length || titles.length !== tables.length) throw new Error("pattern-diff：每张表前面要有一个加粗标题");
  const stage = el("div", { class: "ap-difftable" });
  const tabs = tabButtons(titles, (i) => stage.replaceChildren(tables[i].cloneNode(true)), "选择一组相似的模式");
  root.append(el("div", { class: "w-ap" }, [tabs.bar, stage]));
  tabs.select(0);
}

/* ---------- pattern-quiz：看场景选模式 ---------- */

// 用行号做种子，选项顺序稳定，同一题每次看到的一样
function optionsFor(rows, i, all) {
  const answer = rows[i][1];
  const others = all.filter((n) => n !== answer);
  const picked = [0, 1, 2].map((k) => others[(i * 7 + k * 5 + 3) % others.length]);
  const unique = [...new Set(picked)];
  for (const n of others) { if (unique.length >= 3) break; if (!unique.includes(n)) unique.push(n); }
  const options = [...unique];
  options.splice(i % 4, 0, answer);
  return options;
}

function mountPatternQuiz(root, ctx) {
  const { rows } = readRows(ctx, "pattern-quiz");
  const all = [...new Set(rows.map((r) => r[1]))];
  if (all.length < 4) throw new Error("pattern-quiz：至少需要 4 种不同的答案");
  let at = 0;
  let right = 0;
  let answered = false;
  const progress = el("p", { class: "ap-label" });
  const scene = el("p", { class: "ap-scene" });
  const options = el("div", { class: "ap-options" });
  const result = el("p", { class: "ap-result", "aria-live": "polite" });
  const next = el("button", { type: "button", class: "ap-btn is-primary", text: "下一题" });

  function render() {
    answered = false;
    const row = rows[at];
    progress.textContent = `第 ${at + 1} / ${rows.length} 题 · 答对 ${right}`;
    scene.textContent = row[0];
    result.textContent = "";
    next.hidden = true;
    options.replaceChildren(...optionsFor(rows, at, all).map((name) => {
      const b = el("button", { type: "button", class: "ap-btn ap-opt", text: name });
      b.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const ok = name === row[1];
        if (ok) right += 1;
        [...options.children].forEach((o) => {
          o.disabled = true;
          if (o.textContent === row[1]) o.classList.add("is-right");
        });
        if (!ok) b.classList.add("is-wrong");
        progress.textContent = `第 ${at + 1} / ${rows.length} 题 · 答对 ${right}`;
        result.textContent = `${ok ? "答对了" : `答案是${row[1]}`}：${row[2]}`;
        next.textContent = at + 1 === rows.length ? "再来一遍" : "下一题";
        next.hidden = false;
      });
      return b;
    }));
  }

  next.addEventListener("click", () => {
    at += 1;
    if (at === rows.length) { at = 0; right = 0; }
    render();
  });
  root.append(el("div", { class: "w-ap" }, [progress, scene, options, result, next]));
  render();
}

/* ---------- 首屏：23 个格子，变化只点亮隔离它的那一块 ---------- */

const FIELD = [
  ["创建型", ["工厂方法", "抽象工厂", "建造者", "原型", "单例"]],
  ["结构型", ["适配器", "桥接", "组合", "装饰器", "外观", "享元", "代理"]],
  ["行为型", ["责任链", "命令", "解释器", "迭代器", "中介者", "备忘录", "观察者", "状态", "策略", "模板方法", "访问者"]],
];

function mountPatternField(figure) {
  const narrow = figure.clientWidth < 560;
  const g = narrow
    ? { w: 420, h: 520, cols: [3, 3, 4], tw: 92, th: 34, gap: 8, x0: 18, font: 12, titleFont: 13 }
    : { w: 1000, h: 380, cols: [5, 7, 11], tw: 78, th: 40, gap: 8, x0: 30, font: 11, titleFont: 14 };
  const root = svg("svg", { viewBox: `0 0 ${g.w} ${g.h}`, class: "aph-svg", role: "img",
    "aria-label": "23 种设计模式分成创建型、结构型、行为型三组，依次点亮" });
  const tiles = [];
  let y = narrow ? 30 : 46;
  FIELD.forEach(([title, names], gi) => {
    const label = svg("text", { x: g.x0, y, class: "aph-title", "font-size": g.titleFont }, root);
    label.textContent = `${title} · ${names.length}`;
    y += 14;
    const perRow = g.cols[gi];
    names.forEach((name, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const tile = svg("g", { class: "aph-tile" }, root);
      tile.setAttribute("transform", `translate(${g.x0 + col * (g.tw + g.gap)} ${y + row * (g.th + g.gap)})`);
      svg("rect", { width: g.tw, height: g.th, rx: 2 }, tile);
      const t = svg("text", { x: g.tw / 2, y: g.th / 2 + 4, "text-anchor": "middle", "font-size": g.font }, tile);
      t.textContent = name;
      tiles.push(tile);
    });
    y += Math.ceil(names.length / perRow) * (g.th + g.gap) + (narrow ? 24 : 34);
  });
  figure.append(root, el("figcaption", { class: "viewer-cap" }, [
    el("span", { text: "每一种模式，都在隔离某一类变化" }),
  ]));
  if (reduceMotion) { tiles.forEach((t) => t.classList.add("is-on")); return; }
  let at = 0;
  whileVisible(figure, () => {
    tiles.forEach((t, i) => t.classList.toggle("is-on", i === at));
    at = (at + 1) % tiles.length;
  }, 420);
}

export const widgets = {
  "change-ripple": mountChangeRipple,
  "arch-dims": mountArchDims,
  "pattern-map": mountPatternMap,
  "decorator-chain": mountDecoratorChain,
  "pattern-diff": mountPatternDiff,
  "pattern-quiz": mountPatternQuiz,
};
export const heroes = { "pattern-field": mountPatternField };
