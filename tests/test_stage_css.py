import re
import unittest
from pathlib import Path


STAGE = Path(__file__).resolve().parents[1] / "static" / "stage"
# 正文通用列表样式必须包在 :where() 里（零优先级），组件自己的列表（.ledger / .lessons ……）才能覆盖它。
# 不能用 :not([class])：动效脚本运行时会给每个正文块加 m-rise / is-in，那样通用样式会整个失效。
GENERIC_LIST = re.compile(r"(?<!:where\()\.body\s*>\s*(?:ul|ol)\b")


class GenericListRulesTest(unittest.TestCase):
    def test_generic_body_list_rules_have_zero_specificity(self):
        for name in ("stage.css", "motion.css"):
            css = (STAGE / name).read_text(encoding="utf-8")
            leaks = [m.group(0) for m in GENERIC_LIST.finditer(css)]
            self.assertEqual(leaks, [], f"{name} 里的正文列表规则没有包 :where()，会压过组件列表")

    def test_block_labels_opt_out_of_inline_highlight(self):
        # 荧光笔是给行内加粗用的；组件里 display:block 的加粗标签会被画成整行色条
        css = (STAGE / "stage.css").read_text(encoding="utf-8")
        for selector in (r"\.ledger li b", r"\.lessons b"):
            rule = re.search(selector + r"\{([^}]*)\}", css).group(1)
            self.assertIn("background:none", rule)

    def test_ledger_labels_do_not_use_mono_for_chinese(self):
        css = (STAGE / "stage.css").read_text(encoding="utf-8")
        rule = re.search(r"\.ledger li b\{([^}]*)\}", css).group(1)
        self.assertNotIn("var(--mono)", rule)               # 标签是中文，等宽字体没有中文字形


class PageOverflowTest(unittest.TestCase):
    def test_main_clips_horizontal_overflow_from_entrance_offsets(self):
        # 引语角标、组件锁定角标入场前都在框外（±18~30px），手机边距只有 16px，
        # 不裁掉就会让整页横向滚动；用 clip 而不是 hidden，sticky 目录才不受影响
        css = (STAGE / "stage.css").read_text(encoding="utf-8")
        rule = re.search(r"(?m)^main\{([^}]*)\}", css)
        self.assertIsNotNone(rule)
        self.assertIn("overflow-x:clip", rule.group(1))


class RecIndicatorTest(unittest.TestCase):
    def test_rec_never_wraps_and_label_hides_on_phones(self):
        # 手机宽度下「REC ·」曾被挤成两行；标签单独包一层，窄屏只留红点和时间码
        tpl = (STAGE.parents[1] / "src" / "templates" / "post-stage.tpl").read_text(encoding="utf-8")
        self.assertIn('<span class="rec-label">REC · </span>', tpl)
        css = (STAGE / "stage.css").read_text(encoding="utf-8")
        self.assertIn("white-space:nowrap", re.search(r"\.rec\{([^}]*)\}", css).group(1))
        self.assertRegex(css, r"@media ?\(max-width:\d+px\)\{[^@]*\.rec-label\{display:none\}")


if __name__ == "__main__":
    unittest.main()
