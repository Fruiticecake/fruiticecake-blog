"""Build and write a daily open-source radar digest."""
from __future__ import annotations

import argparse
import datetime
import html
import json
import os
import re
import sys
from pathlib import Path
from typing import Iterable

from opensource_ai import GitHubModelsClient, analyze_candidate
from opensource_models import DailyDigest, ProjectBrief, RepositoryCandidate
from opensource_ranker import select_candidates
from opensource_render import render_digest
from opensource_sources import GitHubClient, collect_candidates


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONTENT_DIR = ROOT / "content" / "opensource"
MAX_PROJECTS = 12
MIN_PROJECTS = 8


class IncompleteDigestError(ValueError):
    """Raised when the collection cannot support a useful daily digest."""


def build_digest(
    briefs: list[ProjectBrief], date: datetime.date | str, trends: list[str] | None = None
) -> DailyDigest:
    """Partition ranked briefs into featured and quick entries for one date."""
    normalized_date = _normalize_date(date)
    if len(briefs) < MIN_PROJECTS:
        raise IncompleteDigestError(f"Need at least {MIN_PROJECTS} project briefs; got {len(briefs)}")
    selected = briefs[:MAX_PROJECTS]
    resolved_trends = _resolve_trends(selected, trends)
    return DailyDigest(
        date=normalized_date,
        generated_at=datetime.datetime.combine(normalized_date, datetime.time.min),
        trends=resolved_trends,
        featured=selected[:3],
        quick=selected[3:],
    )


def digest_markdown(digest: DailyDigest) -> str:
    """Serialize a rendered digest with the required site front matter."""
    frontmatter = {
        "title": f"开源雷达 · {digest.date.isoformat()}",
        "date": digest.date.isoformat(),
        "html": True,
        "section": "opensource",
        "trend_1": html.escape(digest.trends[0], quote=True),
        "trend_2": html.escape(digest.trends[1], quote=True),
        "trend_3": html.escape(digest.trends[2], quote=True),
        "project_count": len(digest.featured) + len(digest.quick),
    }
    lines = ["---"]
    for key, value in frontmatter.items():
        lines.append(f"{key}: {json.dumps(value, ensure_ascii=False)}")
    lines.extend(("---", "", render_digest(digest), ""))
    return "\n".join(lines)


def recent_seen_names(content_dir: Path, date: datetime.date) -> set[str]:
    """Return GitHub repository names linked by existing files in the prior week."""
    seen: set[str] = set()
    if not content_dir.exists():
        return seen
    earliest = date - datetime.timedelta(days=6)
    for path in content_dir.glob("*.md"):
        try:
            file_date = datetime.date.fromisoformat(path.stem)
        except ValueError:
            continue
        if earliest <= file_date <= date:
            seen.update(match.lower() for match in re.findall(r"https://github\.com/([\w.-]+/[\w.-]+)", path.read_text(encoding="utf-8")))
    return seen


def _normalize_date(value: datetime.date | str) -> datetime.date:
    if isinstance(value, datetime.datetime):
        return value.date()
    if isinstance(value, datetime.date):
        return value
    if isinstance(value, str):
        return datetime.date.fromisoformat(value)
    raise TypeError("date must be an ISO date string or datetime.date")


def _resolve_trends(briefs: list[ProjectBrief], supplied: list[str] | None) -> list[str]:
    trends = [item.strip() for item in supplied or [] if isinstance(item, str) and item.strip()][:3]
    if len(trends) == 3:
        return trends
    for brief in briefs:
        category = str(getattr(brief.candidate, "category", "other") or "other").strip()
        evidence = str(brief.why_trending or "").strip()
        if not evidence:
            continue
        trend = f"{category}：{evidence[:180]}"
        trends.append(trend)
        if len(trends) == 3:
            return trends
    raise IncompleteDigestError("Need three evidence-backed trends")


def _brief_from_dict(data: dict) -> ProjectBrief:
    candidate_data = data["candidate"]
    candidate = RepositoryCandidate(
        full_name=candidate_data["full_name"],
        html_url=candidate_data["html_url"],
        description=candidate_data.get("description", ""),
        language=candidate_data.get("language", ""),
        license_name=candidate_data.get("license_name", ""),
        stars=int(candidate_data.get("stars", 0)),
        forks=int(candidate_data.get("forks", 0)),
        topics=list(candidate_data.get("topics", [])),
        created_at=_parse_datetime(candidate_data["created_at"]),
        pushed_at=_parse_datetime(candidate_data["pushed_at"]),
        trending_rank=candidate_data.get("trending_rank"),
        stars_today=candidate_data.get("stars_today"),
        category=candidate_data.get("category", "other"),
        score=float(candidate_data.get("score", 0)),
        readme=candidate_data.get("readme", ""),
    )
    return ProjectBrief(candidate=candidate, **{key: data[key] for key in (
        "headline", "problem", "approach", "why_trending", "audience", "difficulty",
        "differentiator", "quick_start", "caveats",
    )})


def _parse_datetime(value: str) -> datetime.datetime:
    return datetime.datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)


def load_fixture(path: Path) -> list[ProjectBrief]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    entries = payload["briefs"] if isinstance(payload, dict) else payload
    if not isinstance(entries, list):
        raise ValueError("Fixture must be a list or an object with a briefs list")
    return [_brief_from_dict(entry) for entry in entries]


def collect_live_briefs(date: datetime.date, content_dir: Path) -> list[ProjectBrief]:
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise RuntimeError("GITHUB_TOKEN is required for live open-source radar runs")
    candidates = collect_candidates(GitHubClient(token), date)
    ranked = select_candidates(candidates, recent_seen_names(content_dir, date), limit=MAX_PROJECTS)
    return [analyze_candidate(GitHubModelsClient(token), candidate, index < 3) for index, candidate in enumerate(ranked)]


def _target_path(content_dir: Path, date: datetime.date) -> Path:
    return content_dir / f"{date.isoformat()}.md"


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate the daily open-source radar digest")
    parser.add_argument("--date", default=datetime.date.today().isoformat(), type=_normalize_date)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--fixture", type=Path)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args(argv)
    content_dir = DEFAULT_CONTENT_DIR
    target = _target_path(content_dir, args.date)
    if target.exists() and not args.force:
        print(f"Open-source digest already exists: {target}")
        return 0
    briefs = load_fixture(args.fixture) if args.fixture else collect_live_briefs(args.date, content_dir)
    digest = build_digest(briefs, args.date)
    project_count = len(digest.featured) + len(digest.quick)
    if args.dry_run:
        print(f"Dry run: {target} ({project_count} projects, {len(digest.trends)} trends)")
        return 0
    content_dir.mkdir(parents=True, exist_ok=True)
    target.write_text(digest_markdown(digest), encoding="utf-8")
    print(f"Wrote {target} ({project_count} projects, {len(digest.trends)} trends)")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (IncompleteDigestError, RuntimeError, ValueError, OSError) as error:
        print(f"Open-source digest failed: {error}", file=sys.stderr)
        raise SystemExit(1)
