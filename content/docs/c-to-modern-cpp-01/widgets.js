// 本文专属组件：capture-lab / move-lab / owner-graph
// 首屏：move-hero
// 组件里的结果、地址变化和析构顺序都来自正文 code/ 目录的实测输出；地址只画相对关系。

import { el, svg, whileVisible, reduceMotion } from "/stage/lib/dom.js";

/* ---------- 公共 ---------- */

function readTable(ctx, name, minRows) {
  const table = ctx.fallback?.querySelector("table");
  if (!table) throw new Error(`${name}：降级内容里需要一张表格`);
  const rows = [...table.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((n) => n.textContent.trim()));
  if (rows.length < minRows) throw new Error(`${name}：表格至少需要 ${minRows} 行数据`);
  return rows;
}

function toggleGroup(labels, onPick, ariaLabel) {
  const bar = el("div", { class: "cm-tabs", role: "group", "aria-label": ariaLabel });
  const buttons = labels.map((label, i) => {
    const b = el("button", { type: "button", class: "cm-btn", text: label });
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

function button(text, primary = false) {
  return el("button", { type: "button", class: primary ? "cm-btn is-primary" : "cm-btn", text });
}

/* ---------- 首屏 move-hero：拷贝要再申请一块，移动只是把指针交出去 ---------- */

function mountMoveHero(figure) {
  const root = svg("svg", { viewBox: "0 0 1000 380", role: "img",
    "aria-label": "左边是拷贝：两个对象各指向一块堆内存；右边是移动：指针从 a 交给 c，a 变成 nullptr" });
  root.classList.add("mh-svg");
  figure.append(root, el("figcaption", { class: "viewer-cap" }, [
    el("span", {}, [el("i", { class: "k-obj" }), "对象（栈上）"]),
    el("span", {}, [el("i", { class: "k-heap" }), "堆上的缓冲区"]),
    el("span", { text: "左 COPY · 右 MOVE" }),
  ]));

  const label = (x, y, text, cls = "mh-label") => { const t = svg("text", { x, y, class: cls, "text-anchor": "middle" }, root); t.textContent = text; return t; };
  const box = (x, y, w, h, cls) => svg("rect", { x, y, width: w, height: h, rx: 4, class: cls }, root);

  // 左：拷贝
  label(250, 40, "Buffer b = a;", "mh-code");
  box(110, 80, 120, 56, "mh-obj"); label(170, 114, "a");
  box(270, 80, 120, 56, "mh-obj"); label(330, 114, "b");
  box(110, 250, 120, 50, "mh-heap"); label(170, 280, "\"hello\"", "mh-mono");
  const copyBlock = box(270, 250, 120, 50, "mh-heap mh-fade"); label(330, 280, "\"hello\"", "mh-mono mh-fade-t");
  svg("line", { x1: 170, y1: 136, x2: 170, y2: 250, class: "mh-ptr" }, root);
  const copyLine = svg("line", { x1: 330, y1: 136, x2: 330, y2: 250, class: "mh-ptr mh-fade" }, root);
  label(250, 340, "再申请一块，复制内容", "mh-note");

  // 右：移动
  label(750, 40, "Buffer c = std::move(a);", "mh-code");
  box(610, 80, 120, 56, "mh-obj"); label(670, 114, "a");
  box(770, 80, 120, 56, "mh-obj"); label(830, 114, "c");
  box(610, 250, 120, 50, "mh-heap"); label(670, 280, "\"hello\"", "mh-mono");
  const oldLine = svg("line", { x1: 670, y1: 136, x2: 670, y2: 250, class: "mh-ptr" }, root);
  const newLine = svg("line", { x1: 830, y1: 136, x2: 690, y2: 250, class: "mh-ptr mh-mark" }, root);
  const nullTag = label(670, 160, "nullptr", "mh-null");
  label(750, 340, "同一块内存，只交出指针", "mh-note");

  function show(done) {
    [copyBlock, copyLine].forEach((n) => n.classList.toggle("is-on", done));
    root.querySelectorAll(".mh-fade-t").forEach((n) => n.classList.toggle("is-on", done));
    oldLine.classList.toggle("is-off", done);
    newLine.classList.toggle("is-on", done);
    nullTag.classList.toggle("is-on", done);
  }
  if (reduceMotion) { show(true); return; }
  let done = false;
  show(false);
  whileVisible(figure, () => { done = !done; show(done); }, 1800);
}

/* ---------- capture-lab：值捕获 vs 引用捕获 ---------- */

const CAPTURE_STEPS = ["创建 lambda", "value = 100", "调用 lambda"];

function mountCaptureLab(root, ctx) {
  const rows = readTable(ctx, "capture-lab", 2);   // 捕获写法 | 结构体成员 | 调用结果
  let mode = 0;
  let step = 0;

  const code = el("pre", { class: "cm-code" });
  const outer = el("div", { class: "cl-box" });
  const closure = el("div", { class: "cl-box is-closure" });
  const link = el("div", { class: "cl-link", "aria-hidden": "true" });
  const result = el("p", { class: "cl-result", "aria-live": "polite" });
  const stepper = el("ol", { class: "cl-steps" }, CAPTURE_STEPS.map((s) => el("li", { text: s })));
  const next = button("下一步", true);
  const reset = button("重来");
  const modes = toggleGroup(rows.map((r) => r[0]), (i) => { mode = i; step = 0; render(); }, "捕获方式");

  function render() {
    const byRef = rows[mode][0].includes("&");
    const outerValue = step >= 2 ? 100 : 1;
    code.textContent = `int value = 1;\nauto f = ${rows[mode][0]} { return value; };\nvalue = 100;\nint got = f();`;
    outer.replaceChildren(el("span", { class: "cl-tag", text: "main 的栈" }), el("code", { text: `int value = ${outerValue}` }));
    if (step === 0) {
      closure.replaceChildren(el("span", { class: "cl-tag", text: "闭包对象" }), el("em", { text: "还没创建" }));
    } else {
      closure.replaceChildren(el("span", { class: "cl-tag", text: "闭包对象（编译器生成的结构体）" }),
        el("code", { text: byRef ? `int& value  → 指向 main 的 value` : `int value = 1   （创建时拷贝）` }));
    }
    link.textContent = step === 0 ? "" : byRef ? "引用：读的是同一个变量" : "拷贝：之后互不影响";
    link.classList.toggle("is-ref", step > 0 && byRef);
    result.textContent = step === 3 ? `f() 返回 ${rows[mode][2]}。${rows[mode][1]}` : "按「下一步」走一遍。";
    stepper.querySelectorAll("li").forEach((li, i) => li.classList.toggle("is-done", i < step));
    next.disabled = step >= 3;
  }
  next.addEventListener("click", () => { step = Math.min(3, step + 1); render(); });
  reset.addEventListener("click", () => { step = 0; render(); });

  root.append(
    el("div", { class: "cm-bar" }, [modes.bar, el("div", { class: "cm-acts" }, [next, reset])]),
    el("div", { class: "cl-grid" }, [code, el("div", { class: "cl-mem" }, [outer, link, closure]), stepper]),
    result,
  );
  modes.select(0);
}

/* ---------- move-lab：拷贝构造 vs 移动构造 ---------- */

function mountMoveLab(root, ctx) {
  const rows = readTable(ctx, "move-lab", 2);   // 操作 | 源对象之后 | 新对象 | 析构时
  const W = 560, H = 270;
  const pic = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", class: "ml-svg" });
  const desc = el("p", { class: "cl-result", "aria-live": "polite" });
  let mode = 0;
  let destroyed = false;

  const mk = (tag, attrs) => svg(tag, attrs, pic);
  const text = (x, y, t, cls) => { const n = mk("text", { x, y, "text-anchor": "middle", class: cls }); n.textContent = t; return n; };
  const srcBox = mk("rect", { x: 70, y: 30, width: 130, height: 54, rx: 4, class: "mh-obj" });
  const srcName = text(135, 63, "a", "mh-label");
  const dstBox = mk("rect", { x: 360, y: 30, width: 130, height: 54, rx: 4, class: "mh-obj" });
  const dstName = text(425, 63, "b", "mh-label");
  const heap1 = mk("rect", { x: 70, y: 190, width: 130, height: 48, rx: 4, class: "mh-heap" });
  const heap1t = text(135, 219, "块 1：\"hello\"", "mh-mono");
  const heap2 = mk("rect", { x: 360, y: 190, width: 130, height: 48, rx: 4, class: "mh-heap" });
  const heap2t = text(425, 219, "块 2：\"hello\"", "mh-mono");
  const srcLine = mk("line", { x1: 135, y1: 84, x2: 135, y2: 190, class: "mh-ptr" });
  const dstLine = mk("line", { x1: 425, y1: 84, x2: 425, y2: 190, class: "mh-ptr" });
  const stealLine = mk("line", { x1: 425, y1: 84, x2: 160, y2: 190, class: "mh-ptr mh-mark" });
  const nullTag = text(135, 108, "nullptr", "mh-null");
  [srcBox, dstBox].forEach((n) => n.setAttribute("aria-hidden", "true"));

  const modes = toggleGroup(rows.map((r) => r[0]), (i) => { mode = i; destroyed = false; render(); }, "构造方式");
  const kill = button("离开作用域：析构", true);
  kill.addEventListener("click", () => { destroyed = true; render(); });

  function render() {
    const isMove = mode === 1;
    dstName.textContent = isMove ? "c" : "b";
    pic.setAttribute("aria-label", isMove
      ? "移动：c 指向块 1，a 变成 nullptr，只有一块堆内存"
      : "拷贝：a 指向块 1，b 指向新申请的块 2");
    const lineOn = destroyed ? "0.15" : "1";   // 析构后指针一起淡出
    srcLine.style.opacity = isMove ? "0" : lineOn;
    dstLine.style.opacity = isMove ? "0" : lineOn;
    stealLine.style.opacity = isMove ? lineOn : "0";
    nullTag.style.opacity = isMove ? "1" : "0";
    heap2.style.opacity = isMove ? "0" : "1";
    heap2t.style.opacity = isMove ? "0" : "1";
    [heap1, heap1t, heap2, heap2t].forEach((n) => n.classList.toggle("is-freed", destroyed));
    [srcBox, dstBox, srcName, dstName].forEach((n) => n.classList.toggle("is-gone", destroyed));
    const row = rows[mode];
    desc.textContent = destroyed ? `析构：${row[3]}` : `${row[0]}：源对象之后 ${row[1]}；新对象 ${row[2]}。`;
    kill.disabled = destroyed;
  }

  root.append(el("div", { class: "cm-bar" }, [modes.bar, el("div", { class: "cm-acts" }, [kill])]), pic, desc);
  modes.select(0);
}

/* ---------- owner-graph：强引用环 vs 弱引用 ---------- */

function mountOwnerGraph(root, ctx) {
  const rows = readTable(ctx, "owner-graph", 2);   // b→a 的边 | 离开作用域前计数 | 离开作用域后
  const W = 560, H = 250;
  const pic = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", class: "og-svg" });
  const desc = el("p", { class: "cl-result", "aria-live": "polite" });
  const mk = (tag, attrs) => svg(tag, attrs, pic);
  const text = (x, y, t, cls) => { const n = mk("text", { x, y, "text-anchor": "middle", class: cls }); n.textContent = t; return n; };
  const uidArrow = `og-arrow-${Math.random().toString(36).slice(2, 8)}`;
  const defs = mk("defs", {});
  const marker = svg("marker", { id: uidArrow, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
  svg("path", { d: "M0,0 L10,5 L0,10 z", class: "og-head" }, marker);

  const stackA = mk("rect", { x: 60, y: 18, width: 120, height: 34, rx: 4, class: "og-stack" });
  const stackAt = text(120, 40, "局部变量 a", "og-small");
  const stackB = mk("rect", { x: 380, y: 18, width: 120, height: 34, rx: 4, class: "og-stack" });
  const stackBt = text(440, 40, "局部变量 b", "og-small");
  const holdA = mk("line", { x1: 120, y1: 52, x2: 120, y2: 112, class: "og-edge", "marker-end": `url(#${uidArrow})` });
  const holdB = mk("line", { x1: 440, y1: 52, x2: 440, y2: 112, class: "og-edge", "marker-end": `url(#${uidArrow})` });
  const nodeA = mk("circle", { cx: 120, cy: 150, r: 36, class: "og-node" });
  const nodeAt = text(120, 156, "A", "mh-label");
  const nodeB = mk("circle", { cx: 440, cy: 150, r: 36, class: "og-node" });
  const nodeBt = text(440, 156, "B", "mh-label");
  mk("path", { d: "M156,138 Q280,96 404,138", class: "og-edge", "marker-end": `url(#${uidArrow})` });
  text(280, 104, "a->next：shared_ptr", "og-small");
  const back = mk("path", { d: "M404,166 Q280,208 156,166", class: "og-edge", "marker-end": `url(#${uidArrow})` });
  const backLabel = text(280, 214, "", "og-small");
  const countA = text(120, 206, "", "og-count");
  const countB = text(440, 206, "", "og-count");

  let weak = 0;
  let left = false;
  const modes = toggleGroup(rows.map((r) => r[0]), (i) => { weak = i; left = false; render(); }, "b->prev 用哪种指针");
  const go = button("离开作用域", true);
  go.addEventListener("click", () => { left = true; render(); });

  function render() {
    const isWeak = weak === 1;
    back.classList.toggle("is-weak", isWeak);
    backLabel.textContent = isWeak ? "b->prev：weak_ptr（不计数）" : "b->prev：shared_ptr";
    let a = 1 + (isWeak ? 0 : 1);   // 局部变量 a + 来自 b 的强引用
    let b = 2;                      // 局部变量 b + a->next
    let freed = false;
    if (left) {
      a -= 1; b -= 1;               // 两个局部变量销毁
      if (a === 0) { b -= 1; freed = true; }   // A 析构时释放 a->next
    }
    [stackA, stackAt, stackB, stackBt, holdA, holdB].forEach((n) => n.classList.toggle("is-gone", left));
    [nodeA, nodeAt, nodeB, nodeBt].forEach((n) => n.classList.toggle("is-freed", left && freed));
    [nodeA, nodeB].forEach((n) => n.classList.toggle("is-leak", left && !freed));
    countA.textContent = left && freed ? "已析构" : `强引用 ${a}`;
    countB.textContent = left && freed ? "已析构" : `强引用 ${b}`;
    pic.setAttribute("aria-label", `A 的强引用 ${a}，B 的强引用 ${b}${left ? (freed ? "，两个都已析构" : "，谁也到不了 0，泄漏") : ""}`);
    const row = rows[weak];
    desc.textContent = left ? `离开作用域后：${row[2]}` : `离开作用域前：${row[1]}`;
    go.disabled = left;
  }

  root.append(el("div", { class: "cm-bar" }, [modes.bar, el("div", { class: "cm-acts" }, [go])]), pic, desc);
  modes.select(0);
}

export const widgets = { "capture-lab": mountCaptureLab, "move-lab": mountMoveLab, "owner-graph": mountOwnerGraph };
export const heroes = { "move-hero": mountMoveHero };
