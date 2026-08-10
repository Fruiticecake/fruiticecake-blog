"""Safe HTML rendering for the daily open-source radar digest."""
from __future__ import annotations

import html
from urllib.parse import urlparse

from opensource_models import DailyDigest, ProjectBrief


def render_digest(digest: DailyDigest) -> str:
    """Render a digest as a self-contained HTML fragment.

    Project briefs originate from a model, so every displayed value is escaped at
    the rendering boundary. Repository links are deliberately limited to GitHub.
    """
    trends = "".join(f"<li>{_text(trend)}</li>" for trend in digest.trends[:3])
    featured = "".join(_render_project(brief, "radar-feature", detailed=True) for brief in digest.featured)
    quick = "".join(_render_project(brief, "radar-quick", detailed=False) for brief in digest.quick)
    project_count = len(digest.featured) + len(digest.quick)
    collected_at = digest.generated_at.strftime("%Y-%m-%d %H:%M")
    return "\n".join(
        (
            '<section class="radar-digest">',
            '  <header class="radar-issue-header">',
            f"    <p>Collected {_text(collected_at)} · {_text(project_count)} projects</p>",
            '    <p class="radar-method-note">Data: GitHub Trending and GitHub REST metadata. '
            'Method: deterministic ranking followed by DeepSeek structured analysis.</p>',
            "  </header>",
            '  <section class="radar-trends">',
            "    <h2>今日趋势</h2>",
            f"    <ol>{trends}</ol>",
            "  </section>",
            '  <section class="radar-featured">',
            "    <h2>重点项目</h2>",
            featured,
            "  </section>",
            '  <section class="radar-quick-list">',
            "    <h2>快速浏览</h2>",
            quick,
            "  </section>",
            "</section>",
        )
    )


def _render_project(brief: ProjectBrief, css_class: str, detailed: bool) -> str:
    candidate = brief.candidate
    name = _text(candidate.full_name)
    url = _github_url(getattr(candidate, "html_url", ""))
    title = (
        f'<a href="{_text(url)}" target="_blank" rel="noopener noreferrer" '
        f'aria-label="在 GitHub 查看 {name}">{name}</a>'
        if url
        else name
    )
    lines = [f'    <article class="{css_class}">', f"      <h3>{title}</h3>"]
    if brief.headline:
        lines.append(f"      <p>{_text(brief.headline)}</p>")
    lines.append(f'      <span class="difficulty-label">{_text(brief.difficulty)}</span>')
    language = candidate.language or "未注明"
    license_name = candidate.license_name or "未声明"
    lines.append(
        '      <p class="radar-facts">'
        f"Language {_text(language)} · License {_text(license_name)} · "
        f"Stars {_text(candidate.stars)} · Forks {_text(candidate.forks)} · "
        f"Recent {_text(_recent_signal(candidate))}</p>"
    )
    why_trending = _trend_text(brief)
    if detailed:
        for label, value in (
            ("解决问题", brief.problem),
            ("实现方式", brief.approach),
            ("为什么值得关注", why_trending),
            ("适合谁", brief.audience),
            ("差异点", brief.differentiator),
            ("快速开始", brief.quick_start),
            ("注意事项", brief.caveats),
        ):
            if value:
                lines.append(f"      <p><strong>{label}：</strong>{_text(value)}</p>")
    else:
        for label, value in (
            ("Problem", brief.problem),
            ("Approach", brief.approach),
            ("Audience", brief.audience),
        ):
            if value:
                lines.append(f"      <p><strong>{label}: </strong>{_text(value)}</p>")
        lines.append(f'      <p class="radar-signal">{_text(why_trending)}</p>')
    lines.append("    </article>")
    return "\n".join(lines)


def _github_url(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    parsed = urlparse(value)
    if parsed.scheme == "https" and parsed.hostname == "github.com":
        return value
    return None


def _recent_signal(candidate) -> str:
    if candidate.stars_today is not None:
        return f"+{candidate.stars_today} stars today"
    if candidate.trending_rank is not None:
        return f"GitHub Trending #{candidate.trending_rank}"
    return "no verified recent signal"


def _trend_text(brief: ProjectBrief) -> str:
    trend = str(brief.why_trending or "").strip()
    repeat_reason = str(getattr(brief.candidate, "repeat_reason", "") or "").strip()
    if repeat_reason and repeat_reason not in trend:
        return f"{trend} {repeat_reason}".strip()
    return trend


def _text(value: object) -> str:
    return html.escape(str(value or ""), quote=True)
