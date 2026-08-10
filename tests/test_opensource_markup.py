import datetime
import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from opensource import build_digest
from opensource_models import ProjectBrief, RepositoryCandidate
from opensource_render import render_digest


NOW = datetime.datetime(2026, 8, 9, 12, 0, 0)


def build_fixture_page() -> str:
    briefs = []
    for index in range(12):
        name = "sample/agent-kit" if index == 0 else f"sample/project-{index + 1}"
        briefs.append(
            ProjectBrief(
                candidate=RepositoryCandidate(
                    full_name=name,
                    html_url=f"https://github.com/{name}",
                    description="A useful project.",
                    language="Python",
                    license_name="MIT",
                    stars=100 + index,
                    forks=10,
                    topics=["ai"],
                    created_at=NOW - datetime.timedelta(days=30),
                    pushed_at=NOW - datetime.timedelta(days=1),
                    trending_rank=index + 1,
                    stars_today=20 + index,
                ),
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
    return render_digest(build_digest(briefs, date="2026-08-09"))


class OpenSourceMarkupTests(unittest.TestCase):
    def test_repository_cards_have_safe_external_links_and_labels(self):
        page = build_fixture_page()

        self.assertEqual(page.count('target="_blank" rel="noopener noreferrer"'), 12)
        self.assertIn('aria-label="在 GitHub 查看 sample/agent-kit"', page)
        self.assertIn('<span class="difficulty-label">中等</span>', page)


if __name__ == "__main__":
    unittest.main()
