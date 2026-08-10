"""Deterministic scoring and selection for open-source radar candidates."""
import datetime
import math

from opensource_models import RepositoryCandidate


CATEGORY_CAPS = {"ai": 5, "devtools": 4, "platform": 4, "other": 3}


def score_candidate(
    candidate: RepositoryCandidate, seen: set[str], now: datetime.datetime
) -> float:
    """Score quality, recency, relevance, and discovery freshness."""
    age_days = max(0.0, (now - candidate.pushed_at).total_seconds() / 86400)
    recency = max(0.0, 30.0 - min(age_days, 30.0))
    quality = min(math.log10(max(candidate.stars, 0) + 1) * 8, 40.0)
    quality += min(math.log10(max(candidate.forks, 0) + 1) * 3, 12.0)
    relevance = min(len({topic.lower() for topic in candidate.topics} & {"ai", "agent", "llm", "machine-learning", "developer-tools"}) * 4, 12)
    trending = 0.0 if candidate.trending_rank is None else max(0.0, 20.0 - candidate.trending_rank)
    growth = min(max(candidate.stars_today or 0, 0), 1000) / 100
    repeat_penalty = 50.0 if candidate.full_name.lower() in {name.lower() for name in seen} else 0.0
    return quality + recency + relevance + trending + growth - repeat_penalty


def select_candidates(
    candidates: list[RepositoryCandidate], seen: set[str], limit: int = 20
) -> list[RepositoryCandidate]:
    """Return eligible, de-duplicated candidates in a stable ranked order."""
    now = datetime.datetime.now(tz=candidates[0].pushed_at.tzinfo) if candidates else datetime.datetime.now()
    unique: dict[str, RepositoryCandidate] = {}
    for candidate in candidates:
        key = candidate.full_name.lower()
        if key in unique or getattr(candidate, "archived", False) or getattr(candidate, "is_fork", False):
            continue
        candidate.score = score_candidate(candidate, seen, now)
        unique[key] = candidate

    ordered = sorted(unique.values(), key=lambda item: (-item.score, item.full_name.lower()))
    caps = {category: CATEGORY_CAPS.get(category, CATEGORY_CAPS["other"]) for category in CATEGORY_CAPS}
    selected: list[RepositoryCandidate] = []
    counts: dict[str, int] = {}
    for candidate in ordered:
        category = candidate.category if candidate.category in caps else "other"
        if counts.get(category, 0) >= caps[category]:
            continue
        selected.append(candidate)
        counts[category] = counts.get(category, 0) + 1
        if len(selected) == limit:
            break
    return selected
