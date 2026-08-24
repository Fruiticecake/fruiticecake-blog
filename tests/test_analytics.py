import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import ui


def config(script):
    return {"site": {"analytics_script": script}} if script is not None else {"site": {}}


class AnalyticsSnippetTests(unittest.TestCase):
    def test_configured_path_emits_queue_shim_and_deferred_script(self):
        snippet = ui.analytics_html(config("/_vercel/insights/script.js"))

        self.assertIn("window.vaq", snippet)
        self.assertIn('<script defer src="/_vercel/insights/script.js"></script>', snippet)

    def test_project_specific_path_is_used_verbatim(self):
        """Vercel 后台给的专属路径（抗广告拦截）应能直接替换默认路径。"""
        snippet = ui.analytics_html(config("/za7Vu9k2/script.js"))

        self.assertIn('src="/za7Vu9k2/script.js"', snippet)

    def test_empty_or_missing_config_disables_analytics(self):
        for value in (None, "", "   "):
            with self.subTest(value=value):
                self.assertEqual(ui.analytics_html(config(value)), "")

    def test_off_origin_sources_are_rejected(self):
        """配置只允许站内绝对路径，防止被改成任意第三方脚本源。"""
        for value in ("https://evil.example/s.js", "//evil.example/s.js", "s.js"):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    ui.analytics_html(config(value))


if __name__ == "__main__":
    unittest.main()
