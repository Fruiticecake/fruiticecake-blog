// 明暗主题开关（stage 文章与全站共用）。
// <head> 内联脚本已在首帧前设好 data-theme / data-theme-resolved；这里负责按钮切换。
// 默认深色，不跟随系统；用户选择存在 localStorage（读写失败时只在当前页生效，下次仍是深色）。

const html = document.documentElement;
const KEY = "theme";

export function resolvedTheme() {
  const t = html.getAttribute("data-theme");
  return t === "light" ? "light" : "dark";
}

function sync(btn) {
  const theme = resolvedTheme();
  html.setAttribute("data-theme-resolved", theme);
  btn?.setAttribute("aria-label", theme === "light" ? "切换到深色" : "切换到浅色");
  btn?.setAttribute("aria-pressed", String(theme === "light"));
}

export function initTheme() {
  const btn = document.querySelector(".theme-btn");
  btn?.addEventListener("click", () => {
    const next = resolvedTheme() === "light" ? "dark" : "light";
    html.setAttribute("data-theme", next);
    try { localStorage.setItem(KEY, next); } catch { /* 无法存储：只在本页生效 */ }
    sync(btn);
  });
  sync(btn);
}
