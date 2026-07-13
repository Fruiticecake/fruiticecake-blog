---
title: 欢迎来到我的博客
date: 2026-07-13
summary: 这个站点用什么搭的、为什么这么搭，以及我会在这里写些什么。
tags: [随笔, 博客搭建]
slug: welcome
---

二〇二六年七月，Fruiticecake 把这个博客站搭起来了。它完全**静态**、零服务器、零数据库，别人能直接打开阅读。

## 为什么是静态站点

不想维护服务器。静态站点只需要能托管 HTML 的地方（这里用 Vercel），内容用 Markdown 写，提交即发布。简单、快、便宜、可控。

## 这个站点的板块

- **AI HOT 日报**：每天自动拉取 AI 圈动态并归档，卡片浏览。
- **博客**：随笔、思考、日常，就像这一篇。
- **技术文档**：技术笔记、教程、踩坑记录。

## 怎么写一篇新文章

在 `content/blog/` 目录下新建一个 `.md` 文件，写好 frontmatter（标题、日期、标签），正文用 Markdown，提交即可：

```bash
git add content/blog/my-post.md
git commit -m "post: my-post"
git push
```

GitHub Action 会自动重新生成整站。就这么简单。

> 框架本身可拓展：要加新板块，建 `content/<板块>/` 目录，并在 `config.json` 里加一条配置即可，不用改代码。
