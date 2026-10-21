import sys
import tempfile
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import drafts
import util


ROOT = Path(__file__).resolve().parents[1]
SECTIONS = {"docs": False, "blog": False, "aihot": True}


class NewDraftTest(unittest.TestCase):
    def test_creates_draft_from_scaffold_with_filled_frontmatter(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = drafts.new_draft(
                "TLS 握手详解", section="docs", tags=["网络", "TLS"], slug="tls-handshake",
                drafts_dir=Path(tmp), scaffold=ROOT / "scaffolds" / "post.md", today="2026-10-20")

            self.assertEqual(path.name, "2026-10-20-tls-handshake.md")
            meta, body = util.parse_frontmatter(path.read_text(encoding="utf-8"))
            self.assertEqual(meta["title"], "TLS 握手详解")
            self.assertEqual(meta["section"], "docs")
            self.assertEqual(meta["tags"], ["网络", "TLS"])
            self.assertEqual(meta["slug"], "tls-handshake")
            self.assertIn("/images/tls-handshake/", body)

    def test_defaults_slug_to_slugified_title(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = drafts.new_draft(
                "Hello World", drafts_dir=Path(tmp),
                scaffold=ROOT / "scaffolds" / "post.md", today="2026-10-20")
            self.assertEqual(path.name, "2026-10-20-hello-world.md")

    def test_refuses_to_overwrite_existing_draft(self):
        with tempfile.TemporaryDirectory() as tmp:
            kwargs = dict(drafts_dir=Path(tmp), scaffold=ROOT / "scaffolds" / "post.md",
                          today="2026-10-20")
            drafts.new_draft("dup", **kwargs)
            with self.assertRaises(drafts.DraftError):
                drafts.new_draft("dup", **kwargs)


def _write_draft(directory, name="2026-10-01-demo.md", section="docs", summary="一句话摘要"):
    path = Path(directory) / name
    path.write_text(
        "---\n"
        "title: 演示\n"
        "date: 2026-10-01\n"
        f"section: {section}\n"
        f'summary: "{summary}"\n'
        "tags: [演示]\n"
        "slug: demo\n"
        "---\n\n正文\n",
        encoding="utf-8")
    return path


class PublishDraftTest(unittest.TestCase):
    def test_moves_draft_into_section_with_today_date(self):
        with tempfile.TemporaryDirectory() as tmp:
            draft = _write_draft(tmp)
            content = Path(tmp) / "content"

            target, warnings = drafts.publish_draft(
                draft, content_dir=content, sections=SECTIONS, today="2026-10-20")

            self.assertEqual(target, content / "docs" / "2026-10-20-demo.md")
            self.assertFalse(draft.exists())
            meta, body = util.parse_frontmatter(target.read_text(encoding="utf-8"))
            self.assertEqual(meta["date"], "2026-10-20")
            self.assertEqual(body, "正文")
            self.assertEqual(warnings, [])

    def test_rejects_unknown_or_auto_section(self):
        with tempfile.TemporaryDirectory() as tmp:
            for section in ("nope", "aihot"):
                draft = _write_draft(tmp, section=section)
                with self.assertRaises(drafts.DraftError):
                    drafts.publish_draft(draft, content_dir=Path(tmp) / "content",
                                         sections=SECTIONS, today="2026-10-20")
                self.assertTrue(draft.exists())

    def test_refuses_to_overwrite_published_post(self):
        with tempfile.TemporaryDirectory() as tmp:
            content = Path(tmp) / "content"
            (content / "docs").mkdir(parents=True)
            (content / "docs" / "2026-10-20-demo.md").write_text("old", encoding="utf-8")
            draft = _write_draft(tmp)
            with self.assertRaises(drafts.DraftError):
                drafts.publish_draft(draft, content_dir=content, sections=SECTIONS,
                                     today="2026-10-20")
            self.assertTrue(draft.exists())

    def test_warns_on_empty_summary_and_leftover_example_image(self):
        with tempfile.TemporaryDirectory() as tmp:
            draft = _write_draft(tmp, summary="")
            draft.write_text(draft.read_text(encoding="utf-8")
                             + "\n![图片说明](/images/demo/example.png)\n", encoding="utf-8")
            _, warnings = drafts.publish_draft(
                draft, content_dir=Path(tmp) / "content", sections=SECTIONS, today="2026-10-20")
            self.assertEqual(len(warnings), 2)


STAGE_DRAFT = """---
title: 演示
date: 2026-10-01
section: docs
summary: "摘要"
design: stage
---

::: tldr
结论。
:::

## [01:20] 第一章

正文。
"""


def _write_stage_folder(directory, name="demo", text=STAGE_DRAFT):
    folder = Path(directory) / name
    folder.mkdir(parents=True)
    (folder / "index.md").write_text(text, encoding="utf-8")
    (folder / "widgets.js").write_text("export const widgets = {};", encoding="utf-8")
    return folder


class StageDraftTest(unittest.TestCase):
    def test_new_stage_draft_is_a_folder_from_the_stage_scaffold(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = drafts.new_draft("怪物动画", slug="monster-rig", stage=True, drafts_dir=Path(tmp), today="2026-10-20")
            self.assertEqual(path, Path(tmp) / "monster-rig" / "index.md")
            meta, body = util.parse_frontmatter(path.read_text(encoding="utf-8"))
            self.assertEqual(meta["design"], "stage")
            self.assertEqual(meta["title"], "怪物动画")
            self.assertIn("::: tldr", body)

    def test_stage_scaffold_itself_renders_without_errors(self):
        import stage
        with tempfile.TemporaryDirectory() as tmp:
            path = drafts.new_draft("x", slug="x", stage=True, drafts_dir=Path(tmp), today="2026-10-20")
            stage.render_body(util.parse_frontmatter(path.read_text(encoding="utf-8"))[1])

    def test_publishing_a_folder_moves_it_and_updates_the_date(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = _write_stage_folder(Path(tmp) / "drafts")
            content = Path(tmp) / "content"
            target, _ = drafts.publish_draft(folder, content_dir=content, sections=SECTIONS, today="2026-10-20")
            self.assertEqual(target, content / "docs" / "demo")
            self.assertFalse(folder.exists())
            self.assertTrue((target / "widgets.js").exists())
            meta, _ = util.parse_frontmatter((target / "index.md").read_text(encoding="utf-8"))
            self.assertEqual(meta["date"], "2026-10-20")

    def test_publish_rejects_broken_stage_syntax_and_keeps_the_draft(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = _write_stage_folder(Path(tmp) / "drafts", text=STAGE_DRAFT.replace("结论。\n:::", "结论。"))
            with self.assertRaisesRegex(drafts.DraftError, "第 .* 行"):
                drafts.publish_draft(folder, content_dir=Path(tmp) / "content", sections=SECTIONS, today="2026-10-20")
            self.assertTrue((folder / "index.md").exists())

    def test_publish_refuses_to_overwrite_an_existing_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = _write_stage_folder(Path(tmp) / "drafts")
            (Path(tmp) / "content" / "docs" / "demo").mkdir(parents=True)
            with self.assertRaises(drafts.DraftError):
                drafts.publish_draft(folder, content_dir=Path(tmp) / "content", sections=SECTIONS, today="2026-10-20")
            self.assertTrue(folder.exists())


if __name__ == "__main__":
    unittest.main()
