"""Deterministic scoring and selection for open-source radar candidates."""
import datetime
import math
import re

from opensource_models import ProjectBrief, RepositoryCandidate


CATEGORY_WEIGHTS = {"ai": 0.35, "devtools": 0.25, "platform": 0.25, "other": 0.15}
EXCEPTIONAL_REPEAT_STARS = 1000
SAFE_MINIMUM = 8
FINAL_CATEGORY_CAPS = {"ai": 5, "devtools": 4, "platform": 4, "other": 3}

CATEGORY_TERMS = {
    "ai": {
        "ai", "agent", "agents", "artificial intelligence", "deep learning",
        "embedding", "generative ai", "large language model", "llm",
        "machine learning", "model", "neural", "rag", "transformer",
    },
    "devtools": {
        "build tool", "ci", "cli", "code generator", "compiler", "debugger",
        "developer tool", "developer tools", "devtools", "formatter", "ide", "linter",
        "package manager", "sdk", "shell", "testing", "workflow",
    },
    "platform": {
        "api", "backend", "cloud", "cloud native", "container", "database",
        "docker", "frontend", "infrastructure", "kubernetes", "observability",
        "hcl", "platform", "serverless", "service mesh", "terraform",
    },
}


def _normalized_text(candidate: RepositoryCandidate) -> str:
    values = [*candidate.topics, candidate.description, candidate.language]
    return " ".join(
        re.sub(r"[^a-z0-9+#.]+", " ", str(value).casefold()).strip()
        for value in values
        if value
    )


def infer_category(candidate: RepositoryCandidate) -> str:
    """Infer a stable category from normalized repository facts."""
    normalized = f" {_normalized_text(candidate)} "
    for category in ("ai", "devtools", "platform"):
        for term in CATEGORY_TERMS[category]:
            normalized_term = re.sub(r"[^a-z0-9+#.]+", " ", term).strip()
            if f" {normalized_term} " in normalized:
                return category
    return "other"


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


def rank_candidates(
    candidates: list[RepositoryCandidate], seen: set[str], limit: int = 20
) -> list[RepositoryCandidate]:
    """Return a full eligible analysis reserve without applying publication caps."""
    seen_names = {name.lower() for name in seen}
    unique: dict[str, RepositoryCandidate] = {}
    for candidate in candidates:
        key = candidate.full_name.lower()
        if key in unique or getattr(candidate, "archived", False) or getattr(candidate, "is_fork", False):
            continue
        if key in seen_names:
            if (candidate.stars_today or 0) < EXCEPTIONAL_REPEAT_STARS:
                continue
            candidate.repeat_reason = (
                "Previously featured within 7 days; repeated because recent growth reached "
                f"{candidate.stars_today} stars today."
            )
        candidate.category = infer_category(candidate)
        unique[key] = candidate

    if not unique or limit <= 0:
        return []
    now = max(
        max(candidate.pushed_at, candidate.created_at) for candidate in unique.values()
    )
    for candidate in unique.values():
        candidate.score = score_candidate(candidate, seen, now)
    return sorted(
        unique.values(), key=lambda item: (-item.score, item.full_name.lower())
    )[:limit]


def select_candidates(
    candidates: list[RepositoryCandidate], seen: set[str], limit: int = 20
) -> list[RepositoryCandidate]:
    """Select metadata candidates to category targets, with minimum-only backfill."""
    ordered = rank_candidates(candidates, seen, limit=limit)
    if not ordered:
        return []
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

    backfill_limit = min(target_limit, SAFE_MINIMUM)
    for candidate in ordered:
        if len(selected) >= backfill_limit:
            break
        if candidate.full_name.lower() not in selected_names:
            selected.append(candidate)
            selected_names.add(candidate.full_name.lower())
    return sorted(selected, key=lambda item: (-item.score, item.full_name.lower()))


def select_briefs(
    briefs: list[ProjectBrief], limit: int = 12, minimum: int = SAFE_MINIMUM
) -> list[ProjectBrief]:
    """Apply publication category targets after model analysis has succeeded."""
    if limit <= 0:
        return []
    ordered = briefs[:]
    target_limit = min(limit, len(ordered))
    quotas = _category_quotas(target_limit)
    selected_ids: set[int] = set()
    counts = {category: 0 for category in CATEGORY_WEIGHTS}

    def category_for(brief: ProjectBrief) -> str:
        category = brief.candidate.category
        return category if category in CATEGORY_WEIGHTS else "other"

    for brief in ordered:
        category = category_for(brief)
        if counts[category] < quotas[category]:
            selected_ids.add(id(brief))
            counts[category] += 1

    # Use the documented final-set caps when one target category is unavailable.
    for brief in ordered:
        if len(selected_ids) >= target_limit:
            break
        category = category_for(brief)
        if id(brief) not in selected_ids and counts[category] < FINAL_CATEGORY_CAPS[category]:
            selected_ids.add(id(brief))
            counts[category] += 1

    # A useful digest is preferable to failing solely because the source mix is narrow.
    minimum_target = min(target_limit, minimum)
    for brief in ordered:
        if len(selected_ids) >= minimum_target:
            break
        selected_ids.add(id(brief))
    return [brief for brief in ordered if id(brief) in selected_ids][:target_limit]


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
