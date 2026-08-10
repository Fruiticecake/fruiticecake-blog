from pathlib import Path
import unittest


class WorkflowConfigurationTests(unittest.TestCase):
    def test_workflow_grants_models_permission_and_runs_radar_before_build(self):
        text = Path(".github/workflows/build.yml").read_text(encoding="utf-8")

        self.assertIn("models: read", text)
        self.assertLess(
            text.index("python3 src/opensource.py"),
            text.index("python3 src/generator.py"),
        )
        self.assertIn("GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}", text)
