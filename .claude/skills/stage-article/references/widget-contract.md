# 组件契约

运行时（`static/stage/runtime.js`）对每个 `::: interactive` 块调用：

```js
await mount(root, ctx)
```

- `root`：空的 `<div data-widget="名字">`，组件把自己的 DOM 加进去。
- `ctx.props`：原稿里除 title / hint / note 以外的属性（字符串值）。
- `ctx.fallback`：降级内容的容器（`.ix-fallback`），通用组件从这里读数据。
- `ctx.module`：外层 `<section class="module">`。

挂载成功后运行时会隐藏降级内容；`mount` 抛错（或返回被拒绝的 Promise）时，模块显示 OFFLINE、保留降级内容，控制台打印原因，其他组件不受影响。所以：**数据格式不对就抛出说清楚原因的 Error**，不要静默渲染一个空组件。

## 工具（`/stage/lib/dom.js`）

| 导出 | 用途 |
|---|---|
| `el(tag, attrs, children)` | 建 HTML 元素；`attrs.text` 设文字；children 可以是节点或字符串 |
| `svg(tag, attrs, parent)` | 建 SVG 元素 |
| `onceVisible(node, fn)` | 进入视口时执行一次（适合入场编排）；减弱动效时立即执行 |
| `whileVisible(node, tick, ms)` | 可见时定时执行、离开时暂停，返回停止函数；减弱动效时不运行 |
| `reduceMotion` | 用户是否开启「减弱动效」 |
| `textOf(node)` | 节点的纯文本（压缩空白） |
| `uid()` | 随机短 id（SVG filter / pattern 的 id 要唯一） |

## 主题

全站有两套主题：默认深色「夜棚」，和浅色「日光棚」（读者用右上角按钮切换，或跟随系统）。变量定义在 `/stage/tokens.css`，两套主题下同名变量取不同值——**只用 CSS 变量着色，不写死颜色**，组件就自动适配两种主题：

| 变量 | 含义 |
|---|---|
| `--bg` `--bg-2` `--panel` `--panel-2` | 背景层级（底→上） |
| `--ink` `--ink-2` `--ink-3` | 文字（主 / 次 / 弱） |
| `--line` `--line-2` | 分隔线（弱 / 强） |
| `--mark` `--mark-dim` | 标记色：标记点、选中、通过（深色是荧光绿，浅色是墨绿） |
| `--on-mark` | 放在 `--mark` 底色上的文字 |
| `--ir` `--ir-dim` | 红外红：错误、失败、警示 |
| `--glow` `--glow-shadow` | 辉光（`filter` / `box-shadow` 用）；浅色主题下自动变成无 |
| `--render-bg` `--viewer-bg` `--scanline` | 渲染画面 / 取景器背景 / 扫描线 |
| `--sans` `--mono` `--disp` | 正文 / 等宽 / 展示字体 |
| `--ease` | 默认缓动 |

- 需要半透明时用 `color-mix(in srgb, var(--mark) 30%, transparent)`，不要写 `rgba(…)`。
- 中文不要用 `--mono`：等宽字体没有中文字形，会回退成别的字体且字距怪异。等宽只用于拉丁字母和数字标签。
- 写完在两种主题下各看一遍（点右上角按钮切换）。

现成的类：`.w-caption`（组件下方的说明小字，「示意」写在这里）、`.module-note`。

视觉语言：荧光标记点（深色下带辉光）、等宽小字标签（`CAM_A · FRONT`、`TRY_D`、`STEP 03 / 08`）、取景框角标。新组件尽量沿用，让全文像同一个摄影棚。

## 安全

- **不用 `innerHTML`**。文字一律 `textContent` / `el(..., { text })`，HTML 结构用 DOM API 搭。组件库全部遵守这条，新组件也一样——即使拼的是静态字符串，也不要开这个口子。
- 不加载第三方脚本；需要的代码放在本文文件夹里。
- 本文模块里 import 组件库工具用绝对路径 `/stage/lib/dom.js`，import 同目录文件用 `./xxx.js`。

## 无障碍

- 可交互的东西用 `<button>`；切换状态用 `aria-pressed` / `aria-selected`。
- 拖拽的元素同时支持方向键（参考 `triangulation.js` 的关节：`tabindex="0"`、`role="slider"`、`aria-valuetext`）。
- 动态变化的读数加 `aria-live="polite"`。
- 纯装饰的图形加 `aria-hidden="true"`；表达信息的 SVG 加 `role="img"` 和 `aria-label`。

## 性能与动效

- 动画只改 `transform` / `opacity` / `filter` / SVG 属性，不触发重排。
- 持续动画（rAF、定时器）在离开视口时暂停：用 `whileVisible`，或自己用 IntersectionObserver。
- `reduceMotion` 为真时：不自动播放，给一个静态的、信息完整的画面。
- `requestAnimationFrame` 的时间戳可能早于你在同一帧取的 `performance.now()`——计算时间要 `Math.max(0, …)`，否则会出现负时间（真实踩过的坑）。

## 响应式

- 根据 `root.clientWidth` 选择布局；小于约 560px 时考虑竖排（参考 `triangulation.js` 的 `tall`）。
- SVG 用 `viewBox` + `width:100%`，但别让文字缩到 9px 以下——窄屏时换布局，而不是一味缩小。

## 「示意」

组件里凡是原文没给的数字或画面，都在组件末尾加：

```js
root.append(el("p", { class: "w-caption", text: "示意：……为图解，不是原文公布的数据。" }));
```

## 最小示例

```js
import { el, onceVisible } from "/stage/lib/dom.js";

function mountCounter(root, ctx) {
  const items = [...(ctx.fallback?.querySelectorAll("li") || [])].map((li) => li.textContent.trim());
  if (!items.length) throw new Error("counter：降级内容里需要一个列表");
  const list = el("ol", { class: "my-counter" }, items.map((t) => el("li", { text: t })));
  root.append(list);
  onceVisible(root, () => list.classList.add("is-in"));
}

export const widgets = { counter: mountCounter };
```
