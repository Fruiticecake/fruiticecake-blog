// 页面外壳的阅读辅助：时间码目录高亮当前章节、顶栏阅读进度条、[data-reveal] 滚动显现。
// 与动效开关无关，减弱动效时也照常工作（显现直接到位）。

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function syncRail(links, chaps, progress) {
  // 取「顶部已越过视口 30% 线」的最后一个章节：快速滚动也不会漏掉
  const line = innerHeight * 0.3;
  let current = chaps[0];
  for (const c of chaps) if (c && c.getBoundingClientRect().top < line) current = c;
  links.forEach((a) => a.classList.toggle("is-on", !!current && a.getAttribute("href") === `#${current.id}`));
  if (progress) {
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.setProperty("--read", max > 0 ? scrollY / max : 0);
  }
}

function revealOnScroll() {
  const items = document.querySelectorAll("[data-reveal]");
  if (reduceMotion) { items.forEach((n) => n.classList.add("is-in")); return; }
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
  }, { rootMargin: "0px 0px -12% 0px" });
  items.forEach((n) => io.observe(n));
}

export function initChrome() {
  const links = [...document.querySelectorAll(".rail a")];
  const chaps = links.map((a) => document.querySelector(a.getAttribute("href")));
  const progress = document.querySelector(".bar .progress");
  let ticking = false;
  const update = () => { ticking = false; syncRail(links, chaps, progress); };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener("resize", update);
  update();
  revealOnScroll();
}
