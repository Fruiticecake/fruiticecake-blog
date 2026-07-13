---
title: 站点技术文档：架构与扩展指南
date: 2026-07-13
summary: 自研静态博客生成器的目录结构、内容模型与扩展方式。
tags: [技术文档, 架构, 静态站点]
slug: getting-started
---

本文说明 Fruiticecake 博客站点的内部结构与如何扩展。生成器是**纯 Python、零第三方依赖**（仅用标准库 `json` 与 `string.Template`）。

## 目录结构

```text
blog/
├── config.json          # 站点元信息 + 板块配置
├── content/             # 内容（Markdown / HTML）
│   ├── aihot/           # AI HOT 日报（自动生成，卡片布局）
│   ├── blog/            # 博客
│   └── docs/            # 技术文档
├── src/                 # 生成器源码
│   ├── generator.py     # 主入口
│   ├── aihot.py         # 拉取 AI HOT 并生成卡片 HTML
│   ├── markdown.py      # Markdown 渲染
│   ├── models.py        # 数据模型
│   ├── util.py          # 工具函数
│   └── templates/       # HTML 模板
├── static/style.css     # 全局样式
└── public/              # 生成的站点
```

## 内容模型

```markdown
---
title: 文章标题
date: 2026-07-13
summary: 一句话摘要
tags: [标签A, 标签B]
slug: my-post
---

正文……
```

AI HOT 日报使用 `html: true`，正文为卡片网格 HTML，生成器不再走 Markdown。

板块由**目录名**决定，例如 `content/blog/foo.md` 属于 `blog` 板块。

## 如何新增一个板块

1. 建目录 `content/<板块slug>/`
2. 在 `config.json` 的 `sections` 数组加一条配置
3. 提交即可；无需改代码

## 本地预览

```bash
python3 src/aihot.py
python3 src/generator.py
python3 -m http.server -d public 8000
```
