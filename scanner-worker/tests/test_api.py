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
from api_server import create_server, parse_allowed_origins  # noqa: E402
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

    def request_bytes(self, method: str, path: str, data: bytes, *, token: str | None = "valid-a"):
        headers = {"Content-Type": "application/json"}
        if token is not None:
            headers["Authorization"] = f"Bearer {token}"
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

    def test_cors_allows_only_the_explicit_https_frontend_origin(self) -> None:
        allowed = parse_allowed_origins("https://app.contractiq.example")
        self.assertEqual(allowed, {"https://app.contractiq.example"})
        self.assertRaises(ValueError, parse_allowed_origins, "*")
        self.assertRaises(ValueError, parse_allowed_origins, "http://app.contractiq.example")
        server = create_server(self.gateway, object(), port=0, allowed_origins=allowed)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = f"http://127.0.0.1:{server.server_address[1]}"
            for origin, expected in (("https://app.contractiq.example", 204), ("https://attacker.example", 403)):
                request = urllib.request.Request(base + "/api/scans", headers={
                    "Origin": origin, "Access-Control-Request-Method": "GET",
                }, method="OPTIONS")
                try:
                    with urllib.request.urlopen(request, timeout=3) as response:
                        status = response.status
                        allow_origin = response.headers.get("Access-Control-Allow-Origin")
                except urllib.error.HTTPError as error:
                    with error:
                        status = error.code
                        allow_origin = error.headers.get("Access-Control-Allow-Origin")
                self.assertEqual(status, expected)
                self.assertEqual(allow_origin, origin if expected == 204 else None)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_api_concurrency_limit_rejects_invalid_configuration(self) -> None:
        self.assertRaises(ValueError, create_server, self.gateway, object(), 0, max_concurrency=129)

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

    def test_unsupported_compiler_and_oversized_source_are_rejected(self) -> None:
        status, body = self.submit(payload=self.payload(compilerVersion="latest"))
        self.assertEqual(status, 422)
        self.assertEqual(body["error"]["code"], "unsupported_compiler")
        status, body = self.submit(payload=self.payload(sourceCode="x" * 500_001))
        self.assertEqual(status, 413)
        self.assertEqual(body["error"]["code"], "source_too_large")
        self.assertEqual(self.gateway.scans, {})

    def test_malformed_and_oversized_http_bodies_are_rejected(self) -> None:
        status, body = self.request_bytes("POST", "/api/scans", b"{")
        self.assertEqual(status, 400)
        self.assertEqual(body["error"]["code"], "invalid_json")
        status, body = self.request_bytes("POST", "/api/scans", b"x" * 516_001)
        self.assertEqual(status, 413)
        self.assertEqual(body["error"]["code"], "request_too_large")
        self.assertEqual(self.gateway.scans, {})

    def test_findings_are_hidden_until_scan_is_completed(self) -> None:
        _, body = self.submit()
        scan_id = body["scan"]["id"]
        for state in ("queued", "running", "failed"):
            self.gateway.scans[scan_id]["status"] = state
            status, response = self.request("GET", f"/api/scans/{scan_id}/findings")
            self.assertEqual(status, 409)
            self.assertEqual(response["error"]["code"], "scan_not_completed")
        self.assertEqual(self.gateway.findings, [])

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

    def test_empty_analysis_completes_and_returns_zero_findings(self) -> None:
        _, body = self.submit()
        scan_id = body["scan"]["id"]
        worker = QueueWorker(self.gateway, lambda *_args: {
            "analysis_version": "0.11.6", "summary": {"finding_count": 0}, "findings": [],
        })
        self.assertTrue(worker.run_once())
        self.assertEqual(self.gateway.scans[scan_id]["status"], "completed")
        status, response = self.request("GET", f"/api/scans/{scan_id}/findings")
        self.assertEqual(status, 200)
        self.assertEqual(response["findings"], [])

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

    def test_retry_after_completion_write_failure_replaces_findings_without_duplicates(self) -> None:
        _, body = self.submit()
        scan_id = body["scan"]["id"]
        original_complete = self.gateway.complete_scan
        attempts = 0

        def fail_completion_once(row, started_at, result):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise RuntimeError("temporary persistence failure")
            return original_complete(row, started_at, result)

        self.gateway.complete_scan = fail_completion_once

        def analyzer(*_args):
            return {
                "analysis_version": "0.11.6", "summary": {"finding_count": 1},
                "findings": [{"rule_id": "reentrancy-eth", "title": "Reentrancy", "severity": "high",
                              "confidence": "medium", "line_start": 1, "line_end": 1}],
            }

        worker = QueueWorker(self.gateway, analyzer, max_attempts=2)
        self.assertTrue(worker.run_once())
        self.assertEqual(self.gateway.scans[scan_id]["status"], "queued")
        self.assertTrue(worker.run_once())
        self.assertEqual(self.gateway.scans[scan_id]["status"], "completed")
        self.assertEqual(len(self.gateway.findings), 1)
        self.assertEqual(self.gateway.findings[0]["scan_id"], scan_id)


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


class SupabaseRecoveryTests(unittest.TestCase):
    def test_stale_jobs_are_requeued_once_or_failed_at_attempt_limit(self) -> None:
        gateway = SupabaseGateway("https://example.supabase.co", "public-placeholder", "server-placeholder")
        stale = [
            {"id": str(uuid.uuid4()), "user_id": USER_A, "started_at": "2026-10-12T00:00:00Z",
             "options": {"contractiqWorker": {"attempt": 1}}},
            {"id": str(uuid.uuid4()), "user_id": USER_B, "started_at": "2026-10-12T00:00:00Z",
             "options": {"contractiqWorker": {"attempt": 2}}},
        ]
        with patch.object(gateway, "_rest", side_effect=[stale, [{"id": stale[0]["id"]}], [{"id": stale[1]["id"]}]]) as rest:
            recovered = gateway.recover_stale("2026-10-12T00:05:00Z", max_attempts=2)

        self.assertEqual(recovered, 2)
        self.assertEqual(rest.call_count, 3)
        retry_call = rest.call_args_list[1]
        failure_call = rest.call_args_list[2]
        self.assertEqual(retry_call.args[1], "PATCH")
        self.assertEqual(retry_call.args[2]["status"], "queued")
        self.assertEqual(failure_call.args[1], "PATCH")
        self.assertEqual(failure_call.args[2]["status"], "failed")
        self.assertEqual(failure_call.args[2]["error_code"], "worker_timeout")
        self.assertIn("status=eq.running", retry_call.args[0])
        self.assertIn("started_at=eq.2026-10-12T00%3A00%3A00Z", retry_call.args[0])


if __name__ == "__main__":
    unittest.main()

