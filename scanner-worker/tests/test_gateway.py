from __future__ import annotations

import json
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

    def test_auth_and_postgrest_use_separate_public_and_service_credentials(self) -> None:
        user_id = "42d489d8-e193-4bcf-80a7-e66780d291d8"
        gateway = SupabaseGateway("https://example.invalid", "public-anon", "private-service-role")
        with patch("urllib.request.urlopen") as urlopen:
            urlopen.return_value.__enter__.return_value.read.return_value = json.dumps({"id": user_id}).encode()
            self.assertEqual(gateway.verify_access_token("user-access-token"), user_id)
            auth_request = urlopen.call_args.args[0]
            auth_headers = {key.lower(): value for key, value in auth_request.header_items()}
            self.assertEqual(auth_headers["apikey"], "public-anon")
            self.assertEqual(auth_headers["authorization"], "Bearer user-access-token")

            urlopen.reset_mock()
            urlopen.return_value.__enter__.return_value.read.return_value = b"[]"
            gateway._rest("contractiq_findings")
            rest_request = urlopen.call_args.args[0]
            rest_headers = {key.lower(): value for key, value in rest_request.header_items()}
            self.assertEqual(rest_headers["apikey"], "private-service-role")
            self.assertEqual(rest_headers["authorization"], "Bearer private-service-role")


if __name__ == "__main__":
    unittest.main()
