// var-placer：点一个声明，它落进所在的段；切换视角（ELF / Linux 进程 / 单片机）时，已放好的变量重新归位。
// 数据全部来自降级内容的表格：| 声明 | ELF 段 | Linux 进程 | 单片机 | 说明 |。

import { el, onceVisible, reduceMotion } from "/stage/lib/dom.js";

/** 每个视角的区域，从高地址画到低地址；key 与表格单元格的开头匹配。 */
const VIEWS = {
  elf: {
    label: "ELF 文件", col: 1,
    regions: [
      { key: "不在文件里", sub: "栈和堆运行时才出现" },
      { key: ".bss", sub: "只记大小，不占文件空间" },
      { key: ".data", sub: "存着初值，可写" },
      { key: ".data.rel.ro", sub: "加载时重定位，之后只读" },
      { key: ".rodata", sub: "只读" },
      { key: ".text", sub: "只读可执行" },
    ],
  },
  linux: {
    label: "Linux 进程", col: 2,
    regions: [
      { key: "[stack]", sub: "向低地址长，默认上限 8 MB" },
      { key: "[heap]", sub: "brk 堆，向高地址长" },
      { key: "rw-p 数据段", sub: ".data + .bss（超出文件页的部分是匿名零页）" },
      { key: "r--p RELRO", sub: ".data.rel.ro / .got" },
      { key: "r--p 只读数据", sub: ".rodata" },
      { key: "r-xp 代码段", sub: ".text" },
    ],
  },
  mcu: {
    label: "单片机", col: 3,
    regions: [
      { key: "RAM 栈", sub: "主栈 / RTOS 任务栈", mem: "ram" },
      { key: "RAM 堆", sub: "_sbrk 堆或 FreeRTOS ucHeap", mem: "ram" },
      { key: "RAM .bss", sub: "上电后由启动代码清零", mem: "ram" },
      { key: "Flash→RAM", sub: "Flash 存初值、RAM 存运行值：两份都占", mem: "both" },
      { key: "Flash", sub: "只读，直接从 Flash 执行 / 读取", mem: "flash" },
    ],
  },
};

/** 从降级内容的第一张表里读出行。 */
function readRows(fallback) {
  const rows = [...(fallback?.querySelectorAll("table tbody tr") || [])].map((tr) =>
    [...tr.children].map((td) => td.textContent.replace(/\s+/g, " ").trim()));
  if (rows.length < 3 || rows.some((r) => r.length < 5)) {
    throw new Error("var-placer：降级内容需要一张 5 列表格：声明 | ELF 段 | Linux 进程 | 单片机 | 说明");
  }
  return rows.map(([decl, elf, linux, mcu, note], i) => ({ id: i, decl, cells: [decl, elf, linux, mcu], note }));
}

/** 单元格文字 → 区域下标；按 key 长度从长到短匹配，避免 .data 吞掉 .data.rel.ro。 */
function regionIndex(view, cell, decl) {
  const order = view.regions.map((r, i) => [r.key, i]).sort((a, b) => b[0].length - a[0].length);
  const hit = order.find(([key]) => cell.startsWith(key));
  if (!hit) throw new Error(`var-placer：「${decl}」的「${cell}」不属于 ${view.label} 视角的任何区域`);
  return hit[1];
}

export function mountVarPlacer(root, ctx) {
  const rows = readRows(ctx.fallback);
  Object.values(VIEWS).forEach((v) => rows.forEach((r) => regionIndex(v, r.cells[v.col], r.decl)));   // 先校验，出错就 OFFLINE
  root.classList.add("w-vp");
  if (root.clientWidth < 620) root.classList.add("is-narrow");

  let view = "elf";
  const placed = new Set();
  const viewBtns = Object.entries(VIEWS).map(([k, v]) =>
    el("button", { type: "button", class: "vp-view", "aria-pressed": String(k === view), "data-k": k, text: v.label }));
  const allBtn = el("button", { type: "button", class: "vp-act is-primary", text: "全部放入" });
  const clearBtn = el("button", { type: "button", class: "vp-act", text: "清空" });
  const declBtns = rows.map((r) =>
    el("button", { type: "button", class: "vp-decl", "aria-pressed": "false", "data-id": r.id }, [el("code", { text: r.decl })]));
  const stack = el("div", { class: "vp-stack" });
  const note = el("p", { class: "vp-note", "aria-live": "polite", text: "点左边的声明，看它落在哪里。" });
  const tally = el("p", { class: "vp-tally" });

  function renderRegions() {
    const v = VIEWS[view];
    stack.replaceChildren(...v.regions.map((r, i) => el("div", { class: `vp-reg${r.mem ? ` m-${r.mem}` : ""}`, "data-i": i }, [
      el("div", { class: "vp-reg-h" }, [el("b", { text: r.key }), el("span", { text: r.sub })]),
      el("div", { class: "vp-chips" }),
    ])));
    for (const r of rows) if (placed.has(r.id)) addChip(r, false);
    renderTally();
  }

  function addChip(r, animate) {
    const v = VIEWS[view];
    const reg = stack.children[regionIndex(v, r.cells[v.col], r.decl)];
    const chip = el("code", { class: `vp-chip${animate && !reduceMotion ? " is-new" : ""}`, text: r.decl.replace(/（.*?）/g, "") });
    reg.querySelector(".vp-chips").append(chip);
    if (animate && !reduceMotion) {
      reg.classList.remove("is-flash"); void reg.offsetWidth; reg.classList.add("is-flash");
    }
    return reg;
  }

  /** 单片机视角下统计占 Flash / RAM 的声明个数，直观看出 .data 「付两次钱」。 */
  function renderTally() {
    if (view !== "mcu") { tally.textContent = ""; return; }
    const v = VIEWS.mcu;
    let flash = 0, ram = 0;
    for (const r of rows) {
      if (!placed.has(r.id)) continue;
      const mem = v.regions[regionIndex(v, r.cells[v.col], r.decl)].mem;
      if (mem === "flash" || mem === "both") flash += 1;
      if (mem === "ram" || mem === "both") ram += 1;
    }
    tally.textContent = placed.size ? `已放入 ${placed.size} 个：占 Flash 的 ${flash} 个，占 RAM 的 ${ram} 个（Flash→RAM 两边都算）` : "";
  }

  function place(r) {
    const v = VIEWS[view];
    declBtns.forEach((b) => b.classList.toggle("is-cur", b.dataset.id === String(r.id)));
    if (!placed.has(r.id)) {
      placed.add(r.id);
      declBtns[r.id].setAttribute("aria-pressed", "true");
      addChip(r, true);
    } else {
      const reg = stack.children[regionIndex(v, r.cells[v.col], r.decl)];
      reg.classList.remove("is-flash"); void reg.offsetWidth; reg.classList.add("is-flash");
    }
    note.textContent = `${r.decl} → ${r.cells[v.col]}。${r.note}`;
    renderTally();
  }

  let auto = null;
  const stopAuto = () => { clearInterval(auto); auto = null; };
  function placeAll() {
    stopAuto();
    const todo = rows.filter((r) => !placed.has(r.id));
    if (reduceMotion) { todo.forEach(place); return; }
    auto = setInterval(() => { const r = todo.shift(); if (!r) { stopAuto(); return; } place(r); }, 320);
  }

  declBtns.forEach((b) => b.addEventListener("click", () => { stopAuto(); place(rows[Number(b.dataset.id)]); }));
  viewBtns.forEach((b) => b.addEventListener("click", () => {
    view = b.dataset.k;
    viewBtns.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderRegions();
    const cur = declBtns.find((x) => x.classList.contains("is-cur"));
    if (cur) { const r = rows[Number(cur.dataset.id)]; note.textContent = `${r.decl} → ${r.cells[VIEWS[view].col]}。${r.note}`; }
  }));
  allBtn.addEventListener("click", placeAll);
  clearBtn.addEventListener("click", () => {
    stopAuto(); placed.clear();
    declBtns.forEach((b) => { b.setAttribute("aria-pressed", "false"); b.classList.remove("is-cur"); });
    note.textContent = "点左边的声明，看它落在哪里。";
    renderRegions();
  });

  root.append(
    el("div", { class: "vp-bar" }, [el("div", { class: "vp-views", role: "group", "aria-label": "视角" }, viewBtns), allBtn, clearBtn]),
    el("div", { class: "vp-grid" }, [el("div", { class: "vp-decls" }, declBtns), el("div", {}, [el("p", { class: "vp-axis", text: "高地址 ↑" }), stack, el("p", { class: "vp-axis", text: "低地址 ↓" })])]),
    note, tally);
  renderRegions();
  onceVisible(root, () => { if (!placed.size) placeAll(); });
}
