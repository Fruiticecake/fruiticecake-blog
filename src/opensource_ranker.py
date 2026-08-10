"""Deterministic scoring and selection for open-source radar candidates."""
import datetime
import math

from opensource_models import RepositoryCandidate


CATEGORY_WEIGHTS = {"ai": 0.35, "devtools": 0.25, "platform": 0.25, "other": 0.15}


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
    unique: dict[str, RepositoryCandidate] = {}
    for candidate in candidates:
        key = candidate.full_name.lower()
        if key in unique or getattr(candidate, "archived", False) or getattr(candidate, "is_fork", False):
            continue
        unique[key] = candidate

    if not unique or limit <= 0:
        return []
    now = max(
        max(candidate.pushed_at, candidate.created_at) for candidate in unique.values()
    )
    for candidate in unique.values():
        candidate.score = score_candidate(candidate, seen, now)
    ordered = sorted(unique.values(), key=lambda item: (-item.score, item.full_name.lower()))
    target_limit = min(limit, len(ordered))
    quotas = _category_quotas(target_limit)
    selected: list[RepositoryCandidate] = []
    selected_names: set[str] = set()
    for category in CATEGORY_WEIGHTS:
        for candidate in ordered:
            normalized_category = candidate.category if candidate.category in CATEGORY_WEIGHTS else "other"
            if normalized_category == category and len(
                [item for item in selected if (item.category if item.category in CATEGORY_WEIGHTS else "other") == category]
            ) < quotas[category]:
                selected.append(candidate)
                selected_names.add(candidate.full_name.lower())

    for candidate in ordered:
        if len(selected) == target_limit:
            break
        if candidate.full_name.lower() not in selected_names:
            selected.append(candidate)
            selected_names.add(candidate.full_name.lower())
    return sorted(selected, key=lambda item: (-item.score, item.full_name.lower()))


def _category_quotas(limit: int) -> dict[str, int]:
    quotas = {category: int(limit * weight) for category, weight in CATEGORY_WEIGHTS.items()}
    remaining = limit - sum(quotas.values())
    fractions = sorted(
        CATEGORY_WEIGHTS,
        key=lambda category: (-(limit * CATEGORY_WEIGHTS[category] - quotas[category]), category),
    )
    for category in fractions[:remaining]:
        quotas[category] += 1
    return quotas
