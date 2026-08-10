import base64
import datetime
import json
import sys
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from opensource_sources import GitHubClient, collect_candidates, enrich_readmes, parse_trending
from opensource_ranker import select_candidates


FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name):
    return (FIXTURES / name).read_text(encoding="utf-8")


def load_json(name):
    return json.loads(fixture(name))


class FakeGitHubClient:
    def __init__(self, trending_error=None, trending_items=None, search_error_on_call=None, readme_errors=None):
        self.trending_error = trending_error
        self.trending_items = trending_items
        self.search_error_on_call = search_error_on_call
        self.search_calls = []
        self.repository_calls = []
        self.readme_calls = []
        self.readme_errors = set(readme_errors or [])
        self.items = load_json("search.json")["items"]
        self.repository_data = {item["full_name"]: item for item in self.items}

    def fetch_trending(self):
        if self.trending_error:
            raise self.trending_error
        return self.trending_items if self.trending_items is not None else parse_trending(fixture("trending.html"))

    def search_repositories(self, query, limit):
        self.search_calls.append((query, limit))
        if len(self.search_calls) == self.search_error_on_call:
            raise URLError("temporary GitHub outage")
        return self.items[:limit]

    def get_repository(self, full_name):
        self.repository_calls.append(full_name)
        return self.repository_data[full_name]

    def get_readme(self, full_name):
        self.readme_calls.append(full_name)
        if full_name in self.readme_errors:
            raise URLError("README unavailable")
        return "README " + ("x" * 18001)


class SourceTests(unittest.TestCase):
    def test_parse_trending_extracts_repo_rank_and_daily_stars(self):
        items = parse_trending(fixture("trending.html"))
        self.assertEqual(items[0], {"full_name": "sample/agent-kit", "rank": 1, "stars_today": 842})

    def test_collect_candidates_survives_trending_failure(self):
        client = FakeGitHubClient(trending_error=URLError("layout changed"))

        result = collect_candidates(client, datetime.date(2026, 8, 9))

        self.assertGreaterEqual(len(result), 8)
        self.assertTrue(client.search_calls)
        self.assertTrue(all(not item.readme for item in result))
        self.assertEqual(client.readme_calls, [])

    def test_unexpected_source_programming_error_propagates(self):
        client = FakeGitHubClient(trending_error=RuntimeError("programming bug"))

        with self.assertRaisesRegex(RuntimeError, "programming bug"):
            collect_candidates(client, datetime.date(2026, 8, 9))

    def test_collect_ranks_metadata_before_readme_and_enriches_only_twenty_shortlisted_items(self):
        client = FakeGitHubClient(readme_errors={"sample/5"})
        metadata = collect_candidates(client, datetime.date(2026, 8, 9))
        candidates = [replace(metadata[0], full_name=f"sample/{index}") for index in range(25)]
        original_stars = candidates[5].stars

        enriched = enrich_readmes(client, candidates)

        self.assertEqual(len(client.readme_calls), 20)
        self.assertEqual(enriched[0].readme, ("README " + ("x" * 18001))[:18000])
        self.assertEqual(enriched[5].stars, original_stars)
        self.assertEqual(enriched[5].readme, "")
        self.assertTrue(all(not item.readme for item in enriched[20:]))

    def test_search_metadata_does_not_trigger_repository_detail_requests(self):
        client = FakeGitHubClient(trending_items=[])

        collect_candidates(client, datetime.date(2026, 8, 9))

        self.assertEqual(client.repository_calls, [])

    def test_source_metadata_reaches_ranker_with_a_four_category_distribution(self):
        client = FakeGitHubClient(trending_items=[])
        fixtures = []
        for name, topics, description, language in (
            ("sample/ai", ["llm"], "Model runtime", "Python"),
            ("sample/devtools", ["linter"], "Code quality", "Rust"),
            ("sample/platform", ["kubernetes"], "Cluster operator", "Go"),
            ("sample/other", ["hardware"], "PCB design", "C++"),
        ):
            item = load_json("repository.json")
            item.update(full_name=name, html_url=f"https://github.com/{name}", topics=topics, description=description, language=language)
            fixtures.append(item)
        client.items = fixtures
        client.repository_data = {item["full_name"]: item for item in fixtures}

        ranked = select_candidates(
            collect_candidates(client, datetime.date(2026, 8, 9)),
            set(),
            limit=4,
        )

        self.assertEqual({item.category for item in ranked}, {"ai", "devtools", "platform", "other"})

    def test_collect_candidates_enriches_trending_repository_and_preserves_flags(self):
        client = FakeGitHubClient()

        result = collect_candidates(client, datetime.date(2026, 8, 9))

        agent = next(item for item in result if item.full_name == "sample/agent-kit")
        self.assertEqual(agent.trending_rank, 1)
        self.assertEqual(agent.stars_today, 842)
        self.assertFalse(agent.archived)
        self.assertFalse(agent.is_fork)

    def test_collect_candidates_includes_trending_only_repository(self):
        client = FakeGitHubClient(
            trending_items=[{"full_name": "sample/trending-only", "rank": 1, "stars_today": 842}]
        )
        repository = load_json("repository.json")
        repository["full_name"] = "sample/trending-only"
        repository["html_url"] = "https://github.com/sample/trending-only"
        client.items = []
        client.repository_data = {"sample/trending-only": repository}

        result = collect_candidates(client, datetime.date(2026, 8, 9))

        self.assertEqual([item.full_name for item in result], ["sample/trending-only"])
        self.assertEqual(result[0].trending_rank, 1)
        self.assertEqual(result[0].stars_today, 842)

    def test_collect_candidates_keeps_first_search_results_when_second_search_fails(self):
        client = FakeGitHubClient(search_error_on_call=2)

        result = collect_candidates(client, datetime.date(2026, 8, 9))

        self.assertEqual(len(result), 8)
        self.assertEqual(len(client.search_calls), 2)

    @patch("opensource_sources.urlopen")
    def test_github_client_requests_json_with_required_headers_and_bearer_token(self, mock_urlopen):
        response = unittest.mock.MagicMock()
        response.read.return_value = fixture("search.json").encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = response

        items = GitHubClient("secret", timeout=12).search_repositories("stars:>=50", 3)

        request = mock_urlopen.call_args.args[0]
        self.assertEqual(items[0]["full_name"], "sample/agent-kit")
        self.assertEqual(request.get_header("User-agent"), "WorkBuddy Open Source Radar")
        self.assertEqual(request.get_header("Accept"), "application/vnd.github+json")
        self.assertEqual(request.get_header("Authorization"), "Bearer secret")
        self.assertEqual(mock_urlopen.call_args.kwargs["timeout"], 12)

    @patch("opensource_sources.urlopen")
    def test_get_readme_decodes_base64_content(self, mock_urlopen):
        response = unittest.mock.MagicMock()
        response.read.return_value = fixture("readme.json").encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = response

        readme = GitHubClient(None).get_readme("sample/agent-kit")

        self.assertEqual(readme, base64.b64decode(load_json("readme.json")["content"]).decode("utf-8"))

    @patch("opensource_sources.urlopen")
    def test_github_json_response_body_is_bounded(self, mock_urlopen):
        response = unittest.mock.MagicMock()
        response.read.side_effect = lambda size=-1: b"x" * (size if size > 0 else 2_000_001)
        mock_urlopen.return_value.__enter__.return_value = response

        with self.assertRaisesRegex(OSError, "too large"):
            GitHubClient("secret").search_repositories("stars:>=50", 3)

    @patch("opensource_sources.urlopen")
    def test_trending_response_body_is_bounded(self, mock_urlopen):
        response = unittest.mock.MagicMock()
        response.read.side_effect = lambda size=-1: b"x" * (size if size > 0 else 1_000_001)
        mock_urlopen.return_value.__enter__.return_value = response

        with self.assertRaisesRegex(OSError, "too large"):
            GitHubClient("secret").fetch_trending()


if __name__ == "__main__":
    unittest.main()
