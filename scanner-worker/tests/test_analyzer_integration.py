from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from worker import WorkerError, run_scan


FIXTURES = Path(__file__).resolve().parent / "fixtures"
RUN_INTEGRATION = os.environ.get("SMARTBOB_RUN_SLITHER_INTEGRATION") == "1"


@unittest.skipUnless(RUN_INTEGRATION, "set SMARTBOB_RUN_SLITHER_INTEGRATION=1 to use the pinned Docker analyzer image")
class SlitherDockerIntegrationTests(unittest.TestCase):
    def analyze(self, fixture: str) -> dict:
        source = (FIXTURES / fixture).read_text(encoding="utf-8")
        return run_scan(source, "0.8.24")

    def test_reentrancy_vulnerable_and_fixed_fixtures(self) -> None:
        vulnerable = self.analyze("reentrancy.sol")
        fixed = self.analyze("reentrancy-fixed.sol")

        finding = next(item for item in vulnerable["findings"] if item["rule_id"] == "reentrancy-eth")
        self.assertEqual(finding["severity"], "high")
        self.assertEqual(finding["impact"], "high")
        self.assertIsNotNone(finding["line_start"])
        self.assertIn("call", finding["code_excerpt"])
        self.assertIn("checks-effects-interactions", finding["recommendation"])
        self.assertTrue(finding["evidence"]["elements"])
        self.assertNotIn("reentrancy-eth", {item["rule_id"] for item in fixed["findings"]})

    def test_access_control_vulnerable_and_fixed_fixtures(self) -> None:
        vulnerable = self.analyze("access-control-vulnerable.sol")
        fixed = self.analyze("access-control-fixed.sol")

        finding = next(item for item in vulnerable["findings"] if item["rule_id"] == "suicidal")
        self.assertEqual(finding["severity"], "high")
        self.assertIsNotNone(finding["line_start"])
        self.assertIn("authorized", finding["recommendation"])
        self.assertNotIn("suicidal", {item["rule_id"] for item in fixed["findings"]})

    def test_invalid_solidity_fails_and_simple_counter_has_no_targeted_finding(self) -> None:
        invalid = (FIXTURES / "invalid.sol").read_text(encoding="utf-8")
        with self.assertRaises(WorkerError):
            run_scan(invalid, "0.8.24")

        simple = self.analyze("simple-counter.sol")
        targeted = {item["rule_id"] for item in simple["findings"]}
        self.assertNotIn("reentrancy-eth", targeted)
        self.assertNotIn("suicidal", targeted)


if __name__ == "__main__":
    unittest.main()
