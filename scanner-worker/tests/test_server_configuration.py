from __future__ import annotations

import io
import sys
import unittest
from contextlib import redirect_stderr
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server import configuration_status, report_configuration_status  # noqa: E402


class StartupConfigurationTests(unittest.TestCase):
    def test_status_reports_presence_only(self) -> None:
        values = {
            "CONTRACTIQ_SUPABASE_URL": "https://private.example",
            "CONTRACTIQ_SUPABASE_ANON_KEY": "public-key-value",
            "CONTRACTIQ_SUPABASE_SERVICE_ROLE_KEY": "service-role-value",
            "GROQ_API_KEY": "groq-secret-value",
            "GEMINI_API_KEY": "gemini-secret-value",
        }
        expected = {
            "supabase_url": True,
            "supabase_anon_key": True,
            "supabase_service_role_key": True,
            "groq_api_key": True,
            "gemini_api_key": True,
        }
        self.assertEqual(configuration_status(values), expected)
        output = io.StringIO()
        with redirect_stderr(output):
            self.assertEqual(report_configuration_status(values), expected)
        for secret in values.values():
            self.assertNotIn(secret, output.getvalue())
        self.assertIn("groq_api_key=present", output.getvalue())
        self.assertIn("supabase_service_role_key=present", output.getvalue())

    def test_missing_values_are_reported_as_missing(self) -> None:
        status = configuration_status({"GEMINI_API_KEY": " "})
        self.assertFalse(status["gemini_api_key"])
        self.assertFalse(status["groq_api_key"])
        self.assertFalse(status["supabase_service_role_key"])


if __name__ == "__main__":
    unittest.main()
