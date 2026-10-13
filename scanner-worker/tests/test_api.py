from __future__ import annotations

import copy
import importlib.util
import json
import sys
import threading
import unittest
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from api_server import create_server  # noqa: E402
from queue_worker import QueueWorker  # noqa: E402
from supabase_gateway import SupabaseGateway  # noqa: E402


USER_A = "2a2f6a72-e91f-40de-86ab-3ef347cdac11"
USER_B = "90711b9f-3fe1-4a49-9773-5a30a2cb31f0"


class FakeGateway:
    def __init__(self) -> None:
        self.tokens = {"valid-a": USER_A, "valid-b": USER_B}
        self.scans: dict[str, dict] = {}
        self.findings: list[dict] = []

    def verify_access_token(self, token: str) -> str:
        if token not in self.tokens:
            from supabase_gateway import AuthenticationError
            raise AuthenticationError("invalid")
        return self.tokens[token]

    def get_scan(self, scan_id: str, user_id: str) -> dict | None:
        row = self.scans.get(scan_id)
        return copy.deepcopy(row) if row and row["user_id"] == user_id else None

    def list_scans(self, user_id: str) -> list[dict]:
        return [copy.deepcopy(row) for row in self.scans.values() if row["user_id"] == user_id]

    def list_findings(self, scan_id: str, user_id: str) -> list[dict]:
        return [copy.deepcopy(row) for row in self.findings if row["scan_id"] == scan_id and row["user_id"] == user_id]

    def insert_queued_scan(self, row: dict) -> dict | None:
        if row["id"] in self.scans:
            return None
        stored = copy.deepcopy(row)
        self.scans[row["id"]] = stored
        return copy.deepcopy(stored)

    def list_queued(self, limit: int = 8) -> list[dict]:
        rows = [row for row in self.scans.values() if row["status"] == "queued"]
        return [copy.deepcopy(row) for row in rows[:limit]]

    def claim_scan(self, row: dict, attempt: int, lease_token: str, started_at: str) -> dict | None:
        current = self.scans.get(row["id"])
        if not current or current["status"] != "queued":
            return None
        current["status"] = "running"
        current["started_at"] = started_at
        current["options"]["contractiqWorker"] = {
            **current["options"].get("contractiqWorker", {}), "attempt": attempt, "lease": lease_token
        }
        return copy.deepcopy(current)

    def replace_findings(self, scan_id: str, user_id: str, findings: list[dict]) -> None:
        self.findings = [row for row in self.findings if not (row["scan_id"] == scan_id and row["user_id"] == user_id)]
        self.findings.extend(copy.deepcopy(findings))

    def complete_scan(self, row: dict, started_at: str, result: dict) -> bool:
        current = self.scans[row["id"]]
        if current["status"] != "running" or current["started_at"] != started_at:
            return False
        current.update({"status": "completed", "analysis_engine": "slither", "analysis_version": result["analysis_version"], "summary": result["summary"]})
        return True

    def retry_scan(self, row: dict, started_at: str, safe_error_code: str) -> bool:
        current = self.scans[row["id"]]
        if current["status"] != "running" or current["started_at"] != started_at:
            return False
        current["status"] = "queued"
        current["started_at"] = None
        current["options"]["contractiqWorker"]["lastErrorCode"] = safe_error_code
        return True

    def fail_scan(self, row: dict, started_at: str, error_code: str, public_message: str) -> bool:
        current = self.scans[row["id"]]
        if current["status"] != "running" or current["started_at"] != started_at:
            return False
        current.update({"status": "failed", "error_code": error_code, "error_message": public_message})
        return True

    def fail_queued(self, row: dict, error_code: str, public_message: str) -> bool:
        current = self.scans[row["id"]]
        if current["status"] != "queued":
            return False
        current.update({"status": "failed", "error_code": error_code, "error_message": public_message})
        return True

    def recover_stale(self, before_iso: str, max_attempts: int) -> int:
        return 0


class ApiAndQueueTests(unittest.TestCase):
    def setUp(self) -> None:
        self.gateway = FakeGateway()
        self.server = create_server(self.gateway, object(), port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    @staticmethod
    def payload(**changes) -> dict:
        value = {
            "contractName": "Worker Test",
            "sourceFilename": "worker-test.sol",
            "sourceCode": "pragma solidity 0.8.24; contract WorkerTest {}",
            "inputType": "paste",
            "compilerVersion": "0.8.24",
            "notes": "Automated local API test",
        }
        value.update(changes)
        return value

    def request(self, method: str, path: str, *, token: str | None = "valid-a", body: dict | None = None,
                idempotency_key: str | None = None):
        headers = {}
        if token is not None:
            headers["Authorization"] = f"Bearer {token}"
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode()
        else:
            data = None
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        request = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=3) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            with error:
                return error.code, json.loads(error.read())

    def submit(self, *, token: str = "valid-a", key: str | None = None, payload: dict | None = None):
        return self.request("POST", "/api/scans", token=token, body=payload or self.payload(),
                            idempotency_key=key or str(uuid.uuid4()))

    def test_missing_or_invalid_auth_is_rejected(self) -> None:
        status, _ = self.submit(token="expired")
        self.assertEqual(status, 401)
        status, _ = self.request("GET", "/api/scans", token=None)
        self.assertEqual(status, 401)
        self.assertEqual(self.gateway.scans, {})

    def test_client_supplied_owner_and_result_fields_are_rejected(self) -> None:
        status, body = self.submit(payload=self.payload(user_id=USER_B, findings=[{"severity": "critical"}], status="completed"))
        self.assertEqual(status, 400)
        self.assertEqual(body["error"]["code"], "unexpected_fields")
        self.assertEqual(self.gateway.scans, {})

    def test_owner_is_derived_from_verified_identity_and_other_users_get_404(self) -> None:
        _, body = self.submit()
        scan_id = body["scan"]["id"]
        self.assertEqual(self.gateway.scans[scan_id]["user_id"], USER_A)
        status, _ = self.request("GET", f"/api/scans/{scan_id}", token="valid-b")
        self.assertEqual(status, 404)

    def test_source_route_returns_only_the_owned_scan_source(self) -> None:
        _, body = self.submit()
        scan_id = body["scan"]["id"]
        status, source = self.request("GET", f"/api/scans/{scan_id}/source")
        self.assertEqual(status, 200)
        self.assertEqual(source, {"sourceCode": self.payload()["sourceCode"], "sourceFilename": "worker-test.sol"})
        denied, _ = self.request("GET", f"/api/scans/{scan_id}/source", token="valid-b")
        self.assertEqual(denied, 404)

    def test_duplicate_submission_is_idempotent_and_payload_reuse_conflicts(self) -> None:
        key = str(uuid.uuid4())
        first, first_body = self.submit(key=key)
        second, second_body = self.submit(key=key)
        self.assertEqual(first, 202)
        self.assertEqual(second, 200)
        self.assertTrue(second_body["replayed"])
        self.assertEqual(first_body["scan"]["id"], second_body["scan"]["id"])
        self.assertEqual(len(self.gateway.scans), 1)
        conflict, _ = self.submit(key=key, payload=self.payload(sourceCode="pragma solidity 0.8.24; contract Changed {}"))
        self.assertEqual(conflict, 409)

    def test_no_http_route_can_write_results_or_claim_jobs(self) -> None:
        _, created = self.submit()
        scan_id = created["scan"]["id"]
        before = copy.deepcopy(self.gateway.scans[scan_id])
        status, _ = self.request("POST", f"/api/scans/{scan_id}/results", body={"findings": []})
        self.assertEqual(status, 404)
        self.assertEqual(self.gateway.scans[scan_id], before)
        self.assertEqual(self.gateway.findings, [])

    def test_invalid_source_is_rejected_before_queue_insert(self) -> None:
        status, _ = self.submit(payload=self.payload(sourceCode='pragma solidity 0.8.24; import "https://example.invalid/X.sol";'))
        self.assertEqual(status, 422)
        self.assertEqual(self.gateway.scans, {})

    def test_worker_lifecycle_persists_findings_using_row_owner(self) -> None:
        key = str(uuid.uuid4())
        _, body = self.submit(key=key)
        scan_id = body["scan"]["id"]

        def analyzer(source, compiler, timeout, container_name):
            self.assertTrue(container_name.startswith("contractiq-job-"))
            return {
                "analysis_version": "0.11.6", "summary": {"finding_count": 1},
                "findings": [{"rule_id": "reentrancy-eth", "title": "Reentrancy", "severity": "high",
                              "confidence": "medium", "line_start": 1, "line_end": 1,
                              "verification": {"status": "not_verified"}}],
            }

        worker = QueueWorker(self.gateway, analyzer)
        self.assertTrue(worker.run_once())
        self.assertEqual(self.gateway.scans[scan_id]["status"], "completed")
        self.assertEqual(self.gateway.findings[0]["user_id"], USER_A)
        self.assertEqual(self.gateway.findings[0]["scan_id"], scan_id)
        self.assertEqual(self.gateway.findings[0]["severity"], "high")

        # Internal worker metadata updates preserve the idempotency fingerprint.
        replay_status, replay_body = self.submit(key=key)
        self.assertEqual(replay_status, 200)
        self.assertTrue(replay_body["replayed"])

    def test_worker_failure_retries_once_then_uses_safe_terminal_error(self) -> None:
        _, body = self.submit()
        scan_id = body["scan"]["id"]

        def failed_analyzer(*_args):
            raise RuntimeError("provider response contains source and private detail")

        worker = QueueWorker(self.gateway, failed_analyzer, max_attempts=2)
        self.assertTrue(worker.run_once())
        self.assertEqual(self.gateway.scans[scan_id]["status"], "queued")
        self.assertTrue(worker.run_once())
        self.assertEqual(self.gateway.scans[scan_id]["status"], "failed")
        self.assertEqual(self.gateway.scans[scan_id]["error_code"], "analyzer_error")
        self.assertNotIn("private detail", self.gateway.scans[scan_id]["error_message"])


class SupabaseAuthAdapterTests(unittest.TestCase):
    def test_access_token_is_sent_to_auth_user_endpoint_and_only_user_id_is_returned(self) -> None:
        gateway = SupabaseGateway("https://example.supabase.co", "public-placeholder", "server-placeholder")
        captured = []

        def fake_open(request):
            captured.append(request)
            return json.dumps({"id": USER_A, "email": "not-returned@example.invalid"}).encode()

        with patch.object(gateway, "_urlopen", side_effect=fake_open):
            result = gateway.verify_access_token("opaque-access-token-test")
        self.assertEqual(result, USER_A)
        self.assertTrue(captured[0].full_url.endswith("/auth/v1/user"))
        self.assertEqual(captured[0].get_header("Authorization"), "Bearer opaque-access-token-test")
        self.assertEqual(captured[0].get_header("Apikey"), "public-placeholder")


if __name__ == "__main__":
    unittest.main()

