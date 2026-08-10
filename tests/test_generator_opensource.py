import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import generator


class OpenSourceGeneratorTests(unittest.TestCase):
    def test_build_contains_open_source_radar_routes_and_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            public = Path(directory)
            with patch.object(generator, "PUBLIC", str(public)):
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


if __name__ == "__main__":
    unittest.main()
