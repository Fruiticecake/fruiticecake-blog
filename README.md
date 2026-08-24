# Fruiticecake 的博客（静态站点）

纯静态、零服务器、零数据库的公开个人博客。作者署名 **Fruiticecake**。
AI HOT 日报是其中一个自动归档板块；也可用 Markdown 写博客与技术文档。
生成器为**纯 Python、零第三方依赖**。

## 目录结构

```text
blog/
├── config.json          # 站点元信息 + 板块配置 + 访问统计开关
├── content/             # Markdown / HTML 内容
│   ├── aihot/           # AI HOT 日报（自动生成，卡片布局）
│   ├── blog/            # 博客
│   └── docs/            # 技术文档
├── src/
│   ├── generator.py     # 入口：读 content/ 渲染到 public/
│   ├── ui.py            # 界面外壳：导航、底部标签栏、月历、统计数字
│   └── templates/       # string.Template 模板
├── static/              # 整目录拷贝到 public/（style.css、favicon.svg）
├── public/              # 构建产物（部署用，不入库）
└── .github/workflows/   # 定时拉取 + 构建
```

## 本地预览

```bash
python3 src/aihot.py        # （可选）拉取今日 AI HOT
python3 src/generator.py    # 生成 public/
python3 -m http.server -d public 8000
```

跑测试（与 CI 同一条命令）：

```bash
python3 -m unittest discover -s tests
```

## 新增板块

在 `config.json` 的 `sections` 加一条即可，无需改代码：`slug` / `name` /
`tab`（底部标签栏短标签）/ `description` / `dot`。导航、底部标签栏、
板块卡片都会自动跟着长出来；未单独适配的板块走通用时间线列表样式。

## 访问统计

只做后台统计，页面上不显示访问量数字。

1. Vercel Dashboard → **Analytics** → 选择项目 → **Enable**
2. **重新部署一次**——启用只会在下一次部署后才创建 `/_vercel/insights/*` 路由

路径由 `config.json` 的 `site.analytics_script` 控制，留空即关闭。后台启用后会
额外给一个项目专属路径（更抗广告拦截），可直接替换默认值。出于安全考虑该字段
只接受站内绝对路径，不能填第三方脚本地址。

## 部署

- 生产站点：https://zyj-blog.vercel.app
- GitHub：https://github.com/Fruiticecake/fruiticecake-blog
- Vercel Framework：`Other`，`outputDirectory: public`，构建命令见 `vercel.json`
- 推送到 `main` 即触发 Vercel 生产部署

## 公开说明

本仓库内容为可公开阅读的博客数据，不包含个人真实姓名、私人邮箱或未公开域名配置。
自动提交使用 `blog-bot` 机器人身份。
