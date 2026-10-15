from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from api_server import create_server  # noqa: E402
from local_gateway import LOCAL_OWNER_ID, LocalSQLiteGateway  # noqa: E402
from queue_worker import QueueWorker  # noqa: E402
from server import build_gateway  # noqa: E402
from worker import WorkerError, run_scan  # noqa: E402


def docker_image_available() -> bool:
    if not shutil.which("docker"):
        return False
    try:
        result = subprocess.run(
            ["docker", "image", "inspect", "contractiq-slither-worker:0.1.0"],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            timeout=5, check=False,
        )
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


DOCKER_ANALYZER_AVAILABLE = docker_image_available()


class LocalApiHarness:
    def __init__(self, database_path: Path, analyzer=run_scan, *, max_attempts: int = 1) -> None:
        self.gateway = LocalSQLiteGateway(database_path)
        self.worker = QueueWorker(self.gateway, analyzer=analyzer, max_attempts=max_attempts)
        self.server = create_server(self.gateway, self.worker, port=0, local_mode=True)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.stop = threading.Event()
        self.http_thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker_thread = threading.Thread(target=self._run_worker, daemon=True)
        self.http_thread.start()
        self.worker_thread.start()

    def _run_worker(self) -> None:
        while not self.stop.is_set():
            if not self.worker.run_once():
                self.stop.wait(0.02)

    def close(self) -> None:
        self.stop.set()
        self.server.shutdown()
        self.server.server_close()
        self.http_thread.join(timeout=2)
        self.worker_thread.join(timeout=2)
        self.gateway.close()

    def request(self, method: str, path: str, body: dict | None = None, idempotency_key: str | None = None):
        headers = {}
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode()
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        request = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            with error:
                return error.code, json.loads(error.read())

    def submit(self, source: str, filename: str = "contract.sol"):
        payload = {
            "contractName": "Local Test Contract", "sourceFilename": filename,
            "sourceCode": source, "inputType": "paste", "compilerVersion": "0.8.24",
        }
        return self.request("POST", "/api/local/scans", payload, str(uuid.uuid4()))

    def wait_for_terminal(self, scan_id: str, timeout: float = 240) -> dict:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            status, body = self.request("GET", f"/api/local/scans/{scan_id}")
            if status != 200:
                raise AssertionError(f"Local scan retrieval returned HTTP {status}.")
            scan = body["scan"]
            if scan["status"] in {"completed", "failed", "cancelled"}:
                return scan
            time.sleep(0.1)
        raise AssertionError("The local analyzer did not finish before the test timeout.")


class LocalModeApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp.name) / "smartbob.sqlite3"

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_unauthenticated_local_submission_is_separate_from_account_api(self) -> None:
        harness = LocalApiHarness(self.database_path, analyzer=lambda *args: {
            "analysis_version": "test-double", "summary": {"finding_count": 0}, "findings": [],
        })
        try:
            status, body = harness.request("GET", "/api/local/status")
            self.assertEqual(status, 200)
            self.assertEqual(body, {"enabled": True, "mode": "local", "authenticated": False,
                                    "storage": "sqlite", "persistsAcrossRestarts": True,
                                    "analyzer": "slither"})
            account_status, account_body = harness.request("GET", "/api/scans")
            self.assertEqual(account_status, 409)
            self.assertEqual(account_body["error"]["code"], "account_mode_disabled")
            status, accepted = harness.submit("pragma solidity 0.8.24; contract LocalOnly {}")
            self.assertEqual(status, 202)
            self.assertEqual(accepted["mode"], "local")
            scan = harness.wait_for_terminal(accepted["scan"]["id"])
            self.assertEqual(scan["status"], "completed")
            self.assertNotIn("user_id", accepted["scan"])
        finally:
            harness.close()

    def test_analyzer_failure_is_saved_and_retrievable(self) -> None:
        def fail_analyzer(*args):
            raise WorkerError("controlled analyzer failure")

        harness = LocalApiHarness(self.database_path, analyzer=fail_analyzer)
        try:
            status, accepted = harness.submit("pragma solidity 0.8.24; contract FailureCase {}")
            self.assertEqual(status, 202)
            scan = harness.wait_for_terminal(accepted["scan"]["id"])
            self.assertEqual(scan["status"], "failed")
            self.assertEqual(scan["errorCode"], "analyzer_error")
            self.assertIsNotNone(scan["errorMessage"])
        finally:
            harness.close()

    @unittest.skipUnless(DOCKER_ANALYZER_AVAILABLE, "Docker analyzer image is not available")
    def test_real_slither_scan_returns_findings_and_survives_restart(self) -> None:
        harness = LocalApiHarness(self.database_path, analyzer=run_scan)
        source = (ROOT / "tests" / "fixtures" / "access-control-vulnerable.sol").read_text(encoding="utf-8")
        try:
            status, accepted = harness.submit(source, "access-control-vulnerable.sol")
            self.assertEqual(status, 202)
            scan_id = accepted["scan"]["id"]
            scan = harness.wait_for_terminal(scan_id)
            self.assertEqual(scan["status"], "completed", scan.get("errorMessage"))
            self.assertEqual(scan["analysisEngine"], "slither")
            self.assertGreater(scan["summary"]["finding_count"], 0)
            findings_status, result = harness.request("GET", f"/api/local/scans/{scan_id}/findings")
            self.assertEqual(findings_status, 200)
            self.assertGreater(len(result["findings"]), 0)
            self.assertTrue(any(finding["rule_id"] == "suicidal" for finding in result["findings"]))
        finally:
            harness.close()

        reopened = LocalSQLiteGateway(self.database_path)
        try:
            stored_scan = reopened.get_scan(scan_id, LOCAL_OWNER_ID)
            stored_findings = reopened.list_findings(scan_id, LOCAL_OWNER_ID)
            self.assertEqual(stored_scan["status"], "completed")
            self.assertGreater(len(stored_findings), 0)
        finally:
            reopened.close()

    @unittest.skipUnless(DOCKER_ANALYZER_AVAILABLE, "Docker analyzer image is not available")
    def test_invalid_solidity_finishes_as_failed_without_fake_findings(self) -> None:
        harness = LocalApiHarness(self.database_path, analyzer=run_scan)
        try:
            status, accepted = harness.submit("pragma solidity 0.8.24; contract Broken { function ( }")
            self.assertEqual(status, 202)
            scan_id = accepted["scan"]["id"]
            scan = harness.wait_for_terminal(scan_id)
            self.assertEqual(scan["status"], "failed")
            self.assertEqual(scan["errorCode"], "analyzer_error")
            self.assertEqual(scan["summary"], {})
        finally:
            harness.close()

    def test_invalid_request_returns_actual_api_validation_error(self) -> None:
        harness = LocalApiHarness(self.database_path)
        try:
            status, body = harness.submit('pragma solidity 0.8.24; import "./Missing.sol"; contract Bad {}')
            self.assertEqual(status, 422)
            self.assertEqual(body["error"]["code"], "unsupported_source")
            self.assertIn("imports are not supported", body["error"]["message"].lower())
        finally:
            harness.close()


if __name__ == "__main__":
    unittest.main()
