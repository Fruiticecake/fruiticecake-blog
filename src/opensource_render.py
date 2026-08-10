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
    return "\n".join(
        (
            '<section class="radar-digest">',
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
    if detailed:
        for label, value in (
            ("解决问题", brief.problem),
            ("实现方式", brief.approach),
            ("为什么值得关注", brief.why_trending),
            ("适合谁", brief.audience),
            ("差异点", brief.differentiator),
            ("快速开始", brief.quick_start),
            ("注意事项", brief.caveats),
        ):
            if value:
                lines.append(f"      <p><strong>{label}：</strong>{_text(value)}</p>")
    else:
        lines.append(f"      <p>{_text(brief.why_trending)}</p>")
    lines.append("    </article>")
    return "\n".join(lines)


def _github_url(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    parsed = urlparse(value)
    if parsed.scheme == "https" and parsed.hostname == "github.com":
        return value
    return None


def _text(value: object) -> str:
    return html.escape(str(value or ""), quote=True)
