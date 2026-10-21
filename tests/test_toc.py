import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import toc


class AddHeadingIdsTest(unittest.TestCase):
    def test_adds_ids_and_collects_h2_h3(self):
        html, heads = toc.add_heading_ids("<h2>第一节</h2><p>x</p><h3>小节 <code>a</code></h3><h2>第二节</h2>")
        self.assertEqual([(h.level, h.id, h.text) for h in heads],
                         [(2, "sec-1", "第一节"), (3, "sec-2", "小节 a"), (2, "sec-3", "第二节")])
        self.assertIn('<h2 id="sec-1" data-tc="§01">第一节</h2>', html)
        self.assertIn('<h3 id="sec-2">小节 <code>a</code></h3>', html)
        self.assertIn('<h2 id="sec-3" data-tc="§02">', html)

    def test_keeps_existing_ids_and_attributes(self):
        html, heads = toc.add_heading_ids('<h2 id="intro" class="x">引言</h2>')
        self.assertEqual(heads[0].id, "intro")
        self.assertIn('id="intro"', html)
        self.assertEqual(html.count("id="), 1)
        self.assertIn('class="x"', html)

    def test_levels_can_be_limited_to_h2(self):
        # 日报正文里每张卡片的标题是 h3，不该进目录
        html, heads = toc.add_heading_ids("<h2>分组</h2><a><h3>卡片标题</h3></a>", levels=(2,))
        self.assertEqual([h.text for h in heads], ["分组"])
        self.assertIn("<h3>卡片标题</h3>", html)

    def test_skips_empty_headings_and_other_levels(self):
        html, heads = toc.add_heading_ids("<h1>标题</h1><h2> </h2><h4>四级</h4>")
        self.assertEqual(heads, [])
        self.assertEqual(html, "<h1>标题</h1><h2> </h2><h4>四级</h4>")

    def test_heading_text_is_escaped_in_rail(self):
        _, heads = toc.add_heading_ids("<h2>a &lt;b&gt; c</h2><h2>d</h2>")
        rail = toc.rail_html(heads)
        self.assertIn("a &lt;b&gt; c", rail)
        self.assertNotIn("<b>", rail)

    def test_rail_needs_at_least_two_headings(self):
        _, one = toc.add_heading_ids("<h2>仅一节</h2>")
        self.assertEqual(toc.rail_html(one), "")
        _, two = toc.add_heading_ids("<h2>a</h2><h3>b</h3>")
        rail = toc.rail_html(two)
        self.assertIn('<a class="lv2" href="#sec-1">a</a>', rail)
        self.assertIn('<a class="lv3" href="#sec-2">b</a>', rail)


if __name__ == "__main__":
    unittest.main()
