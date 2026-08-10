from pathlib import Path
import re
import unittest


EXPECTED_PIPELINE = [
    "Fetch AI HOT daily",
    "Generate open source radar",
    "Run tests",
    "Generate site",
    "Commit & push",
]
TOKEN_ENV = "GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}"


def _extract_named_step_blocks(text):
    lines = text.splitlines(keepends=True)
    step_headers = []
    for index, line in enumerate(lines):
        match = re.match(r"^(?P<indent> *)- name:\s*(?P<name>.+?)\s*$", line.rstrip())
        if match:
            step_headers.append((index, match.group("indent"), match.group("name")))

    steps = []
    for start, indent, name in step_headers:
        end = start + 1
        next_step = re.compile(rf"^{re.escape(indent)}-\s+")
        while end < len(lines) and not next_step.match(lines[end]):
            end += 1
        steps.append((name.strip("\"'"), "".join(lines[start:end])))
    return steps


def _assert_workflow_contract(test_case, text):
    test_case.assertIn("contents: write", text)
    test_case.assertIn("models: read", text)

    steps = _extract_named_step_blocks(text)
    test_case.assertEqual(EXPECTED_PIPELINE, [name for name, _ in steps])
    blocks = dict(steps)

    aihot = blocks["Fetch AI HOT daily"]
    for fragment in (
        "set +e",
        "python3 src/aihot.py",
        "code=$?",
        'if [ "$code" -eq 1 ] || [ "$code" -gt 2 ]; then',
        'exit "$code"',
        "exit 0",
    ):
        test_case.assertIn(fragment, aihot)

    radar = blocks["Generate open source radar"]
    test_case.assertIn(TOKEN_ENV, radar)
    test_case.assertIn("run: python3 src/opensource.py", radar)
    test_case.assertNotRegex(radar, r"(?m)^\s+if\s*:")
    test_case.assertNotRegex(radar, r"(?m)^\s+continue-on-error\s*:")

    tests = blocks["Run tests"]
    test_case.assertIn("run: python -m unittest discover -s tests -v", tests)

    generator = blocks["Generate site"]
    test_case.assertIn("run: python3 src/generator.py", generator)


class WorkflowConfigurationTests(unittest.TestCase):
    def test_workflow_enforces_the_complete_publish_pipeline(self):
        text = Path(".github/workflows/build.yml").read_text(encoding="utf-8")

        _assert_workflow_contract(self, text)

    def test_contract_rejects_token_moved_out_of_radar_step(self):
        text = Path(".github/workflows/build.yml").read_text(encoding="utf-8")
        mutated = text.replace(
            f"          {TOKEN_ENV}\n        run: python3 src/opensource.py",
            "        run: python3 src/opensource.py",
        ).replace(
            "      - name: Run tests\n",
            f"      - name: Run tests\n        env:\n          {TOKEN_ENV}\n",
        )

        self.assertNotEqual(text, mutated)
        with self.assertRaises(AssertionError):
            _assert_workflow_contract(self, mutated)
