from __future__ import annotations

import sys
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from supabase_gateway import SupabaseGateway  # noqa: E402


class GatewayPaginationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.gateway = SupabaseGateway("https://example.invalid", "public", "server-only")

    def test_scan_history_fetches_every_page_past_old_cap(self) -> None:
        rows = [{"id": f"scan-{index}"} for index in range(455)]
        offsets = []

        def page(path: str):
            params = parse_qs(urlsplit(path).query)
            offset = int(params["offset"][0])
            offsets.append(offset)
            return rows[offset:offset + int(params["limit"][0])]

        with patch.object(self.gateway, "_rest", side_effect=page):
            result = self.gateway.list_scans("owner")

        self.assertEqual(len(result), 455)
        self.assertEqual(offsets, [0, 200, 400])

    def test_findings_fetch_every_page_and_keep_user_filter(self) -> None:
        rows = [{"id": f"finding-{index}"} for index in range(401)]
        offsets = []

        def page(path: str):
            params = parse_qs(urlsplit(path).query)
            self.assertEqual(params["scan_id"], ["eq.scan-id"])
            self.assertEqual(params["user_id"], ["eq.owner"])
            offset = int(params["offset"][0])
            offsets.append(offset)
            return rows[offset:offset + int(params["limit"][0])]

        with patch.object(self.gateway, "_rest", side_effect=page):
            result = self.gateway.list_findings("scan-id", "owner")

        self.assertEqual(len(result), 401)
        self.assertEqual(offsets, [0, 200, 400])


if __name__ == "__main__":
    unittest.main()
