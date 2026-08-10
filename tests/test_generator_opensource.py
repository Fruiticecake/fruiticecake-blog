import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import generator
import opensource


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests" / "fixtures" / "briefs.json"
PRODUCTION_OPEN_SOURCE_CONTENT = ROOT / "content" / "opensource"
FIXTURE_MARKERS = (
    "sample/",
    "GitHub Trending 第 1 名，今日新增 842 星。",
    "GitHub Trending 第 2 名，今日新增 615 星。",
    "GitHub Trending 第 3 名，今日新增 488 星。",
)


class OpenSourceGeneratorTests(unittest.TestCase):
    def test_build_contains_open_source_radar_routes_and_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            content = root / "content"
            public = root / "public"
            fixture_content = content / "opensource"
            with patch.object(opensource, "DEFAULT_CONTENT_DIR", fixture_content):
                exit_code = opensource.main(
                    ["--date", "2026-08-09", "--fixture", str(FIXTURE)]
                )
            self.assertEqual(exit_code, 0)

            with patch.object(generator, "CONTENT", str(content)), patch.object(
                generator, "PUBLIC", str(public)
            ):
                generator.main()

            homepage = (public / "index.html").read_text(encoding="utf-8")
            self.assertIn('href="/opensource/"', homepage)
            self.assertIn('<link rel="icon" href="data:,">', homepage)
            section = (public / "opensource" / "index.html").read_text(encoding="utf-8")
            self.assertIn("今日风向", section)
            self.assertIn("GitHub Trending 第 1 名", section)
            self.assertIn(
                "为什么值得关注",
                (public / "opensource" / "2026-08-09.html").read_text(encoding="utf-8"),
            )
            self.assertIn(
                'class="post post-wide"',
                (public / "opensource" / "2026-08-09.html").read_text(encoding="utf-8"),
            )
            self.assertIn("/opensource/2026-08-09.html", (public / "feed.xml").read_text(encoding="utf-8"))

    def test_production_content_excludes_fixture_daily_digest(self):
        production_documents = (
            list(PRODUCTION_OPEN_SOURCE_CONTENT.glob("*.md"))
            if PRODUCTION_OPEN_SOURCE_CONTENT.exists()
            else []
        )

        for path in production_documents:
            document = path.read_text(encoding="utf-8")
            with self.subTest(path=path):
                for marker in FIXTURE_MARKERS:
                    self.assertFalse(
                        marker in document,
                        f"Fixture marker {marker!r} leaked into production content {path}",
                    )

    def test_production_build_excludes_fixture_repositories(self):
        with tempfile.TemporaryDirectory() as directory:
            public = Path(directory) / "public"
            radar_public = public / "opensource"
            radar_public.mkdir(parents=True)
            stale_page = radar_public / "2026-08-09.html"
            stale_page.write_text("https://github.com/sample/stale", encoding="utf-8")
            unrelated_asset = radar_public / "radar-mark.svg"
            unrelated_asset.write_text("<svg><!-- keep --></svg>", encoding="utf-8")

            with patch.object(generator, "PUBLIC", str(public)):
                generator.main()

            self.assertFalse(stale_page.exists())
            self.assertTrue((radar_public / "index.html").is_file())
            self.assertEqual(
                unrelated_asset.read_text(encoding="utf-8"),
                "<svg><!-- keep --></svg>",
            )
            for path in public.rglob("*"):
                if path.is_file():
                    self.assertFalse(
                        "sample/" in path.read_text(encoding="utf-8"),
                        f"Fixture repository leaked into production build {path}",
                    )


if __name__ == "__main__":
    unittest.main()
