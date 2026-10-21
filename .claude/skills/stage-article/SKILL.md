---
name: stage-article
description: 为 Fruiticecake 个人技术博客写「动捕棚」版式（design: stage）的图文交互文章，并同步生成 CSDN 版本。凡是要把视频、文章、论文、笔记、对话整理成博客文章，写技术文档 / 图文教程 / 交互讲解，给已有 stage 文章加章节或交互组件，或要「发到个人站和 CSDN」时都使用本 skill——即使用户只说「写成一篇文章」「整理一下发博客」「做个可视化讲解」，没有提到 stage 或动捕棚。
---

# stage-article：动捕棚版式的技术文章

一份 Markdown 原稿，两种产物：
- **个人站**：生成器把原稿渲染成深色「动捕棚」页面——首屏动画、时间码目录、交互组件、滚动动效；
- **CSDN**：`export_csdn.py` 把同一份原稿展开成普通 Markdown，交互块变成文字版 +「交互版见原文」链接。

所以原稿是唯一的内容源。任何事实、数字、结论都只写在原稿的文字里；交互组件负责「让人看懂」，不负责「告诉人新事实」。

仓库根目录是 `blog/`（下文命令都在这里执行）。生成器零依赖，Python 3.11+ 即可。

## 工作流

### 1. 取材：只从原始出处取事实

- 视频：用 yt-dlp 只抓字幕（`--skip-download --write-auto-subs --sub-langs en-orig`），YouTube 偶尔 429，换 `en-orig` 或稍后重试。
- 文章 / 论文：读全文，不要只看摘要。
- 记下出处的标题、作者 / 频道、日期、链接，以及关键时间码（视频）或章节（文章）。

为什么严格：读者会拿这篇文章复习，错一个数字比少一段更伤。原文没给的数字，在组件里可以作图解，但必须标「示意」，文字里不能写成事实。

### 2. 提炼：先想清楚再动笔

写下这四样，再开始写原稿：
1. **一句话结论**——读者只读 TL;DR 也能带走的东西；
2. **化简后的核心问题**——把模糊的大问题压成一个可以检验的小问题；
3. **章节骨架**——通常是：问题 → 尝试 / 失败 → 化简 → 方案 → 验证 → 局限 → 可迁移的方法论；
4. **3–5 个值得做成交互的概念**——判断标准：读者动一下手（拖、切换、看它播放）就能「豁然开朗」的东西。几何关系、流程、对比、取舍、数据生成过程都很合适；纯观点、纯列表不需要交互。

详细的写作范式、语气、标题与摘要的写法：读 `references/writing.md`。

### 3. 建草稿并写原稿

```bash
python3 src/drafts.py new "文章标题" --stage --slug english-slug --tags AI,3D
```

会生成 `drafts/<slug>/index.md`（drafts/ 已 gitignore，不会公开）。模板里每种写法都有最小示例。语法全集（frontmatter、时间码标题、`:::` 指令、文件夹资源）：读 `references/syntax.md`。

### 4. 选组件

- 组件库里已有的直接用（`triangulation`、`attempt-log`、`pipeline`），它们从降级内容里读数据；
- 没有合适的，就在草稿文件夹里写**本文专属组件**（`widgets.js` + `style.css`），不需要改模板或生成器。

组件目录与数据格式：`references/components.md`。写专属组件前必读 `references/widget-contract.md`（契约、主题变量、无障碍、性能、容错）。动效是自动挂上的，作者通常什么都不用做；想为某篇文章定制动效时读 `references/motion.md`。

### 5. 发布到 content/ 并自检

```bash
python3 src/drafts.py publish drafts/<slug>     # 先做 stage 渲染校验，写法错误会报出行号，草稿不动
python3 src/generator.py                         # 构建 public/
python3 -m http.server 4321 --directory public   # 本地预览
python3 -m unittest discover -s tests            # 和 CI 同一条命令
```

在浏览器里按 `references/qa.md` 逐项检查：桌面和手机宽度、控制台、所有组件都挂载、减弱动效、事实核对。

### 6. 导出 CSDN 版本

```bash
python3 src/export_csdn.py content/<板块>/<slug>
```

结果在 `exports/csdn/<slug>.md`。通读一遍：文字版是否自成一体、「交互版见原文」的锚点是否落在对的章节、有没有只适用于个人站的说法（比如「左侧目录」）。

## 底线

- **事实只来自原文**；图解性的数字、画面在组件里标「示意」。
- **每个交互块都要有能独立阅读的文字版**——CSDN、无 JS、搜索引擎都只看得到它。
- **尊重原作者**：开头写明出处与链接，用自己的话重述，不大段翻译或照搬字幕。
- **不替用户发布**：`git push` 等于上线，`commit` / `push` 都要等用户明确同意。
- 生成器、测试、`static/stage/` 是全站共用的，改它们会影响所有文章；只为一篇文章服务的东西放在那篇文章的文件夹里。

## 参考文件

| 文件 | 什么时候读 |
|---|---|
| `references/writing.md` | 每次写原稿前 |
| `references/syntax.md` | 写原稿时查语法 |
| `references/components.md` | 选组件 / 想知道组件需要什么格式的降级内容 |
| `references/widget-contract.md` | 写本文专属组件前 |
| `references/motion.md` | 想调整或新增动效时 |
| `references/qa.md` | 发布后自检 |

范例：`content/docs/ai-rig-any-monster/`——第一篇 stage 文章，包含全部语义块、3 个通用组件和 4 个专属组件。
