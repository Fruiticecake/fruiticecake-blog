import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import export_csdn
import stage
import util


BASE = "https://zyj-blog.vercel.app"


class AbsolutizeLinksTest(unittest.TestCase):
    def test_rewrites_site_absolute_images_and_links(self):
        body = "看图 ![架构](/images/demo/a.png)，另见 [上一篇](/docs/prev.html)。"
        out = export_csdn.absolutize_links(body, BASE)
        self.assertIn(f"![架构]({BASE}/images/demo/a.png)", out)
        self.assertIn(f"[上一篇]({BASE}/docs/prev.html)", out)

    def test_leaves_external_protocol_relative_and_anchor_links(self):
        body = "[外链](https://example.com) ![cdn](//cdn.example.com/x.png) [锚点](#intro)"
        self.assertEqual(export_csdn.absolutize_links(body, BASE), body)

    def test_does_not_touch_code_blocks_or_inline_code(self):
        body = (
            "```md\n![示例](/images/demo/a.png)\n```\n"
            "行内 `[x](/y)` 不动，[真链接](/z) 要改。"
        )
        out = export_csdn.absolutize_links(body, BASE)
        self.assertIn("```md\n![示例](/images/demo/a.png)\n```", out)
        self.assertIn("`[x](/y)`", out)
        self.assertIn(f"[真链接]({BASE}/z)", out)


class RelativeLinkWarningTest(unittest.TestCase):
    def test_reports_relative_paths_that_csdn_cannot_resolve(self):
        body = "![本地](./a.png) [ok](https://x.com) [站内](/docs/a.html) [锚](#a)"
        self.assertEqual(export_csdn.find_relative_links(body), ["./a.png"])


class BuildExportTest(unittest.TestCase):
    def test_builds_body_with_source_footer_and_form_fields(self):
        text = (
            "---\ntitle: 演示\ndate: 2026-10-20\nsummary: \"摘要\"\n"
            "tags: [网络, TLS]\nslug: demo\n---\n\n正文 ![图](/images/demo/a.png)\n"
        )
        export = export_csdn.build_export(text, BASE, section="docs", filename="2026-10-20-demo.md")

        self.assertEqual(export.title, "演示")
        self.assertEqual(export.tags, ["网络", "TLS"])
        self.assertEqual(export.summary, "摘要")
        self.assertEqual(export.post_url, f"{BASE}/docs/demo.html")
        self.assertTrue(export.body.startswith(f"正文 ![图]({BASE}/images/demo/a.png)"))
        self.assertIn(f"]({BASE}/docs/demo.html)", export.body.splitlines()[-1])
        self.assertNotIn("---", export.body.splitlines()[0])

    def test_slug_falls_back_to_filename_like_generator(self):
        export = export_csdn.build_export("---\ntitle: t\n---\n\nx\n", BASE,
                                          section="blog", filename="2026-10-20-hello.md")
        self.assertEqual(export.post_url, f"{BASE}/blog/2026-10-20-hello.html")

    def test_rejects_raw_html_posts(self):
        with self.assertRaises(export_csdn.ExportError):
            export_csdn.build_export("---\ntitle: t\nhtml: true\n---\n\n<p>x</p>\n", BASE,
                                     section="blog", filename="x.md")


STAGE_TEXT = """---
title: 演示
design: stage
---

::: tldr
结论先行。
:::

## [01:20] 第一章

::: interactive triangulation title="三角测量"
**静态版**图解。
:::

```md
## 代码里的标题不算章节
::: quote
:::
```

## [NOTE] 收获

::: quote
只剩一件事：*找到每个关节*。
:::

::: ledger
- [+] **成本** 几分钟
- [-] **局限** 手是猜的
:::

::: lessons
1. **几何胜过猜测。**别猜。
:::

::: stats
- TIME | ~~4d~~~min | 每只怪物
:::

![图](fig.png)
"""


class StageExportTest(unittest.TestCase):
    def export(self, bundle=True):
        return export_csdn.build_export(STAGE_TEXT, BASE, section="docs", filename="demo", bundle=bundle)

    def test_no_directive_markers_survive(self):
        body = self.export().body
        outside_code = body.split("```md")[0] + body.split("```", 2)[2]
        self.assertNotIn(":::", outside_code)

    def test_interactive_block_expands_to_fallback_and_anchor_link(self):
        body = self.export().body
        self.assertIn("**静态版**图解。", body)
        self.assertIn(f"]({BASE}/docs/demo.html#c1)", body)
        self.assertIn("三角测量", body)

    def test_anchor_numbers_match_the_rendered_page(self):
        rendered = stage.render_body(util.parse_frontmatter(STAGE_TEXT)[1])
        self.assertEqual([c.id for c in rendered.chapters], ["c1", "c2"])
        self.assertIn("#c1)", self.export().body)

    def test_chapter_headings_become_plain_headings(self):
        body = self.export().body
        self.assertIn("## 第一章 · 01:20", body)
        self.assertIn("## 收获", body)
        self.assertIn("## 代码里的标题不算章节", body)   # 代码块原样保留

    def test_semantic_blocks_become_plain_markdown(self):
        body = self.export().body
        self.assertIn("> **一句话结论**：结论先行。", body)
        self.assertIn("> **只剩一件事：*找到每个关节*。**", body)
        self.assertIn("- ✔ **成本** 几分钟", body)
        self.assertIn("- ✘ **局限** 手是猜的", body)
        self.assertIn("1. **几何胜过猜测。**别猜。", body)
        self.assertIn("| TIME | ~~4d~~~min | 每只怪物 |", body)

    def test_bundle_relative_images_point_into_the_bundle(self):
        self.assertIn(f"![图]({BASE}/docs/demo/fig.png)", self.export().body)

    def test_bundle_slug_defaults_to_folder_name(self):
        self.assertEqual(self.export().post_url, f"{BASE}/docs/demo.html")


class LocateTest(unittest.TestCase):
    SECTIONS = {"docs", "blog"}

    def test_single_file_post(self):
        loc = export_csdn.locate(Path("content/docs/2026-10-20-x.md"), self.SECTIONS)
        self.assertEqual((loc.section, loc.name, loc.bundle), ("docs", "2026-10-20-x.md", False))

    def test_bundle_folder_or_its_index(self):
        for p in ("content/docs/demo", "content/docs/demo/index.md"):
            loc = export_csdn.locate(Path(p), self.SECTIONS)
            self.assertEqual((loc.section, loc.name, loc.bundle, loc.index.name), ("docs", "demo", True, "index.md"))

    def test_outside_a_section_is_rejected(self):
        with self.assertRaises(export_csdn.ExportError):
            export_csdn.locate(Path("notes/x.md"), self.SECTIONS)


if __name__ == "__main__":
    unittest.main()
