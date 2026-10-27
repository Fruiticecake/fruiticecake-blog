import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import ui


ROOT = Path(__file__).resolve().parents[1]


class HeadBootScriptTest(unittest.TestCase):
    def test_sets_theme_before_first_paint_and_guards_storage(self):
        script = ui.head_boot_script()
        self.assertTrue(script.startswith("<script>") and script.endswith("</script>"))
        self.assertIn('localStorage.getItem("theme")', script)
        self.assertIn("try", script)                                 # 隐私模式下 localStorage 会抛错
        self.assertIn("data-theme-resolved", script)

    def test_defaults_to_dark_and_ignores_system_scheme(self):
        # 默认深色：只有读者手动选过浅色才是浅色，不跟随系统
        script = ui.head_boot_script()
        self.assertNotIn("prefers-color-scheme", script)
        self.assertIn('t === "light"', script)

    def test_motion_flag_with_fallback_and_optional_boot(self):
        plain, boot = ui.head_boot_script(), ui.head_boot_script(boot=True)
        for script in (plain, boot):
            self.assertIn('classList.add("m-on")', script)
            self.assertIn("prefers-reduced-motion", script)
            self.assertIn("}, 5000);", script)                       # JS 失败时 5 秒后撤销 m-on（慢网首访留足时间）
        self.assertNotIn('add("m-boot")', plain)          # 普通页面不播开场
        self.assertIn('add("m-boot")', boot)
        self.assertIn("stage-boot-seen", boot)

    def test_contains_no_template_placeholders(self):
        # 模板用 string.Template；插入值里有 $ 虽然不会被二次替换，但保持干净便于审查
        self.assertNotIn("$", ui.head_boot_script(boot=True))


class TokensTest(unittest.TestCase):
    def test_light_theme_overrides_every_color_token(self):
        css = (ROOT / "static" / "stage" / "tokens.css").read_text(encoding="utf-8")
        dark, light = css.split(':root[data-theme="light"]')
        for token in ("--bg:", "--ink:", "--ink-3:", "--mark:", "--ir:", "--glow-c:", "--render-bg:", "--flesh:"):
            self.assertIn(token, dark, token)
            self.assertIn(token, light, token)

    def test_theme_never_follows_system_scheme(self):
        for rel in ("static/stage/tokens.css", "static/stage/theme.js",
                    "src/templates/layout.tpl", "src/templates/post-stage.tpl"):
            text = (ROOT / rel).read_text(encoding="utf-8")
            self.assertNotIn("prefers-color-scheme", text, f"{rel} 仍在跟随系统明暗")

    def test_stage_styles_have_no_hard_coded_brand_colors(self):
        for rel in ("static/stage/stage.css", "static/stage/motion.css"):
            css = (ROOT / rel).read_text(encoding="utf-8")
            for literal in ("200,255,62", "230,235,228", "255,75,54", "#c8ff3e", "#0a0c0b"):
                self.assertNotIn(literal, css, f"{rel} 里写死了 {literal}，浅色主题下会出错")


if __name__ == "__main__":
    unittest.main()
