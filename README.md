# Fruiticecake 的博客（静态站点）

纯静态、零服务器、零数据库的公开个人博客。作者署名 **Fruiticecake**。
AI HOT 日报是其中一个自动归档板块；也可用 Markdown 写博客与技术文档。
生成器为**纯 Python、零第三方依赖**。

## 目录结构

```text
blog/
├── config.json          # 站点元信息 + 板块配置
├── content/             # Markdown / HTML 内容
│   ├── aihot/           # AI HOT 日报（自动生成，卡片布局）
│   ├── blog/            # 博客
│   └── docs/            # 技术文档
├── src/                 # 生成器源码
├── static/style.css     # 全局样式
├── public/              # 构建产物（部署用，不入库）
└── .github/workflows/   # 定时拉取 + 构建
```

## 本地预览

```bash
python3 src/aihot.py        # （可选）拉取今日 AI HOT
python3 src/generator.py    # 生成 public/
python3 -m http.server -d public 8000
```

## 部署

- 生产站点：https://zyj-blog.vercel.app
- GitHub：https://github.com/Fruiticecake/fruiticecake-blog
- Vercel Framework：`Other`，`outputDirectory: public`，构建命令见 `vercel.json`

## 公开说明

本仓库内容为可公开阅读的博客数据，不包含个人真实姓名、私人邮箱或未公开域名配置。
自动提交使用 `blog-bot` 机器人身份。
