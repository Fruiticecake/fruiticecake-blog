// 动图 3：ev.data 这张「标签」怎么来回走。epoll_ctl 把整个 epoll_event 拷进内核条目，
// 内核按第三个参数决定监视谁，data 原样保存；事件发生后 epoll_wait 把同一个 data 原样拷回 events[0]。
// 可切换标签内容（fd / u64 / ptr / 写错的 fd），演示 epoll 不解释、不检查 data。

import { el } from "/stage/lib/dom.js";
import { stepper } from "./stepper.js";

const TAGS = [
  { key: "fd", label: "data.fd = 3", field: "data.fd", value: "3", read: "fd = 3 → fd == listen_fd，去 accept()", ok: true },
  { key: "u64", label: "data.u64 = 0xBEEF", field: "data.u64", value: "0xBEEF", read: "拿到 0xBEEF：你自己约定它代表什么", ok: true },
  { key: "ptr", label: "data.ptr = &conn", field: "data.ptr", value: "&conn", read: "拿到 &conn：直接用这个连接的缓冲区和状态", ok: true },
  { key: "bad", label: "data.fd = 99（写错）", field: "data.fd", value: "99", read: "拿到 99：read(99) 失败（EBADF），真正就绪的 fd 3 没人处理", ok: false },
];

const STEPS = [
  { at: "ev", cap: "用户在栈上填好 ev：events = EPOLLIN，data 里放一个自己的标签。" },
  { at: "item", cap: "epoll_ctl(epfd, EPOLL_CTL_ADD, 3, &ev)：内核按第三个参数 3 找到要监视的 socket，再把整个 ev 拷一份存进兴趣列表的条目。之后改用户态的 ev 不影响它。" },
  { at: "ready", cap: "fd 3 背后的 socket 就绪：这个条目被挂上就绪链表，data 跟着条目一起，内核没看过它一眼。" },
  { at: "out", cap: "epoll_wait 把条目里存着的 events 和 data 原样拷进用户的 events[0]。" },
  { at: "read", cap: "用户读 events[0].data：拿到的正是第一步自己写进去的值。epoll 只负责把它交还给你。" },
];
const SPOTS = ["ev", "item", "ready", "out"];

function tagChip(tag, extra = "") {
  return el("span", { class: `tg-tag${tag.ok ? "" : " is-bad"}${extra}` }, [el("small", { text: tag.field }), el("b", { text: tag.value })]);
}

export function mountDataTag(root) {
  root.classList.add("w-tg");
  if (root.clientWidth < 640) root.classList.add("is-narrow");
  let tag = TAGS[0];

  const spot = (key, title, rows) => {
    const slot = el("div", { class: "tg-slot" });
    return { key, slot, node: el("div", { class: `tg-spot tg-${key}`, "data-spot": key }, [el("p", { class: "tg-title", text: title }), ...rows, slot]) };
  };
  const watch = el("b", { text: "fd 3" });
  const spots = [
    spot("ev", "用户态 · struct epoll_event ev", [el("p", { class: "tg-line", text: "ev.events = EPOLLIN" })]),
    spot("item", "内核 · 兴趣列表条目", [el("p", { class: "tg-line" }, ["监视对象：", watch, el("small", { text: "（epoll_ctl 第 3 个参数）" })])]),
    spot("ready", "内核 · 就绪链表", [el("p", { class: "tg-line", text: "fd 3 的条目" })]),
    spot("out", "用户态 · events[0]", [el("p", { class: "tg-line", text: "events[0].events = EPOLLIN" })]),
  ];
  const lanes = el("div", { class: "tg-lanes" }, [
    el("p", { class: "tg-band tg-band-u", text: "用户态" }),
    el("p", { class: "tg-band tg-band-k", text: "内核态" }),
    ...spots.map((s) => s.node),
  ]);
  const readout = el("p", { class: "tg-read", "aria-live": "polite" });
  const caption = el("p", { class: "tg-cap", "aria-live": "polite" });
  const picks = TAGS.map((t) => el("button", { type: "button", class: "tg-pick", "aria-pressed": String(t === tag), text: t.label }));

  function render(i) {
    const s = STEPS[i];
    const reach = s.at === "read" ? SPOTS.length - 1 : SPOTS.indexOf(s.at);
    spots.forEach((sp, k) => {
      sp.node.classList.toggle("is-cur", k === reach);
      sp.node.classList.toggle("is-past", k < reach);
      // 原件留在 ev 里（之后变淡），内核里的是拷贝
      sp.slot.replaceChildren(...(k <= reach ? [tagChip(tag, k < reach && k === 0 ? " is-orig" : k === reach ? " is-new" : "")] : []));
    });
    readout.replaceChildren();
    if (s.at === "read") {
      readout.append(el("code", { text: `events[0].${tag.field} == ${tag.value}` }), el("span", { text: ` · ${tag.read}` }));
      readout.classList.toggle("is-bad", !tag.ok);
    }
    caption.textContent = s.cap;
  }

  const ctl = stepper(root, { count: STEPS.length, render, interval: 2600 });
  picks.forEach((btn, k) => btn.addEventListener("click", () => {
    tag = TAGS[k];
    picks.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    ctl.stop(); ctl.go(ctl.step);
  }));
  root.append(el("div", { class: "tg-picks" }, [el("span", { class: "tg-lab", text: "标签里放什么" }), ...picks]),
    lanes, readout, caption, ctl.bar);
}
