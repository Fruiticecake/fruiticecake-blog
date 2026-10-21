// 全站（非 stage 文章）页面入口：主题开关、REC 时间码、阅读进度、文章目录高亮、
// 代码复制、回到顶部、首页星图，以及文字动效。
// 动效约定与 stage 文章一致：初始隐藏都挂在 html.m-on 下（<head> 内联脚本按需添加），
// 减弱动效 / JS 失败时页面就是完整的静态版。本模块启动时设置 window.__siteMotion。

import { initTheme } from "/stage/theme.js";
import { splitChars, runBoot } from "/stage/motion.js";

const html = document.documentElement;
const motionOn = () => html.classList.contains("m-on");
const VERSION = new URL(import.meta.url).search;
const SCRAMBLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/* ---------- 阅读辅助 ---------- */
function initClock() {
  const clock = document.getElementById("clock");
  if (!clock) return;
  const t0 = performance.now();
  const pad = (n) => String(n).padStart(2, "0");
  setInterval(() => {
    const t = Math.max(0, (performance.now() - t0) / 1000);
    clock.textContent = `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t / 60) % 60)}:${pad(Math.floor(t) % 60)}:${pad(Math.floor(t * 24) % 24)}`;
  }, 1000 / 12);
}

function initScroll() {
  const progress = document.querySelector(".bar .progress");
  const back = document.getElementById("backToTop");
  const links = [...document.querySelectorAll(".rail a")];
  const heads = links.map((a) => document.getElementById(decodeURIComponent(a.getAttribute("href").slice(1))));
  let ticking = false;
  const update = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    progress?.style.setProperty("--read", max > 0 ? scrollY / max : 0);
    back?.classList.toggle("show", scrollY > 480);
    const line = innerHeight * 0.25;
    let current = null;
    for (const h of heads) if (h && h.getBoundingClientRect().top < line) current = h;
    links.forEach((a, i) => a.classList.toggle("is-on", heads[i] === current));
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  back?.addEventListener("click", () => scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  update();
}

function initCopyButtons() {
  document.querySelectorAll(".prose pre").forEach((pre) => {
    if (pre.classList.contains("mermaid")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.textContent = "COPY";
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText((pre.querySelector("code") || pre).textContent);
        btn.textContent = "COPIED";
      } catch {
        btn.textContent = "FAILED";                    // 非安全上下文或被拒绝时如实提示
      }
      setTimeout(() => { btn.textContent = "COPY"; }, 1500);
    });
    pre.appendChild(btn);
  });
}

/** 整段只有一个加粗词时，它是被当作小标题用的：标为 .is-label，不画荧光线（与动效无关，总是执行）。 */
function markBoldLabels() {
  document.querySelectorAll(".prose > p > strong").forEach((b) => {
    if (b.textContent.trim() === b.parentElement.textContent.trim()) b.classList.add("is-label");
  });
}

/* ---------- 文字动效 ---------- */
function onEnter(nodes, fn, margin = "0px 0px -10% 0px") {
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { io.unobserve(en.target); fn(en.target); }
  }, { rootMargin: margin });
  nodes.forEach((n) => io.observe(n));
}

/** 标签「解码」：拉丁字母和数字先乱跳，再从左到右逐个锁定；中文与符号不动。 */
function decode(node) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) texts.push({ n: walker.currentNode, raw: walker.currentNode.textContent });
  const total = texts.reduce((s, t) => s + t.raw.length, 0);
  const t0 = performance.now(), dur = 520;
  const step = (now) => {
    const k = Math.min(1, Math.max(0, (now - t0) / dur));
    let offset = 0;
    for (const t of texts) {
      t.n.textContent = [...t.raw].map((ch, i) =>
        (offset + i) / total < k || !/[A-Z0-9]/i.test(ch) ? ch : SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)]).join("");
      offset += t.raw.length;
    }
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const ROW_SELECTORS = [
  ".log > li", ".takes > li", ".post-list > *", ".aihot-list > a", ".chat-inbox > a", ".archive-row",
  ".aihot-grid > a", ".radar-featured > article", ".radar-quick-list > article", ".opensource-trends li",
  ".channels > a", ".tag-cloud > a",
].join(",");
const PROSE_BLOCKS = ".prose > p, .prose > ul, .prose > ol, .prose > blockquote, .prose > pre, .prose > table, .prose > figure, .prose > img";

function prepareMotion() {
  // 页面标题：首页逐字由标记点成形，其余页面逐字对焦
  const homeTitle = document.querySelector(".home-head h1");
  if (homeTitle) { homeTitle.classList.add("m-markers"); splitChars(homeTitle); }
  document.querySelectorAll(".page-head h1, .post-head h1, .prose h2").forEach((h) => { h.classList.add("m-focus"); splitChars(h); });
  // 列表与卡片：同一父元素内依次入场
  const counters = new Map();
  document.querySelectorAll(ROW_SELECTORS).forEach((row) => {
    const i = counters.get(row.parentElement) || 0;
    counters.set(row.parentElement, i + 1);
    row.classList.add("m-row");
    row.style.setProperty("--i", Math.min(i, 12));
  });
  document.querySelectorAll(PROSE_BLOCKS).forEach((n) => n.classList.add("m-rise"));
  return homeTitle;
}

function playMotion(homeTitle) {
  requestAnimationFrame(() => {
    homeTitle?.classList.add("is-forming");
    document.querySelectorAll(".page-head h1, .post-head h1").forEach((h) => h.classList.add("is-in"));
  });
  document.querySelectorAll(".page-head .tc, .post-head .tc, .home-head .tc").forEach(decode);
  onEnter(document.querySelectorAll(".block-head .tc"), decode);
  onEnter(document.querySelectorAll(".prose h2"), (h) => h.classList.add("is-in"));
  onEnter(document.querySelectorAll(".m-row, .m-rise"), (n) => n.classList.add("is-in"), "0px 0px -6% 0px");
  onEnter(document.querySelectorAll("[data-reveal]"), (n) => n.classList.add("is-in"));
}

/* ---------- 首页星图 ---------- */
async function initConstellation() {
  const figure = document.getElementById("constellation");
  const data = document.getElementById("marker-data");
  if (!figure || !data) return;
  try {
    const { mount } = await import(`./constellation.js${VERSION}`);
    mount(figure, JSON.parse(data.textContent));
  } catch (e) {
    figure.classList.add("is-failed");
    console.error("[site] 星图加载失败，页面其余内容不受影响", e);
  }
}

async function init() {
  window.__siteMotion = true;
  initTheme();
  initClock();
  initScroll();
  initCopyButtons();
  markBoldLabels();
  if (!motionOn()) {                                   // 减弱动效：直接显示一切
    document.querySelectorAll("[data-reveal]").forEach((n) => n.classList.add("is-in"));
    initConstellation();
    return;
  }
  const homeTitle = prepareMotion();
  await runBoot();                                     // 只有首页首访带 m-boot，其余页面立即返回
  html.classList.add("m-ready");
  initConstellation();
  playMotion(homeTitle);
}

init();
