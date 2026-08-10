"""Data structures used by the open-source radar pipeline."""
import datetime
from dataclasses import dataclass


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
    repeat_reason: str = ""


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
