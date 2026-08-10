# Open Source Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily “开源雷达” section that discovers trending GitHub repositories, produces structured Chinese project briefs, publishes them through the existing static blog, and is verified locally and on Vercel.

**Architecture:** A standard-library Python pipeline collects GitHub candidates, ranks them deterministically, calls DeepSeek for structured analysis, validates the result, and writes a versioned Markdown digest under `content/opensource/`. The existing generator renders the committed digest without network or secrets; GitHub Actions owns collection and generation, and Vercel continues to perform a deterministic static build.

**Tech Stack:** Python 3.11 standard library, `unittest`, GitHub REST API, DeepSeek chat-completions API, existing HTML/CSS static generator, GitHub Actions, Vercel, browser-based E2E verification.

**Provider correction (final review):** The original GitHub Models integration was retired before release. Live generation now uses `DEEPSEEK_API_KEY` with `DEEPSEEK_ENDPOINT` defaulting to `https://api.deepseek.com/chat/completions` and `DEEPSEEK_MODEL` defaulting to `deepseek-v4-flash`. Requests use JSON-object mode with thinking disabled. `GITHUB_TOKEN` is used only for GitHub repository data. A live run without either required key fails closed; committed historical digests remain renderable by the static generator without any key.

**Final review round 2 correction:** Ranking now exposes a two-stage contract. `rank_candidates(..., limit=20)` returns the complete eligible analysis reserve without publication category truncation. After bounded README enrichment and independent model validation, `select_briefs(..., limit=12, minimum=8)` applies publication targets and caps, with cap-crossing backfill limited to the safe minimum. Workflow-dispatch dry runs gate AI HOT and commit/push while passing `--dry-run` to radar. Generator parsing JSON-decodes machine-written frontmatter values while retaining legacy unquoted values.

## Global Constraints

- The public route is `/opensource/`; the visible name is `开源雷达` and subtitle is `Open Source Radar`.
- Daily output contains 8–15 projects, targeting 12, with three featured projects when enough candidates exist.
- Category weighting targets AI/Agent 35%, developer tools 25%, frontend/backend/infrastructure 25%, other emerging technology 15%.
- No database, runtime backend, login, collection, personalization, email subscription, or separate domain in v1.
- Vercel build stays network-free and uses only committed content; only GitHub Actions may call GitHub or model APIs.
- The workflow passes `GITHUB_TOKEN` and the `DEEPSEEK_API_KEY` secret only to the radar step, grants only `contents: write`, and commits no secret.
- An incomplete digest with fewer than eight valid projects is never committed.
- Existing untracked files are user-owned and must not be modified, removed, or included in feature commits.
- Desktop 1440px and mobile 375px layouts must have no horizontal overflow and all repository links must be keyboard reachable.

---

### Task 1: Domain Models and Deterministic Ranking

**Files:**
- Create: `tests/__init__.py`
- Create: `src/opensource_models.py`
- Create: `src/opensource_ranker.py`
- Create: `tests/test_opensource_ranker.py`

**Interfaces:**
- Produces: `RepositoryCandidate`, `ProjectBrief`, and `DailyDigest` dataclasses.
- Produces: `score_candidate(candidate: RepositoryCandidate, seen: set[str], now: datetime.datetime) -> float`.
- Produces: `rank_candidates(candidates: list[RepositoryCandidate], seen: set[str], limit: int = 20) -> list[RepositoryCandidate]` for the analysis reserve.
- Produces: `select_candidates(...)` for metadata-level compatibility and `select_briefs(briefs, limit=12, minimum=8)` for final publication selection.
- Consumed by Tasks 2–4.

- [ ] **Step 1: Write ranking tests**

```python
def test_recent_ai_project_outranks_stale_duplicate():
    fresh = candidate("org/fresh-agent", topics=["ai", "agent"], stars=900, trending_rank=2)
    stale = candidate("org/old", stars=50000, trending_rank=None, pushed_days_ago=120)
    ranked = select_candidates([stale, fresh], {"org/old"}, limit=2)
    assert ranked[0].full_name == "org/fresh-agent"

def test_selection_deduplicates_and_limits_single_category():
    selected = select_candidates(make_category_fixture(), set(), limit=12)
    assert len({item.full_name.lower() for item in selected}) == len(selected)
    assert sum(item.category == "ai" for item in selected) <= 5
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `python -m unittest tests.test_opensource_ranker -v`

Expected: import failure for `opensource_models` or `opensource_ranker`.

- [ ] **Step 3: Implement focused dataclasses and ranking rules**

```python
@dataclass
class RepositoryCandidate:
    full_name: str
    html_url: str
    description: str
    language: str
    license_name: str
    stars: int
    forks: int
    topics: list[str]
    created_at: datetime.datetime
    pushed_at: datetime.datetime
    trending_rank: int | None = None
    stars_today: int | None = None
    readme: str = ""
    category: str = "other"
    score: float = 0.0

@dataclass
class ProjectBrief:
    candidate: RepositoryCandidate
    headline: str
    problem: str
    approach: str
    why_trending: str
    audience: str
    difficulty: str
    differentiator: str = ""
    quick_start: str = ""
    caveats: str = ""

@dataclass
class DailyDigest:
    date: datetime.date
    generated_at: datetime.datetime
    trends: list[str]
    featured: list[ProjectBrief]
    quick: list[ProjectBrief]
```

Implement normalized full-name deduplication, seven-day repeat penalty, recency/quality/relevance factors, fork/archive rejection, and category caps of 5 AI, 4 devtools, 4 platform, and 3 other in a 12-item final set.

- [ ] **Step 4: Run ranking tests**

Run: `python -m unittest tests.test_opensource_ranker -v`

Expected: all ranking tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/opensource_models.py src/opensource_ranker.py tests/__init__.py tests/test_opensource_ranker.py
git commit -m "feat: add open source radar ranking"
```

### Task 2: GitHub Candidate Sources

**Files:**
- Create: `src/opensource_sources.py`
- Create: `tests/fixtures/trending.html`
- Create: `tests/fixtures/search.json`
- Create: `tests/fixtures/repository.json`
- Create: `tests/fixtures/readme.json`
- Create: `tests/test_opensource_sources.py`

**Interfaces:**
- Consumes: `RepositoryCandidate` from Task 1.
- Produces: `parse_trending(html_text: str) -> list[dict]`.
- Produces: `GitHubClient(token: str | None, timeout: int = 30)` with `fetch_trending()`, `search_repositories(query: str, limit: int)`, `get_repository(full_name: str)`, and `get_readme(full_name: str)`.
- Produces: `collect_candidates(client: GitHubClient, date: datetime.date) -> list[RepositoryCandidate]`.

- [ ] **Step 1: Add fixture-driven source tests**

```python
def test_parse_trending_extracts_repo_rank_and_daily_stars():
    items = parse_trending(fixture("trending.html"))
    assert items[0] == {"full_name": "sample/agent-kit", "rank": 1, "stars_today": 842}

def test_collect_candidates_survives_trending_failure():
    client = FakeGitHubClient(trending_error=RuntimeError("layout changed"))
    result = collect_candidates(client, datetime.date(2026, 8, 9))
    assert len(result) >= 8
    assert client.search_calls
```

- [ ] **Step 2: Verify source tests fail**

Run: `python -m unittest tests.test_opensource_sources -v`

Expected: import failure for `opensource_sources`.

- [ ] **Step 3: Implement HTTP client, parsing, and fallbacks**

Use `urllib.request` with `User-Agent`, `Accept: application/vnd.github+json`, and bearer authorization when a token is present. Search with these deterministic query families:

```python
queries = [
    f"created:>={date - timedelta(days=14)} stars:>=50 archived:false fork:false",
    f"pushed:>={date - timedelta(days=7)} stars:>=500 archived:false fork:false",
]
```

Trending parsing must be isolated so an HTML layout change logs a warning and still returns Search API candidates. README text is capped at 18,000 characters before AI input.

- [ ] **Step 4: Run source tests**

Run: `python -m unittest tests.test_opensource_sources -v`

Expected: all source tests pass without network access.

- [ ] **Step 5: Commit**

```bash
git add src/opensource_sources.py tests/fixtures tests/test_opensource_sources.py
git commit -m "feat: collect GitHub project candidates"
```

### Task 3: Structured AI Analysis

**Files:**
- Create: `src/opensource_ai.py`
- Create: `tests/fixtures/model_response.json`
- Create: `tests/test_opensource_ai.py`

**Interfaces:**
- Consumes: `RepositoryCandidate` and produces `ProjectBrief` from Task 1.
- Produces: `validate_brief(data: dict, candidate: RepositoryCandidate) -> ProjectBrief`.
- Produces: `DeepSeekClient(token: str, model: str = "deepseek-v4-flash", endpoint: str = "https://api.deepseek.com/chat/completions", timeout: int = 60)`.
- Produces: `analyze_candidate(client: DeepSeekClient, candidate: RepositoryCandidate, featured: bool, *, sleeper, retry_delay) -> ProjectBrief`.

- [ ] **Step 1: Add strict validation tests**

```python
def test_validate_brief_accepts_bounded_structured_result():
    brief = validate_brief(load_json("model_response.json"), sample_candidate())
    assert brief.difficulty in {"容易", "中等", "较难"}
    assert brief.repository_url == "https://github.com/sample/agent-kit"

def test_validate_brief_rejects_missing_problem_and_unknown_difficulty():
    data = load_json("model_response.json")
    data.update(problem="", difficulty="专家")
    with self.assertRaises(BriefValidationError):
        validate_brief(data, sample_candidate())
```

- [ ] **Step 2: Verify AI tests fail**

Run: `python -m unittest tests.test_opensource_ai -v`

Expected: import failure for `opensource_ai`.

- [ ] **Step 3: Implement DeepSeek request and validation**

POST to `https://api.deepseek.com/chat/completions` with model `deepseek-v4-flash`, `response_format: {"type": "json_object"}`, `thinking: {"type": "disabled"}`, temperature `0.2`, maximum output `1200`, and a system prompt that prohibits unsupported claims. Parse `choices[0].message.content`, reject unexpected enums and fields over their limits, and retry one time on expected transport or schema failure with bounded injectable delay.

- [ ] **Step 4: Run AI tests**

Run: `python -m unittest tests.test_opensource_ai -v`

Expected: all tests pass using a fake transport; no live model request occurs.

- [ ] **Step 5: Commit**

```bash
git add src/opensource_ai.py tests/fixtures/model_response.json tests/test_opensource_ai.py
git commit -m "feat: generate validated project briefs"
```

### Task 4: Daily Pipeline and Digest Rendering

**Files:**
- Create: `src/opensource_render.py`
- Create: `src/opensource.py`
- Create: `tests/fixtures/briefs.json`
- Create: `tests/test_opensource_pipeline.py`
- Create: `content/opensource/2026-08-09.md`

**Interfaces:**
- Consumes: collection, ranking, and AI interfaces from Tasks 1–3.
- Produces: `render_digest(digest: DailyDigest) -> str`.
- Produces: `build_digest(briefs: list[ProjectBrief], date: datetime.date | str, trends: list[str] | None = None) -> DailyDigest`, normalizing ISO date strings at the boundary.
- Produces: CLI `python src/opensource.py [--date YYYY-MM-DD] [--dry-run] [--fixture path] [--force]`.
- Produces: a validated Markdown file with `html: true`, `section: opensource`, `trend_1..trend_3`, and `project_count` frontmatter.

- [ ] **Step 1: Add pipeline and escaping tests**

```python
def test_render_digest_contains_trends_featured_and_quick_projects():
    html = render_digest(sample_digest())
    assert 'class="radar-trends"' in html
    assert html.count('class="radar-feature"') == 3
    assert html.count('class="radar-quick"') == 9

def test_pipeline_refuses_incomplete_digest():
    with self.assertRaises(IncompleteDigestError):
        build_digest(sample_briefs(count=7), date="2026-08-09")
```

- [ ] **Step 2: Verify pipeline tests fail**

Run: `python -m unittest tests.test_opensource_pipeline -v`

Expected: import failure for renderer or pipeline.

- [ ] **Step 3: Implement safe HTML rendering and idempotent CLI**

All model-derived text must pass `html.escape(..., quote=True)`. Repository URLs must be accepted only when `scheme == "https"` and `host == "github.com"`. Existing valid date files cause a zero-exit no-op unless `--force` is explicitly used; `--dry-run` prints the target and counts without writing.

- [ ] **Step 4: Generate a deterministic first digest from fixtures**

Run: `python src/opensource.py --date 2026-08-09 --fixture tests/fixtures/briefs.json`

Expected: `content/opensource/2026-08-09.md` contains 12 projects, three trends, three featured entries, and nine quick entries.

- [ ] **Step 5: Run pipeline tests**

Run: `python -m unittest tests.test_opensource_pipeline -v`

Expected: all pipeline tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/opensource.py src/opensource_render.py tests/fixtures/briefs.json tests/test_opensource_pipeline.py content/opensource/2026-08-09.md
git commit -m "feat: build daily open source digest"
```

### Task 5: Static Site Integration

**Files:**
- Modify: `config.json`
- Modify: `src/models.py`
- Modify: `src/generator.py`
- Modify: `src/templates/post.tpl`
- Create: `tests/test_generator_opensource.py`

**Interfaces:**
- Consumes: committed digest from Task 4.
- Produces: `/opensource/index.html`, `/opensource/2026-08-09.html`, homepage/nav/archive/RSS entries.
- Produces: `render_opensource_section(sec: Section) -> str`.
- Produces: `Post.meta: dict`, populated with the complete parsed frontmatter so the section renderer can read `trend_1..trend_3` and `project_count`.

- [ ] **Step 1: Add generator integration test**

```python
def test_build_contains_open_source_radar_routes_and_copy():
    run_generator(temp_public)
    assert_file_contains(temp_public / "index.html", 'href="/opensource/"')
    assert_file_contains(temp_public / "opensource/index.html", "今日风向")
    assert_file_contains(temp_public / "opensource/2026-08-09.html", "为什么今天值得看")
    assert_file_contains(temp_public / "feed.xml", "/opensource/2026-08-09.html")
```

- [ ] **Step 2: Verify generator test fails**

Run: `python -m unittest tests.test_generator_opensource -v`

Expected: missing `opensource` section or route.

- [ ] **Step 3: Register the section and dedicated archive renderer**

Add this configuration entry:

```json
{
  "slug": "opensource",
  "name": "开源雷达",
  "description": "每天 5 分钟，读懂正在流行的开源项目",
  "auto": true,
  "dot": "#4f7564"
}
```

Add `meta: dict = field(default_factory=dict)` to `Post` and pass `meta=meta` in `load_posts`. `render_opensource_section` renders the newest issue as a large lead row, a 14-day date rail, and historical rows using `trend_1..trend_3` extracted from `Post.meta`. Update post template selection so opensource detail uses `post-wide` while existing sections remain unchanged.

- [ ] **Step 4: Run generator and regression tests**

Run: `python -m unittest discover -s tests -v`

Run: `python src/generator.py`

Expected: tests pass; generator reports five sections; existing AI HOT, chat, blog, docs, archive, tags, and feed files exist.

- [ ] **Step 5: Commit**

```bash
git add config.json src/models.py src/generator.py src/templates/post.tpl tests/test_generator_opensource.py
git commit -m "feat: add open source radar section"
```

### Task 6: Production UI and Responsive Styling

**Files:**
- Modify: `static/style.css`
- Create: `tests/test_opensource_markup.py`

**Interfaces:**
- Consumes: HTML class names from Tasks 4–5.
- Produces: responsive editor-style radar page, keyboard focus states, and reduced-motion behavior.

- [ ] **Step 1: Add markup/accessibility assertions**

```python
def test_repository_cards_have_safe_external_links_and_labels():
    page = build_fixture_page()
    assert page.count('target="_blank" rel="noopener noreferrer"') == 12
    assert 'aria-label="在 GitHub 查看 sample/agent-kit"' in page
    assert '<span class="difficulty-label">中等</span>' in page
```

- [ ] **Step 2: Verify markup test fails**

Run: `python -m unittest tests.test_opensource_markup -v`

Expected: missing accessibility label or radar class.

- [ ] **Step 3: Add the visual system**

Define `--radar:#4f7564`, `--radar-soft:#dce7df`, `.radar-hero`, `.radar-sweep`, `.radar-trends`, `.radar-feature`, `.radar-quick-grid`, `.radar-signal`, `.difficulty-label`, and mobile breakpoints. Use the existing warm paper background and editorial typography. Add:

```css
@media (prefers-reduced-motion: reduce) {
  .radar-sweep { animation: none; }
}
@media (max-width: 720px) {
  .radar-feature, .radar-quick-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: Run tests and build**

Run: `python -m unittest discover -s tests -v && python src/generator.py`

Expected: all tests pass and CSS is copied to `public/style.css`.

- [ ] **Step 5: Commit**

```bash
git add static/style.css tests/test_opensource_markup.py
git commit -m "style: design open source radar experience"
```

### Task 7: Daily GitHub Actions Automation

**Files:**
- Modify: `.github/workflows/build.yml`
- Create: `tests/test_workflow_config.py`

**Interfaces:**
- Consumes: `python src/opensource.py` from Task 4.
- Produces: a daily and manually dispatchable generation job with a workflow concurrency lock, `contents: write`, and the DeepSeek secret scoped to the radar step.

- [ ] **Step 1: Add workflow configuration test**

```python
def test_workflow_scopes_deepseek_secret_and_runs_radar_before_build():
    text = Path(".github/workflows/build.yml").read_text(encoding="utf-8")
    assert "models: read" not in text
    assert text.index("python3 src/opensource.py") < text.index("python3 src/generator.py")
    assert "GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}" in text
    assert "DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}" in text
```

- [ ] **Step 2: Verify workflow test fails**

Run: `python -m unittest tests.test_workflow_config -v`

Expected: missing DeepSeek secret, concurrency lock, safe manual-input mapping, and radar command.

- [ ] **Step 3: Update workflow permissions and steps**

Pass `GITHUB_TOKEN` and `DEEPSEEK_API_KEY` only through the radar step environment, map validated `date` and `dry-run` inputs through shell arrays, add one non-cancelling workflow concurrency group, run the radar generator before the static generator, then run `python -m unittest discover -s tests -v`. Preserve the existing AI HOT retry semantics and commit only after radar generation, all tests, and static build succeed.

- [ ] **Step 4: Run full local verification**

Run: `python -m unittest discover -s tests -v`

Run: `python src/generator.py`

Run: `git diff --check`

Expected: all commands exit zero.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/build.yml tests/test_workflow_config.py
git commit -m "ci: publish daily open source radar"
```

### Task 8: Local E2E and UI Inspection

**Files:**
- Create: `docs/verification/open-source-radar-local.md`
- Create screenshots outside the repository or under the app-provided visualization artifact directory.

**Interfaces:**
- Consumes: production `public/` build.
- Produces: local navigation evidence, console/network results, 1440px and 375px screenshots, and a written UI audit.

- [ ] **Step 1: Start a local production server**

Run: `python -m http.server 8000 -d public`

Expected: `http://127.0.0.1:8000/` serves the production build.

- [ ] **Step 2: Exercise the complete local user journey**

Open the homepage, click “开源雷达”, open the latest issue, open one GitHub repository link, navigate back, and open a historical issue. Verify URL transitions, visible page titles, 12 project entries, and no severe console or resource errors.

- [ ] **Step 3: Inspect desktop and mobile layouts**

Capture homepage, `/opensource/`, and `/opensource/2026-08-09.html` at 1440×1000 and 375×812. Check long repository names, focus rings, card hierarchy, no horizontal overflow, readable body copy, and reduced-motion behavior.

- [ ] **Step 4: Record evidence and fix defects**

Write exact URLs, viewport sizes, observed project counts, console results, screenshot paths, and any fixes to `docs/verification/open-source-radar-local.md`. Re-run all tests after every fix.

- [ ] **Step 5: Commit verification-driven fixes and report**

```bash
git add docs/verification/open-source-radar-local.md static/style.css src/opensource_render.py src/generator.py
git commit -m "test: verify open source radar UI"
```

Git ignores unchanged paths, so the command commits only verification-driven changes that actually exist.

### Task 9: Push, Vercel Deployment, and Production E2E

**Files:**
- Create: `docs/verification/open-source-radar-production.md`

**Interfaces:**
- Consumes: green local build and git history from Tasks 1–8.
- Produces: pushed `main`, successful Vercel production deployment, and production E2E/UI evidence.

- [ ] **Step 1: Perform pre-push completion audit**

Run: `git status --short`, `git log --oneline --decorate -10`, `python -m unittest discover -s tests -v`, `python src/generator.py`, and `git diff --check`.

Expected: only known user-owned untracked files remain; all feature files are committed; tests and build pass.

- [ ] **Step 2: Push committed changes**

Run: `git push origin main`

Expected: remote `main` advances to local `HEAD` without force.

- [ ] **Step 3: Verify Vercel production deployment**

Use the linked Vercel project or CLI to confirm the production deployment for the pushed commit reaches `READY`. Record deployment ID, commit SHA, and production URL.

- [ ] **Step 4: Repeat critical E2E paths on production**

Verify `/`, `/opensource/`, and `/opensource/2026-08-09.html`; confirm navigation, content counts, GitHub external link behavior, no severe console/resource errors, desktop 1440px and mobile 375px layouts, and no horizontal overflow.

- [ ] **Step 5: Record production evidence**

Write the deployed commit, deployment URL/status, tested URLs, viewport results, screenshot paths, console/network findings, and any residual limitations to `docs/verification/open-source-radar-production.md`.

- [ ] **Step 6: Commit and push the production verification record**

```bash
git add docs/verification/open-source-radar-production.md
git commit -m "docs: record open source radar deployment"
git push origin main
```

- [ ] **Step 7: Confirm the documentation-only deployment is also ready**

Expected: Vercel production is `READY`, the live feature remains accessible, and remote `main` equals local `HEAD`.
