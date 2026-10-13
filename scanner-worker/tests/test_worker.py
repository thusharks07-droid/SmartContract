from __future__ import annotations

import importlib.util
import io
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("contractiq_worker", ROOT / "worker.py")
worker = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(worker)
analyzer_spec = importlib.util.spec_from_file_location("contractiq_analyzer", ROOT / "analyze.py")
analyzer = importlib.util.module_from_spec(analyzer_spec)
assert analyzer_spec.loader is not None
analyzer_spec.loader.exec_module(analyzer)


class WorkerValidationTests(unittest.TestCase):
    def test_all_pinned_compilers_are_accepted(self) -> None:
        for version in worker.SUPPORTED_COMPILERS:
            self.assertEqual(worker.validate_compiler_version(version), version)

    def test_unpinned_compiler_is_rejected(self) -> None:
        with self.assertRaises(worker.InputError):
            worker.validate_compiler_version("latest")

    def test_source_size_is_limited(self) -> None:
        with self.assertRaises(worker.InputError):
            worker.run_scan("x" * (worker.MAX_SOURCE_BYTES + 1), "0.8.24")

    def test_imports_are_rejected_without_resolution(self) -> None:
        with self.assertRaisesRegex(worker.InputError, "Imports are not supported"):
            worker.run_scan('pragma solidity 0.8.24;\nimport "https://example.invalid/evil.sol";', "0.8.24")

    def test_file_must_be_solidity_and_utf8(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            bad_ext = Path(temp) / "source.txt"
            bad_ext.write_text("contract A {}", encoding="utf-8")
            with self.assertRaises(worker.InputError):
                worker.read_source(str(bad_ext))
            bad_encoding = Path(temp) / "source.sol"
            bad_encoding.write_bytes(b"\xff\xfe")
            with self.assertRaises(worker.InputError):
                worker.read_source(str(bad_encoding))

    def test_command_has_isolation_and_resource_flags(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            command = worker._container_command(Path(temp), "0.8.24", "contractiq-test")
        joined = " ".join(command)
        for flag in ("--network=none", "--read-only", "--cap-drop=ALL", "--pids-limit=128", "--memory=1g", "--cpus=1.0"):
            self.assertIn(flag, joined)
        self.assertNotIn("--privileged", joined)

    def test_slither_findings_are_normalized_without_claiming_verification(self) -> None:
        source = "pragma solidity 0.8.24;\ncontract A {\n function f() external {}\n}"
        raw = {"results": {"detectors": [{
            "check": "reentrancy-eth", "impact": "High", "confidence": "Medium",
            "description": "External call in ../../input/contract.sol before state update.",
            "elements": [{"type": "function", "name": "f", "source_mapping": {"lines": [3]}}],
        }]}}
        result = analyzer.normalize(raw, source, "a" * 64)
        self.assertEqual(result["status"], "completed_with_findings")
        self.assertEqual(result["findings"][0]["severity"], "high")
        self.assertEqual(result["findings"][0]["line_start"], 3)
        self.assertEqual(result["findings"][0]["verification"]["status"], "not_verified")
        self.assertIn("no completeness", result["summary"]["disclaimer"])
        self.assertIn("contract.sol", result["findings"][0]["description"])
        self.assertNotIn("../../input", result["findings"][0]["description"])

    def test_slither_success_without_detectors_is_empty_not_an_error(self) -> None:
        result = analyzer.normalize({"results": {}}, "pragma solidity 0.8.24; contract A {}", "b" * 64)
        self.assertEqual(result["status"], "completed_no_findings")
        self.assertEqual(result["findings"], [])

    @patch.object(worker.subprocess, "run")
    @patch.object(worker.subprocess, "Popen")
    def test_successful_job_normalizes_json_and_cleans_container(self, popen, run) -> None:
        popen.return_value = type("Process", (), {
            "stdout": io.BytesIO(b'{"status":"completed_no_findings","findings":[]}'),
            "stderr": io.BytesIO(b""),
            "wait": lambda self, timeout: 0,
        })()
        result = worker.run_scan("pragma solidity 0.8.24; contract A {}", "0.8.24")
        self.assertEqual(result["status"], "completed_no_findings")
        self.assertEqual(result["compiler_version"], "0.8.24")
        self.assertEqual(len(result["source_hash"]), 64)
        self.assertGreaterEqual(run.call_count, 2)  # stale-name cleanup before and after the job

    @patch.object(worker.subprocess, "run")
    @patch.object(worker.subprocess, "Popen")
    def test_timeout_kills_and_cleans_named_container(self, popen, run) -> None:
        process = type("Process", (), {
            "stdout": io.BytesIO(b""),
            "stderr": io.BytesIO(b""),
            "wait": lambda self, timeout: (_ for _ in ()).throw(subprocess.TimeoutExpired("docker", timeout)),
            "kill": lambda self: None,
        })()
        process.wait = unittest.mock.Mock(side_effect=[subprocess.TimeoutExpired("docker", 1), 0])
        popen.return_value = process
        with self.assertRaisesRegex(worker.WorkerError, "timeout"):
            worker.run_scan("pragma solidity 0.8.24; contract A {}", "0.8.24", timeout_seconds=1)
        self.assertGreaterEqual(run.call_count, 2)


if __name__ == "__main__":
    unittest.main()

