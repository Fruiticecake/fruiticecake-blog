// 本文专属组件：绑骨择优 / 合成数据 / 考试 / 深度对决。
// 约定：导出 widgets 对象，键是 ::: interactive 后面的组件名，值是 mount(root, ctx)。
// 凡视频没有给出具体数值的地方，组件内都标注「示意」。

import { svg, el, reduceMotion, uid, onceVisible, whileVisible } from "/stage/lib/dom.js";
import { randomAngles, forwardKinematics, project, rand } from "./creature.js";

/* ------------------------------------------------------------------
   1. 绑骨择优：UniRig 跑 4 次，按三条规则打分，留下最好的一副
------------------------------------------------------------------ */
const RIG_BODY = "M30 50 C40 32 118 30 146 42 C158 38 168 32 176 28 L173 40 C165 49 157 55 149 59 L147 98 L138 98 L134 66 C110 72 72 72 54 66 L51 98 L42 98 L38 63 C27 63 18 58 12 52 C8 46 18 38 30 50 Z";
const RIG_BASE = {
  nodes: { head: [20, 50], shld: [46, 52], spine: [90, 50], hip: [134, 52], tail: [168, 36],
    fk: [44, 76], ff: [46, 96], hk: [140, 76], hf: [138, 96],
    fk2: [52, 76], ff2: [54, 96], hk2: [132, 76], hf2: [130, 96] },
};
const RIG_TRIES = [
  { id: "A", note: "脊柱和尾骨戳出体外", checks: [true, true, false],
    patch: { spine: [90, 22], tail: [190, 18] } },
  { id: "B", note: "近侧后腿没有骨骼", checks: [false, false, true], drop: ["near-hind"] },
  { id: "C", note: "两侧前腿长短不一", checks: [true, false, true],
    patch: { fk2: [56, 70], ff2: [60, 84] } },
  { id: "D", note: "全部满足", checks: [true, true, true] },
];
const RIG_RULES = ["着地的腿都有骨骼", "左右对称", "骨骼都在体内"];

function drawRig(tryDef) {
  const n = { ...RIG_BASE.nodes, ...(tryDef.patch || {}) };
  const s = svg("svg", { viewBox: "0 0 200 112", class: "rig-svg", "aria-hidden": "true" });
  svg("path", { d: RIG_BODY, class: "rig-body" }, s);
  const bone = (a, b, cls = "") => svg("line", { x1: n[a][0], y1: n[a][1], x2: n[b][0], y2: n[b][1], class: `rig-bone ${cls}` }, s);
  bone("shld", "fk2", "far"); bone("fk2", "ff2", "far"); bone("hip", "hk2", "far"); bone("hk2", "hf2", "far");
  bone("head", "shld"); bone("shld", "spine"); bone("spine", "hip"); bone("hip", "tail");
  bone("shld", "fk"); bone("fk", "ff");
  if (!(tryDef.drop || []).includes("near-hind")) { bone("hip", "hk"); bone("hk", "hf"); }
  const bad = new Set(Object.keys(tryDef.patch || {}));
  for (const [k, [x, y]] of Object.entries(n)) {
    if ((tryDef.drop || []).includes("near-hind") && ["hk", "hf"].includes(k)) continue;
    svg("circle", { cx: x, cy: y, r: k.endsWith("2") ? 2.2 : 3, class: `rig-joint${bad.has(k) ? " is-bad" : ""}${k.endsWith("2") ? " far" : ""}` }, s);
  }
  return s;
}

function mountRigSelect(root) {
  root.classList.add("w-rig");
  const grid = el("ol", { class: "rig-grid" });
  const cards = RIG_TRIES.map((t) => {
    const checks = el("ul", { class: "rig-checks" }, RIG_RULES.map((r, i) =>
      el("li", { class: `rig-check ${t.checks[i] ? "is-ok" : "is-no"}` }, [el("span", { class: "rig-mark", "aria-hidden": "true" }), r])));
    const score = t.checks.filter(Boolean).length;
    const card = el("li", { class: "rig-card", "aria-label": `第 ${t.id} 次：${t.note}，得分 ${score}/3` }, [
      el("div", { class: "rig-top" }, [el("span", { class: "rig-id", text: `TRY_${t.id}` }), el("span", { class: "rig-score", text: `${score}/3` })]),
      drawRig(t), el("p", { class: "rig-note", text: t.note }), checks,
    ]);
    grid.appendChild(card);
    return { card, score };
  });
  const after = el("p", { class: "rig-after" }, [
    el("b", { text: "选中 TRY_D 后的修整：" }), "把手指收进手掌 · 裁掉戳出体外的骨骼 → 骨架完全在模型内部",
  ]);
  root.append(grid, after, el("p", { class: "w-caption", text: "示意：四次尝试的缺陷类型来自视频描述，具体骨架为图解。" }));

  onceVisible(root, () => {
    root.classList.add("is-scoring");
    const best = cards.reduce((a, b) => (b.score > a.score ? b : a));
    setTimeout(() => { best.card.classList.add("is-best"); root.classList.add("is-done"); }, reduceMotion ? 0 : 1500);
  });
}

/* ------------------------------------------------------------------
   2. 合成数据：一张训练图的四个步骤，标注永远是精确的
------------------------------------------------------------------ */
const SD_PANELS = [{ view: "front", x0: 10, label: "CAM_A · FRONT" }, { view: "side", x0: 340, label: "CAM_B · SIDE" }];
const SD_W = 310, SD_FLOOR = 266, SD_SCALE = 122;
const SD_STEPS = [
  { key: "pose", label: "① 随机弯关节", hint: "只弯到真实关节能弯的程度" },
  { key: "turn", label: "② 随机转身", hint: "各个角度都要见过" },
  { key: "blur", label: "③ 运动模糊", hint: "约一半是快速动作" },
  { key: "grade", label: "④ 故意劣化", hint: "模仿 Seedance 的光照、色偏、糊手" },
];
const REST = { legs: { FL: { hip: 8, knee: 10 }, FR: { hip: -6, knee: 8 }, HL: { hip: -8, knee: 12 }, HR: { hip: 6, knee: 10 } },
  spine: 0, neck: 12, tail: 10, yaw: 0, fast: false };

function mountSynthData(root) {
  root.classList.add("w-synth");
  const id = uid();
  const on = { pose: true, turn: true, blur: true, grade: true, labels: true };
  let count = 1, auto = true, sample = null;

  const chips = el("div", { class: "sd-steps", role: "group", "aria-label": "生成步骤开关" });
  SD_STEPS.forEach((s) => {
    const b = el("button", { type: "button", class: "sd-chip", "aria-pressed": "true", title: s.hint }, [s.label]);
    b.addEventListener("click", () => { on[s.key] = !on[s.key]; b.setAttribute("aria-pressed", String(on[s.key])); stopAuto(); render(); });
    chips.appendChild(b);
  });
  const lblBtn = el("button", { type: "button", class: "sd-chip is-label", "aria-pressed": "true" }, ["显示标注"]);
  lblBtn.addEventListener("click", () => { on.labels = !on.labels; lblBtn.setAttribute("aria-pressed", String(on.labels)); render(); });
  const next = el("button", { type: "button", class: "sd-next" }, ["生成下一张 →"]);
  next.addEventListener("click", () => { stopAuto(); generate(); });
  chips.append(lblBtn, next);

  const fig = svg("svg", { viewBox: "0 0 660 300", class: "sd-svg", role: "img", "aria-label": "一张合成训练图：怪物在正面和侧面两个画面中的随机姿势，以及精确的关节标注" });
  const defs = svg("defs", {}, fig);
  const blurF = svg("filter", { id: `sd-blur-${id}`, x: "-20%", y: "-20%", width: "140%", height: "140%" }, defs);
  svg("feGaussianBlur", { stdDeviation: 2.4 }, blurF);
  const gradeF = svg("filter", { id: `sd-grade-${id}` }, defs);
  const gradeM = svg("feColorMatrix", { type: "matrix" }, gradeF);
  const noiseF = svg("filter", { id: `sd-noise-${id}`, x: 0, y: 0, width: "100%", height: "100%" }, defs);
  svg("feTurbulence", { type: "fractalNoise", baseFrequency: 0.9, numOctaves: 2, stitchTiles: "stitch" }, noiseF);
  svg("feColorMatrix", { type: "saturate", values: 0 }, noiseF);
  const light = svg("linearGradient", { id: `sd-light-${id}` }, defs);
  const stopA = svg("stop", { offset: 0, "stop-color": "#fff", "stop-opacity": 0.12 }, light);
  svg("stop", { offset: 1, "stop-color": "#000", "stop-opacity": 0.35 }, light);

  const layers = SD_PANELS.map((p) => {
    const g = svg("g", { transform: `translate(${p.x0} 0)` }, fig);
    svg("rect", { x: 0, y: 14, width: SD_W, height: 272, rx: 4, class: "sd-frame" }, g);
    const render = svg("g", { class: "sd-render" }, g);
    const fx = svg("g", {}, g);
    const labels = svg("g", { class: "sd-labels" }, g);
    svg("text", { x: 12, y: 34, class: "sd-cam" }, g).textContent = p.label;
    return { ...p, render, fx, labels };
  });
  const readout = el("p", { class: "sd-readout", "aria-live": "polite" });
  const counter = el("span", { class: "sd-count" });
  root.append(chips, fig, el("div", { class: "sd-foot" }, [readout, counter]));

  function generate() {
    const a = on.pose ? randomAngles() : { ...REST, legs: { ...REST.legs }, fast: Math.random() < 0.5 };
    if (!on.turn) a.yaw = 0;
    const fastLimbs = new Set(a.fast ? ["FL", "HR", "tail"].filter(() => Math.random() < 0.8) : []);
    sample = { a, fk: forwardKinematics(a), fastLimbs, dir: [rand(-1, 1), rand(-0.4, 0.4)],
      grade: { warm: rand(-0.12, 0.16), bright: rand(0.75, 1.15), lightFrom: Math.random() < 0.5 } };
    count = Math.min(3000, count + 1);
    render();
  }

  function render() {
    if (!sample) return;
    const { a, fk, fastLimbs, dir, grade } = sample;
    const g = grade;
    gradeM.setAttribute("values", `${g.bright + g.warm} 0 0 0 0  0 ${g.bright} 0 0 0  0 0 ${g.bright - g.warm} 0 0  0 0 0 1 0`);
    stopA.setAttribute("stop-opacity", on.grade ? 0.12 : 0);
    const byName = Object.fromEntries(fk.joints.map((j) => [j.name, j]));
    for (const P of layers) {
      P.render.replaceChildren(); P.fx.replaceChildren(); P.labels.replaceChildren();
      P.render.setAttribute("filter", on.grade ? `url(#sd-grade-${id})` : "");
      const pt = (j, off = [0, 0]) => {
        const { u, v } = project(j, P.view);
        return [SD_W / 2 + (u + off[0]) * SD_SCALE, SD_FLOOR - (v + off[1]) * SD_SCALE];
      };
      svg("line", { x1: 14, x2: SD_W - 14, y1: SD_FLOOR, y2: SD_FLOOR, class: "sd-floor" }, P.render);
      const drawBody = (parent, off, cls, onlyLimbs) => {
        for (const [p, q] of fk.bones) {
          const limb = byName[q].limb;
          if (onlyLimbs && !onlyLimbs.has(limb)) continue;
          const [x1, y1] = pt(byName[p], off), [x2, y2] = pt(byName[q], off);
          svg("line", { x1, y1, x2, y2, class: `sd-flesh ${cls}`, "data-limb": limb }, parent);
        }
        if (!onlyLimbs) {
          const [hx, hy] = pt(byName.HEAD, off);
          svg("circle", { cx: hx, cy: hy, r: 13, class: `sd-head ${cls}` }, parent);
        }
      };
      // 快速部位：主体之外再画几层沿运动方向错开的残影，并模糊
      const blurOn = on.blur && fastLimbs.size > 0;
      if (blurOn) {
        const ghosts = svg("g", { filter: `url(#sd-blur-${id})`, class: "sd-ghosts" }, P.render);
        for (const k of [0.04, 0.08, 0.12]) drawBody(ghosts, [dir[0] * k, dir[1] * k], "is-ghost", fastLimbs);
      }
      const body = svg("g", {}, P.render);
      drawBody(body, [0, 0], "");
      if (blurOn) {
        body.querySelectorAll(".sd-flesh").forEach((l) => { if (fastLimbs.has(l.dataset.limb)) l.setAttribute("filter", `url(#sd-blur-${id})`); });
      }
      if (on.grade) {
        svg("rect", { x: 0, y: 14, width: SD_W, height: 272, rx: 4, fill: `url(#sd-light-${id})`,
          transform: g.lightFrom ? "" : `matrix(-1 0 0 1 ${SD_W} 0)` }, P.fx);
        svg("rect", { x: 0, y: 14, width: SD_W, height: 272, rx: 4, filter: `url(#sd-noise-${id})`, class: "sd-noise" }, P.fx);
      }
      if (on.labels) {
        for (const j of fk.joints) {
          const [x, y] = pt(j);
          svg("circle", { cx: x, cy: y, r: 3.4, class: "sd-gt" }, P.labels);
        }
      }
    }
    const turn = Math.round(((a.yaw % 360) + 360) % 360);
    readout.textContent = `${a.fast && on.blur ? "快速动作 · 已加运动模糊" : "慢速动作"} · 转身 ${turn}° · `
      + `${on.labels ? `${fk.joints.length} 个关节坐标全部已知（渲染时直接得到，不需要人工标注）` : "标注已隐藏"}`;
    counter.textContent = `${String(count).padStart(4, "0")} / 3000`;
  }

  function stopAuto() { if (auto) { auto = false; stopTimer(); root.classList.add("is-manual"); } }
  const stopTimer = whileVisible(root, () => auto && generate(), 1700);
  generate();
}

/* ------------------------------------------------------------------
   3. 考试：用自己编的动作当标准答案，逐骨骼比对；坏改动会被拒绝
------------------------------------------------------------------ */
const EXAM_BONES = [
  ["头部", 0.6, 0.7], ["肩部", 0.5, 0.6], ["髋部", 0.5, 0.6], ["尾尖", 1.1, 1.5],
  ["前腿 · 近侧", 0.9, 2.6], ["前腿 · 远侧", 1.3, 3.9], ["后腿 · 近侧", 0.8, 2.3], ["后腿 · 远侧", 1.4, 4.2],
];
const EXAM_LIMIT = 2.0, EXAM_MAX = 5, EXAM_FRAMES = 240;

function mountExam(root) {
  root.classList.add("w-exam");
  let mode = 0, frame = 0;
  const modes = ["当前工具", "假设的改动：去掉运动模糊增强"];
  const ctl = el("div", { class: "exam-modes", role: "group", "aria-label": "被考的工具版本" });
  const btns = modes.map((m, i) => {
    const b = el("button", { type: "button", class: "exam-mode", "aria-pressed": String(i === 0) }, [m]);
    b.addEventListener("click", () => { mode = i; btns.forEach((x, j) => x.setAttribute("aria-pressed", String(j === i))); render(); });
    ctl.appendChild(b);
    return b;
  });
  const meta = el("p", { class: "exam-meta" });
  const table = el("div", { class: "exam-table", role: "table", "aria-label": "逐骨骼误差" });
  const rows = EXAM_BONES.map(([name]) => {
    const bar = el("span", { class: "exam-bar" });
    const val = el("span", { class: "exam-val", role: "cell" });
    const st = el("span", { class: "exam-st", role: "cell" });
    const row = el("div", { class: "exam-row", role: "row" }, [
      el("span", { class: "exam-name", role: "cell", text: name }),
      el("span", { class: "exam-track", role: "cell" }, [bar, el("i", { class: "exam-limit", style: `--x:${EXAM_LIMIT / EXAM_MAX}` })]),
      val, st,
    ]);
    table.appendChild(row);
    return { row, bar, val, st };
  });
  const verdict = el("div", { class: "exam-verdict", "aria-live": "polite" });
  root.append(ctl, meta, table, verdict,
    el("p", { class: "w-caption", text: `示意数据：视频没有公布误差数值，这里用 ${EXAM_LIMIT} cm 作为假设的合格线，演示「每次改动都必须通过考试」这条规则。` }));

  function render() {
    let fails = 0;
    EXAM_BONES.forEach(([, base, broken], i) => {
      const jitter = Math.sin(frame * 0.21 + i * 1.7) * 0.12 + Math.sin(frame * 0.07 + i) * 0.08;
      const err = Math.max(0.1, (mode ? broken : base) + jitter);
      const fail = err > EXAM_LIMIT;
      fails += fail ? 1 : 0;
      rows[i].bar.style.setProperty("--w", Math.min(1, err / EXAM_MAX));
      rows[i].row.classList.toggle("is-fail", fail);
      rows[i].val.textContent = `${err.toFixed(1)} cm`;
      rows[i].st.textContent = fail ? "FAIL" : "PASS";
    });
    meta.textContent = `怪物：蜥蜴（新）· 动作：随机生成、关节限位内 · 逐帧比对 ${String(frame % EXAM_FRAMES).padStart(3, "0")} / ${EXAM_FRAMES}`;
    verdict.className = `exam-verdict ${fails ? "is-fail" : "is-pass"}`;
    verdict.textContent = fails ? `${fails} 根骨骼超出合格线 → 这次改动被拒绝，不合入` : "全部骨骼在合格线内 → 通过，可以开始花钱生成 Seedance 视频";
  }
  whileVisible(root, () => { frame += 1; render(); }, 140);
  render();
}

/* ------------------------------------------------------------------
   4. 深度对决：谁更近？通用模型 4/10，专属模型 10/10
------------------------------------------------------------------ */
const DUEL = [
  { name: "Depth Anything", sub: "通用单目深度", hits: [1, 0, 0, 1, 0, 1, 0, 0, 1, 0] },
  { name: "专属深度模型", sub: "用这只怪物的渲染训练", hits: Array(10).fill(1) },
  { name: "双机位几何", sub: "两条视线直接相交", hits: Array(10).fill(1) },
];

function mountDepthDuel(root) {
  root.classList.add("w-duel");
  const list = el("div", { class: "duel-list" });
  const rows = DUEL.map((d) => {
    const cells = d.hits.map((h, i) => el("span", { class: `duel-cell ${h ? "is-hit" : "is-miss"}`, style: `--i:${i}`,
      "aria-label": `第 ${i + 1} 帧：${h ? "判断正确" : "判断错误"}` }));
    const score = el("span", { class: "duel-score", text: `${d.hits.filter(Boolean).length} / 10` });
    const row = el("div", { class: "duel-row" }, [
      el("div", { class: "duel-who" }, [el("b", { text: d.name }), el("span", { text: d.sub })]),
      el("div", { class: "duel-cells", role: "img", "aria-label": `${d.name}：10 帧中判断正确 ${d.hits.filter(Boolean).length} 帧` }, cells),
      score,
    ]);
    list.appendChild(row);
    return row;
  });
  const facts = el("ul", { class: "duel-facts" }, [
    el("li", { class: "is-yes" }, ["专属模型能判断", el("b", { text: "哪条腿更近" })]),
    el("li", { class: "is-no" }, ["但说不出", el("b", { text: "到底近多少" }), "→ 还替代不了第二台相机"]),
    el("li", {}, ["和双机位结合后结果几乎不变：", el("b", { text: "两台相机本来就看得见深度" })]),
  ]);
  root.append(list, facts, el("p", { class: "w-caption", text: "按 10 帧示意「10 次对 4 次」与「每一次都对」，帧序为图解。" }));
  onceVisible(root, () => rows.forEach((r, i) => setTimeout(() => r.classList.add("is-on"), reduceMotion ? 0 : i * 700)));
}

export const widgets = {
  "rig-select": mountRigSelect,
  "synth-data": mountSynthData,
  "exam": mountExam,
  "depth-duel": mountDepthDuel,
};
