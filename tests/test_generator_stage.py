import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import generator
import stage


STAGE_POST = """---
title: 演示文章
display_title: 让 AI 给[任何怪物]做动画
date: 2026-10-20
summary: "一句话摘要"
design: stage
source: "https://www.youtube.com/watch?v=x"
source_label: Can It Code?
---

::: tldr
结论先行。
:::

## [01:20] 第一章

正文 **重点**。

::: interactive triangulation title="三角测量"
静态图解。
:::

## [NOTE] 收获
"""

PLAIN_POST = """---
title: 普通文章
date: 2026-10-01
---

普通正文。
"""


class StageBuildTest(unittest.TestCase):
    def build(self, files):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        content, public = Path(tmp.name) / "content", Path(tmp.name) / "public"
        for rel, text in files.items():
            path = content / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(text, bytes):
                path.write_bytes(text)
            else:
                path.write_text(text, encoding="utf-8")
        with patch.object(generator, "CONTENT", str(content)), patch.object(generator, "PUBLIC", str(public)):
            generator.main()
        return public

    def test_bundle_post_is_loaded_and_its_assets_are_copied(self):
        public = self.build({
            "docs/demo-bundle/index.md": STAGE_POST,
            "docs/demo-bundle/widgets.js": "export const widgets = {};",
            "docs/demo-bundle/fig.png": b"png",
        })
        self.assertTrue((public / "docs" / "demo-bundle.html").exists())
        self.assertEqual((public / "docs" / "demo-bundle" / "fig.png").read_bytes(), b"png")
        self.assertTrue((public / "docs" / "demo-bundle" / "widgets.js").exists())
        self.assertFalse((public / "docs" / "demo-bundle" / "index.md").exists())

    def test_stage_page_supports_light_and_dark_themes(self):
        public = self.build({"docs/demo-bundle/index.md": STAGE_POST})
        page = (public / "docs" / "demo-bundle.html").read_text(encoding="utf-8")
        head = page.split("</head>")[0]
        self.assertLess(head.index("/stage/tokens.css"), head.index("/stage/stage.css"))
        self.assertIn('localStorage.getItem("theme")', head)          # 首帧前读取用户选择
        self.assertIn("data-theme-resolved", head)
        self.assertIn('class="theme-btn"', page)

    def test_stage_page_uses_stage_shell_rail_and_widgets(self):
        public = self.build({"docs/demo-bundle/index.md": STAGE_POST,
                             "docs/demo-bundle/widgets.js": "export const widgets = {};"})
        page = (public / "docs" / "demo-bundle.html").read_text(encoding="utf-8")
        self.assertIn("/stage/stage.css", page)
        self.assertIn("/stage/runtime.js", page)
        self.assertIn('data-local-widgets="/docs/demo-bundle/widgets.js?v=', page)
        self.assertIn('data-hero="mocap-gait"', page)
        self.assertIn('<span class="hl">任何怪物</span>', page)
        self.assertIn('<a href="#c1"><span>01:20</span>第一章</a>', page)
        self.assertIn('<a href="#c2"><span>NOTE</span>收获</a>', page)
        self.assertIn('data-widget="triangulation"', page)
        self.assertIn('class="tldr"', page)
        self.assertIn("Can It Code?", page)
        self.assertNotIn('class="site-nav"', page)
        self.assertNotIn("$", page.split("<body")[1].split("<script")[0])  # 没有未替换的模板占位符

    def test_stage_nav_links_home_sections_and_archive(self):
        public = self.build({"docs/demo-bundle/index.md": STAGE_POST})
        page = (public / "docs" / "demo-bundle.html").read_text(encoding="utf-8")
        nav = page.split('<nav aria-label="站点">')[1].split("</nav>")[0]
        self.assertIn('<a class="nav-home" href="/">首页</a>', nav)        # 手机上也保留的回首页入口
        self.assertIn('<a href="/docs/" aria-current="true">', nav)       # 当前文章所在板块高亮
        self.assertIn('href="/archive/"', nav)
        self.assertLess(nav.index('href="/"'), nav.index('href="/docs/"'))

    def test_bundle_style_is_linked_only_when_present(self):
        public = self.build({"docs/with-style/index.md": STAGE_POST,
                             "docs/with-style/style.css": ".x{}",
                             "docs/no-style/index.md": STAGE_POST.replace("title: 演示文章", "title: 另一篇")})
        self.assertIn('href="/docs/with-style/style.css?v=', (public / "docs" / "with-style.html").read_text(encoding="utf-8"))
        self.assertNotIn("/docs/no-style/style.css", (public / "docs" / "no-style.html").read_text(encoding="utf-8"))

    def test_single_file_stage_post_has_no_local_widgets(self):
        public = self.build({"docs/2026-10-20-demo.md": STAGE_POST.replace("design: stage", "design: stage\nslug: demo")})
        page = (public / "docs" / "demo.html").read_text(encoding="utf-8")
        self.assertIn("/stage/runtime.js", page)
        self.assertNotIn("data-local-widgets", page)

    def test_plain_posts_keep_the_classic_layout(self):
        public = self.build({"docs/2026-10-01-plain.md": PLAIN_POST})
        page = (public / "docs" / "2026-10-01-plain.html").read_text(encoding="utf-8")
        self.assertIn('class="site-nav"', page)
        self.assertNotIn("/stage/runtime.js", page)       # 普通文章用全站外壳，不加载 stage 运行时
        self.assertIn("/site/site.js", page)

    def test_stage_error_names_the_source_file(self):
        bad = STAGE_POST.replace("::: tldr\n结论先行。\n:::", "::: tldr\n没有结束")
        with self.assertRaises(stage.StageError) as ctx:
            self.build({"docs/broken/index.md": bad})
        self.assertIn("broken", str(ctx.exception))

    def test_directory_without_index_is_ignored(self):
        public = self.build({"docs/assets-only/readme.txt": "x", "docs/2026-10-01-plain.md": PLAIN_POST})
        self.assertFalse((public / "docs" / "assets-only.html").exists())

    def test_stage_post_still_appears_in_section_index_and_feed(self):
        public = self.build({"docs/demo-bundle/index.md": STAGE_POST})
        self.assertIn("/docs/demo-bundle.html", (public / "docs" / "index.html").read_text(encoding="utf-8"))
        self.assertIn("/docs/demo-bundle.html", (public / "feed.xml").read_text(encoding="utf-8"))


    def test_bundle_copy_uses_allow_list_and_skips_dotfiles(self):
        public = self.build({"docs/b/index.md": STAGE_POST, "docs/b/notes.md": "草稿", "docs/b/.secret": "x",
                             "docs/b/run.py": "x", "docs/b/img/fig.webp": b"w"})
        dest = public / "docs" / "b"
        self.assertTrue((dest / "img" / "fig.webp").exists())
        for name in ("notes.md", ".secret", "run.py"):
            self.assertFalse((dest / name).exists(), name)

    def test_relative_links_in_bundle_posts_point_into_the_bundle(self):
        post = STAGE_POST + "\n![图](fig.png) [附件](files/a.pdf) [站内](/docs/) [外链](https://x.com) [锚](#c1)\n"
        public = self.build({"docs/b/index.md": post, "docs/b/fig.png": b"p"})
        page = (public / "docs" / "b.html").read_text(encoding="utf-8")
        self.assertIn('src="/docs/b/fig.png"', page)
        self.assertIn('href="/docs/b/files/a.pdf"', page)
        self.assertIn('href="/docs/"', page)
        self.assertIn('href="https://x.com"', page)
        self.assertIn('href="#c1"', page)

    def test_local_assets_are_versioned_by_their_own_content(self):
        files = {"docs/b/index.md": STAGE_POST, "docs/b/widgets.js": "export const widgets = {};"}
        v1 = (self.build(files) / "docs" / "b.html").read_text(encoding="utf-8").split("widgets.js?v=")[1][:10]
        files["docs/b/widgets.js"] = "export const widgets = { a: () => {} };"
        v2 = (self.build(files) / "docs" / "b.html").read_text(encoding="utf-8").split("widgets.js?v=")[1][:10]
        self.assertNotEqual(v1, v2)

    def test_auto_summary_does_not_start_with_tldr_label(self):
        post = STAGE_POST.replace('summary: "一句话摘要"\n', "")
        public = self.build({"docs/b/index.md": post})
        feed = (public / "feed.xml").read_text(encoding="utf-8")
        self.assertIn("结论先行", feed)
        self.assertNotIn("TL;DR", feed)

    def test_stage_cannot_be_combined_with_raw_html_or_chat(self):
        for extra in ("html: true", "type: chat"):
            with self.assertRaises(stage.StageError, msg=extra):
                self.build({"docs/b/index.md": STAGE_POST.replace("design: stage", f"design: stage\n{extra}")})


if __name__ == "__main__":
    unittest.main()
