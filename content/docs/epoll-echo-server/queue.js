// 动图 1：三次握手与 accept 队列。客户端（nc）/ 内核 / 用户程序三栏，逐步演示握手由内核完成、
// accept 队列非空时监听 socket 可读、epoll_wait 返回 fd 3、accept 取走连接得到 fd 5。
// 行为依据 listen(2)、epoll(7) 与内核 5.x 源码；队列满的表现取决于内核参数，组件内注明。

import { el } from "/stage/lib/dom.js";
import { stepper } from "./stepper.js";

const CODE = [
  { key: "listen", text: "listen(listen_fd, 128);" },
  { key: "ctl", text: "epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev);" },
  { key: "wait", text: "int n = epoll_wait(epfd, events, MAX_EVENTS, -1);" },
  { key: "fd", text: "int fd = events[i].data.fd;" },
  { key: "accept", text: "int conn_fd = accept(listen_fd, ...);" },
];

// 每一步的完整画面。clients：[名字, 状态]；syn / acc：队列里的连接；wire：线上的报文 [方向, 文字]。
const STEPS = [
  { caption: "程序还没运行：内核里没有这个端口的监听 socket，nc 此时去连会被拒绝。",
    user: { st: "未运行" } },
  { caption: "socket → bind → listen：内核里出现监听 socket（fd 3），带着两个队列。listen 的第二个参数 128 是 accept 队列的上限。",
    listen: true, user: { st: "运行中", line: "listen", vars: { listen_fd: 3 } } },
  { caption: "epoll_create1 得到 fd 4，epoll_ctl 把 fd 3 登记进去，然后程序阻塞在 epoll_wait，进入睡眠。",
    listen: true, epoll: { interest: [3] },
    user: { st: "阻塞 · epoll_wait", sleep: true, line: "wait", vars: { listen_fd: 3, epfd: 4 } } },
  { caption: "客户端发 SYN，内核把这个半连接记进 SYN 队列。用户程序还在睡，一行代码都没执行。",
    listen: true, epoll: { interest: [3] }, syn: ["nc#1"], wire: [["ck", "SYN"]], clients: [["nc#1", "SYN_SENT"]],
    zero: true, user: { st: "阻塞 · epoll_wait", sleep: true, line: "wait", vars: { listen_fd: 3, epfd: 4 } } },
  { caption: "内核回 SYN+ACK，客户端回 ACK：握手完成，连接从 SYN 队列移到 accept 队列。nc 的 connect() 已经返回——而用户程序仍然一行代码都没执行。",
    listen: true, epoll: { interest: [3] }, acc: ["nc#1"], wire: [["kc", "SYN+ACK"], ["ck", "ACK"]],
    clients: [["nc#1", "ESTABLISHED"]], zero: true,
    user: { st: "阻塞 · epoll_wait", sleep: true, line: "wait", vars: { listen_fd: 3, epfd: 4 } } },
  { caption: "accept 队列从空变成非空，监听 socket 变成「可读」。listen_fd = 3 这个数字没变，变的是它背后 socket 的状态。",
    listen: true, readable: true, epoll: { interest: [3] }, acc: ["nc#1"], clients: [["nc#1", "ESTABLISHED"]], zero: true,
    user: { st: "阻塞 · epoll_wait", sleep: true, line: "wait", vars: { listen_fd: 3, epfd: 4 } } },
  { caption: "回调把 fd 3 挂上就绪链表，epoll_wait 醒来返回 n = 1，events[0].data.fd == 3。",
    listen: true, readable: true, epoll: { interest: [3], ready: [3] }, acc: ["nc#1"], clients: [["nc#1", "ESTABLISHED"]],
    user: { st: "运行中", line: "fd", vars: { listen_fd: 3, epfd: 4, n: 1, "events[0].data.fd": 3 } } },
  { caption: "fd == listen_fd，调用 accept()：从 accept 队列取走这个连接，得到新的 conn_fd = 5。队列又空了，监听 socket 不再可读。",
    listen: true, epoll: { interest: [3, 5] }, conn: true, clients: [["nc#1", "ESTABLISHED"]],
    user: { st: "运行中", line: "accept", vars: { listen_fd: 3, epfd: 4, n: 1, conn_fd: 5 } } },
  { caption: "实验：如果程序一直不 accept，nc#2、nc#3 照样握手成功，只是排在 accept 队列里。队列一直非空，epoll（默认水平触发）每次都会报告 fd 3。",
    exp: true, listen: true, readable: true, epoll: { interest: [3, 5], ready: [3] }, conn: true,
    acc: ["nc#2", "nc#3"], wire: [["ck", "ACK"]],
    clients: [["nc#1", "ESTABLISHED"], ["nc#2", "ESTABLISHED"], ["nc#3", "ESTABLISHED"]],
    user: { st: "不 accept", line: "fd", vars: { listen_fd: 3, epfd: 4, n: 1, "events[0].data.fd": 3 } } },
  { caption: "队列排满 128 个之后，新来的 SYN 被直接丢弃，客户端收不到 SYN+ACK，只能重传。最后一个 ACK 到达时队列已满的情况，默认丢 ACK、设了 tcp_abort_on_overflow=1 则回 RST——取决于内核参数。",
    exp: true, full: true, listen: true, readable: true, epoll: { interest: [3, 5], ready: [3] }, conn: true,
    acc: ["nc#2", "nc#3", "…", "nc#129"], wire: [["ck", "SYN", true]],
    clients: [["nc#1", "ESTABLISHED"], ["nc#2", "ESTABLISHED"], ["…", "ESTABLISHED"], ["nc#130", "SYN_SENT · 重传"]],
    user: { st: "不 accept", line: "fd", vars: { listen_fd: 3, epfd: 4, n: 1, "events[0].data.fd": 3 } } },
];

const panel = (cls, head, body) =>
  el("div", { class: `aq-col ${cls}` }, [el("p", { class: "aq-head", text: head }), ...body]);

const chips = (node, items, cls) => node.replaceChildren(...items.map((t) => el("span", { class: `aq-chip ${cls}`, text: t })));

export function mountAcceptQueue(root) {
  root.classList.add("w-aq");
  if (root.clientWidth < 680) root.classList.add("is-narrow");

  // 客户端栏
  const clientList = el("ul", { class: "aq-clients" });
  // 线：报文从一侧飞向另一侧
  const wire = el("div", { class: "aq-wire", "aria-hidden": "true" });
  // 内核栏
  const lstate = el("b", { class: "aq-lstate" });
  const lamp = el("span", { class: "aq-lamp", text: "EPOLLIN · 可读" });
  const listenCard = el("div", { class: "aq-card aq-listen" }, [
    el("div", { class: "aq-row" }, [el("span", { class: "aq-fd", text: "fd 3" }), el("span", { class: "aq-arrow", text: "→" }), el("span", { text: "监听 socket " }), lstate]),
    lamp,
  ]);
  const synQ = el("div", { class: "aq-slots" });
  const accQ = el("div", { class: "aq-slots" });
  const meter = el("span", { class: "aq-meter" });
  const queues = el("div", { class: "aq-queues" }, [
    el("div", { class: "aq-q" }, [el("p", { class: "aq-qname" }, [el("span", { text: "SYN 队列" }), el("small", { text: "半连接" })]), synQ]),
    el("div", { class: "aq-q aq-acc" }, [el("p", { class: "aq-qname" }, [el("span", { text: "accept 队列" }), el("small", { text: "全连接" }), meter]), accQ]),
  ]);
  const interest = el("span", { class: "aq-list" });
  const ready = el("span", { class: "aq-list aq-ready" });
  const epollCard = el("div", { class: "aq-card aq-epoll" }, [
    el("div", { class: "aq-row" }, [el("span", { class: "aq-fd", text: "fd 4" }), el("span", { class: "aq-arrow", text: "→" }), el("span", { text: "epoll 实例" })]),
    el("div", { class: "aq-row aq-sub" }, [el("span", { text: "兴趣列表" }), interest]),
    el("div", { class: "aq-row aq-sub" }, [el("span", { text: "就绪链表" }), ready]),
  ]);
  const connCard = el("div", { class: "aq-card aq-conn" }, [
    el("div", { class: "aq-row" }, [el("span", { class: "aq-fd", text: "fd 5" }), el("span", { class: "aq-arrow", text: "→" }), el("span", { text: "已连接 socket（nc#1）" })]),
  ]);
  // 用户栏
  const ustate = el("p", { class: "aq-ustate" });
  const zero = el("p", { class: "aq-zero", text: "本步执行的用户代码：0 行" });
  const code = el("ol", { class: "aq-code" }, CODE.map((c) => el("li", { "data-k": c.key, text: c.text })));
  const vars = el("dl", { class: "aq-vars" });

  const grid = el("div", { class: "aq-grid" }, [
    panel("aq-client", "客户端 · nc", [clientList]),
    wire,
    panel("aq-kernel", "内核", [listenCard, queues, epollCard, connCard]),
    panel("aq-user", "用户程序 · demo", [ustate, zero, code, vars]),
  ]);
  const caption = el("p", { class: "aq-cap", "aria-live": "polite" });
  const badge = el("p", { class: "aq-exp", text: "实验：程序不调用 accept" });

  function render(i) {
    const s = STEPS[i];
    root.classList.toggle("is-exp", Boolean(s.exp));
    clientList.replaceChildren(...(s.clients || []).map(([who, st]) =>
      el("li", { class: st.startsWith("ESTAB") ? "is-est" : st.includes("重传") ? "is-drop" : "" }, [
        el("span", { text: who }), el("b", { text: st })])));
    if (!s.clients) clientList.append(el("li", { class: "aq-empty", text: "还没有客户端" }));

    wire.replaceChildren(...(s.wire || []).map(([dir, text, drop], k) =>
      el("span", { class: `aq-pkt is-${dir}${drop ? " is-drop" : ""}`, style: `--k:${k}`, text: drop ? `${text} ✕ 丢弃` : text })));

    listenCard.hidden = !s.listen; queues.hidden = !s.listen;
    lstate.textContent = "LISTEN";
    listenCard.classList.toggle("is-readable", Boolean(s.readable));
    chips(synQ, s.syn || [], "is-syn");
    chips(accQ, s.acc || [], "is-acc");
    meter.textContent = s.full ? "128 / 128 已满" : `${(s.acc || []).length} / 128`;
    accQ.parentElement.classList.toggle("is-full", Boolean(s.full));

    epollCard.hidden = !s.epoll;
    interest.textContent = s.epoll ? s.epoll.interest.map((f) => `fd ${f}`).join("、") : "";
    chips(ready, (s.epoll?.ready || []).map((f) => `fd ${f}`), "is-ready");
    if (!s.epoll?.ready) ready.append(el("span", { class: "aq-none", text: "空" }));
    connCard.hidden = !s.conn;

    ustate.textContent = s.user.st;
    ustate.classList.toggle("is-sleep", Boolean(s.user.sleep));
    zero.classList.toggle("is-on", Boolean(s.zero));
    const at = CODE.findIndex((c) => c.key === s.user.line);
    [...code.children].forEach((li, k) => {
      li.classList.toggle("is-cur", k === at);
      li.classList.toggle("is-done", at >= 0 && k < at);
    });
    vars.replaceChildren(...Object.entries(s.user.vars || {}).flatMap(([k, v]) =>
      [el("dt", { text: k }), el("dd", { text: String(v) })]));
    caption.textContent = s.caption;
  }

  const ctl = stepper(root, { count: STEPS.length, render, interval: (s) => (s >= 7 ? 3600 : 2800) });
  root.append(badge, grid, caption, ctl.bar,
    el("p", { class: "w-caption", text: "示意：nc#129、nc#130 与「排满 128 个」为图解；队列满时的具体表现取决于内核版本和 tcp_abort_on_overflow 等参数。" }));
}
