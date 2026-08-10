import datetime
import re
import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from opensource import build_digest
from opensource_models import ProjectBrief, RepositoryCandidate
from opensource_render import render_digest


NOW = datetime.datetime(2026, 8, 9, 12, 0, 0)
CSS_PATH = Path(__file__).resolve().parents[1] / "static" / "style.css"


def css_declarations(selector: str) -> str:
    css = CSS_PATH.read_text(encoding="utf-8")
    for selector_group, declarations in re.findall(r"([^{}]+)\{([^{}]*)\}", css):
        selectors = [item.strip() for item in selector_group.split(",")]
        if selector in selectors:
            return re.sub(r"\s+", "", declarations)
    raise AssertionError(f"Missing CSS selector: {selector}")


def build_fixture_digest():
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
    return build_digest(briefs, date="2026-08-09")


def build_fixture_page() -> str:
    return render_digest(build_fixture_digest())


class OpenSourceMarkupTests(unittest.TestCase):
    def test_mobile_navigation_wraps_without_horizontal_scrolling(self):
        css = CSS_PATH.read_text(encoding="utf-8")
        mobile_css = css[css.rfind("@media(max-width:720px)") :]

        self.assertRegex(
            mobile_css,
            r"\.site-nav \.wrap\{[^}]*flex-wrap:wrap[^}]*overflow-x:visible",
        )

    def test_repository_cards_have_safe_external_links_and_labels(self):
        page = build_fixture_page()

        self.assertEqual(page.count('target="_blank" rel="noopener noreferrer"'), 12)
        self.assertIn('aria-label="在 GitHub 查看 sample/agent-kit"', page)
        self.assertIn('<span class="difficulty-label">中等</span>', page)

    def test_every_card_shows_escaped_facts_and_quick_cards_explain_the_project(self):
        digest = build_fixture_digest()
        digest.generated_at = datetime.datetime(2026, 8, 9, 12, 34)
        digest.featured[0].candidate.language = "R&D <lang>"
        digest.featured[0].candidate.license_name = ""
        digest.quick[0].problem = "Problem <unsafe>"
        digest.quick[0].approach = "Approach & proof"
        digest.quick[0].audience = "R&D teams"

        page = render_digest(digest)

        self.assertIn('class="radar-issue-header"', page)
        self.assertIn("2026-08-09 12:34", page)
        self.assertIn("12 projects", page)
        self.assertIn('class="radar-method-note"', page)
        self.assertEqual(page.count('class="radar-facts"'), 12)
        self.assertIn("R&amp;D &lt;lang&gt;", page)
        self.assertIn("未声明", page)
        self.assertIn("Stars 100", page)
        self.assertIn("Forks 10", page)
        self.assertIn("Problem &lt;unsafe&gt;", page)
        self.assertIn("Approach &amp; proof", page)
        self.assertIn("R&amp;D teams", page)

    def test_exceptional_repeat_reason_is_visible_on_the_project_card(self):
        digest = build_fixture_digest()
        digest.quick[0].candidate.repeat_reason = "Repeated after 1200 stars today."

        page = render_digest(digest)

        self.assertIn("Repeated after 1200 stars today.", page)

    def test_clipped_radar_containers_use_internal_focus_indicators(self):
        for selector in (
            ".opensource-rail .streak-day:focus-visible",
            ".opensource-history .aihot-list-row:focus-visible",
        ):
            with self.subTest(selector=selector):
                declarations = css_declarations(selector)
                self.assertIn("box-shadow:inset", declarations)
                self.assertNotIn("outline-offset:4px", declarations)

    def test_radar_body_copy_and_small_labels_use_opaque_ink(self):
        selectors = (
            ".opensource-trends h2",
            ".opensource-trends li",
            ".opensource-rail .streak-wd",
            ".opensource-history .aihot-list-headline",
            ".opensource-history .aihot-list-count",
            ".radar-feature p",
            ".radar-feature p strong",
            ".radar-quick p",
            ".difficulty-label",
            ".radar-signal",
        )
        for selector in selectors:
            with self.subTest(selector=selector):
                self.assertIn("color:var(--ink)", css_declarations(selector))


if __name__ == "__main__":
    unittest.main()
