# 开源雷达（Open Source Radar）设计说明

## 1. 背景与目标

热门开源项目数量大、变化快，依靠人工查找容易遗漏；即使发现项目，阅读 README、文档和示例也需要较高时间成本。

本功能在 Fruiticecake 静态博客中新增“开源雷达”板块，每天自动发现、筛选并解释值得关注的开源项目，让读者在 5 分钟内完成当天技术趋势浏览，并能对重点项目进行约 3 分钟的深度速读。

首版成功标准：

- 每天自动发布一份包含约 12 个项目的中文日报。
- 覆盖全部技术方向，AI、Agent 和开发者工具优先。
- 日报说明“项目解决什么问题、为什么值得关注、是否适合我”，而不只是翻译 README。
- 沿用现有 GitHub Actions、静态生成器和 Vercel 部署，不引入数据库或常驻后端。
- 数据源或 AI 服务短暂失败时，不覆盖已有日报，也不发布空白或明显残缺的页面。
- 桌面端和移动端均可快速扫读，并满足基础可访问性要求。

## 2. 命名与信息架构

### 2.1 名称

- 中文名称：开源雷达
- 英文副标题：Open Source Radar
- URL：`/opensource/`
- 一句话介绍：每天 5 分钟，读懂正在流行的开源项目。

不使用 `Githot`。截至设计时已经存在同名、同类的 GitHub Trending AI 摘要产品，继续使用会造成品牌、搜索和用户认知混淆。

### 2.2 站点位置

“开源雷达”作为当前博客的一级板块，加入：

- 顶部导航；
- 首页板块入口；
- 首页最新内容流；
- 全站归档和 RSS；
- 独立板块页 `/opensource/`；
- 每日日报详情页 `/opensource/YYYY-MM-DD.html`。

不把现有“AI HOT 日报”改名或合并。AI HOT 继续负责行业消息、产品发布和观点；开源雷达只负责可访问的开源仓库和项目分析，两者解决的问题不同。

## 3. 内容产品设计

### 3.1 每日内容结构

每天目标收录 12 个项目，允许在候选不足时发布 8 至 15 个，但不得用低质量项目机械补足数量。

日报由三层信息组成：

1. 今日风向：三条以内的趋势结论，说明项目集合反映出的技术方向。
2. 重点项目：默认 3 个，提供完整的 3 分钟速读。
3. 快速项目：默认 9 个，提供可在约 30 秒内读完的摘要。

每个项目至少展示：

- 仓库名和项目名称；
- 一句话结论；
- 解决的问题；
- 核心技术或架构；
- 走红信号；
- 适合人群；
- 上手难度：容易、中等、较难；
- 主语言、License、Star 总数及近期增长信号；
- GitHub 原始链接。

重点项目额外展示：

- 与同类方案相比的差异；
- 最短上手路径；
- 使用限制或采用风险；
- “为什么今天值得看”。

### 3.2 分类与配额

候选项目按以下目标权重选择：

- AI、Agent、模型与数据工具：35%；
- 开发者工具、编程语言与工程效率：25%；
- 前端、后端、云原生与基础设施：25%；
- 安全、硬件、数据科学及其他新兴方向：15%。

权重是排序偏好，不是硬性每日配额。高质量和新颖性优先于凑齐类别。

### 3.3 内容质量约束

- 摘要必须基于 GitHub 元数据、README 和仓库信息，不推测未被材料支持的能力。
- 明确区分总 Star 与近期热度信号。
- License 缺失时显示“未声明”，不得推断可商用。
- README 无法读取或信息不足时，只输出可验证字段，并降低入选分数。
- 相同项目七天内默认不重复进入日报；出现重大版本发布或异常增长时允许再次入选，并标注原因。
- Fork、镜像、教程列表、空壳仓库和明显营销仓库默认降权。

## 4. 候选发现与排序

### 4.1 数据源

首版采用多信号候选池，避免单一来源遗漏：

1. GitHub Trending 日榜：捕获当天社区热度。该页面没有稳定的官方 API，因此采集器必须隔离实现，并允许失败。
2. GitHub Search REST API：发现近期创建且快速获得 Star 的项目，以及近期活跃的高质量项目。
3. GitHub Repository REST API：补齐仓库描述、主题、主语言、License、Star、Fork、默认分支和更新时间。
4. README 内容：用于生成项目解释和采用建议。

所有 GitHub API 请求使用 GitHub Actions 提供的 `GITHUB_TOKEN`。采集器遵守分页和速率限制，并缓存本次任务内已获取的仓库信息。

### 4.2 排序模型

候选分数由确定性规则计算，AI 不直接决定原始排名：

```text
score = 近期热度 35%
      + 新颖性 20%
      + 项目质量 20%
      + 技术相关性 15%
      + 类别多样性 10%
```

其中：

- 近期热度综合 Trending 排名、当日 Star 提示和近期创建后的增长速度；
- 新颖性降低七天内重复项目和长期常驻项目的分数；
- 项目质量综合活跃度、License、README 完整度和社区信号；
- 技术相关性提高 AI、Agent、开发者工具等目标方向的权重；
- 类别多样性用于避免整份日报被单一语言或主题占满。

排序完成后取约 20 个候选交给 AI 分析，再经过结构校验与质量规则选出最终 8 至 15 个项目。

## 5. AI 速读生成

### 5.1 输入和输出

AI 输入只包含经过截断和清洗的仓库元数据、README 片段及可验证的热度信号。生成结果必须返回约定 JSON 结构，不允许直接生成整页 HTML。

结构化结果包括：

- `headline`：一句话结论；
- `problem`：解决的问题；
- `approach`：核心技术或架构；
- `why_trending`：可验证的走红依据；
- `audience`：适合人群；
- `difficulty`：枚举值；
- `differentiator`：重点项目使用；
- `quick_start`：重点项目使用；
- `caveats`：限制与风险；
- `category` 和 `tags`。

生成器对字段类型、长度、枚举、URL 和必填项进行校验。未通过校验时最多重试一次；仍失败则跳过该候选，不能把原始模型输出直接写入页面。

### 5.2 模型配置

AI 服务通过环境变量配置，密钥只保存在 GitHub Actions Secrets 和本地 `.env.local`，不会写入内容、日志或仓库。模型调用封装在独立模块中，使后续更换兼容 API 或模型时不影响采集、排序和渲染。

若未配置 AI 密钥，本地构建仍可渲染已经提交的历史日报；只有“生成新日报”任务需要模型服务。

### 5.3 Provider correction after final review

The originally planned GitHub Models dependency was retired before release. New live digests use DeepSeek's official chat-completions contract instead:

- default endpoint: `https://api.deepseek.com/chat/completions` (`DEEPSEEK_ENDPOINT` may override it);
- default model: `deepseek-v4-flash` (`DEEPSEEK_MODEL` may override it);
- authentication: `DEEPSEEK_API_KEY` as a bearer token;

### 5.4 Two-stage reserve and publication selection

Candidate ranking and publication category selection are intentionally separate. The deterministic ranker first produces up to 20 eligible metadata candidates after duplicate, fork, archive, and seven-day repeat filtering. Category targets do not truncate this analysis reserve, so a narrow-source day can still tolerate per-project model failures. README enrichment and model analysis operate on that bounded reserve.

Only validated briefs enter publication selection. The final 8-12 projects follow the 35/25/25/15 targets and the 12-item caps (5 AI, 4 developer tools, 4 platform, 3 other) as far as the available validated briefs allow. When the source pool cannot provide enough categories, selection may cross a cap only to reach the safe minimum of eight.

For manual workflow dispatch, `dry-run` executes radar diagnostics with `--dry-run` but gates both the write-capable AI HOT step and the commit/push step. Push and scheduled events remain publishing runs.
- structured output: `response_format: {"type": "json_object"}`;
- reasoning mode: `thinking: {"type": "disabled"}`.

`GITHUB_TOKEN` remains isolated to GitHub Trending/Search/repository/README collection and is never reused as model authentication. Live generation fails closed when either required key is missing; the deterministic static build of committed historical digests remains network-free and keyless. No deterministic non-AI brief fallback is allowed because it would silently publish a lower-confidence product under the same editorial contract.

## 6. 文件与模块边界

在现有 Python 静态站点中新增以下边界：

```text
src/
  opensource.py              # 每日任务入口与流水线编排
  opensource_sources.py      # Trending、Search、仓库和 README 获取
  opensource_ranker.py       # 确定性打分、去重和多样性选择
  opensource_ai.py           # AI 请求、结构校验和重试
  opensource_render.py       # 将结构化日报写为 Markdown/HTML 片段
content/
  opensource/
    YYYY-MM-DD.md            # 可审阅、可版本追踪的最终日报
tests/
  fixtures/                  # 固定 API/README/AI 响应
  test_opensource_*.py       # 采集、排序、校验、渲染测试
```

现有 `generator.py` 只负责读取内容和生成站点。开源雷达增加专属板块列表渲染器，但不把网络请求或 AI 调用放入 Vercel 构建阶段。Vercel 构建继续保持纯本地、确定性和零密钥依赖。

## 7. 自动化与数据流

每日发布流程：

```text
GitHub Actions 定时触发
  -> 采集多个候选源
  -> GitHub API 补全元数据和 README
  -> 规则排序、去重和类别平衡
  -> AI 生成结构化中文速读
  -> JSON 校验与内容质量检查
  -> 写入 content/opensource/YYYY-MM-DD.md
  -> 运行静态生成器和测试
  -> 仅在全部成功时提交并推送
  -> Vercel 检测推送并部署 public/
```

定时任务每天运行一次主任务，并保留一次晚间补跑。当天文件已存在且内容通过校验时，任务幂等退出，不重复调用 AI 或制造无意义提交。手动触发支持指定日期及 dry-run，便于排查采集和模型问题。

## 8. 页面与视觉设计

### 8.1 视觉方向

延续当前博客的暖色纸张感和编辑式排版，不创建脱离全站风格的独立 SaaS 仪表盘。“雷达”通过克制的扫描线、坐标刻度和信号点表达，不使用霓虹赛博风。

页面需要让读者记住：这是一份经过筛选和解释的技术风向简报，而不是另一张 GitHub 卡片墙。

### 8.2 板块首页

板块页包含：

- 标题、说明和“连续更新天数”；
- 最新一期的大幅主入口，突出日期、项目数和三条趋势；
- 最近 14 天的日期轨迹；
- 历史日报列表，展示每天的趋势摘要而不是重复文章标题。

### 8.3 日报详情页

阅读顺序固定为：

1. 日期、采集时间、项目数和数据说明；
2. 今日风向；
3. 三个重点项目；
4. 快速项目列表；
5. 方法说明和数据来源。

重点项目使用横向编辑卡片：左侧排名和仓库元数据，右侧为问题、方法、适合人群及限制。快速项目使用紧凑列表，不重复展示重点项目的全部字段。

卡片支持键盘聚焦；外链图标和文本共同表达跳转；颜色不作为类别或难度的唯一提示。移动端改为单列，避免横向滚动。尊重 `prefers-reduced-motion`，雷达扫描动画仅作为非必要的氛围效果。

## 9. 失败处理与可观测性

- Trending 解析失败：记录告警，继续使用 Search API 候选。
- 单仓库 API 或 README 失败：跳过或使用已有元数据，不终止整批任务。
- GitHub API 速率不足：停止扩展候选，使用已获取数据完成本次任务；不足 8 个合格项目则不发布。
- AI 请求失败：指数退避后重试；单项目失败可跳过，整日报不足 8 个时不发布。
- 内容校验失败：保留临时诊断文件作为 Actions artifact，不提交到仓库。
- 静态构建或测试失败：禁止提交日报。
- Vercel 部署失败：保留已提交内容，由现有 Vercel 重试或人工重新部署。

日志只记录仓库名、阶段、耗时、响应状态和错误类别，不记录 Token、完整请求头或密钥。

## 10. 测试与验收

### 10.1 自动化测试

- 单元测试：Trending 解析、GitHub 响应归一化、排序、七日去重、类别平衡、AI JSON 校验和 Markdown 转义。
- 集成测试：用固定 fixture 完整生成一份日报，并交给现有生成器构建站点。
- 回归测试：现有 AI HOT、AI 对话、博客、技术文档、RSS 和归档仍可生成。
- 构建检查：内部链接存在、页面无空标题、无重复 ID、外链带安全属性。

### 10.2 端到端测试

在本地生产构建和 Vercel 线上环境分别验证：

- 首页可进入开源雷达；
- 顶部导航和板块卡片链接正确；
- 最新日报可打开，重点和快速项目数量正确；
- GitHub 外链在新标签页打开；
- 历史日期可以访问；
- 375px 手机视口和 1440px 桌面视口无溢出；
- 键盘可访问所有交互项；
- 页面无严重控制台错误和资源加载失败。

### 10.3 UI 检查

对首页、板块首页和日报详情页分别保留桌面与移动端截图，检查：

- 字体层级和 5 分钟扫读路径是否清晰；
- 重点项目与快速项目的视觉权重是否明显不同；
- 长仓库名、长中文摘要和无 License 状态是否破坏布局；
- 颜色对比、焦点态、减少动画模式是否正常；
- 新板块与现有博客视觉系统是否一致。

## 11. 发布与代码同步

实现阶段使用当前 `main` 分支，保留用户现有未跟踪文件，不做无关清理。提交按“功能实现、测试/修复、生成内容或文档”拆分为可审阅的提交。

发布顺序：

1. 本地运行全部测试和生产构建；
2. 本地浏览器完成端到端和 UI 检查；
3. 提交并推送至远程 `main`；
4. 等待 Vercel 生产部署完成；
5. 在线重复关键端到端路径和桌面/移动 UI 检查；
6. 记录线上 URL、提交哈希、部署状态和测试结果。

只有代码已推送、Vercel 线上页面可访问、端到端测试和 UI 检查通过，才视为本功能完成。

## 12. 明确不在首版范围

- 登录、收藏、点赞和个人推荐；
- 数据库及运行时服务端 API；
- 邮件、微信或聊天机器人订阅；
- 多语言内容；
- 项目评论、用户投稿和社区评分；
- 实时榜单或分钟级更新；
- 独立域名和独立商业品牌。

这些能力可在日报质量和使用频率得到验证后再评估。
