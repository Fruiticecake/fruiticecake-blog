// 动图 2：select 与 epoll 并排同步播放。10 个已连接 fd（5～14），只有 fd 7、fd 12 收到数据。
// select：每次拷位图进内核、内核扫两遍、用户 FD_ISSET 再扫一遍、下轮重建；
// epoll：epoll_ctl 登记一次，数据到达时回调挂就绪链表，epoll_wait 只返回 2 个。
// 计数口径：「检查」= 逐个看一个 fd 是否就绪；select 实际按位扫描到 maxfd+1，这里只数登记的 10 个（示意）。

import { el, reduceMotion } from "/stage/lib/dom.js";
import { stepper } from "./stepper.js";

const FDS = Array.from({ length: 10 }, (_, i) => i + 5);
const HOT = new Set([7, 12]);
const SCAN_MS = 120;

// 每步两侧各自的画面。scan：本步逐个检查的位置（"k" 内核 / "u" 用户）；add：本步计数增量。
const SIDES = {
  select: [
    { code: "FD_ZERO(&set); FD_SET(fd, &set) × 10", cap: "用户态先把 10 个 fd 逐个写进位图。", user: "set" },
    { code: "select(maxfd + 1, &set, NULL, NULL, NULL)", cap: "整张位图从用户态拷进内核。", user: "set", copy: ["down", "fd_set · 10 位"], add: { copy: 10 } },
    { code: "（内核）逐个调用每个 fd 的 poll", cap: "内核逐个检查 10 个 fd：都没数据，于是挂到 10 个等待队列上睡眠。", user: "set", kernel: "idle", scan: "k", add: { k: 10 } },
    { code: "（内核）被唤醒，再逐个检查一遍", cap: "fd 7、fd 12 收到数据，唤醒 select；内核再把 10 个逐个检查一遍，没就绪的位清零。", user: "set", kernel: "data", data: true, scan: "k", add: { k: 10 } },
    { code: "return 2;  // 位图被改写后拷回", cap: "位图拷回用户态，返回 2——只说有 2 个，没说是哪 2 个。", user: "result", kernel: "data", data: true, copy: ["up", "fd_set · 被改写"] },
    { code: "for (fd = 5; fd <= 14; fd++) if (FD_ISSET(fd, &set))", cap: "用户用 FD_ISSET 逐个检查 10 个，才找到 fd 7 和 fd 12。", user: "result", kernel: "data", data: true, scan: "u", add: { u: 10 } },
    { code: "// 下一轮前：FD_ZERO + FD_SET × 10", cap: "位图已经被内核改写，下一轮调用前要重新设置整个集合。", user: "stale", kernel: "data", data: true },
  ],
  epoll: [
    { code: "epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev) × 10", cap: "只在开始时登记一次：内核在每个 socket 的等待队列上挂好回调。", kernel: "reg", once: true, add: { copy: 10, once: true } },
    { code: "epoll_wait(epfd, events, MAX_EVENTS, -1)", cap: "不用交出任何集合，内核只看就绪链表。", kernel: "reg" },
    { code: "（内核）就绪链表为空 → 睡眠", cap: "就绪链表是空的，直接睡眠，一个 fd 都不用检查。", kernel: "reg" },
    { code: "（内核）ep_poll_callback → 挂上就绪链表", cap: "fd 7、fd 12 收到数据，回调把它们挂到就绪链表上，唤醒 epoll_wait。", kernel: "reg", data: true, ready: true },
    { code: "return 2;  // 只拷回 2 个 epoll_event", cap: "只确认、只拷回就绪链表上的 2 个事件，返回 n = 2。", kernel: "reg", data: true, ready: true, events: true, copy: ["up", "2 × epoll_event"], add: { k: 2 } },
    { code: "for (int i = 0; i < n; i++)  // n = 2", cap: "for 只跑 2 次，每次拿到的都已经是就绪的 fd。", kernel: "reg", data: true, events: true, scan: "e", add: { u: 2 } },
    { code: "// 下一轮：直接再调 epoll_wait", cap: "登记还在内核里，下一轮什么都不用重建。", kernel: "reg", data: true, events: true },
  ],
};
const STEPS = SIDES.select.length;

function fdRow(cls) {
  return el("ol", { class: `mx-fds ${cls}` }, FDS.map((fd) => el("li", { "data-fd": fd, text: String(fd) })));
}

function buildSide(name) {
  const code = el("code", { class: "mx-code" });
  const user = fdRow("mx-user");
  const kernel = fdRow("mx-kernel");
  const copy = el("div", { class: "mx-copy", "aria-hidden": "true" }, [el("span", { class: "mx-strip" })]);
  const extra = name === "epoll"
    ? el("div", { class: "mx-ready" }, [el("span", { class: "mx-lab", text: "就绪链表" }), el("span", { class: "mx-rlist" })])
    : el("div", { class: "mx-ready mx-waitq" }, [el("span", { class: "mx-lab", text: "等待队列" }), el("span", { class: "mx-rlist" })]);
  const cap = el("p", { class: "mx-cap" });
  const kCount = el("b"), uCount = el("b"), cCount = el("b");
  const node = el("section", { class: `mx-side mx-${name}`, "aria-label": name }, [
    el("p", { class: "mx-title", text: name === "select" ? "select" : "epoll" }),
    code,
    el("p", { class: "mx-band", text: name === "select" ? "用户态 · fd_set 位图" : "用户态 · events[]" }), user,
    copy,
    el("p", { class: "mx-band", text: "内核态 · socket" }), kernel, extra,
    cap,
    el("dl", { class: "mx-count" }, [
      el("dt", { text: "内核检查" }), el("dd", {}, [kCount]),
      el("dt", { text: "用户检查" }), el("dd", {}, [uCount]),
      el("dt", { text: "拷入内核的 fd" }), el("dd", {}, [cCount]),
    ]),
  ]);
  return { name, node, code, user, kernel, copy, extra, cap, kCount, uCount, cCount, timers: [] };
}

/** 截至第 step 步（含）、第 round 轮的累计计数。 */
function totals(name, step, round) {
  const t = { k: 0, u: 0, copy: 0 };
  for (let r = 0; r <= round; r++) {
    const last = r < round ? STEPS - 1 : step;
    for (let i = 0; i <= last; i++) {
      const a = SIDES[name][i].add;
      if (!a || (a.once && r > 0)) continue;
      t.k += a.k || 0; t.u += a.u || 0; t.copy += a.copy || 0;
    }
  }
  return t;
}

function paintSide(side, i, round) {
  side.timers.forEach(clearTimeout); side.timers = [];
  const s = SIDES[side.name][i];
  const regSkip = side.name === "epoll" && round > 0 && i === 0;
  side.code.textContent = regSkip ? "// 已登记过，不再调用 epoll_ctl" : s.code;
  side.cap.textContent = regSkip ? "第二轮起不用再登记：兴趣列表一直在内核里。" : s.cap;

  [...side.user.children].forEach((li) => {
    const fd = Number(li.dataset.fd);
    const on = side.name === "select"
      ? (s.user === "set" || s.user === "stale" ? true : s.user === "result" && HOT.has(fd))
      : Boolean(s.events) && HOT.has(fd);
    li.className = on ? (s.user === "stale" ? "is-stale" : "is-set") : "";
    if (side.name === "select") li.dataset.bit = on ? "1" : "0";
    if (side.name === "epoll") li.classList.toggle("is-ghost", !(s.events && HOT.has(fd)));
  });
  [...side.kernel.children].forEach((li) => {
    const fd = Number(li.dataset.fd);
    li.className = [s.data && HOT.has(fd) ? "is-hot" : "", s.kernel === "reg" ? "is-reg" : "", s.kernel ? "" : "is-off"].join(" ").trim();
  });
  const rlist = side.extra.querySelector(".mx-rlist");
  if (side.name === "epoll") {
    rlist.replaceChildren(...(s.ready ? [...HOT].map((fd) => el("span", { class: "mx-rchip", text: `fd ${fd}` })) : [el("span", { class: "mx-none", text: "空" })]));
  } else {
    rlist.textContent = s.kernel === "idle" ? "挂在 10 个等待队列上睡眠" : s.data ? "唤醒 → 从 10 个队列上摘下" : "—";
  }
  side.copy.className = `mx-copy${s.copy ? ` is-${s.copy[0]}` : ""}`;
  side.copy.firstChild.textContent = s.copy ? s.copy[1] : "";
  side.copy.firstChild.style.animation = "none";
  void side.copy.offsetWidth;                // 重新触发拷贝动画
  side.copy.firstChild.style.animation = "";

  const before = i > 0 ? totals(side.name, i - 1, round) : (round > 0 ? totals(side.name, STEPS - 1, round - 1) : { k: 0, u: 0, copy: 0 });
  const after = totals(side.name, i, round);
  side.cCount.textContent = String(after.copy);
  const setCounts = (k, u) => { side.kCount.textContent = String(k); side.uCount.textContent = String(u); };

  const row = s.scan === "k" ? side.kernel : s.scan ? side.user : null;
  if (!row || reduceMotion) { setCounts(after.k, after.u); return; }
  // 逐个检查：高亮一格，计数加一
  setCounts(before.k, before.u);
  const cells = [...row.children].filter((li) => s.scan !== "e" || HOT.has(Number(li.dataset.fd)));
  cells.forEach((li, k) => {
    side.timers.push(setTimeout(() => {
      li.classList.add("is-scan");
      setCounts(before.k + (s.scan === "k" ? k + 1 : 0), before.u + (s.scan === "k" ? 0 : k + 1));
    }, k * SCAN_MS * (s.scan === "e" ? 3 : 1)));
  });
}

export function mountSelectVsEpoll(root) {
  root.classList.add("w-mx");
  if (root.clientWidth < 640) root.classList.add("is-narrow");
  const sides = [buildSide("select"), buildSide("epoll")];
  const roundTag = el("span", { class: "mx-round" });
  const nextRound = el("button", { type: "button", class: "ep-btn mx-next", text: "再跑一轮 ↻" });
  const verdict = el("p", { class: "mx-verdict", "aria-live": "polite" });
  const final = el("div", { class: "mx-final" }, [
    el("p", {}, [el("code", { text: "for (i = 0; i < n; i++)" }), " 里的 n 是", el("b", { text: "就绪数" }), "，不是连接总数。"]),
    el("p", {}, [el("code", { text: "if (fd == listen_fd)" }), " 只是在已就绪的 fd 里分类型（新连接还是有数据），不是在搜索。"]),
  ]);
  let round = 0;

  function render(i) {
    sides.forEach((s) => paintSide(s, i, round));
    roundTag.textContent = `ROUND ${round + 1}`;
    nextRound.disabled = i !== STEPS - 1;
    final.classList.toggle("is-on", i === STEPS - 1);
    const a = totals("select", i, round), b = totals("epoll", i, round);
    verdict.textContent = `累计检查：select ${a.k + a.u} 次，epoll ${b.k + b.u} 次`;
  }

  const ctl = stepper(root, { count: STEPS, render, interval: (s) => ([2, 3, 5].includes(s + 1) ? 2600 : 2100), extra: [roundTag, nextRound] });
  nextRound.addEventListener("click", () => { ctl.stop(); round += 1; ctl.go(0); });
  root.append(el("div", { class: "mx-grid" }, sides.map((s) => s.node)), verdict, final, ctl.bar,
    el("p", { class: "w-caption", text: "示意：计数只数登记的 10 个 fd；真实的 select 在内核里按位扫描 0～maxfd，epoll_wait 在水平触发下会对就绪项再确认一次。" }));
}
