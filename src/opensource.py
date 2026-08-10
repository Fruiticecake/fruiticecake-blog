"""Build and write a daily open-source radar digest."""
from __future__ import annotations

import argparse
import datetime
import json
import logging
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Iterable

from opensource_ai import (
    DEFAULT_ENDPOINT,
    DEFAULT_MODEL,
    BriefValidationError,
    DeepSeekClient,
    ModelTransportError,
    analyze_candidate,
)
from opensource_models import DailyDigest, ProjectBrief, RepositoryCandidate
from opensource_ranker import select_candidates
from opensource_render import render_digest
from opensource_sources import GitHubClient, collect_candidates, enrich_readmes


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONTENT_DIR = ROOT / "content" / "opensource"
MAX_PROJECTS = 12
MIN_PROJECTS = 8
MAX_ANALYSIS_CANDIDATES = 20
BEIJING = datetime.timezone(datetime.timedelta(hours=8), name="UTC+08:00")
LOGGER = logging.getLogger(__name__)


class IncompleteDigestError(ValueError):
    """Raised when the collection cannot support a useful daily digest."""


def build_digest(
    briefs: list[ProjectBrief],
    date: datetime.date | str,
    trends: list[str] | None = None,
    generated_at: datetime.datetime | None = None,
) -> DailyDigest:
    """Partition ranked briefs into featured and quick entries for one date."""
    normalized_date = _normalize_date(date)
    if len(briefs) < MIN_PROJECTS:
        raise IncompleteDigestError(f"Need at least {MIN_PROJECTS} project briefs; got {len(briefs)}")
    selected = briefs[:MAX_PROJECTS]
    resolved_trends = _resolve_trends(selected, trends)
    return DailyDigest(
        date=normalized_date,
        generated_at=generated_at or datetime.datetime.combine(normalized_date, datetime.time.min),
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
        "trend_1": digest.trends[0],
        "trend_2": digest.trends[1],
        "trend_3": digest.trends[2],
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
    earliest = date - datetime.timedelta(days=7)
    for path in content_dir.glob("*.md"):
        try:
            file_date = datetime.date.fromisoformat(path.stem)
        except ValueError:
            continue
        if earliest <= file_date < date:
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


def default_digest_date(now: datetime.datetime | None = None) -> datetime.date:
    """Return the current calendar date in Beijing time, independent of host locale."""
    current = now or datetime.datetime.now(datetime.timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=datetime.timezone.utc)
    return current.astimezone(BEIJING).date()


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
    github_token = os.environ.get("GITHUB_TOKEN")
    deepseek_key = os.environ.get("DEEPSEEK_API_KEY")
    if not github_token:
        raise RuntimeError("GITHUB_TOKEN is required for live open-source radar runs")
    if not deepseek_key:
        raise RuntimeError("DEEPSEEK_API_KEY is required for live open-source radar runs")
    github_client = GitHubClient(github_token)
    candidates = collect_candidates(github_client, date)
    ranked = select_candidates(
        candidates,
        recent_seen_names(content_dir, date),
        limit=MAX_ANALYSIS_CANDIDATES,
    )
    if len(ranked) < MIN_PROJECTS:
        raise IncompleteDigestError(f"Need at least {MIN_PROJECTS} ranked candidates; got {len(ranked)}")
    enrich_readmes(github_client, ranked, limit=MAX_ANALYSIS_CANDIDATES)
    model_client = DeepSeekClient(
        deepseek_key,
        endpoint=os.environ.get("DEEPSEEK_ENDPOINT") or DEFAULT_ENDPOINT,
        model=os.environ.get("DEEPSEEK_MODEL") or DEFAULT_MODEL,
    )
    briefs: list[ProjectBrief] = []
    for candidate in ranked[:MAX_ANALYSIS_CANDIDATES]:
        try:
            briefs.append(
                analyze_candidate(model_client, candidate, featured=len(briefs) < 3)
            )
        except (BriefValidationError, ModelTransportError) as error:
            LOGGER.warning("Could not analyze %s: %s", candidate.full_name, error)
            continue
        if len(briefs) == MAX_PROJECTS:
            break
    if len(briefs) < MIN_PROJECTS:
        raise IncompleteDigestError(
            f"Need at least {MIN_PROJECTS} valid project briefs; got {len(briefs)}"
        )
    return briefs


def _target_path(content_dir: Path, date: datetime.date) -> Path:
    return content_dir / f"{date.isoformat()}.md"


def _existing_digest_metadata(path: Path, date: datetime.date) -> tuple[int, int]:
    """Validate a completed digest file and return its project and trend counts."""
    return _digest_metadata(path.read_text(encoding="utf-8"), date)


def _digest_metadata(document: str, date: datetime.date) -> tuple[int, int]:
    if not document.startswith("---\n"):
        raise ValueError("Digest is missing front matter")
    try:
        frontmatter_text, body = document[4:].split("\n---\n", 1)
    except ValueError as error:
        raise ValueError("Digest front matter is incomplete") from error
    frontmatter: dict[str, object] = {}
    for line in frontmatter_text.splitlines():
        if ":" not in line:
            raise ValueError("Digest front matter is malformed")
        key, raw_value = line.split(":", 1)
        try:
            frontmatter[key.strip()] = json.loads(raw_value.strip())
        except json.JSONDecodeError as error:
            raise ValueError(f"Invalid front matter value for {key.strip()}") from error
    required = {"date", "html", "section", "trend_1", "trend_2", "trend_3", "project_count"}
    if not required.issubset(frontmatter):
        raise ValueError("Digest front matter is missing required fields")
    if frontmatter["date"] != date.isoformat() or frontmatter["html"] is not True:
        raise ValueError("Digest front matter date or html flag is invalid")
    if frontmatter["section"] != "opensource":
        raise ValueError("Digest section is invalid")
    trend_values = [frontmatter[f"trend_{number}"] for number in range(1, 4)]
    if not all(isinstance(value, str) and value.strip() for value in trend_values):
        raise ValueError("Digest trends are invalid")
    project_count = frontmatter["project_count"]
    if (
        isinstance(project_count, bool)
        or not isinstance(project_count, int)
        or not MIN_PROJECTS <= project_count <= MAX_PROJECTS
    ):
        raise ValueError("Digest project count is invalid")
    if '<section class="radar-digest">' not in body or '<section class="radar-trends">' not in body:
        raise ValueError("Digest body is missing required sections")
    if body.count('class="radar-feature"') != 3 or body.count('class="radar-quick"') != project_count - 3:
        raise ValueError("Digest project structure is invalid")
    return project_count, len(trend_values)


def _atomic_write(path: Path, content: str) -> None:
    """Durably replace a digest while keeping the previous file intact on failure."""
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.", suffix=".tmp", delete=False
        ) as temporary:
            temporary_path = Path(temporary.name)
            temporary.write(content)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_path, path)
    except Exception:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
        raise


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate the daily open-source radar digest")
    parser.add_argument("--date", default=default_digest_date().isoformat(), type=_normalize_date)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--fixture", type=Path)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args(argv)
    content_dir = DEFAULT_CONTENT_DIR
    target = _target_path(content_dir, args.date)
    existing_metadata = (
        _existing_digest_metadata(target, args.date)
        if target.exists() and not args.force
        else None
    )
    if existing_metadata is not None and not args.force:
        project_count, trend_count = existing_metadata
        if args.dry_run:
            print(f"Dry run: {target} ({project_count} projects, {trend_count} trends)")
        else:
            print(f"Open-source digest already exists: {target} ({project_count} projects, {trend_count} trends)")
        return 0
    briefs = load_fixture(args.fixture) if args.fixture else collect_live_briefs(args.date, content_dir)
    digest = build_digest(briefs, args.date, generated_at=datetime.datetime.now(BEIJING))
    project_count = len(digest.featured) + len(digest.quick)
    if args.dry_run:
        print(f"Dry run: {target} ({project_count} projects, {len(digest.trends)} trends)")
        return 0
    content_dir.mkdir(parents=True, exist_ok=True)
    document = digest_markdown(digest)
    _digest_metadata(document, args.date)
    _atomic_write(target, document)
    print(f"Wrote {target} ({project_count} projects, {len(digest.trends)} trends)")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (IncompleteDigestError, RuntimeError, ValueError, OSError) as error:
        print(f"Open-source digest failed: {error}", file=sys.stderr)
        raise SystemExit(1)
