// 本文专属组件：raii-scope-lab / lifetime-lab / compile-link-lab / atomic-order-lab
// 首屏：raii-bus-hero
// 所有数据优先从降级表格读取，图形与步进流为原理图解。

import { el, svg, onceVisible, whileVisible, reduceMotion } from "/stage/lib/dom.js";

/* ---------- 公共 ---------- */

function readTable(ctx, name, minRows) {
  const table = ctx.fallback?.querySelector("table");
  if (!table) throw new Error(`${name}：降级内容里需要一张表格`);
  const rows = [...table.querySelectorAll("tbody tr")].map((tr) =>
    [...tr.children].map((n) => n.textContent.trim()),
  );
  if (rows.length < minRows) throw new Error(`${name}：表格至少需要 ${minRows} 行数据`);
  return rows;
}

function toggleGroup(labels, onPick, ariaLabel) {
  const bar = el("div", { class: "cpp2-tabs", role: "group", "aria-label": ariaLabel });
  const buttons = labels.map((label, i) => {
    const b = el("button", { type: "button", class: "cpp2-btn", text: label });
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

function mkBtn(text, primary = false) {
  return el("button", { type: "button", class: primary ? "cpp2-btn is-primary" : "cpp2-btn", text });
}

/* ---------- 首屏 raii-bus-hero：Bus(shared_ptr) 与 Subscription(weak_ptr) 生命周期 ---------- */

function mountRaiiBusHero(figure, ctx) {
  const root = svg("svg", {
    viewBox: "0 0 1000 380",
    role: "img",
    "aria-label": "InProcEventBus 用 shared_ptr 拥有 EventBusImpl 内核，Subscription 用 weak_ptr 观察并在析构时安全退订",
  });
  root.classList.add("rbh-svg");
  figure.append(
    root,
    el("figcaption", { class: "viewer-cap" }, [
      el("span", {}, [el("i", { class: "k-strong" }), "shared_ptr 强引用"]),
      el("span", {}, [el("i", { class: "k-weak" }), "weak_ptr 弱引用"]),
      el("span", { text: "LUMA-ARM · RAII LIFETIME" }),
    ]),
  );

  const mk = (tag, attrs, parent = root) => svg(tag, attrs, parent);
  const txt = (x, y, text, cls, anchor = "middle") => {
    const n = mk("text", { x, y, class: cls, "text-anchor": anchor });
    n.textContent = text;
    return n;
  };

  // 左：InProcEventBus 宿主
  const busBox = mk("rect", { x: 70, y: 64, width: 220, height: 100, rx: 4, class: "rbh-box" });
  txt(180, 96, "InProcEventBus", "rbh-title");
  txt(180, 122, "shared_ptr<EventBusImpl>", "rbh-mono-mark");
  const busState = txt(180, 146, "ALIVE · owner", "rbh-sub");

  // 中：堆上的 EventBusImpl 内核
  const implBox = mk("rect", { x: 390, y: 150, width: 220, height: 120, rx: 4, class: "rbh-impl" });
  txt(500, 184, "EventBusImpl (Heap)", "rbh-title");
  txt(500, 210, "mutex + topics[]", "rbh-mono");
  const implRef = txt(500, 240, "use_count = 1", "rbh-mono-mark");

  // 右：Subscription 句柄
  const subBox = mk("rect", { x: 710, y: 64, width: 220, height: 100, rx: 4, class: "rbh-box" });
  txt(820, 96, "Subscription (RAII)", "rbh-title");
  txt(820, 122, "weak_ptr<EventBusImpl>", "rbh-mono");
  const subState = txt(820, 146, "id_ = 42 · valid()", "rbh-sub");

  // 连线
  const strongLine = mk("path", { d: "M290,114 C350,114 345,200 390,200", class: "rbh-strong" });
  const weakLine = mk("path", { d: "M710,114 C650,114 655,200 610,200", class: "rbh-weak" });

  // 底部状态指示条
  mk("rect", { x: 70, y: 304, width: 860, height: 42, rx: 4, class: "rbh-bar" });
  const statusTxt = txt(500, 330, "正常运行：Subscription 持 weak_ptr 观察总线，不阻止总线释放", "rbh-status");

  const phases = [
    {
      busAlive: true,
      subAlive: true,
      ref: "use_count = 1",
      busTxt: "ALIVE · owner",
      subTxt: "id_ = 42 · valid()",
      msg: "阶段 1：正常运行 — Bus 持有唯一强引用，Subscription 仅持有 weak_ptr",
      clock: "REF 01",
    },
    {
      busAlive: false,
      subAlive: true,
      ref: "use_count = 0 (已释放)",
      busTxt: "DESTROYED",
      subTxt: "id_ = 42 · expired()",
      msg: "阶段 2：总线先销毁 — 强引用归零即释放内核，句柄不给总线强行续命",
      clock: "EXP 00",
    },
    {
      busAlive: false,
      subAlive: false,
      ref: "use_count = 0 (安全跳过)",
      busTxt: "DESTROYED",
      subTxt: "~Subscription() -> id_ = 0",
      msg: "阶段 3：句柄离开作用域 — impl_.lock() 返回空指针，安全跳过，零 UAF",
      clock: "SAFE OK",
    },
  ];

  let idx = 0;
  function apply(p) {
    busBox.classList.toggle("is-dead", !p.busAlive);
    implBox.classList.toggle("is-dead", !p.busAlive);
    subBox.classList.toggle("is-dead", !p.subAlive);
    strongLine.classList.toggle("is-off", !p.busAlive);
    weakLine.classList.toggle("is-broken", !p.busAlive);
    weakLine.classList.toggle("is-off", !p.subAlive);
    implRef.textContent = p.ref;
    busState.textContent = p.busTxt;
    subState.textContent = p.subTxt;
    statusTxt.textContent = p.msg;
    if (ctx?.clock) ctx.clock.textContent = p.clock;
  }

  apply(phases[0]);
  if (reduceMotion) return;
  whileVisible(
    figure,
    () => {
      idx = (idx + 1) % phases.length;
      apply(phases[idx]);
    },
    2200,
  );
}

/* ---------- 组件 1：raii-scope-lab（持锁直调 vs RAII 花括号快照解锁） ---------- */

const RAII_STEPS = ["publish() 加锁", "执行回调 handler", "回调内调 sub.reset()"];

function mountRaiiScopeLab(root, ctx) {
  const rows = readTable(ctx, "raii-scope-lab", 2);
  let mode = 0;
  let step = 0;

  const tabs = toggleGroup(
    rows.map((r) => r[0]),
    (i) => {
      mode = i;
      step = 0;
      render();
    },
    "锁与回调实现方式",
  );
  const next = mkBtn("下一步", true);
  const reset = mkBtn("重来");

  const code = el("pre", { class: "cpp2-code" });
  const cards = el("div", { class: "rs-cards" });
  const lockCard = el("div", { class: "rs-card" });
  const snapCard = el("div", { class: "rs-card" });
  const callCard = el("div", { class: "rs-card" });
  cards.append(lockCard, snapCard, callCard);

  const stepper = el("ol", { class: "cpp2-steps" }, RAII_STEPS.map((s) => el("li", { text: s })));
  const result = el("p", { class: "cpp2-result", "aria-live": "polite" });

  function setCard(node, label, text, state = "") {
    node.className = `rs-card${state ? ` is-${state}` : ""}`;
    node.replaceChildren(el("small", { text: label }), el("strong", { text }));
  }

  function render() {
    const safe = mode === 1;
    code.textContent = safe
      ? `std::vector<EntryPtr> snapshot;\n{\n    std::lock_guard<std::mutex> lock(impl_->mutex);\n    snapshot = it->second;  // 锁内只拷快照\n}                           // 出花括号立即析构解锁\nfor (auto& e : snapshot) if (e->alive.load()) e->handler(...);`
      : `std::lock_guard<std::mutex> lock(impl_->mutex);\nfor (auto& e : it->second) {\n    e->handler(...);  // 抱着锁调外部回调\n}`;

    if (step === 0) {
      setCard(lockCard, "MUTEX 状态", "尚未进入 publish()");
      setCard(snapCard, "作用域 / 容器", "等待派发");
      setCard(callCard, "重入结果", "点击「下一步」执行");
    } else if (step === 1) {
      setCard(lockCard, "MUTEX 状态", safe ? "花括号内加锁 → 离开即解锁" : "整个函数全程持锁", safe ? "mark" : "warn");
      setCard(snapCard, "作用域 / 容器", safe ? "拷贝 lightweight shared_ptr 快照" : "直接引用原 topics vector", safe ? "mark" : "");
      setCard(callCard, "重入结果", rows[mode][1]);
    } else if (step === 2) {
      setCard(lockCard, "MUTEX 状态", safe ? "已解锁（free）" : "仍然被本线程锁死（held）", safe ? "mark" : "warn");
      setCard(snapCard, "作用域 / 容器", safe ? "安全遍历 snapshot" : "遍历正在被持锁的 vector");
      setCard(callCard, "重入结果", rows[mode][2]);
    } else {
      setCard(lockCard, "MUTEX 状态", safe ? "reset() 正常拿到锁并解锁" : "同线程二次加锁 → 死锁", safe ? "mark" : "warn");
      setCard(snapCard, "作用域 / 容器", safe ? "alive 置 false 并安全移除条目" : "卡死在 unsubscribe()");
      setCard(callCard, "重入结果", safe ? "通过（0 死锁）" : "死锁 / 崩溃", safe ? "mark" : "warn");
    }

    stepper.querySelectorAll("li").forEach((li, i) => li.classList.toggle("is-done", i < step));
    result.textContent = step === 0 ? "按「下一步」逐拍走过 publish() 调用栈。" : rows[mode][step];
    next.disabled = step >= 3;
  }

  next.addEventListener("click", () => {
    step = Math.min(3, step + 1);
    render();
  });
  reset.addEventListener("click", () => {
    step = 0;
    render();
  });

  root.append(
    el("div", { class: "cpp2-bar" }, [tabs.bar, el("div", { class: "cpp2-acts" }, [next, reset])]),
    el("div", { class: "rs-grid" }, [code, el("div", { class: "rs-right" }, [cards, stepper])]),
    result,
    el("p", { class: "w-caption", text: "示意：演示 RAII 独立花括号作用域如何在调回调前自动释放互斥锁。" }),
  );
  tabs.select(0);
  onceVisible(root, () => root.classList.add("is-in"));
}

/* ---------- 组件 2：lifetime-lab（总线先销毁时的三种指针结果） ---------- */

function mountLifetimeLab(root, ctx) {
  const rows = readTable(ctx, "lifetime-lab", 3);
  let mode = 2; // 默认展示 weak_ptr，用户可自由切换
  let stage = 0; // 0: 正常, 1: 总线销毁, 2: 句柄析构

  const W = 580;
  const H = 230;
  const pic = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", class: "lt-svg" });
  const mk = (tag, attrs) => svg(tag, attrs, pic);
  const txt = (x, y, t, cls) => {
    const n = mk("text", { x, y, "text-anchor": "middle", class: cls });
    n.textContent = t;
    return n;
  };

  const busRect = mk("rect", { x: 30, y: 34, width: 150, height: 70, rx: 4, class: "lt-box" });
  txt(105, 62, "InProcEventBus", "lt-title");
  const busSub = txt(105, 86, "作用域内活着", "lt-small");

  const implRect = mk("rect", { x: 215, y: 128, width: 150, height: 76, rx: 4, class: "lt-impl" });
  txt(290, 158, "EventBusImpl", "lt-title");
  const implSub = txt(290, 184, "", "lt-mono");

  const subRect = mk("rect", { x: 400, y: 34, width: 150, height: 70, rx: 4, class: "lt-box" });
  txt(475, 62, "Subscription", "lt-title");
  const subSub = txt(475, 86, "", "lt-small");

  const busEdge = mk("line", { x1: 145, y1: 104, x2: 245, y2: 128, class: "lt-edge" });
  const subEdge = mk("line", { x1: 435, y1: 104, x2: 335, y2: 128, class: "lt-edge" });

  const tabs = toggleGroup(
    rows.map((r) => r[0]),
    (i) => {
      mode = i;
      stage = 0;
      render();
    },
    "Subscription 持有指针类型",
  );
  const stepBtn = mkBtn("1. 让总线先销毁", true);
  const resetBtn = mkBtn("复位");
  const desc = el("p", { class: "cpp2-result", "aria-live": "polite" });

  function render() {
    const row = rows[mode];
    const isRaw = mode === 0;
    const isStrong = mode === 1;
    const isWeak = mode === 2;

    const busDestroyed = stage >= 1;
    const subDestroyed = stage >= 2;
    const implFreed = busDestroyed && (isRaw || isWeak || (isStrong && subDestroyed));
    const uafCrash = isRaw && subDestroyed;
    const leaked = isStrong && busDestroyed && !subDestroyed;

    busRect.classList.toggle("is-dead", busDestroyed);
    busEdge.classList.toggle("is-off", busDestroyed);
    subRect.classList.toggle("is-dead", subDestroyed);
    subEdge.classList.toggle("is-weak", isWeak);
    subEdge.classList.toggle("is-warn", uafCrash || leaked);
    subEdge.classList.toggle("is-off", subDestroyed && !uafCrash);

    implRect.classList.toggle("is-dead", implFreed && !uafCrash);
    implRect.classList.toggle("is-leak", leaked);
    implRect.classList.toggle("is-crash", uafCrash);

    busSub.textContent = busDestroyed ? "已离开作用域销毁" : "作用域内活着";
    subSub.textContent = subDestroyed ? "~Subscription()" : isWeak ? "持 weak_ptr" : isStrong ? "持 shared_ptr" : "持裸指针";
    if (isRaw) {
      implSub.textContent = busDestroyed ? (uafCrash ? "UAF 崩溃！" : "已 free（野指针）") : "堆上存活";
    } else if (isStrong) {
      const cnt = (busDestroyed ? 0 : 1) + (subDestroyed ? 0 : 1);
      implSub.textContent = leaked ? `use_count = ${cnt}（滞留泄漏）` : cnt === 0 ? "use_count = 0 已释放" : `use_count = ${cnt}`;
    } else {
      implSub.textContent = busDestroyed ? "use_count = 0（已安全释放）" : "use_count = 1";
    }

    if (stage === 0) {
      stepBtn.textContent = "1. 让总线先销毁";
      stepBtn.disabled = false;
      desc.textContent = `当前方案：${row[0]}。先点击「让总线先销毁」模拟生命周期倒置。`;
    } else if (stage === 1) {
      stepBtn.textContent = "2. 句柄离开作用域析构";
      stepBtn.disabled = false;
      desc.textContent = `总线销毁后：${row[1]}`;
    } else {
      stepBtn.textContent = "演示完成";
      stepBtn.disabled = true;
      desc.textContent = `句柄析构时：${row[2]}`;
    }
    pic.setAttribute("aria-label", `${row[0]}，${desc.textContent}`);
  }

  stepBtn.addEventListener("click", () => {
    stage = Math.min(2, stage + 1);
    render();
  });
  resetBtn.addEventListener("click", () => {
    stage = 0;
    render();
  });

  root.append(
    el("div", { class: "cpp2-bar" }, [tabs.bar, el("div", { class: "cpp2-acts" }, [stepBtn, resetBtn])]),
    pic,
    desc,
    el("p", { class: "w-caption", text: "示意：总线比句柄先销毁时，三种指针的处理结果对比。" }),
  );
  tabs.select(2);
}

/* ---------- 组件 3：compile-link-lab（分离编译 vs 模板头文件实例化） ---------- */

function mountCompileLinkLab(root, ctx) {
  const rows = readTable(ctx, "compile-link-lab", 3);
  let mode = 0;
  let step = 0;

  const tabs = toggleGroup(
    rows.map((r) => r[0]),
    (i) => {
      mode = i;
      step = 0;
      render();
    },
    "编译模型方案",
  );
  const next = mkBtn("推进编译/链接", true);
  const reset = mkBtn("重来");

  const units = el("div", { class: "cl2-grid" });
  const uMain = el("div", { class: "cl2-unit" });
  const uLib = el("div", { class: "cl2-unit" });
  const uLd = el("div", { class: "cl2-unit" });
  units.append(uMain, uLib, uLd);
  const desc = el("p", { class: "cpp2-result", "aria-live": "polite" });

  function setUnit(node, title, lines, state = "") {
    node.className = `cl2-unit${state ? ` is-${state}` : ""}`;
    node.replaceChildren(
      el("small", { text: title }),
      ...lines.map((l) => el("div", { class: "cl2-line", text: l })),
    );
  }

  function render() {
    const isNormal = mode === 0;
    const isBroken = mode === 1;
    const isHeader = mode === 2;

    if (step === 0) {
      setUnit(uMain, "STAGE 1 · main.cpp", ["准备编译调用方..."]);
      setUnit(uLib, isHeader ? "STAGE 2 · ring_buffer.hpp" : "STAGE 2 · lib.cpp", [
        isHeader ? "完整模板蓝图都在头文件里" : "等待独立编译 .o",
      ]);
      setUnit(uLd, "STAGE 3 · 链接器 ld", ["等待合并目标文件"]);
      desc.textContent = `${rows[mode][0]}：按「推进编译/链接」查看编译期与链接期发生了什么。`;
    } else if (step === 1) {
      if (isNormal) {
        setUnit(uMain, "main.o（已编译）", ["看到 publish() 声明", "登记未决符号：InProcEventBus::publish"], "mark");
        setUnit(uLib, "inproc_event_bus.o（已编译）", ["普通函数签名固定", "生成唯一机器码：T InProcEventBus::publish"], "mark");
      } else if (isBroken) {
        setUnit(uMain, "main.o（已编译）", ["用到 HistoryRingBuffer<HeartbeatMsg, 500>", "头文件只有声明无实现，登记未决符号"], "warn");
        setUnit(uLib, "ring_buffer.o（已编译）", ["看到模板实现，但不知道谁会传 HeartbeatMsg", "结果：0 份机器码生成！"], "warn");
      } else {
        setUnit(uMain, "main.o（已编译）", ["通过 .hpp 同时看到模板实现 + 实参 HeartbeatMsg", "现场实例化生成推送机器码！"], "mark");
        setUnit(uLib, "ring_buffer.hpp（纯头文件）", ["无需独立 .cpp 编译单元", "按需随调用方一起编译"], "mark");
      }
      setUnit(uLd, "STAGE 3 · 链接器 ld", ["即将解析跨文件符号..."]);
      desc.textContent = `编译阶段：${rows[mode][1]}`;
    } else {
      if (isBroken) {
        setUnit(uMain, "main.o", ["需求：HistoryRingBuffer<HeartbeatMsg, 500>::pushOverwrite"], "warn");
        setUnit(uLib, "ring_buffer.o", ["导出符号表为空（未实例化）"], "warn");
        setUnit(uLd, "ld 链接结果：失败", ["error: undefined reference to pushOverwrite", "结论：" + rows[mode][3]], "warn");
      } else {
        setUnit(uMain, "main.o", [isHeader ? "已自带实例化机器码" : "调用外部符号"], "mark");
        setUnit(uLib, isHeader ? "ring_buffer.hpp" : "inproc_event_bus.o", [isHeader ? "多 .o 重复实例由链接器自动合并" : "提供唯一机器码实现"], "mark");
        setUnit(uLd, "ld 链接结果：成功", ["所有符号地址绑定完成", "结论：" + rows[mode][3]], "mark");
      }
      desc.textContent = `链接阶段：${rows[mode][2]}（${rows[mode][3]}）`;
    }
    next.disabled = step >= 2;
  }

  next.addEventListener("click", () => {
    step = Math.min(2, step + 1);
    render();
  });
  reset.addEventListener("click", () => {
    step = 0;
    render();
  });

  root.append(
    el("div", { class: "cpp2-bar" }, [tabs.bar, el("div", { class: "cpp2-acts" }, [next, reset])]),
    units,
    desc,
    el("p", { class: "w-caption", text: "示意：对比普通类 .hpp/.cpp 分离编译与模板类头文件实例化流程。" }),
  );
  tabs.select(0);
}

/* ---------- 组件 4：atomic-order-lab（四种并发读写对比） ---------- */

const ATOMIC_META = [
  { a: "普通写入（无原子保护 / volatile）", b: "可能读到半截或陈旧值", barrier: "NONE（编译器与 CPU 可重排）", state: "warn" },
  { a: "fetch_add(1, relaxed)", b: "总和最终一致", barrier: "ATOMIC ONLY（无跨变量顺序约束）", state: "mark" },
  { a: "store(false, release)", b: "load(acquire) 看到 false", barrier: "ACQUIRE / RELEASE 内存屏障", state: "mark" },
  { a: "store(v) / load() 默认 seq_cst", b: "所有核心看到相同全局顺序", barrier: "SEQ_CST 全序屏障（默认基线）", state: "mark" },
];

function mountAtomicOrderLab(root, ctx) {
  const rows = readTable(ctx, "atomic-order-lab", 4);
  let mode = 2; // 默认展示 release / acquire

  const tabs = toggleGroup(
    rows.map((r) => r[0]),
    (i) => {
      mode = i;
      render();
    },
    "内存序模式",
  );

  const stage = el("div", { class: "ao-grid" });
  const coreA = el("div", { class: "ao-box" });
  const fence = el("div", { class: "ao-fence" });
  const coreB = el("div", { class: "ao-box" });
  stage.append(coreA, fence, coreB);

  const desc = el("p", { class: "cpp2-result", "aria-live": "polite" });

  function render() {
    const row = rows[mode];
    const meta = ATOMIC_META[mode];

    coreA.className = `ao-box is-${meta.state}`;
    coreA.replaceChildren(
      el("small", { text: "THREAD A · 退订/写线程" }),
      el("strong", { text: meta.a }),
      el("span", { text: `原子性：${row[1]}` }),
    );

    fence.className = `ao-fence is-${meta.state}`;
    fence.replaceChildren(
      el("small", { text: "MEMORY ORDER" }),
      el("strong", { text: meta.barrier }),
    );

    coreB.className = `ao-box is-${meta.state}`;
    coreB.replaceChildren(
      el("small", { text: "THREAD B · 派发/读线程" }),
      el("strong", { text: meta.b }),
      el("span", { text: `可见性：${row[2]}` }),
    );

    desc.textContent = `${row[0]} — 适用边界：${row[3]}`;
  }

  root.append(
    el("div", { class: "cpp2-bar" }, [tabs.bar]),
    stage,
    desc,
    el("p", { class: "w-caption", text: "示意：展示 std::atomic 不同内存序在双核之间的原子性与重排约束。" }),
  );
  tabs.select(2);
}

export const widgets = {
  "raii-scope-lab": mountRaiiScopeLab,
  "lifetime-lab": mountLifetimeLab,
  "compile-link-lab": mountCompileLinkLab,
  "atomic-order-lab": mountAtomicOrderLab,
};

export const heroes = {
  "raii-bus-hero": mountRaiiBusHero,
};
