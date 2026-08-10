import datetime
import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from opensource_models import ProjectBrief, RepositoryCandidate
from opensource_render import render_digest
from opensource import IncompleteDigestError, build_digest


NOW = datetime.datetime(2026, 8, 9, 12, 0, 0)


def sample_briefs(count=12):
    briefs = []
    categories = ("ai", "devtools", "platform")
    for index in range(count):
        candidate = RepositoryCandidate(
            full_name=f"sample/project-{index + 1}",
            html_url=f"https://github.com/sample/project-{index + 1}",
            description="A useful project.",
            language="Python",
            license_name="MIT",
            stars=100 + index,
            forks=10,
            topics=[categories[index % len(categories)]],
            created_at=NOW - datetime.timedelta(days=30),
            pushed_at=NOW - datetime.timedelta(days=1),
            category=categories[index % len(categories)],
            trending_rank=index + 1,
            stars_today=20 + index,
        )
        briefs.append(
            ProjectBrief(
                candidate=candidate,
                headline=f"Project {index + 1} headline",
                problem="Solves a concrete developer problem.",
                approach="Uses a focused technical approach.",
                why_trending=f"Ranked #{index + 1} with {20 + index} stars today.",
                audience="Developers",
                difficulty="中等",
                differentiator="A practical differentiator.",
                quick_start="Install and run the documented example.",
                caveats="Validate it against your workload.",
            )
        )
    return briefs


def sample_digest():
    return build_digest(sample_briefs(), date="2026-08-09")


class OpenSourcePipelineTests(unittest.TestCase):
    def test_render_digest_contains_trends_featured_and_quick_projects(self):
        html = render_digest(sample_digest())

        self.assertIn('class="radar-trends"', html)
        self.assertEqual(html.count('class="radar-feature"'), 3)
        self.assertEqual(html.count('class="radar-quick"'), 9)

    def test_pipeline_refuses_incomplete_digest(self):
        with self.assertRaises(IncompleteDigestError):
            build_digest(sample_briefs(count=7), date="2026-08-09")

    def test_render_escapes_model_text_and_refuses_non_github_repository_links(self):
        brief = sample_briefs(count=1)[0]
        brief.headline = '<script>alert("x")</script>'
        brief.candidate.html_url = "https://example.com/not-github"
        digest = build_digest([brief] * 8, date=datetime.date(2026, 8, 9))

        html = render_digest(digest)

        self.assertIn("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;", html)
        self.assertNotIn('href="https://example.com/not-github"', html)

    def test_build_digest_normalizes_dates_and_derives_three_evidence_backed_trends(self):
        digest = build_digest(sample_briefs(), date="2026-08-09")

        self.assertEqual(digest.date, datetime.date(2026, 8, 9))
        self.assertEqual(len(digest.trends), 3)
        self.assertTrue(all("Ranked" in trend for trend in digest.trends))


if __name__ == "__main__":
    unittest.main()
