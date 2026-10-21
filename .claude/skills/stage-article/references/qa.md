# 发布前自检

按顺序做。任何一项不过，先修再往下。

## 1. 构建与测试

```bash
python3 src/drafts.py publish drafts/<slug>        # stage 写法校验（失败会报行号，草稿不动）
python3 src/generator.py
python3 -m unittest discover -s tests             # 与 CI 同一条命令
node --check content/<板块>/<slug>/widgets.js      # 有专属组件时
```

## 2. 浏览器（桌面 1440 宽 + 手机 375 宽）

用本地服务器打开 `http://localhost:4321/<板块>/<slug>.html`，在控制台执行：

```js
await new Promise((r) => setTimeout(r, 3000));
({
  modules: document.querySelectorAll(".module").length,
  mounted: document.querySelectorAll(".module.is-mounted").length,
  failed: [...document.querySelectorAll(".module.is-failed [data-widget]")].map((n) => n.dataset.widget),
  hero: !!document.querySelector(".viewer svg, .viewer canvas"),
  overflow: document.documentElement.scrollWidth > innerWidth,
})
```

期望：`mounted === modules`、`failed` 为空、`hero` 为真、`overflow` 为假。

- 控制台除 `/_vercel/insights/script.js` 的 404（统计脚本只在线上存在）外，没有错误。
- 逐个操作每个组件：点击、拖动、方向键、切换按钮。
- 首屏标题只有方括号里的词是荧光色。
- 手机宽度：组件文字不小于约 9px，没有横向滚动。

预览面板隐藏时浏览器会冻结动画——截图前先 `document.getAnimations().forEach(a => { try { a.finish() } catch {} })`，或让用户看着页面验证。

## 3. 降级与减弱动效

- 在控制台执行 `document.documentElement.classList.remove("m-on", "m-ready")`：所有内容应立即完整可见。
- 把某个组件名临时改错（只在 public/ 的副本里改）：该模块应显示 OFFLINE 且文字版可读，其他组件不受影响。

## 4. 事实核对

- 文中每个数字、每个结论都能在原始出处里找到对应。
- 组件里原文没给的数字，下方都有「示意」说明；参考区有一句总说明。
- 出处、链接、作者在开头和参考区都写了。

## 5. CSDN 版本

```bash
python3 src/export_csdn.py content/<板块>/<slug>
```

通读 `exports/csdn/<slug>.md`：
- 没有残留的 `:::`；
- 每个交互块的文字版能独立读懂，「交互版见原文」的锚点落在正确章节；
- 没有只适用于个人站的说法（「左侧目录」「拖动上面的点」）——改成两边都成立的写法。

## 6. 交还给用户

列出：页面地址、做了哪些组件、哪些内容是「示意」、CSDN 导出文件位置。`git commit` / `git push` 等用户明确同意后再做。
