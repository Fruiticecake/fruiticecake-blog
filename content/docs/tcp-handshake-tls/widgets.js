// 本文专属组件：首屏连线图 / TCP 状态机 / 重启模拟 / TLS 往返对比。
// 约定：导出 widgets 与 heroes，键是组件名，值是 mount(root, ctx)。
// 协议流程来自 RFC 9293 / 8446 / 5246；倒计时加速、RTT 毫秒数等为图解，组件内标注「示意」。

import { svg, el, reduceMotion, onceVisible } from "/stage/lib/dom.js";

/* ------------------------------------------------------------------
   公共：时序图（两条生命线 + 斜向报文）
------------------------------------------------------------------ */
const C2S = 1, S2C = -1;

/** 画一条报文：从一侧生命线斜向下到另一侧，末端是手画的箭头（不依赖 marker）。 */
function drawMsg(parent, m, geo, y) {
  const [xa, xb] = m.dir === C2S ? [geo.left, geo.right] : [geo.right, geo.left];
  const y2 = y + geo.drop;
  const g = svg("g", { class: `lad-msg k-${m.kind || "tcp"}${m.enc ? " is-enc" : ""}` }, parent);
  svg("line", { x1: xa, y1: y, x2: xb, y2, pathLength: 1, class: "lad-line" }, g);
  const ang = Math.atan2(y2 - y, xb - xa), s = geo.head;
  const p = (a) => `${xb - s * Math.cos(ang + a)},${y2 - s * Math.sin(ang + a)}`;
  svg("polygon", { points: `${xb},${y2} ${p(0.45)} ${p(-0.45)}`, class: "lad-head" }, g);
  const label = svg("text", { x: (xa + xb) / 2, y: (y + y2) / 2 - geo.font * 0.55, "text-anchor": "middle",
    class: "lad-label", "font-size": geo.font }, g);
  label.textContent = (m.enc ? "🔒 " : "") + m.text;
  return g;
}

/** 两条生命线和顶部标签。 */
function drawLifelines(parent, geo, names) {
  for (const [x, name] of [[geo.left, names[0]], [geo.right, names[1]]]) {
    svg("line", { x1: x, x2: x, y1: geo.top - 6, y2: geo.bottom, class: "lad-life" }, parent);
    svg("text", { x, y: geo.top - 14, "text-anchor": "middle", class: "lad-name", "font-size": geo.font }, parent)
      .textContent = name;
  }
}

/** 按 RTT 画底色条带：每两条报文（去 + 回）算一个往返。 */
function drawRttBands(parent, geo, count) {
  for (let i = 0; i < count; i++) {
    const y = geo.top + i * 2 * geo.row - geo.row * 0.25;
    const g = svg("g", { class: "lad-band" }, parent);
    svg("rect", { x: geo.left, y, width: geo.right - geo.left, height: geo.row * 2, class: i % 2 ? "odd" : "" }, g);
    svg("text", { x: geo.right + 8, y: y + geo.row, class: "lad-rtt", "font-size": geo.font * 0.85 }, g)
      .textContent = `RTT ${i + 1}`;
  }
}

/* ------------------------------------------------------------------
   1. 首屏：一条全新 HTTPS 连接的时序（TCP → TLS 1.3 → HTTP），循环播放
------------------------------------------------------------------ */
const HERO_MSGS = [
  { dir: C2S, text: "SYN", kind: "tcp" },
  { dir: S2C, text: "SYN+ACK", kind: "tcp" },
  { dir: C2S, text: "ACK · ClientHello + key_share", kind: "tls" },
  { dir: S2C, text: "ServerHello · {Cert, Verify, Finished}", kind: "tls", enc: true },
  { dir: C2S, text: "{Finished} · GET /", kind: "http", enc: true },
  { dir: S2C, text: "200 OK", kind: "http", enc: true },
];

function heroGeometry(narrow) {
  return narrow
    ? { w: 520, h: 520, left: 70, right: 400, top: 70, row: 66, drop: 40, head: 9, font: 15 }
    : { w: 1000, h: 380, left: 180, right: 800, top: 62, row: 48, drop: 30, head: 9, font: 15 };
}

function mountWireHero(figure) {
  const narrow = figure.clientWidth < 560;
  const geo = heroGeometry(narrow);
  geo.bottom = geo.top + HERO_MSGS.length * geo.row + 6;
  const root = svg("svg", { viewBox: `0 0 ${geo.w} ${geo.h}`, class: "wire-hero", role: "img",
    "aria-label": "一条全新 HTTPS 连接的时序：TCP 三次握手、TLS 1.3 握手、HTTP 请求，共 3 个往返" });
  drawRttBands(root, geo, 3);
  drawLifelines(root, geo, ["CLIENT", "SERVER :443"]);
  const msgs = HERO_MSGS.map((m, i) => drawMsg(root, m, geo, geo.top + i * geo.row));
  const tag = svg("text", { x: geo.w - 20, y: 30, "text-anchor": "end", class: "vf-label hot" }, root);
  figure.append(root, el("figcaption", { class: "viewer-cap" }, [
    el("span", {}, [el("i", { class: "k-tcp" }), "TCP 握手"]),
    el("span", {}, [el("i", { class: "k-tls" }), "TLS 1.3 握手"]),
    el("span", {}, [el("i", { class: "k-http" }), "HTTP"]),
    el("span", { text: "🔒 = 已加密" }),
  ]));

  const show = (n) => {
    msgs.forEach((g, i) => g.classList.toggle("is-on", i < n));
    tag.textContent = n ? `RTT ${Math.ceil(n / 2)} / 3` : "CONNECTING";
  };
  if (reduceMotion) { show(msgs.length); tag.textContent = "3 RTT · FIRST BYTE"; return; }

  let n = 0, visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(figure);
  const tick = () => {
    if (visible) {
      n = n > msgs.length + 3 ? 0 : n + 1;         // 播完停顿几拍再从头开始
      show(Math.min(n, msgs.length));
      if (n === msgs.length) tag.textContent = "3 RTT · FIRST BYTE";
    }
    setTimeout(tick, n === 0 ? 500 : 900);
  };
  setTimeout(tick, 1200);
}

/* ------------------------------------------------------------------
   2. TCP 状态机：mode="open" 三次握手 / mode="close" 四次挥手（可切到「忘了 close()」）
------------------------------------------------------------------ */
const FLOWS = {
  open: {
    names: ["CLIENT", "SERVER"],
    msgs: [
      { dir: C2S, text: "SYN seq=x" },
      { dir: S2C, text: "SYN+ACK seq=y ack=x+1" },
      { dir: C2S, text: "ACK ack=y+1" },
    ],
    steps: [
      { st: ["CLOSED", "LISTEN"], text: "服务端调用 listen()，客户端准备 connect()。" },
      { st: ["SYN_SENT", "SYN_RCVD"], text: "客户端发 SYN，带上自己的初始序号 x；服务端收到后回 SYN+ACK。" },
      { st: ["ESTABLISHED", "SYN_RCVD"], text: "客户端收到 SYN+ACK（确认 x+1，并带来服务端的序号 y），回 ACK 后 connect() 返回。" },
      { st: ["ESTABLISHED", "ESTABLISHED"], text: "服务端收到 ACK，连接进入 accept 队列，等应用 accept() 取走。两个方向的序号都已同步。" },
    ],
  },
  close: {
    names: ["主动方", "被动方"],
    msgs: [
      { dir: C2S, text: "FIN" },
      { dir: S2C, text: "ACK" },
      { dir: S2C, text: "FIN（应用调用 close()）" },
      { dir: C2S, text: "ACK" },
    ],
    steps: [
      { st: ["ESTABLISHED", "ESTABLISHED"], text: "连接正常，主动方的应用准备调用 close()。" },
      { st: ["FIN_WAIT_1", "CLOSE_WAIT"], text: "主动方发 FIN；被动方的内核收到后立刻回 ACK，进入 CLOSE_WAIT，等自己的应用 close()。" },
      { st: ["FIN_WAIT_2", "CLOSE_WAIT"], text: "主动方收到 ACK，进入 FIN_WAIT_2：自己这个方向关了，等对方的 FIN。" },
      { st: ["TIME_WAIT", "LAST_ACK"], text: "被动方的应用调用 close()，内核发出 FIN，进入 LAST_ACK。" },
      { st: ["TIME_WAIT", "CLOSED"], text: "主动方回 ACK 后进入 TIME_WAIT，要再等 2MSL（Linux 为 60 秒）才释放；被动方收到 ACK 直接关闭。", timeWait: true },
    ],
    bugSteps: [
      { st: ["FIN_WAIT_2", "CLOSE_WAIT"], stuck: true,
        text: "被动方的代码忘了调 close()：它永远停在 CLOSE_WAIT，fd 一直占着，内核不会替它关。主动方的孤儿连接在 tcp_fin_timeout 后被内核回收。" },
    ],
  },
};
const HOT = new Set(["TIME_WAIT", "CLOSE_WAIT"]);
const TIME_WAIT_SECS = 60, TW_DEMO_MS = 3000;

function badge(side) {
  return el("div", { class: `tcp-side tcp-${side}` }, [el("span", { class: "tcp-who" }), el("b", { class: "tcp-state" })]);
}

function setBadge(node, who, state, stuck) {
  node.querySelector(".tcp-who").textContent = who;
  node.querySelector(".tcp-state").textContent = state;
  node.classList.toggle("is-est", state === "ESTABLISHED");
  node.classList.toggle("is-hot", HOT.has(state) && !stuck);
  node.classList.toggle("is-stuck", Boolean(stuck));
}

function mountTcpFlow(root, ctx) {
  const flow = FLOWS[ctx.props.mode];
  if (!flow) throw new Error(`tcp-flow：mode 只能是 ${Object.keys(FLOWS).join(" / ")}`);
  root.classList.add("w-tcp");
  const geo = { left: 70, right: 370, top: 40, row: 54, drop: 30, head: 8, font: 13 };
  geo.bottom = geo.top + flow.msgs.length * geo.row;
  const pic = svg("svg", { viewBox: `0 0 440 ${geo.bottom + 10}`, class: "tcp-svg", role: "img",
    "aria-label": `${flow.names[0]}与${flow.names[1]}之间的报文时序` });
  drawLifelines(pic, geo, flow.names);
  const msgs = flow.msgs.map((m, i) => drawMsg(pic, m, geo, geo.top + i * geo.row));
  const stuckMark = svg("text", { x: geo.right - 10, y: geo.top + 2 * geo.row - 8, "text-anchor": "end",
    class: "tcp-stuck", "font-size": 13 }, pic);
  stuckMark.textContent = "…等待 close() ∞";

  const left = badge("l"), right = badge("r");
  const caption = el("p", { class: "tcp-cap", "aria-live": "polite" });
  const counter = el("span", { class: "tcp-count" });
  const prev = el("button", { type: "button", class: "tcp-btn", "aria-label": "上一步", text: "←" });
  const next = el("button", { type: "button", class: "tcp-btn is-primary", "aria-label": "下一步", text: "→" });
  const bugBtn = el("button", { type: "button", class: "tcp-bug", "aria-pressed": "false", text: "被动方忘了 close()" });
  const controls = el("div", { class: "tcp-ctrl" }, [prev, counter, next]);
  if (flow.bugSteps) controls.append(bugBtn);

  let step = 0, bug = false, twTimer = null, auto = null;
  const steps = () => (bug ? [...flow.steps.slice(0, 3), ...flow.bugSteps] : flow.steps);

  function render() {
    clearInterval(twTimer);
    const all = steps(), s = all[step];
    const shownMsgs = bug ? Math.min(step, 2) : step;
    // 忘了 close() 时，后两条报文画成虚线「幽灵」：本该发生、却永远不会发生
    msgs.forEach((g, i) => {
      const ghost = Boolean(s.stuck) && i >= 2;
      g.classList.toggle("is-ghost", ghost);
      g.classList.toggle("is-on", ghost || i < shownMsgs);
    });
    stuckMark.classList.toggle("is-on", Boolean(s.stuck));
    setBadge(left, flow.names[0], s.st[0]);
    setBadge(right, flow.names[1], s.st[1], s.stuck);
    caption.textContent = s.text;
    counter.textContent = `STEP ${String(step).padStart(2, "0")} / ${String(all.length - 1).padStart(2, "0")}`;
    prev.disabled = step === 0; next.disabled = step === all.length - 1;
    if (s.timeWait) startTimeWait();
  }

  function startTimeWait() {
    const state = left.querySelector(".tcp-state"), t0 = performance.now();
    const tick = () => {
      const left60 = Math.max(0, TIME_WAIT_SECS - Math.round((performance.now() - t0) / TW_DEMO_MS * TIME_WAIT_SECS));
      state.textContent = left60 ? `TIME_WAIT · ${left60}s` : "CLOSED";
      left.classList.toggle("is-hot", left60 > 0);
      if (!left60) clearInterval(twTimer);
    };
    if (reduceMotion) { state.textContent = `TIME_WAIT · ${TIME_WAIT_SECS}s`; return; }
    twTimer = setInterval(tick, 100);
  }

  const go = (d) => { step = Math.max(0, Math.min(steps().length - 1, step + d)); render(); };
  const manual = () => { clearInterval(auto); auto = null; };
  prev.addEventListener("click", () => { manual(); go(-1); });
  next.addEventListener("click", () => { manual(); go(1); });
  bugBtn.addEventListener("click", () => {
    manual(); bug = !bug; bugBtn.setAttribute("aria-pressed", String(bug));
    step = Math.min(step, steps().length - 1); render();
  });
  root.addEventListener("keydown", (e) => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (d) { e.preventDefault(); manual(); go(d); }
  });

  root.append(el("div", { class: "tcp-sides" }, [left, right]), pic, caption, controls,
    el("p", { class: "w-caption", text: "示意：TIME_WAIT 倒计时加速播放，真实时长为 60 秒。" }));
  render();
  onceVisible(root, () => {
    if (reduceMotion) return;
    auto = setInterval(() => { if (step >= steps().length - 1) manual(); else go(1); }, 1700);
  });
}

/* ------------------------------------------------------------------
   3. 重启模拟：SO_REUSEADDR 开 / 关，旧进程退出 / 未退出
------------------------------------------------------------------ */
const RESTART_DEMO_MS = 6000;   // 60 秒的 TIME_WAIT 压缩到 6 秒播放

function sockRow(state, peer, extra = "") {
  return el("li", { class: `rs-sock s-${state.toLowerCase()}` }, [
    el("span", { class: "rs-state", text: state }), el("span", { class: "rs-addr", text: `:8080 ⇄ ${peer}` }),
    el("span", { class: "rs-extra", text: extra }),
  ]);
}

function mountPortRestart(root) {
  root.classList.add("w-rs");
  const reuse = el("button", { type: "button", class: "rs-toggle", "aria-pressed": "false", text: "SO_REUSEADDR" });
  const alive = el("button", { type: "button", class: "rs-toggle is-warn", "aria-pressed": "false", text: "旧进程还没退出" });
  const restart = el("button", { type: "button", class: "rs-go", text: "重启服务 ↻" });
  const table = el("ul", { class: "rs-table", "aria-label": "8080 端口上的 socket" });
  const term = el("ol", { class: "rs-term", "aria-live": "polite" });
  root.append(el("div", { class: "rs-bar" }, [reuse, alive, restart]),
    el("div", { class: "rs-grid" }, [
      el("div", {}, [el("p", { class: "rs-h", text: "ss -tan '( sport = :8080 )'" }), table]),
      el("div", {}, [el("p", { class: "rs-h", text: "TERMINAL" }), term]),
    ]),
    el("p", { class: "w-caption", text: "示意：TIME_WAIT 的 60 秒压缩成 6 秒播放；进程号和客户端地址为虚构。" }));

  const PEERS = ["10.0.3.17:51022", "10.0.3.17:51040", "10.0.8.2:44310"];
  let timer = null, pid = 4121;
  const log = (text, cls = "") => { term.append(el("li", { class: cls, text })); while (term.children.length > 6) term.firstChild.remove(); };
  const idle = () => {
    table.replaceChildren(sockRow("LISTEN", "*:*", `pid ${pid}`), ...PEERS.map((p) => sockRow("ESTAB", p, `pid ${pid}`)));
  };
  const toggle = (b) => b.addEventListener("click", () => b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")));
  toggle(reuse); toggle(alive);

  function bind(twLeft) {
    const isReuse = reuse.getAttribute("aria-pressed") === "true";
    const isAlive = alive.getAttribute("aria-pressed") === "true";
    if (isAlive) return { ok: false, why: "旧进程仍在 LISTEN，SO_REUSEADDR 也帮不了" };
    if (twLeft > 0 && !isReuse) return { ok: false, why: `端口上还有 ${PEERS.length} 个 TIME_WAIT` };
    return { ok: true };
  }

  /** 尝试一次 bind；成功时新进程开始监听。 */
  function attempt(twLeft) {
    const r = bind(twLeft);
    if (!r.ok) { log(`bind: Address already in use（${r.why}）`, "err"); return false; }
    pid += 1;
    table.prepend(sockRow("LISTEN", "*:*", `pid ${pid}`));
    log(`listening on 0.0.0.0:8080 (pid ${pid})`, "ok");
    return true;
  }

  function expireTimeWait(note) {
    table.querySelectorAll(".s-time_wait").forEach((n) => n.remove());
    log(note);
    attempt(0);
    restart.disabled = false;
  }

  function run() {
    clearInterval(timer);
    restart.disabled = true;
    term.replaceChildren();
    const isAlive = alive.getAttribute("aria-pressed") === "true";
    log(isAlive ? "$ ./server   # 旧进程还在跑" : `$ kill ${pid} && ./server`);
    table.replaceChildren(...(isAlive
      ? [sockRow("LISTEN", "*:*", `pid ${pid}`)]
      : PEERS.map((p) => sockRow("TIME_WAIT", p, "60s"))));
    if (attempt(isAlive ? 0 : TIME_WAIT_SECS) || isAlive) { restart.disabled = false; return; }

    log("每秒重试一次……", "dim");
    if (reduceMotion) { expireTimeWait("（60 秒后）TIME_WAIT 全部过期"); return; }
    const t0 = performance.now();
    timer = setInterval(() => {
      const secs = Math.max(0, TIME_WAIT_SECS - Math.round((performance.now() - t0) / RESTART_DEMO_MS * TIME_WAIT_SECS));
      table.querySelectorAll(".s-time_wait .rs-extra").forEach((n) => { n.textContent = `${secs}s`; });
      if (secs > 0) return;
      clearInterval(timer);
      expireTimeWait("TIME_WAIT 全部过期");
    }, 100);
  }

  restart.addEventListener("click", run);
  idle();
  log("$ ./server");
  log(`listening on 0.0.0.0:8080 (pid ${pid})`, "ok");
}

/* ------------------------------------------------------------------
   4. TLS 1.2 vs 1.3：数往返
------------------------------------------------------------------ */
const TCP_PAIR = [
  { dir: C2S, text: "SYN", kind: "tcp" },
  { dir: S2C, text: "SYN+ACK", kind: "tcp" },
];
const TLS_FLOWS = {
  "1.3": [
    ...TCP_PAIR,
    { dir: C2S, text: "ACK · ClientHello + key_share", kind: "tls" },
    { dir: S2C, text: "ServerHello · {EE, Cert, CV, Fin}", kind: "tls", enc: true },
    { dir: C2S, text: "{Finished} · GET /", kind: "http", enc: true },
    { dir: S2C, text: "200 OK", kind: "http", enc: true },
  ],
  "1.2": [
    ...TCP_PAIR,
    { dir: C2S, text: "ACK · ClientHello", kind: "tls" },
    { dir: S2C, text: "ServerHello · Cert · SKE · Done", kind: "tls" },
    { dir: C2S, text: "CKE · CCS · {Finished}", kind: "tls", enc: true },
    { dir: S2C, text: "CCS · {Finished}", kind: "tls", enc: true },
    { dir: C2S, text: "GET /", kind: "http", enc: true },
    { dir: S2C, text: "200 OK", kind: "http", enc: true },
  ],
};
const RTT_CHOICES = [20, 80, 150];

function mountTlsCompare(root) {
  root.classList.add("w-tls");
  const geo = { left: 60, right: 380, top: 40, row: 38, drop: 22, head: 7, font: 12.5 };
  const maxRows = Math.max(...Object.values(TLS_FLOWS).map((f) => f.length));
  geo.bottom = geo.top + maxRows * geo.row;
  const pic = svg("svg", { viewBox: `0 0 450 ${geo.bottom + 8}`, class: "tls-svg", role: "img" });
  const total = el("b", { class: "tls-total" });
  const detail = el("span", { class: "tls-detail", "aria-live": "polite" });
  const verBtns = Object.keys(TLS_FLOWS).map((v) => el("button", { type: "button", class: "tls-ver", "aria-pressed": "false", text: `TLS ${v}` }));
  const rttBtns = RTT_CHOICES.map((ms) => el("button", { type: "button", class: "tls-rtt", "aria-pressed": "false", text: `${ms} ms` }));
  let ver = "1.3", rtt = 80;

  function render(animate) {
    const flow = TLS_FLOWS[ver], rtts = flow.length / 2;
    pic.replaceChildren();
    pic.setAttribute("aria-label", `TLS ${ver} 的完整时序，首个响应需要 ${rtts} 个往返`);
    drawRttBands(pic, geo, rtts);
    drawLifelines(pic, geo, ["CLIENT", "SERVER"]);
    const gs = flow.map((m, i) => drawMsg(pic, m, geo, geo.top + i * geo.row));
    gs.forEach((g, i) => {
      if (!animate || reduceMotion) { g.classList.add("is-on"); return; }
      g.style.setProperty("--d", `${i * 0.28}s`);
      requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add("is-on")));
    });
    verBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.textContent.endsWith(ver))));
    rttBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === `${rtt} ms`)));
    total.textContent = `${rtts} RTT`;
    detail.textContent = `首个响应到达 ≈ ${rtts} × ${rtt} ms = ${rtts * rtt} ms（其中 TLS 握手占 ${rtts - 2} 个往返）`;
  }
  verBtns.forEach((b) => b.addEventListener("click", () => { ver = b.textContent.slice(4); render(true); }));
  rttBtns.forEach((b) => b.addEventListener("click", () => { rtt = parseInt(b.textContent, 10); render(false); }));

  root.append(
    el("div", { class: "tls-bar" }, [el("div", { class: "tls-group", role: "group", "aria-label": "TLS 版本" }, verBtns),
      el("div", { class: "tls-group", role: "group", "aria-label": "网络往返时延" }, [el("span", { class: "tls-lab", text: "RTT" }), ...rttBtns])]),
    pic,
    el("p", { class: "tls-sum" }, [total, detail]),
    el("p", { class: "w-caption", text: "示意：按理想网络计算，不含丢包、慢启动和服务器处理时间；{ } 和 🔒 表示该报文已加密。" }));
  render(false);
  onceVisible(root, () => render(true));
}

export const widgets = { "tcp-flow": mountTcpFlow, "port-restart": mountPortRestart, "tls-compare": mountTlsCompare };
export const heroes = { wire: mountWireHero };
