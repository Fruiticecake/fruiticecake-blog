import base64
import datetime
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from opensource_sources import GitHubClient, collect_candidates, parse_trending


FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name):
    return (FIXTURES / name).read_text(encoding="utf-8")


def load_json(name):
    return json.loads(fixture(name))


class FakeGitHubClient:
    def __init__(self, trending_error=None, trending_items=None, search_error_on_call=None):
        self.trending_error = trending_error
        self.trending_items = trending_items
        self.search_error_on_call = search_error_on_call
        self.search_calls = []
        self.items = load_json("search.json")["items"]
        self.repository_data = {item["full_name"]: item for item in self.items}

    def fetch_trending(self):
        if self.trending_error:
            raise self.trending_error
        return self.trending_items if self.trending_items is not None else parse_trending(fixture("trending.html"))

    def search_repositories(self, query, limit):
        self.search_calls.append((query, limit))
        if len(self.search_calls) == self.search_error_on_call:
            raise RuntimeError("temporary GitHub outage")
        return self.items[:limit]

    def get_repository(self, full_name):
        return self.repository_data[full_name]

    def get_readme(self, full_name):
        return "README " + ("x" * 18001)


class SourceTests(unittest.TestCase):
    def test_parse_trending_extracts_repo_rank_and_daily_stars(self):
        items = parse_trending(fixture("trending.html"))
        self.assertEqual(items[0], {"full_name": "sample/agent-kit", "rank": 1, "stars_today": 842})

    def test_collect_candidates_survives_trending_failure(self):
        client = FakeGitHubClient(trending_error=RuntimeError("layout changed"))

        result = collect_candidates(client, datetime.date(2026, 8, 9))

        self.assertGreaterEqual(len(result), 8)
        self.assertTrue(client.search_calls)
        self.assertEqual(len(result[0].readme), 18000)

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


if __name__ == "__main__":
    unittest.main()
