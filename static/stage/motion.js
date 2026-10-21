// 「动捕棚」动效原语。页面在 <head> 里用内联脚本提前加 html.m-on（和首访时的 m-boot），
// 这里负责：开场校准、拆字、按进入视口触发各类动效、滚动驱动的镜头推拉与章节轨刻度。
// 所有效果都只播一次；prefers-reduced-motion 时页面不会有 m-on，本模块只做最小工作。
// 约定：只用 DOM API 构造节点（不用 innerHTML），文字一律走 textContent。

const html = document.documentElement;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const BOOT_KEY = "stage-boot-seen";
const BOOT_MS = 1100;

function h(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** 把元素内的文字拆成逐字 span（保留内部的 <span>/<em> 等结构），并给读屏器保留完整标签。 */
export function splitChars(node, start = 0) {
  const label = node.textContent.replace(/\s+/g, " ").trim();
  let i = start;
  const walk = (parent) => {
    for (const child of [...parent.childNodes]) {
      if (child.nodeType === Node.ELEMENT_NODE) { walk(child); continue; }
      if (child.nodeType !== Node.TEXT_NODE) continue;
      const frag = document.createDocumentFragment();
      for (const char of child.textContent) {
        if (/\s/.test(char)) { frag.appendChild(document.createTextNode(char)); continue; }
        const ch = h("span", "ch");
        ch.style.setProperty("--i", i++);
        ch.setAttribute("aria-hidden", "true");
        ch.appendChild(h("span", "gl", char));
        frag.appendChild(ch);
      }
      child.replaceWith(frag);
    }
  };
  walk(node);
  node.setAttribute("aria-label", label);
  return i;
}

function onEnter(nodes, fn, options = {}) {
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { io.unobserve(en.target); fn(en.target); }
  }, { rootMargin: "0px 0px -12% 0px", ...options });
  nodes.forEach((n) => io.observe(n));
}

/* ---- M0 开场：相机校准，会话内只播一次，点击 / 任意键跳过 ---- */
const BOOT_LINES = [
  ["CALIBRATING CAM_A ······ ", "OK"], ["CALIBRATING CAM_B ······ ", "OK"],
  ["SYNC FRONT ⇄ SIDE · 24 FPS", ""], ["11 MARKERS ", "LOCKED"],
];

function buildBoot() {
  const boot = h("div", "boot");
  boot.setAttribute("role", "status");
  boot.setAttribute("aria-label", "正在载入");
  boot.style.setProperty("--boot-ms", `${BOOT_MS}ms`);
  const inner = h("div", "boot-inner");
  const cams = h("div", "boot-cams");
  for (const label of ["CAM_A · FRONT", "CAM_B · SIDE"]) {
    const cam = h("div", "boot-cam");
    cam.append(h("span", null, label), h("i"));
    cams.appendChild(cam);
  }
  const log = h("ul", "boot-log");
  const skip = h("button", "boot-skip", "跳过 ESC");
  skip.type = "button";
  inner.append(cams, log, h("div", "boot-bar"), skip);
  boot.appendChild(inner);
  return { boot, log };
}

function runBoot() {
  return new Promise((resolve) => {
    if (!html.classList.contains("m-boot")) { resolve(); return; }
    const { boot, log } = buildBoot();
    document.body.appendChild(boot);
    html.classList.remove("m-boot");                 // 遮罩交给 .boot 本身
    const timers = BOOT_LINES.map(([text, ok], k) => setTimeout(() => {
      const li = h("li", null, text);
      if (ok) li.appendChild(h("b", null, ok));
      log.appendChild(li);
    }, 120 + (k * (BOOT_MS - 250)) / BOOT_LINES.length));

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      try { sessionStorage.setItem(BOOT_KEY, "1"); } catch { /* 隐私模式无法写入：下次再播一次，无副作用 */ }
      boot.classList.add("is-out");
      removeEventListener("keydown", finish);
      setTimeout(() => boot.remove(), 600);
      resolve();
    };
    boot.addEventListener("click", finish);
    addEventListener("keydown", finish);
    setTimeout(finish, BOOT_MS + 150);
  });
}

/* ---- M2 时间码滚动：数字先乱跳，再从左到右逐位锁定 ---- */
function rollTimecode(tc) {
  const walker = document.createTreeWalker(tc, NodeFilter.SHOW_TEXT);
  let node = null, m = null;
  while (walker.nextNode()) {
    m = walker.currentNode.textContent.match(/\d{2}:\d{2}:\d{2}/);
    if (m) { node = walker.currentNode; break; }
  }
  if (!node) return;
  const target = m[0];
  const before = node.textContent.slice(0, m.index), after = node.textContent.slice(m.index + target.length);
  const num = h("span", "tc-num is-rolling", target.replace(/\d/g, "0"));
  node.replaceWith(document.createTextNode(before), num, document.createTextNode(after));
  const digits = [...target];
  const t0 = performance.now(), dur = 650;
  const step = (now) => {
    const k = Math.min(1, Math.max(0, (now - t0) / dur));
    const locked = Math.floor(k * digits.length);
    num.textContent = digits.map((d, i) => (d === ":" ? ":" : i < locked ? d : String(Math.floor(Math.random() * 10)))).join("");
    if (k < 1) requestAnimationFrame(step);
    else { num.textContent = target; num.classList.remove("is-rolling"); }
  };
  requestAnimationFrame(step);
}

/* ---- M9 数字滚动：只滚纯数字，单位和删除线保持不动 ---- */
function countUp(b) {
  const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
  const targets = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (n.parentElement.closest("s")) continue;
    const m = n.textContent.match(/\d+/);
    if (m) targets.push({ n, value: Number(m[0]), raw: n.textContent, at: m.index, len: m[0].length });
  }
  const t0 = performance.now(), dur = 1100;
  const tick = (now) => {
    const k = Math.min(1, Math.max(0, (now - t0) / dur)), e = 1 - Math.pow(1 - k, 3);
    for (const t of targets) t.n.textContent = t.raw.slice(0, t.at) + Math.round(t.value * e) + t.raw.slice(t.at + t.len);
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---- M7 镜头推拉 + M10 章节轨刻度：共用一个节流的滚动监听 ---- */
function scrollEffects() {
  const viewer = document.querySelector(".viewer");
  const hero = document.querySelector(".hero");
  const links = [...document.querySelectorAll(".rail a")];
  const chaps = links.map((a) => document.querySelector(a.getAttribute("href")));
  const docTop = (el) => el.getBoundingClientRect().top + scrollY;
  let ticking = false;
  const update = () => {
    ticking = false;
    if (viewer && hero && !reduceMotion) {
      const p = Math.min(1, Math.max(0, scrollY / (hero.offsetHeight * 0.9)));
      viewer.style.transform = `translateY(${p * 60}px) scale(${1 - p * 0.07})`;
      viewer.style.opacity = String(1 - p * 0.65);
    }
    const line = innerHeight * 0.3;
    const end = document.documentElement.scrollHeight - innerHeight + line;
    chaps.forEach((c, i) => {
      if (!c) return;
      const top = docTop(c);
      const next = chaps[i + 1] ? docTop(chaps[i + 1]) : end;
      const p = Math.min(1, Math.max(0, (scrollY + line - top) / Math.max(1, next - top)));
      links[i].style.setProperty("--p", p.toFixed(3));
    });
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener("resize", update);
  update();
}

function prepare() {
  const h1 = document.querySelector(".hero h1");
  if (h1) { h1.classList.add("m-markers"); splitChars(h1); }
  document.querySelectorAll(".chap h2").forEach((n) => { n.classList.add("m-focus"); splitChars(n); });
  document.querySelectorAll(".body > p:not(.quote), .body > ol, .body > ul").forEach((n) => n.classList.add("m-rise"));
  document.querySelector(".tldr")?.classList.add("m-scan");
  document.querySelectorAll(".hero-copy .meta span").forEach((s, i) => s.style.setProperty("--i", i));
  document.querySelectorAll(".module").forEach((m) => {
    for (const pos of ["tl", "tr", "bl", "br"]) {
      const s = h("span", `vf-lock ${pos}`);
      s.setAttribute("aria-hidden", "true");
      m.appendChild(s);
    }
  });
  return h1;
}

export async function initStageMotion() {
  window.__stageMotion = true;
  if (!html.classList.contains("m-on")) { scrollEffects(); return; }   // 减弱动效：只保留目录刻度

  const h1 = prepare();
  await runBoot();
  html.classList.add("m-ready");
  requestAnimationFrame(() => h1?.classList.add("is-forming"));

  onEnter(document.querySelectorAll(".chap"), (c) => {
    c.classList.add("is-in");
    c.querySelector("h2")?.classList.add("is-in");
    const tc = c.querySelector(".tc");
    if (tc) rollTimecode(tc);
  });
  onEnter(document.querySelectorAll(".m-rise, .m-scan, .quote"), (n) => n.classList.add("is-in"));
  onEnter(document.querySelectorAll(".module"), (m) => m.classList.add("is-locked"), { rootMargin: "0px 0px -20% 0px" });
  onEnter(document.querySelectorAll(".telemetry b"), countUp);
  scrollEffects();
}
