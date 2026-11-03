import datetime
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import aihot


def item(title="标题", original="https://example.com/a", aihot_link="https://aihot.news/items/a"):
    links = {"aihot": aihot_link}
    if original:
        links["original"] = original
    return {
        "title": title,
        "summary": "摘要",
        "source": {"name": "来源"},
        "links": links,
        "attribution": {"name": "AIHOT", "url": aihot_link},
    }


def report(date="2026-11-03", label="行业动态", items=None):
    return {
        "date": date,
        "links": {"aihot": f"https://aihot.news/daily/{date}"},
        "sections": [{"label": label, "items": [item()] if items is None else items}],
    }


def today():
    return datetime.datetime.now(aihot.BJ).strftime("%Y-%m-%d")


class GetDailyTest(unittest.TestCase):
    def test_latest_uses_v1_endpoint_and_unwraps_report(self):
        with mock.patch.object(aihot, "fetch", return_value=json.dumps({"report": report()})) as fetch:
            data = aihot.get_daily()
        fetch.assert_called_once_with("https://aihot.news/api/v1/dailies/latest")
        self.assertEqual(data["date"], "2026-11-03")

    def test_dated_request_uses_v1_endpoint(self):
        with mock.patch.object(aihot, "fetch", return_value=json.dumps({"report": report()})) as fetch:
            aihot.get_daily("2026-11-03")
        fetch.assert_called_once_with("https://aihot.news/api/v1/dailies/2026-11-03")

    def test_response_without_report_raises(self):
        problem = json.dumps({"type": "/problems/not-found", "status": 404})
        with mock.patch.object(aihot, "fetch", return_value=problem):
            with self.assertRaises(RuntimeError):
                aihot.get_daily("2026-11-03")


class FetchTest(unittest.TestCase):
    def test_http_error_in_curl_fallback_raises(self):
        failed = mock.Mock(returncode=22, stdout="")
        with mock.patch.object(aihot.urllib.request, "urlopen", side_effect=OSError("down")):
            with mock.patch.object(aihot.subprocess, "run", return_value=failed) as run:
                with self.assertRaises(RuntimeError):
                    aihot.fetch("https://aihot.news/api/v1/dailies/latest")
        self.assertIn("-fsSL", run.call_args.args[0])


class BuildMarkdownTest(unittest.TestCase):
    def test_card_links_to_original_and_shows_source_name(self):
        text = aihot.build_markdown(report(), "2026-11-03")
        self.assertIn('href="https://example.com/a"', text)
        self.assertIn('<span class="aihot-card-src">来源</span>', text)
        self.assertIn("共 <strong>1</strong> 条", text)

    def test_card_falls_back_to_aihot_link_without_original(self):
        text = aihot.build_markdown(report(items=[item(original=None)]), "2026-11-03")
        self.assertIn('href="https://aihot.news/items/a"', text)

    def test_intro_credits_the_daily_page(self):
        text = aihot.build_markdown(report(), "2026-11-03")
        self.assertIn('<a href="https://aihot.news/daily/2026-11-03"', text)
        self.assertNotIn("virxact", text)

    def test_item_text_is_escaped(self):
        text = aihot.build_markdown(report(items=[item(title="<script>x</script>")]), "2026-11-03")
        self.assertNotIn("<script>", text)

    def test_unknown_section_is_reported_not_dropped_silently(self):
        with mock.patch.object(sys, "stderr") as err:
            aihot.build_markdown(report(label="新栏目"), "2026-11-03")
        written = "".join(call.args[0] for call in err.write.call_args_list)
        self.assertIn("新栏目", written)


class MainTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        patcher = mock.patch.object(aihot, "CONTENT_AIHOT", self.tmp.name)
        patcher.start()
        self.addCleanup(patcher.stop)

    def written(self):
        return sorted(p.name for p in Path(self.tmp.name).iterdir())

    def test_writes_todays_digest(self):
        with mock.patch.object(aihot, "get_daily", return_value=report(date=today())):
            self.assertEqual(aihot.main([]), 0)
        self.assertEqual(self.written(), [f"{today()}.md"])

    def test_older_latest_is_written_under_its_own_date_and_exits_2(self):
        def fake(date_str=None):
            if date_str:
                raise RuntimeError("not generated yet")
            return report(date="2026-01-01")

        with mock.patch.object(aihot, "get_daily", side_effect=fake):
            self.assertEqual(aihot.main([]), 2)
        self.assertEqual(self.written(), ["2026-01-01.md"])

    def test_total_failure_exits_1(self):
        with mock.patch.object(aihot, "get_daily", side_effect=RuntimeError("down")):
            self.assertEqual(aihot.main([]), 1)
        self.assertEqual(self.written(), [])

    def test_backfill_writes_each_requested_date(self):
        with mock.patch.object(aihot, "get_daily", side_effect=lambda d: report(date=d)):
            self.assertEqual(aihot.main(["2026-11-01", "2026-11-02"]), 0)
        self.assertEqual(self.written(), ["2026-11-01.md", "2026-11-02.md"])

    def test_backfill_rejects_a_malformed_date(self):
        with mock.patch.object(aihot, "get_daily") as get:
            self.assertEqual(aihot.main(["../secret"]), 1)
        get.assert_not_called()
        self.assertEqual(self.written(), [])

    def test_backfill_does_not_file_another_days_content(self):
        with mock.patch.object(aihot, "get_daily", return_value=report(date="2026-11-03")):
            self.assertEqual(aihot.main(["2026-11-01"]), 1)
        self.assertEqual(self.written(), [])


if __name__ == "__main__":
    unittest.main()
