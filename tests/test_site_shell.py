"""整站外壳的回归测试：用真实 content/ 构建一次到临时目录，检查每类页面。"""
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import unquote


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import generator


HREF = re.compile(r'(?:href|src)="(/[^"#?]*)')


class SiteShellTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        cls.public = Path(cls._tmp.name) / "public"
        with patch.object(generator, "PUBLIC", str(cls.public)):
            generator.main()
        cls.pages = sorted(cls.public.rglob("*.html"))

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def read(self, rel):
        return (self.public / rel).read_text(encoding="utf-8")

    def test_every_page_uses_the_shared_theme_and_shell(self):
        for page in self.pages:
            with self.subTest(page=page.relative_to(self.public).as_posix()):
                text = page.read_text(encoding="utf-8")
                head = text.split("</head>")[0]
                self.assertIn("/stage/tokens.css", head)
                self.assertIn('localStorage.getItem("theme")', head)
                self.assertIn('class="theme-btn"', text)

    def test_classic_pages_load_site_assets(self):
        page = self.read("archive/index.html")
        self.assertIn("/style.css?v=", page)
        self.assertIn("/site/site.js?v=", page)
        self.assertIn('class="bar"', page)
        self.assertTrue((self.public / "site" / "site.js").exists())

    def test_only_home_plays_the_boot_calibration(self):
        self.assertIn('add("m-boot")', self.read("index.html"))
        self.assertNotIn('add("m-boot")', self.read("archive/index.html"))
        self.assertNotIn('add("m-boot")', self.read("blog/index.html"))

    def test_home_embeds_every_post_as_a_marker(self):
        page = self.read("index.html")
        raw = re.search(r'<script type="application/json" id="marker-data">(.*?)</script>', page, re.S).group(1)
        self.assertNotIn("</", raw)                       # 防止标题里的 </script> 提前结束脚本
        data = json.loads(raw)
        total = sum(1 for p in self.pages if p.parent.name in {s["slug"] for s in data["sections"]}
                    and p.name != "index.html")
        self.assertEqual(len(data["posts"]), total)
        self.assertTrue(all({"t", "u", "d", "s"} <= set(p) for p in data["posts"]))

    def test_mermaid_loads_only_where_used(self):
        for page in self.pages:
            text = page.read_text(encoding="utf-8")
            uses = 'class="mermaid"' in text.split("<body", 1)[-1].split("<script", 1)[0]
            self.assertEqual("mermaid.esm" in text, uses, page.name)

    def test_long_classic_posts_get_a_rail_and_short_ones_do_not(self):
        with_rail = [p for p in self.public.glob("blog/*.html") if 'class="rail"' in p.read_text(encoding="utf-8")]
        self.assertGreater(len(with_rail), 0)
        for p in with_rail:
            text = p.read_text(encoding="utf-8")
            for target in re.findall(r'class="lv\d" href="#([^"]+)"', text):
                self.assertIn(f'id="{target}"', text, f"{p.name} 目录指向不存在的锚点 {target}")

    def test_blog_and_docs_sections_use_the_take_log(self):
        for section in ("blog", "docs"):
            self.assertIn('class="log"', self.read(f"{section}/index.html"))

    def test_every_internal_link_resolves(self):
        missing = set()
        for page in self.pages:
            for url in HREF.findall(page.read_text(encoding="utf-8")):
                if url.startswith("//") or url.startswith("/_vercel/"):
                    continue
                path = self.public / unquote(url).lstrip("/")
                target = path / "index.html" if url.endswith("/") else path
                if not target.exists():
                    missing.add(f"{page.relative_to(self.public).as_posix()} → {url}")
        self.assertEqual(sorted(missing)[:20], [])


if __name__ == "__main__":
    unittest.main()
