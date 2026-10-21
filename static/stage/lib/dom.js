// 组件共用的 DOM 小工具。约定：只用 DOM API 构造节点，文字一律走 textContent，不用 innerHTML。

const SVG_NS = "http://www.w3.org/2000/svg";
export const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const uid = () => Math.random().toString(36).slice(2, 8);

/** 创建 SVG 元素；parent 给定时直接追加。 */
export function svg(tag, attrs = {}, parent) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

/** 创建 HTML 元素；attrs.text 作为文字内容，children 可以是节点或字符串。 */
export function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") n.textContent = v; else n.setAttribute(k, v);
  }
  for (const c of children) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return n;
}

/** 进入视口时回调一次；减弱动效时立即回调。 */
export function onceVisible(node, fn, threshold = 0.35) {
  if (reduceMotion) { fn(); return; }
  const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { io.disconnect(); fn(); } }, { threshold });
  io.observe(node);
}

/** 可见时按间隔执行、离开视口时暂停的定时器；返回停止函数。减弱动效时不运行。 */
export function whileVisible(node, tick, ms) {
  let timer = null;
  const io = new IntersectionObserver(([en]) => {
    if (en.isIntersecting && !timer && !reduceMotion) timer = setInterval(tick, ms);
    else if (!en.isIntersecting && timer) { clearInterval(timer); timer = null; }
  }, { threshold: 0.2 });
  io.observe(node);
  return () => { clearInterval(timer); timer = null; io.disconnect(); };
}

/** 读取交互块里降级内容的纯文本（通用组件从这里拿数据，保证原稿只写一份）。 */
export const textOf = (node) => (node?.textContent || "").replace(/\s+/g, " ").trim();
