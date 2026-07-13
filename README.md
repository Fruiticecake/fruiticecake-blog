# 煜杰的博客（静态站点）

纯静态、零服务器、零数据库的个人博客。AI HOT 日报是其中一个自动归档的板块，
你也可以用 Markdown 写自己的博客与技术文档。生成器为**纯 Python、零第三方依赖**。

## 目录结构

```text
blog/
├── config.json          # 站点元信息 + 板块配置（改这里加板块）
├── content/             # 你写的内容（Markdown）
│   ├── aihot/           # AI HOT 日报（src/aihot.py 每日自动生成）
│   ├── blog/            # 我的博客（手写）
│   └── docs/            # 技术文档（手写）
├── src/                 # 生成器源码
│   ├── generator.py     # 主入口：读取 content/ → 渲染 public/
│   ├── aihot.py         # 拉取 AI HOT 当日日报，写成 content/aihot/<date>.md
│   ├── markdown.py      # 零依赖 Markdown → HTML
│   ├── models.py        # 数据模型 Post / Section
│   ├── util.py          # slug、北京时间、frontmatter 解析
│   └── templates/       # HTML 模板（改版式改这里）
├── static/style.css     # 全局样式
├── public/              # 生成的站点（部署时由 Vercel 运行生成器产出，不入库）
└── .github/workflows/   # 每日自动构建 + 部署
```

## 本地预览

```bash
python3 src/aihot.py        # （可选）拉取今日 AI HOT
python3 src/generator.py    # 生成 public/
python3 -m http.server -d public 8000
# 打开 http://localhost:8000
```

## 写一篇新文章

在对应板块目录新建 `.md` 文件，写 frontmatter + 正文，**提交即发布**：

```markdown
---
title: 文章标题
date: 2026-07-13
summary: 一句话摘要（列表/卡片预览用）
tags: [标签A, 标签B]
slug: my-post        # 可选，缺省用文件名
---

正文用 Markdown……
```

- 我的博客 → `content/blog/`
- 技术文档 → `content/docs/`
- 提交后 GitHub Action 自动重新生成并部署。

## 新增一个板块（无需改代码）

1. 建目录 `content/<板块slug>/`
2. 在 `config.json` 的 `sections` 数组加一条：

```json
{
  "sections": [
    {
      "slug": "notes",
      "name": "随手记",
      "description": "零碎想法"
    }
  ]
}
```

生成器会自动建列表页、路由与导航。

## 部署（Vercel，复用你现有域名）

域名 `zyjproject.top` 未 ICP 备案、现托管在海外 Vercel，故走海外托管、免备案。
1. 把本仓库推到 GitHub。
2. Vercel → New Project → 导入仓库。
   - Framework Preset 选 `Other`；本仓库 `vercel.json` 已锁 `framework: none`、`outputDirectory: public`。
3. Settings → Domains → 填 `ai.zyjproject.top`（或 `zyjproject.top/blog`）。
   - Vercel 给一条 CNAME（指向 `cname.vercel-dns.com`）。
   - 去阿里云控制台 → 云解析DNS → `zyjproject.top` → 添加记录：
     主机记录 `ai`、类型 `CNAME`、记录值 `cname.vercel-dns.com`。
4. 之后推送 / 每日定时 → Vercel 自动重新部署。

## 自动更新

`.github/workflows/build.yml`：每次 push 重新构建；每天**北京时间 10:00** 自动拉取
AI HOT 当日日报并重新生成整站（提交用 `blog-bot` 机器人身份，不暴露个人邮箱）。

## 隐私说明

仓库内容均为公开博客数据。提交前会做隐私/密钥审查（Grep 扫密钥/凭据/PII），
不提交任何敏感信息。自动提交使用机器人邮箱，不关联个人账号。
