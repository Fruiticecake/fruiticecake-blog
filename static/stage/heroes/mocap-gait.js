// 默认首屏 mocap-gait：程序化四足步态，正面 / 侧面两个视窗同步行走。
// 关节是发光的动捕标记点；红色对极线轮流连接同一关节在两个画面里的位置，演示「两视角同高」。
// 用法：frontmatter 不写 hero 时默认使用；ctx.clock 是顶栏的 REC 时间码元素（可选）。

import { el, reduceMotion } from "../lib/dom.js";

const NS = "http://www.w3.org/2000/svg";

function caption() {
  const item = (cls, text) => el("span", {}, [el("i", { class: cls }), text]);
  return el("figcaption", { class: "viewer-cap" }, [
    item("k-mark", "关节标记"), item("k-epi", "对极线：同一关节在两个画面里高度相同"),
    el("span", { text: "左 CAM_A 正面 · 右 CAM_B 侧面" }),
  ]);
}

export function mount(figure, ctx = {}) {
  const clock = ctx.clock || null;
  const stage = document.createElementNS(NS, "svg");
  stage.setAttribute("viewBox", "0 0 1000 380");
  stage.setAttribute("role", "img");
  stage.setAttribute("aria-label", "一只四足怪物在正面和侧面两个视窗中同步行走，发光的标记点是它的关节");
  figure.append(stage, caption());
  const mk = (tag, a = {}, p = stage) => { const n = document.createElementNS(NS, tag); for (const k in a) n.setAttribute(k, a[k]); p.appendChild(n); return n; };

  const PANELS = { front: { x0: 0, w: 380 }, side: { x0: 400, w: 600 } };
  const H = 380, FLOOR = 318;
  const vy = (y) => FLOOR - y * 175;                       // 世界 y（米）→ 像素
  const sideU = (z) => PANELS.side.x0 + PANELS.side.w / 2 - z * 190;   // 侧面：看到 z（向左为前）
  const frontU = (x, z) => PANELS.front.x0 + PANELS.front.w / 2 + x * 190 * (1 + z * 0.12); // 正面：看到 x，带一点透视

  // 背景：网格、取景框角标、分割缝
  for (const [name, p] of Object.entries(PANELS)) {
    for (let gx = p.x0 + 40; gx < p.x0 + p.w; gx += 40) mk("line", { x1: gx, x2: gx, y1: 30, y2: H - 30, class: "vf-grid" });
    mk("line", { x1: p.x0 + 16, x2: p.x0 + p.w - 16, y1: FLOOR, y2: FLOOR, class: "vf-floor" });
    const c = (x, y, dx, dy) => mk("path", { d: `M${x} ${y + dy * 18}V${y}H${x + dx * 18}`, class: "vf-corner" });
    c(p.x0 + 14, 14, 1, 1); c(p.x0 + p.w - 14, 14, -1, 1); c(p.x0 + 14, H - 14, 1, -1); c(p.x0 + p.w - 14, H - 14, -1, -1);
    mk("text", { x: p.x0 + 26, y: 36, class: "vf-label" }).textContent = name === "front" ? "CAM_A · FRONT" : "CAM_B · SIDE";
  }
  mk("line", { x1: 390, x2: 390, y1: 0, y2: H, class: "seam" });
  const fpsTag = mk("text", { x: 974, y: 36, class: "vf-label hot", "text-anchor": "end" });
  fpsTag.textContent = "24 FPS · 11 MARKERS";

  const bonesG = mk("g"), epiG = mk("g"), marksG = mk("g");
  const epiLine = mk("line", { class: "epi", x1: 20, x2: 980 }, epiG);
  const epiA = mk("circle", { r: 9, class: "epi-dot" }, epiG);
  const epiB = mk("circle", { r: 9, class: "epi-dot" }, epiG);
  const epiTag = mk("text", { class: "epi-tag", x: 976, "text-anchor": "end" }, epiG);

  // 骨架定义：腿 = 髋/肩 → 膝 → 足
  const LEGS = [
    { id: "FL", x: 0.26, z: 0.55, off: 0, bend: -1 },
    { id: "FR", x: -0.26, z: 0.55, off: Math.PI, bend: -1 },
    { id: "HL", x: 0.28, z: -0.55, off: Math.PI, bend: 1 },
    { id: "HR", x: -0.28, z: -0.55, off: 0, bend: 1 },
  ];
  function pose(t) {
    const ph = t * Math.PI * 2 / 1.15;
    const bob = Math.sin(ph * 2) * 0.025;
    const spine = [
      { x: 0, y: 1.02 + bob, z: -0.95, n: "TAIL" }, { x: 0, y: 1.0 + bob, z: -0.55, n: "HIP" },
      { x: 0, y: 1.04 + bob, z: 0, n: "SPINE" }, { x: 0, y: 1.08 + bob, z: 0.55, n: "SHLD" },
      { x: 0, y: 1.3 + bob * 1.5, z: 0.92, n: "HEAD" },
    ];
    const legs = LEGS.map((L) => {
      const a = ph + L.off;
      const hip = { x: L.x, y: 0.96 + bob, z: L.z };
      const foot = { x: L.x * 1.05, y: Math.max(0, Math.cos(a)) * 0.2, z: L.z + Math.sin(a) * 0.3 };
      const knee = { x: L.x * 1.03, y: (hip.y + foot.y) / 2 + 0.04, z: (hip.z + foot.z) / 2 + L.bend * 0.13 };
      return { id: L.id, hip, knee, foot };
    });
    return { spine, legs };
  }

  // 躯干体积：侧面是沿脊柱的胶囊 + 头部 + 弯角，正面是椭圆躯干 + 头
  function drawHulls(P) {
    const [tail, hip, mid, shld, head] = P.spine;
    const up = (p, d) => `${sideU(p.z)} ${vy(p.y + d)}`;
    mk("path", { class: "hull", d: `M${up(hip, -0.02)} C${up(hip, 0.2)} ${up(mid, 0.18)} ${up(shld, 0.16)}
      L${up(head, 0.06)} L${sideU(head.z + 0.2)} ${vy(head.y - 0.08)} L${up(head, -0.12)}
      C${up(shld, -0.26)} ${up(mid, -0.3)} ${up(hip, -0.22)} Z` }, bonesG);
    mk("path", { class: "horn", d: `M${sideU(head.z - 0.02)} ${vy(head.y + 0.05)} C${sideU(head.z - 0.1)} ${vy(head.y + 0.32)}
      ${sideU(head.z - 0.34)} ${vy(head.y + 0.34)} ${sideU(head.z - 0.36)} ${vy(head.y + 0.16)}` }, bonesG);
    const fx = frontU(0, 0), fy = vy(mid.y);
    mk("ellipse", { class: "hull", cx: fx, cy: fy, rx: 0.36 * 190, ry: 0.21 * 175 }, bonesG);
    mk("circle", { class: "hull", cx: frontU(head.x, head.z), cy: vy(head.y), r: 24 }, bonesG);
    for (const s of [-1, 1]) {
      mk("path", { class: "horn", d: `M${frontU(head.x, head.z) + s * 14} ${vy(head.y) - 16} C${frontU(head.x, head.z) + s * 40} ${vy(head.y) - 54}
        ${frontU(head.x, head.z) + s * 70} ${vy(head.y) - 40} ${frontU(head.x, head.z) + s * 62} ${vy(head.y) - 18}` }, bonesG);
    }
  }

  let frame = 0, t0 = performance.now(), visible = true;
  function draw(now) {
    // rAF 的时间戳可能早于 t0（同一帧内先取的 performance.now），夹到 0 以免出现负时间
    const t = reduceMotion ? 0.3 : Math.max(0, (now - t0) / 1000);
    const P = pose(t);
    bonesG.replaceChildren(); marksG.replaceChildren();
    const seg = (a, b, far, view) => {
      const [u1, u2] = view === "side" ? [sideU(a.z), sideU(b.z)] : [frontU(a.x, a.z), frontU(b.x, b.z)];
      mk("line", { x1: u1, y1: vy(a.y), x2: u2, y2: vy(b.y), class: "bone-l" + (far ? " far" : "") }, bonesG);
    };
    const dot = (p, far, view) => mk("circle", { cx: view === "side" ? sideU(p.z) : frontU(p.x, p.z), cy: vy(p.y), r: far ? 3.2 : 4.6,
      class: "mk" + (far ? " far" : "") }, marksG);
    drawHulls(P);
    for (const view of ["side", "front"]) {
      // 远侧腿先画，被近侧遮住
      const order = view === "side" ? [...P.legs].sort((a, b) => a.hip.x - b.hip.x) : [...P.legs].sort((a, b) => a.hip.z - b.hip.z);
      for (const L of order) {
        const far = view === "side" ? L.hip.x < 0 : L.hip.z < 0;
        seg(L.hip, L.knee, far, view); seg(L.knee, L.foot, far, view);
        dot(L.knee, far, view); dot(L.foot, far, view);
      }
      for (let i = 0; i < P.spine.length - 1; i++) seg(P.spine[i], P.spine[i + 1], false, view);
      P.spine.forEach((s) => dot(s, false, view));
    }
    // 对极线：轮流高亮一个关节，展示它在两个画面里高度一致
    const targets = [P.legs[0].knee, P.spine[4], P.legs[2].knee, P.spine[0]];
    const names = ["L_KNEE_F", "HEAD", "L_HOCK_H", "TAIL"];
    const k = Math.floor(t / 2.2) % targets.length, j = targets[k], y = vy(j.y);
    epiLine.setAttribute("y1", y); epiLine.setAttribute("y2", y);
    epiA.setAttribute("cx", frontU(j.x, j.z)); epiA.setAttribute("cy", y);
    epiB.setAttribute("cx", sideU(j.z)); epiB.setAttribute("cy", y);
    epiTag.setAttribute("y", y - 8); epiTag.textContent = `${names[k]} · y=${j.y.toFixed(2)}m · 两视角同高`;
    frame = Math.floor(t * 24);
    const ff = (n) => String(n).padStart(2, "0");
    if (clock) clock.textContent = `${ff(Math.floor(t / 3600))}:${ff(Math.floor(t / 60) % 60)}:${ff(Math.floor(t) % 60)}:${ff(frame % 24)}`;
    if (!reduceMotion && visible) requestAnimationFrame(draw);
  }
  new IntersectionObserver(([e]) => { const was = visible; visible = e.isIntersecting; if (visible && !was) requestAnimationFrame(draw); }).observe(stage);
  requestAnimationFrame(draw);
}
