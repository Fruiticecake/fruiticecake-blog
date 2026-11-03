// copy-path：同一条消息走七种路径。拷贝时源数据留在原地，飞过去的是一份副本。
// 拷贝次数依据 Linux 源码：fs/pipe.c、ipc/mqueue.c、net/unix/af_unix.c、net/ipv4/tcp.c、drivers/android/binder.c。
// 画面是按消息能一次放进内核缓冲区的情况画的；大消息要多次系统调用，正文有实测。

import { el, svg, reduceMotion } from "/stage/lib/dom.js";
import { stepper } from "./stepper.js";

const FLY_MS = 650;

/** op：copy 拷贝数据 / signal 只传通知 / pass 数据在内核里流动 / wake 唤醒 / read 原地读取 / make 生产数据 */
const METHODS = [
  {
    key: "pipe", name: "管道 / FIFO", kernel: "管道缓冲区", copies: "kk",
    steps: [
      { op: "make", at: "a", text: "A 把数据写在自己的缓冲区里。这是生产数据，还没开始传输。" },
      { op: "copy", from: "a", to: "k", call: "write()", kind: "kernel", text: "A 调 write() 进入内核，内核把数据拷进管道缓冲区。这是第 1 次拷贝。" },
      { op: "wake", text: "内核唤醒阻塞在 read() 上的 B，这里有一次进程切换。" },
      { op: "copy", from: "k", to: "b", call: "read()", kind: "kernel", text: "B 调 read()，内核把数据拷到 B 的缓冲区。这是第 2 次拷贝。" },
    ],
  },
  {
    key: "mq", name: "POSIX 消息队列", kernel: "内核消息队列", copies: "kk",
    steps: [
      { op: "make", at: "a", text: "A 准备好一条有边界的消息。" },
      { op: "copy", from: "a", to: "k", call: "mq_send()", kind: "kernel", text: "mq_send() 把整条消息拷进内核，消息边界和优先级由内核保存。这是第 1 次拷贝。" },
      { op: "wake", text: "内核按优先级排队，并唤醒等待的 B。" },
      { op: "copy", from: "k", to: "b", call: "mq_receive()", kind: "kernel", text: "mq_receive() 取走最高优先级里最早的一条，拷到 B。这是第 2 次拷贝。" },
    ],
  },
  {
    key: "uds", name: "Unix 域 socket", kernel: "对端接收队列", copies: "kk",
    steps: [
      { op: "make", at: "a", text: "A 准备好数据。" },
      { op: "copy", from: "a", to: "k", call: "send()", kind: "kernel", text: "send() 把数据拷进内核的 sk_buff，直接挂到对端的接收队列，不经过 TCP/IP。这是第 1 次拷贝。" },
      { op: "wake", text: "内核唤醒阻塞在 recv() 上的 B。" },
      { op: "copy", from: "k", to: "b", call: "recv()", kind: "kernel", text: "recv() 把数据拷到 B 的缓冲区。这是第 2 次拷贝。" },
    ],
  },
  {
    key: "tcp", name: "本机 TCP", kernel: "TCP/IP 协议栈", copies: "kk",
    steps: [
      { op: "make", at: "a", text: "A 准备好数据。" },
      { op: "copy", from: "a", to: "k", call: "send()", kind: "kernel", text: "send() 把数据拷进内核的 sk_buff。这是第 1 次拷贝。" },
      { op: "pass", text: "数据要走完 tcp → ip → lo → ip → tcp。不再多拷，但加头、路由、排队、确认都要花时间。" },
      { op: "wake", text: "数据进入对端接收队列，内核唤醒 B。" },
      { op: "copy", from: "k", to: "b", call: "recv()", kind: "kernel", text: "recv() 把数据拷到 B。这是第 2 次拷贝。次数和 Unix 域 socket 一样，多的是协议栈这段路。" },
    ],
  },
  {
    key: "binder", name: "Binder（Android）", kernel: "Binder 缓冲区", mapped: true, copies: "k",
    steps: [
      { op: "make", at: "a", text: "A 把参数打包进事务缓冲区。" },
      { op: "copy", from: "a", to: "k", call: "ioctl()", kind: "kernel", text: "驱动把事务拷进 B 预先映射好的 Binder 缓冲区。这是跨进程唯一的一次拷贝。" },
      { op: "wake", text: "驱动找到 B 的一个线程来处理这次事务。" },
      { op: "read", at: "b", from: "k", text: "同一块内存已映射进 B 的地址空间，B 直接读，不再拷贝。" },
    ],
  },
  {
    key: "shmc", name: "共享内存：先拷再通知", kernel: "eventfd 计数器", shared: true, copies: "u",
    steps: [
      { op: "make", at: "a", text: "A 把数据写在私有缓冲区里，比如来自另一个库的输出。" },
      { op: "copy", from: "a", to: "s", kind: "user", text: "A 用 memcpy 把数据拷进共享区。不进内核，但这仍然是一次拷贝。" },
      { op: "signal", from: "a", to: "k", call: "write(eventfd)", text: "A 只把 8 字节的计数写进内核，数据本身不进内核。" },
      { op: "signal", from: "k", to: "b", call: "read(eventfd)", text: "B 从 read() 返回，知道共享区里有新数据了。" },
      { op: "read", at: "b", from: "s", text: "B 直接读共享区，没有拷贝。" },
    ],
  },
  {
    key: "shmi", name: "共享内存：原地生成", kernel: "eventfd 计数器", shared: true, copies: "",
    steps: [
      { op: "make", at: "s", text: "A 拿到共享区里的一块空间，直接在上面生成数据。这才叫零拷贝。" },
      { op: "signal", from: "a", to: "k", call: "write(eventfd)", text: "A 通知 B。进内核的只有 8 字节计数。" },
      { op: "signal", from: "k", to: "b", call: "read(eventfd)", text: "B 被唤醒。" },
      { op: "read", at: "b", from: "s", text: "B 直接读共享区。全程数据没有被拷贝过，代价是生成方必须改成往共享区里写。" },
    ],
  },
];

function geometry(narrow) {
  return narrow
    ? { w: 400, h: 330, nw: 112, nh: 54, a: [66, 74], b: [334, 74], s: [200, 74], k: [200, 254], line: 164, font: 13, small: 13, laneX: 4 }
    : { w: 660, h: 320, nw: 158, nh: 56, a: [100, 74], b: [560, 74], s: [330, 74], k: [330, 244], line: 158, font: 13.5, small: 12, laneX: 8 };
}

function drawNode(pic, id, [x, y], g, label) {
  const group = svg("g", { class: `ic-node is-${id}` }, pic);
  svg("rect", { x: x - g.nw / 2, y: y - g.nh / 2, width: g.nw, height: g.nh, rx: 3 }, group);
  const text = svg("text", { x, y: y - g.nh / 2 - 8, "text-anchor": "middle", "font-size": g.small, class: "ic-node-label" }, group);
  text.textContent = label;
  return { group, text, pos: [x, y] };
}

function drawChip(pic, g, cls, label) {
  const group = svg("g", { class: `ic-chip ${cls}`, "aria-hidden": "true" }, pic);
  const w = cls.includes("is-signal") ? 34 : 58;
  svg("rect", { x: -w / 2, y: -13, width: w, height: 26, rx: 2 }, group);
  const t = svg("text", { x: 0, y: 4.5, "text-anchor": "middle", "font-size": g.small }, group);
  t.textContent = label;
  return group;
}

const place = (node, [x, y]) => { node.style.transform = `translate(${x}px, ${y}px)`; };

/** 重放到第 n 步，算出每个节点上有没有数据、已经拷贝和调用了多少次。 */
function replay(method, n) {
  const held = new Set();
  let copies = 0, calls = 0, callName = "";
  for (const s of method.steps.slice(0, n + 1)) {
    if (s.op === "make") held.add(s.at);
    if (s.op === "copy") { held.add(s.to); copies += 1; }
    if (s.op === "read") held.add(s.at);
    if (s.call) { calls += 1; callName = s.call; }
  }
  return { held, copies, calls, callName };
}

function buildRows(onPick) {
  const rows = METHODS.map((m, i) => {
    const dots = m.copies
      ? [...m.copies].map((c) => el("i", { class: c === "k" ? "is-kernel" : "is-user" }))
      : [el("i", { class: "is-none" })];
    const row = el("button", { type: "button", class: "ic-row", "aria-pressed": "false" }, [
      el("span", { class: "ic-row-name", text: m.name }),
      el("span", { class: "ic-dots", "aria-label": `拷贝 ${m.copies.length} 次` }, dots),
    ]);
    row.addEventListener("click", () => onPick(i));
    return row;
  });
  return { rows, list: el("div", { class: "ic-rows" }, rows) };
}

export function mountCopyPath(root) {
  const narrow = root.clientWidth < 560;
  root.classList.add("w-ic");
  root.classList.toggle("is-narrow", narrow);
  const g = geometry(narrow);

  const pic = svg("svg", { viewBox: `0 0 ${g.w} ${g.h}`, class: "ic-svg", role: "img",
    "aria-label": "进程 A、进程 B 和内核之间的数据路径，按步骤显示数据在哪里被拷贝" });
  svg("rect", { x: 0, y: g.line, width: g.w, height: g.h - g.line, class: "ic-kernel-band" }, pic);
  svg("line", { x1: 0, x2: g.w, y1: g.line, y2: g.line, class: "ic-boundary" }, pic);
  const laneTop = svg("text", { x: g.laneX, y: g.line - 8, "font-size": g.small, class: "ic-lane" }, pic);
  laneTop.textContent = "用户态";
  const laneBot = svg("text", { x: g.laneX, y: g.line + 18, "font-size": g.small, class: "ic-lane" }, pic);
  laneBot.textContent = "内核态";

  const mapLink = svg("polyline", { class: "ic-map", points: "" }, pic);
  const nodes = {
    a: drawNode(pic, "a", g.a, g, "进程 A"),
    b: drawNode(pic, "b", g.b, g, "进程 B"),
    s: drawNode(pic, "s", g.s, g, "共享区"),
    k: drawNode(pic, "k", g.k, g, ""),
  };
  const held = Object.fromEntries(Object.keys(nodes).map((id) => {
    const chip = drawChip(pic, g, "is-held", "DATA");
    place(chip, nodes[id].pos);
    return [id, chip];
  }));
  const flyer = drawChip(pic, g, "is-fly", "DATA");
  const bell = drawChip(pic, g, "is-signal", "8B");

  const copiesEl = el("b", { class: "ic-stat-v" });
  const callsEl = el("b", { class: "ic-stat-v" });
  const callEl = el("code", { class: "ic-call" });
  const stats = el("div", { class: "ic-stats", "aria-live": "polite" }, [
    el("span", {}, ["数据拷贝 ", copiesEl, " 次"]),
    el("span", {}, ["系统调用 ", callsEl, " 次"]),
    callEl,
  ]);
  const caption = el("p", { class: "ic-cap", "aria-live": "polite" });

  let method = METHODS[0], landing = null;

  function fly(chip, from, to, done) {
    chip.classList.add("no-anim", "is-on");
    place(chip, from);
    chip.getBoundingClientRect();
    chip.classList.remove("no-anim");
    place(chip, to);
    clearTimeout(landing);
    landing = setTimeout(() => { chip.classList.remove("is-on"); done?.(); }, FLY_MS);
  }

  function show(n, animate) {
    clearTimeout(landing);
    flyer.classList.remove("is-on");
    bell.classList.remove("is-on");
    const step = method.steps[n];
    const state = replay(method, n);
    const moving = animate && !reduceMotion && step.from;

    for (const [id, chip] of Object.entries(held)) {
      const pending = moving && step.op === "copy" && step.to === id;
      chip.classList.toggle("is-on", state.held.has(id) && !pending);
    }
    pic.classList.toggle("is-waking", step.op === "wake");
    pic.classList.toggle("is-passing", step.op === "pass");

    if (moving && step.op === "copy") {
      fly(flyer, nodes[step.from].pos, nodes[step.to].pos, () => held[step.to].classList.add("is-on"));
    } else if (moving && step.op === "signal") {
      fly(bell, nodes[step.from].pos, nodes[step.to].pos);
    }

    copiesEl.textContent = state.copies;
    callsEl.textContent = state.calls;
    callEl.textContent = state.callName;
    caption.textContent = step.text;
  }

  const ctrl = stepper(root, { render: show });

  function pick(i, autoplay) {
    method = METHODS[i];
    rows.forEach((r, j) => r.setAttribute("aria-pressed", String(j === i)));
    nodes.k.text.textContent = method.kernel;
    nodes.s.group.style.display = method.shared ? "" : "none";
    const [kx, ky] = nodes.k.pos, [bx, by] = nodes.b.pos;
    mapLink.setAttribute("points", method.mapped ? `${kx + g.nw / 2},${ky} ${bx},${ky} ${bx},${by + g.nh / 2}` : "");
    ctrl.load(method.steps.length, autoplay);
  }

  const { rows, list } = buildRows((i) => pick(i, true));
  const legend = el("p", { class: "ic-legend" }, [
    el("span", {}, [el("i", { class: "is-kernel" }), "经过内核的拷贝"]),
    el("span", {}, [el("i", { class: "is-user" }), "用户态的拷贝"]),
    el("span", {}, [el("i", { class: "is-none" }), "没有拷贝"]),
  ]);
  const stage = el("div", { class: "ic-stage" }, [pic, stats, caption, ctrl.bar]);
  root.setAttribute("tabindex", "0");
  root.append(el("div", { class: "ic-grid" }, [el("div", { class: "ic-side" }, [list, legend]), stage]));
  pick(0, false);
}
