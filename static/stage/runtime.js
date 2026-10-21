// 「动捕棚」页面入口（post-stage.tpl 用 <script type="module" src="/stage/runtime.js"> 加载）。
//
// 读取 <body> 上的配置：
//   data-hero="mocap-gait"                 首屏组件名
//   data-local-widgets="/docs/x/widgets.js" 文件夹文章自带的组件模块（可选）
// 文章模块导出 { widgets: { 名字: mount }, heroes: { 名字: mount } }，同名时优先于组件库。
// 组件库按名字动态加载 /stage/widgets/<名字>.js、/stage/heroes/<名字>.js，各自导出 mount(root, ctx)。
//
// 容错：每个组件单独挂载，失败只影响自己——模块标 is-failed、保留降级内容，并在控制台说明原因。

import { initStageMotion } from "./motion.js";
import { initChrome } from "./chrome.js";
import { initTheme } from "./theme.js";

const NAME = /^[a-z][a-z0-9-]*$/;
// 页面用 runtime.js?v=<资源哈希> 加载本文件；组件库的动态 import 沿用同一个版本号，避免旧缓存
const VERSION = new URL(import.meta.url).search;

function parseProps(node) {
  try {
    return JSON.parse(node.dataset.props || "{}");
  } catch (e) {
    console.error(`[stage] 组件 ${node.dataset.widget} 的 data-props 不是合法 JSON，按空处理`, e);
    return {};
  }
}

async function loadLocal(url) {
  if (!url) return { widgets: {}, heroes: {} };
  try {
    const mod = await import(url);
    return { widgets: mod.widgets || {}, heroes: mod.heroes || {} };
  } catch (e) {
    console.error(`[stage] 本文组件模块加载失败：${url}`, e);
    return { widgets: {}, heroes: {} };
  }
}

async function resolve(kind, name, local) {
  if (!NAME.test(name || "")) throw new Error(`名字不合法：${name}`);
  if (typeof local[name] === "function") return local[name];
  const mod = await import(`./${kind}/${name}.js${VERSION}`);
  if (typeof mod.mount !== "function") throw new Error(`./${kind}/${name}.js 没有导出 mount()`);
  return mod.mount;
}

async function mountWidget(node, local) {
  const name = node.dataset.widget;
  const module = node.closest(".module");
  try {
    const mount = await resolve("widgets", name, local.widgets);
    await mount(node, { props: parseProps(node), fallback: module?.querySelector(".ix-fallback") || null, module });
    module?.classList.add("is-mounted");
  } catch (e) {
    node.replaceChildren();
    module?.classList.add("is-failed");
    console.error(`[stage] 组件 ${name} 挂载失败，已保留降级内容`, e);
  }
}

async function mountHero(local) {
  const figure = document.querySelector("[data-hero-mount]");
  if (!figure) return;
  const name = document.body.dataset.hero || "mocap-gait";
  try {
    const mount = await resolve("heroes", name, local.heroes);
    await mount(figure, { clock: document.getElementById("clock") });
  } catch (e) {
    figure.classList.add("is-failed");
    console.error(`[stage] 首屏 ${name} 挂载失败`, e);
  }
}

async function boot() {
  initTheme();
  const local = await loadLocal(document.body.dataset.localWidgets);
  await mountHero(local);
  initChrome();
  initStageMotion();
  await Promise.all([...document.querySelectorAll("[data-widget]")].map((n) => mountWidget(n, local)));
}

boot();
