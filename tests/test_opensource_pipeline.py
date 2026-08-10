import datetime
import io
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from opensource_models import ProjectBrief, RepositoryCandidate
from opensource_render import render_digest
import opensource
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


def valid_existing_digest(date="2026-08-09", project_count=12):
    featured = "\n".join('  <article class="radar-feature"></article>' for _ in range(3))
    quick = "\n".join('  <article class="radar-quick"></article>' for _ in range(project_count - 3))
    return "\n".join(
        (
            "---",
            f'date: "{date}"',
            "html: true",
            'section: "opensource"',
            'trend_1: "trend one"',
            'trend_2: "trend two"',
            'trend_3: "trend three"',
            f"project_count: {project_count}",
            "---",
            '<section class="radar-digest">',
            '  <section class="radar-trends"></section>',
            featured,
            quick,
            "</section>",
            "",
        )
    )


class OpenSourcePipelineTests(unittest.TestCase):
    def test_render_digest_contains_trends_featured_and_quick_projects(self):
        html = render_digest(sample_digest())

        self.assertIn('class="radar-trends"', html)
        self.assertEqual(html.count('class="radar-feature"'), 3)
        self.assertEqual(html.count('class="radar-quick"'), 9)

    def test_rendered_repository_links_are_safe_and_descriptive(self):
        html = render_digest(sample_digest())

        self.assertEqual(html.count('target="_blank"'), 12)
        self.assertEqual(html.count('rel="noopener noreferrer"'), 12)
        self.assertEqual(html.count('aria-label="在 GitHub 查看 sample/project-'), 12)

    def test_rendered_featured_and_quick_projects_show_escaped_difficulty_labels(self):
        digest = sample_digest()
        digest.featured[0].difficulty = "<featured>"
        digest.quick[0].difficulty = "<quick>"

        html = render_digest(digest)

        self.assertEqual(html.count('class="difficulty-label"'), 12)
        self.assertIn('<span class="difficulty-label">&lt;featured&gt;</span>', html)
        self.assertIn('<span class="difficulty-label">&lt;quick&gt;</span>', html)

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

    def test_recent_seen_names_uses_the_prior_seven_complete_days_only(self):
        date = datetime.date(2026, 8, 9)
        with tempfile.TemporaryDirectory() as directory:
            content_dir = Path(directory)
            for days_ago, name in ((7, "included"), (8, "too-old"), (0, "same-day")):
                path = content_dir / f"{date - datetime.timedelta(days=days_ago)}.md"
                path.write_text(f"https://github.com/sample/{name}", encoding="utf-8")

            seen = opensource.recent_seen_names(content_dir, date)

        self.assertEqual(seen, {"sample/included"})

    def test_default_date_uses_beijing_calendar_day(self):
        utc = datetime.datetime(2026, 8, 9, 22, 20, tzinfo=datetime.timezone.utc)

        self.assertEqual(opensource.default_digest_date(utc), datetime.date(2026, 8, 10))

    def test_live_pipeline_stops_before_model_calls_when_ranked_candidates_are_incomplete(self):
        candidates = [brief.candidate for brief in sample_briefs(count=7)]
        with patch.dict(os.environ, {"GITHUB_TOKEN": "token"}), patch(
            "opensource.collect_candidates", return_value=candidates
        ), patch("opensource.select_candidates", return_value=candidates), patch(
            "opensource.GitHubModelsClient"
        ) as model_client, patch("opensource.analyze_candidate") as analyze:
            with self.assertRaises(IncompleteDigestError):
                opensource.collect_live_briefs(datetime.date(2026, 8, 9), Path("unused"))

        model_client.assert_not_called()
        analyze.assert_not_called()

    def test_existing_valid_digest_dry_run_reports_counts_without_collection(self):
        with tempfile.TemporaryDirectory() as directory:
            content_dir = Path(directory)
            target = content_dir / "2026-08-09.md"
            target.write_text(valid_existing_digest(), encoding="utf-8")
            output = io.StringIO()
            with patch.object(opensource, "DEFAULT_CONTENT_DIR", content_dir), patch(
                "opensource.collect_live_briefs", side_effect=AssertionError("must not collect")
            ), redirect_stdout(output):
                exit_code = opensource.main(["--date", "2026-08-09", "--dry-run"])

        self.assertEqual(exit_code, 0)
        self.assertIn("12 projects, 3 trends", output.getvalue())

    def test_existing_invalid_digest_fails_without_overwriting_it(self):
        with tempfile.TemporaryDirectory() as directory:
            content_dir = Path(directory)
            target = content_dir / "2026-08-09.md"
            original = "partial write"
            target.write_text(original, encoding="utf-8")
            with patch.object(opensource, "DEFAULT_CONTENT_DIR", content_dir):
                with self.assertRaises(ValueError):
                    opensource.main(["--date", "2026-08-09", "--fixture", "tests/fixtures/briefs.json"])

            self.assertEqual(target.read_text(encoding="utf-8"), original)

    def test_existing_digest_with_more_than_twelve_projects_fails_without_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            content_dir = Path(directory)
            target = content_dir / "2026-08-09.md"
            original = valid_existing_digest(project_count=13)
            target.write_text(original, encoding="utf-8")
            with patch.object(opensource, "DEFAULT_CONTENT_DIR", content_dir):
                with self.assertRaises(ValueError):
                    opensource.main(["--date", "2026-08-09", "--fixture", "tests/fixtures/briefs.json"])

            self.assertEqual(target.read_text(encoding="utf-8"), original)

    def test_force_write_keeps_existing_digest_when_atomic_replace_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            content_dir = Path(directory)
            target = content_dir / "2026-08-09.md"
            original = valid_existing_digest()
            target.write_text(original, encoding="utf-8")
            with patch.object(opensource, "DEFAULT_CONTENT_DIR", content_dir), patch(
                "opensource.os.replace", side_effect=OSError("disk failure")
            ):
                with self.assertRaises(OSError):
                    opensource.main([
                        "--date", "2026-08-09", "--fixture", "tests/fixtures/briefs.json", "--force"
                    ])

            self.assertEqual(target.read_text(encoding="utf-8"), original)
            self.assertEqual(list(content_dir.glob("*.tmp")), [])


if __name__ == "__main__":
    unittest.main()
