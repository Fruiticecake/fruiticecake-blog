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
GITHUB_TOKEN_ENV = "GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}"
DEEPSEEK_TOKEN_ENV = "DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}"
PUSH_TOKEN_ENV = "GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}"
NON_DRY_RUN_GATE = "if: ${{ inputs['dry-run'] != true }}"


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
    scheduled_crons = re.findall(r"(?m)^\s*- cron:\s*['\"]([^'\"]+)['\"]\s*$", text)
    test_case.assertIn("0 0 * * *", scheduled_crons)
    test_case.assertIn("20 2 * * *", scheduled_crons)
    test_case.assertIn("20 10 * * *", scheduled_crons)
    test_case.assertNotIn("20 22 * * *", scheduled_crons)
    test_case.assertIn("contents: write", text)
    test_case.assertNotIn("models: read", text)
    test_case.assertRegex(
        text,
        r"(?ms)^concurrency:\s*\n\s+group:\s*build-blog-publish\s*\n\s+cancel-in-progress:\s*false\s*$",
    )
    test_case.assertRegex(text, r"(?m)^\s{6}date:\s*$")
    test_case.assertRegex(text, r"(?m)^\s{8}type:\s*string\s*$")
    test_case.assertRegex(text, r"(?m)^\s{6}dry-run:\s*$")
    test_case.assertRegex(text, r"(?m)^\s{8}type:\s*boolean\s*$")
    test_case.assertRegex(
        text,
        r"(?ms)^      - uses: actions/checkout@v4\s*\n        with:\s*\n          persist-credentials: false\s*$",
    )

    steps = _extract_named_step_blocks(text)
    test_case.assertEqual(EXPECTED_PIPELINE, [name for name, _ in steps])
    blocks = dict(steps)

    aihot = blocks["Fetch AI HOT daily"]
    test_case.assertRegex(aihot, rf"(?m)^        {re.escape(NON_DRY_RUN_GATE)}\s*$")
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
    for fragment in (
        "RADAR_DATE: ${{ inputs.date || '' }}",
        "RADAR_DRY_RUN: ${{ inputs['dry-run'] || false }}",
        "args=()",
        '[[ "$RADAR_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]',
        'args+=(--date "$RADAR_DATE")',
        'args+=(--dry-run)',
    ):
        test_case.assertIn(fragment, radar)
    test_case.assertRegex(radar, rf"(?m)^          {re.escape(GITHUB_TOKEN_ENV)}\s*$")
    test_case.assertRegex(radar, rf"(?m)^          {re.escape(DEEPSEEK_TOKEN_ENV)}\s*$")
    test_case.assertRegex(
        radar,
        r'(?m)^          python3 src/opensource\.py "\$\{args\[@\]\}"\s*$',
    )
    run_block = radar.split("        run: |", 1)[1]
    test_case.assertNotIn("${{ inputs.", run_block)
    test_case.assertNotRegex(radar, r"(?m)^\s+if\s*:")
    test_case.assertNotRegex(radar, r"(?m)^\s+continue-on-error\s*:")

    test_case.assertEqual(text.count(GITHUB_TOKEN_ENV), 1)
    test_case.assertEqual(text.count(DEEPSEEK_TOKEN_ENV), 1)
    test_case.assertIn("run: python -m unittest discover -s tests -v", blocks["Run tests"])
    test_case.assertIn("run: python3 src/generator.py", blocks["Generate site"])
    commit = blocks["Commit & push"]
    test_case.assertRegex(commit, rf"(?m)^        {re.escape(NON_DRY_RUN_GATE)}\s*$")
    test_case.assertRegex(commit, rf"(?m)^          {re.escape(PUSH_TOKEN_ENV)}\s*$")
    test_case.assertRegex(commit, r"(?m)^          gh auth setup-git\s*$")
    test_case.assertNotIn(NON_DRY_RUN_GATE, radar)
    for name, block in steps:
        if name != "Commit & push":
            test_case.assertNotIn(PUSH_TOKEN_ENV, block)


class WorkflowConfigurationTests(unittest.TestCase):
    def test_workflow_enforces_locked_safe_publish_pipeline(self):
        text = Path(".github/workflows/build.yml").read_text(encoding="utf-8")

        _assert_workflow_contract(self, text)

    def test_contract_rejects_deepseek_secret_moved_out_of_radar_step(self):
        text = Path(".github/workflows/build.yml").read_text(encoding="utf-8")
        mutated = text.replace(f"          {DEEPSEEK_TOKEN_ENV}\n", "").replace(
            "      - name: Run tests\n",
            f"      - name: Run tests\n        env:\n          {DEEPSEEK_TOKEN_ENV}\n",
        )

        self.assertNotEqual(text, mutated)
        with self.assertRaises(AssertionError):
            _assert_workflow_contract(self, mutated)

    def test_contract_rejects_commented_deepseek_secret(self):
        text = Path(".github/workflows/build.yml").read_text(encoding="utf-8")
        mutated = text.replace(
            f"          {DEEPSEEK_TOKEN_ENV}\n",
            f"          # {DEEPSEEK_TOKEN_ENV}\n",
        )

        self.assertNotEqual(text, mutated)
        with self.assertRaises(AssertionError):
            _assert_workflow_contract(self, mutated)

    def test_contract_rejects_commented_radar_command(self):
        text = Path(".github/workflows/build.yml").read_text(encoding="utf-8")
        mutated = text.replace(
            '          python3 src/opensource.py "${args[@]}"\n',
            '          # python3 src/opensource.py "${args[@]}"\n',
        )

        self.assertNotEqual(text, mutated)
        with self.assertRaises(AssertionError):
            _assert_workflow_contract(self, mutated)

    def test_contract_rejects_commented_non_publishing_gates(self):
        text = Path(".github/workflows/build.yml").read_text(encoding="utf-8")
        for step_name in ("Fetch AI HOT daily", "Commit & push"):
            with self.subTest(step=step_name):
                marker = f"      - name: {step_name}\n        {NON_DRY_RUN_GATE}\n"
                mutated = text.replace(
                    marker,
                    f"      - name: {step_name}\n        # {NON_DRY_RUN_GATE}\n",
                )

                self.assertNotEqual(text, mutated)
                with self.assertRaises(AssertionError):
                    _assert_workflow_contract(self, mutated)

    def test_contract_rejects_dry_run_gate_moved_to_non_writing_step(self):
        text = Path(".github/workflows/build.yml").read_text(encoding="utf-8")
        for step_name in ("Fetch AI HOT daily", "Commit & push"):
            with self.subTest(step=step_name):
                marker = f"      - name: {step_name}\n        {NON_DRY_RUN_GATE}\n"
                mutated = text.replace(marker, f"      - name: {step_name}\n").replace(
                    "      - name: Run tests\n",
                    f"      - name: Run tests\n        {NON_DRY_RUN_GATE}\n",
                )

                self.assertNotEqual(text, mutated)
                with self.assertRaises(AssertionError):
                    _assert_workflow_contract(self, mutated)

    def test_contract_rejects_persisted_checkout_credentials(self):
        text = Path(".github/workflows/build.yml").read_text(encoding="utf-8")
        mutated = text.replace("          persist-credentials: false\n", "")

        self.assertNotEqual(text, mutated)
        with self.assertRaises(AssertionError):
            _assert_workflow_contract(self, mutated)

    def test_contract_rejects_push_token_outside_final_step(self):
        text = Path(".github/workflows/build.yml").read_text(encoding="utf-8")
        mutated = text.replace(f"          {PUSH_TOKEN_ENV}\n", "").replace(
            "      - name: Run tests\n",
            f"      - name: Run tests\n        env:\n          {PUSH_TOKEN_ENV}\n",
        )

        self.assertNotEqual(text, mutated)
        with self.assertRaises(AssertionError):
            _assert_workflow_contract(self, mutated)


if __name__ == "__main__":
    unittest.main()
