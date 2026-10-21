# 组件目录

组件库在 `static/stage/widgets/`（通用组件）和 `static/stage/heroes/`（首屏）。运行时按名字动态加载，用到哪个才下载哪个。

通用组件从**降级内容**读数据：原稿只写一份，CSDN 读者看到的就是同一份数据。降级内容格式不对时组件会抛错，模块显示 OFFLINE 并保留文字版——发布后在浏览器控制台能看到原因。

## triangulation——双机位三角测量

俯视舞台上拖动关节，正面 / 侧面两台相机的视线交于一点；切到「只有侧面相机」时，视线上的点全部重合，演示「单视角没有深度」。

- 降级内容：任意文字（组件不读取）。
- props：无。
- 适用：多视角几何、立体视觉、深度歧义、定位。

## attempt-log——走不通的方法日志

把「试过的方法」排成日志卡片，每张带失败原因和结论印章。

- 降级内容：一张表格（第一张）：

  ```
  | 方法 | 思路 | 为什么失败 | 结论 |
  |---|---|---|---|
  | 点追踪（Google DeepMind） | …… | …… | 腿上的点丢光 |
  | 单图深度（Depth Anything） | …… | …… | 正确率 4/10 |
  ```
- 「方法」列里全角或半角括号中的内容显示为出处。
- 「结论」列可省略（显示「失败」）；出现 `N/10` 时画比例条。
- 适用：方法对比、排查过程、选型记录。

## pipeline——步骤流水线

可点击 / 方向键切换的步骤条，进入视口后自动播放。

- 降级内容：一个有序列表（第一个）：

  ```
  1. **建模**（Tripo）：用 Tripo 生成模型。→ 怪物网格
  2. **自动绑骨**（UniRig）：……→ 骨架
  ```
- 每项：`**标题**`、可选的 `（工具）`、`：说明`、可选的 `→ 产出`。
- 步骤数不限（窄屏每行 4 个）。
- props：`interval="3200"`（自动播放间隔毫秒）。
- 适用：系统流程、数据流、处理管线、操作步骤。

## 首屏：mocap-gait（默认）

程序化四足步态在正面 / 侧面两个取景器里同步行走，红色对极线连接同一关节。frontmatter 不写 `hero` 时使用。

为某篇文章定制首屏：在本文 `widgets.js` 里导出 `heroes: { "my-hero": mount }`，frontmatter 写 `hero: my-hero`。首屏 mount 收到 `<figure class="viewer">`，自己创建 svg / canvas 和 `<figcaption class="viewer-cap">` 图例；`ctx.clock` 是顶栏 REC 时间码元素，可选更新。

## 本文专属组件

组件库没有合适的，就写在文章文件夹里：

```js
// content/<板块>/<slug>/widgets.js
import { el, svg, onceVisible, whileVisible, reduceMotion } from "/stage/lib/dom.js";

function mountMyWidget(root, ctx) { /* ... */ }

export const widgets = { "my-widget": mountMyWidget };
export const heroes = {};            // 可选
```

样式写在同目录 `style.css`，会自动在页面里引用。

范例：`content/docs/ai-rig-any-monster/widgets.js`——
- `rig-select`：四次绑骨尝试按规则逐项打勾，自动选出最优；
- `synth-data`：合成训练图生成器，四个步骤可开关，标注始终精确（依赖同目录 `creature.js`）；
- `exam`：逐骨骼误差条，可切换到「坏改动」看它被拒绝合入；
- `depth-duel`：三种方法逐帧判断「哪条腿更近」。

写之前读 `widget-contract.md`。

## 晋升进组件库

一个专属组件同时满足以下条件，再搬进 `static/stage/widgets/`：
- 至少在两篇文章里有用；
- 数据能完全从降级内容（或 props）读取，不硬编码某篇文章的内容；
- 降级内容格式写进本文件。

晋升会影响所有文章，需要用户同意。
