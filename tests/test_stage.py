import json
import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import stage


class SplitBlocksTest(unittest.TestCase):
    def test_splits_markdown_and_directives(self):
        blocks = stage.split_blocks("前文\n\n::: quote\n重点\n:::\n\n后文")
        self.assertEqual([b.kind for b in blocks], ["md", "directive", "md"])
        self.assertEqual(blocks[1].name, "quote")
        self.assertEqual(blocks[1].body.strip(), "重点")

    def test_ignores_directive_syntax_inside_code_fences(self):
        md = "```md\n::: quote\n不是指令\n:::\n```"
        blocks = stage.split_blocks(md)
        self.assertEqual([b.kind for b in blocks], ["md"])

    def test_unclosed_directive_reports_line(self):
        with self.assertRaisesRegex(stage.StageError, "第 2 行"):
            stage.split_blocks("前文\n::: quote\n没有结束")

    def test_nested_directive_is_rejected(self):
        with self.assertRaisesRegex(stage.StageError, "嵌套"):
            stage.split_blocks("::: ledger\n::: quote\nx\n:::\n:::")

    def test_tilde_fences_and_long_fences_are_respected(self):
        self.assertEqual([b.kind for b in stage.split_blocks("~~~\n::: quote\n~~~")], ["md"])
        self.assertEqual([b.kind for b in stage.split_blocks("````\n```\n::: quote\n````")], ["md"])

    def test_unclosed_fence_is_an_error(self):
        with self.assertRaisesRegex(stage.StageError, "代码块"):
            stage.split_blocks("```py\nprint(1)\n\n::: quote\nx\n:::")

    def test_stray_closing_marker_is_an_error(self):
        with self.assertRaisesRegex(stage.StageError, "多余"):
            stage.split_blocks("正文\n:::\n")


class ParseArgsTest(unittest.TestCase):
    def test_positional_and_quoted_attributes(self):
        pos, attrs = stage.parse_args('triangulation title="三角 测量" hint="DRAG / ←"')
        self.assertEqual(pos, ["triangulation"])
        self.assertEqual(attrs, {"title": "三角 测量", "hint": "DRAG / ←"})


    def test_malformed_arguments_are_errors(self):
        for bad in ('w title=foo', 'w extra', 'w title="x" stray'):
            with self.assertRaises(stage.StageError, msg=bad):
                stage.parse_args(bad, line=3)

    def test_camel_case_keys_are_allowed(self):
        self.assertEqual(stage.parse_args('w maxVal="3"')[1], {"maxVal": "3"})

class InteractiveTest(unittest.TestCase):
    def render(self, md):
        return stage.render_body(md)

    def test_renders_module_with_widget_mount_and_fallback(self):
        out = self.render('::: interactive triangulation title="三角测量" hint="DRAG" note="切换看看"\n**静态版**图解\n:::')
        html = out.body_html
        self.assertIn('data-widget="triangulation"', html)
        self.assertIn("MODULE_01", html)
        self.assertIn("三角测量", html)
        self.assertIn('<div class="ix-fallback"><p><strong>静态版</strong>图解</p></div>', html)
        self.assertIn("切换看看", html)
        self.assertEqual(out.widgets, ["triangulation"])

    def test_extra_attributes_become_json_props(self):
        html = self.render('::: interactive exam limit="2.0"\nx\n:::').body_html
        props = html.split("data-props='")[1].split("'")[0]
        self.assertEqual(json.loads(props.replace("&quot;", '"')), {"limit": "2.0"})

    def test_modules_are_numbered_in_order(self):
        html = self.render("::: interactive a-one\nx\n:::\n\n::: interactive b-two\ny\n:::").body_html
        self.assertLess(html.index("MODULE_01"), html.index("MODULE_02"))

    def test_attribute_values_are_escaped(self):
        html = self.render('::: interactive w title="<script>"\nx\n:::').body_html
        self.assertNotIn("<script>", html)
        self.assertIn("&lt;script&gt;", html)

    def test_rejects_invalid_widget_name(self):
        for bad in ("../evil", "Bad", ""):
            with self.assertRaises(stage.StageError):
                self.render(f"::: interactive {bad}\nx\n:::")

    def test_unknown_directive_is_an_error(self):
        with self.assertRaisesRegex(stage.StageError, "未知指令"):
            self.render("::: sparkle\nx\n:::")


class SemanticBlocksTest(unittest.TestCase):
    def test_tldr(self):
        html = stage.render_body("::: tldr\n别让 AI **猜**。\n:::").body_html
        self.assertIn('class="tldr"', html)
        self.assertIn("<strong>猜</strong>", html)
        self.assertNotIn("<p>", html)

    def test_quote_uses_em_for_highlight(self):
        html = stage.render_body("::: quote\n只剩一件事：*找到每个关节*。\n:::").body_html
        self.assertIn('<p class="quote">只剩一件事：<em>找到每个关节</em>。</p>', html)

    def test_ledger_items_with_plus_minus_markers(self):
        html = stage.render_body("::: ledger\n- [+] **成本** 几分钟\n- [-] **局限** 手是猜的\n:::").body_html
        self.assertIn('<li class="is-yes"><b>成本</b>几分钟</li>', html)
        self.assertIn('<li class="is-no"><b>局限</b>手是猜的</li>', html)

    def test_lessons_wrap_text_in_span(self):
        html = stage.render_body("::: lessons\n1. **几何胜过猜测。**能用多视角就别猜。\n:::").body_html
        self.assertIn("<li><b>几何胜过猜测。</b><span>能用多视角就别猜。</span></li>", html)

    def test_stats_with_strikethrough(self):
        html = stage.render_body("::: stats\n- TIME / MONSTER | ~~4d~~~min | 每只怪物\n:::").body_html
        self.assertIn('class="telemetry"', html)
        self.assertIn("<small>TIME / MONSTER</small><b><s>4d</s>~min</b><span>每只怪物</span>", html)


    def test_ledger_rejects_non_list_lines_and_empty_bodies(self):
        with self.assertRaises(stage.StageError):
            stage.render_body("::: ledger\n- [+] **成本** 几分钟\n  续行文字\n:::")
        with self.assertRaises(stage.StageError):
            stage.render_body("::: lessons\n\n:::")

class ChapterTest(unittest.TestCase):
    def test_timecode_heading_becomes_chapter(self):
        out = stage.render_body("## [01:20] 不做动画\n\n正文")
        self.assertIn('<header class="chap" id="c1"><p class="tc">[00:01:20]</p><h2>不做动画</h2></header>', out.body_html)
        self.assertEqual(out.chapters[0].rail_label, "01:20")
        self.assertEqual(out.chapters[0].title_html, "不做动画")

    def test_tag_heading_and_plain_heading(self):
        out = stage.render_body("## [note] 方法论\n\n## 参考")
        self.assertIn('<p class="tc">[NOTE]</p>', out.body_html)
        self.assertEqual([c.rail_label for c in out.chapters], ["NOTE", "§02"])

    def test_h3_is_not_a_chapter(self):
        out = stage.render_body("### 小节")
        self.assertEqual(out.chapters, [])
        self.assertIn('<h3 class="sub">', out.body_html)

    def test_chapters_inside_directives_are_not_collected(self):
        out = stage.render_body("::: interactive w\n## 不算\n:::")
        self.assertEqual(out.chapters, [])


    def test_rail_label_strips_inline_tags(self):
        out = stage.render_body("## [NOTE] 读 [原文](https://x.com) 的收获")
        self.assertEqual(out.chapters[0].rail_text, "读 原文 的收获")

class HeroTest(unittest.TestCase):
    def test_display_title_brackets_become_highlight(self):
        self.assertEqual(stage.display_title("让 AI 给[任何怪物]做<骨骼>动画"),
                         '让 AI 给<span class="hl">任何怪物</span>做&lt;骨骼&gt;动画')

    def test_source_label_defaults_to_host(self):
        self.assertEqual(stage.source_label({"source": "https://www.youtube.com/watch?v=x"}), "youtube.com")
        self.assertEqual(stage.source_label({"source_label": "Can It Code?", "source": "https://x.com"}), "Can It Code?")
        self.assertEqual(stage.source_label({}), "")

    def test_hero_name_is_validated(self):
        self.assertEqual(stage.hero_name({}), "mocap-gait")
        self.assertEqual(stage.hero_name({"hero": "marker-field"}), "marker-field")
        with self.assertRaises(stage.StageError):
            stage.hero_name({"hero": "../x"})


if __name__ == "__main__":
    unittest.main()
