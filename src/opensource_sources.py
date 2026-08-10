"""GitHub sources for the open-source radar candidate pipeline."""
import base64
import datetime
import json
import logging
import re
from html.parser import HTMLParser
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from opensource_models import RepositoryCandidate


LOGGER = logging.getLogger(__name__)
GITHUB_API = "https://api.github.com"
GITHUB_TRENDING = "https://github.com/trending"
README_LIMIT = 18_000


class _TrendingParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.items = []
        self._in_article = False
        self._full_name = None
        self._text = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "article" and "Box-row" in attributes.get("class", ""):
            self._in_article = True
            self._full_name = None
            self._text = []
        elif self._in_article and tag == "a" and not self._full_name:
            href = attributes.get("href", "")
            if re.fullmatch(r"/[\w.-]+/[\w.-]+", href):
                self._full_name = href.strip("/")

    def handle_data(self, data):
        if self._in_article:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag == "article" and self._in_article:
            if self._full_name:
                match = re.search(r"([\d,]+)\s+stars\s+today", " ".join(self._text), re.I)
                if match:
                    self.items.append({"full_name": self._full_name, "stars_today": int(match.group(1).replace(",", ""))})
            self._in_article = False


def parse_trending(html_text: str) -> list[dict]:
    """Extract repository names, ranks, and daily stars from GitHub Trending HTML."""
    parser = _TrendingParser()
    parser.feed(html_text)
    return [{**item, "rank": rank} for rank, item in enumerate(parser.items, start=1)]


class GitHubClient:
    def __init__(self, token: str | None, timeout: int = 30):
        self.token = token
        self.timeout = timeout

    def _get_json(self, url: str) -> dict:
        headers = {
            "User-Agent": "WorkBuddy Open Source Radar",
            "Accept": "application/vnd.github+json",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = Request(url, headers=headers)
        with urlopen(request, timeout=self.timeout) as response:
            return json.loads(response.read().decode("utf-8"))

    def fetch_trending(self) -> list[dict]:
        headers = {"User-Agent": "WorkBuddy Open Source Radar", "Accept": "text/html"}
        request = Request(GITHUB_TRENDING, headers=headers)
        with urlopen(request, timeout=self.timeout) as response:
            return parse_trending(response.read().decode("utf-8"))

    def search_repositories(self, query: str, limit: int) -> list[dict]:
        params = urlencode({"q": query, "per_page": limit, "sort": "stars", "order": "desc"})
        return self._get_json(f"{GITHUB_API}/search/repositories?{params}").get("items", [])

    def get_repository(self, full_name: str) -> dict:
        return self._get_json(f"{GITHUB_API}/repos/{full_name}")

    def get_readme(self, full_name: str) -> str:
        payload = self._get_json(f"{GITHUB_API}/repos/{full_name}/readme")
        if payload.get("encoding") != "base64" or not payload.get("content"):
            return ""
        return base64.b64decode(payload["content"]).decode("utf-8", errors="replace")


def _parse_timestamp(value: str | None) -> datetime.datetime:
    if not value:
        return datetime.datetime.min
    return datetime.datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)


def _candidate(data: dict, trend: dict | None, readme: str) -> RepositoryCandidate:
    license_data = data.get("license") or {}
    candidate = RepositoryCandidate(
        full_name=data["full_name"],
        html_url=data.get("html_url", f"https://github.com/{data['full_name']}"),
        description=data.get("description") or "",
        language=data.get("language") or "",
        license_name=license_data.get("name") or "",
        stars=data.get("stargazers_count", 0),
        forks=data.get("forks_count", 0),
        topics=data.get("topics") or [],
        created_at=_parse_timestamp(data.get("created_at")),
        pushed_at=_parse_timestamp(data.get("pushed_at")),
        trending_rank=trend["rank"] if trend else None,
        stars_today=trend["stars_today"] if trend else None,
        readme=readme[:README_LIMIT],
    )
    candidate.archived = bool(data.get("archived", False))
    candidate.is_fork = bool(data.get("fork", False))
    return candidate


def collect_candidates(client: GitHubClient, date: datetime.date) -> list[RepositoryCandidate]:
    """Collect and enrich deterministic GitHub search candidates, with Trending optional."""
    try:
        trending = {item["full_name"].lower(): item for item in client.fetch_trending()}
    except Exception as error:
        LOGGER.warning("GitHub Trending unavailable; continuing with search: %s", error)
        trending = {}

    queries = [
        f"created:>={date - datetime.timedelta(days=14)} stars:>=50 archived:false fork:false",
        f"pushed:>={date - datetime.timedelta(days=7)} stars:>=500 archived:false fork:false",
    ]
    repositories = {}
    for query in queries:
        for item in client.search_repositories(query, 50):
            repositories.setdefault(item["full_name"].lower(), item)

    candidates = []
    for key, search_item in repositories.items():
        try:
            repository = client.get_repository(search_item["full_name"])
            readme = client.get_readme(search_item["full_name"])
        except Exception as error:
            LOGGER.warning("Could not enrich %s: %s", search_item["full_name"], error)
            repository, readme = search_item, ""
        candidates.append(_candidate(repository, trending.get(key), readme))
    return candidates
