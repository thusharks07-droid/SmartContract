"""Private one-at-a-time durable Supabase queue consumer."""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Callable

from worker import InputError, WorkerError, run_scan


MAX_ATTEMPTS = 2
SCAN_TIMEOUT_SECONDS = 180
LEASE_GRACE_SECONDS = 90
SAFE_PUBLIC_FAILURE = "The analyzer could not complete this submission. Check the source and retry."


class QueueWorker:
    def __init__(self, gateway, analyzer: Callable = run_scan, *, max_attempts: int = MAX_ATTEMPTS,
                 scan_timeout_seconds: int = SCAN_TIMEOUT_SECONDS) -> None:
        self.gateway = gateway
        self.analyzer = analyzer
        self.max_attempts = max_attempts
        self.scan_timeout_seconds = scan_timeout_seconds

    def recover_stale_jobs(self) -> int:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=self.scan_timeout_seconds + LEASE_GRACE_SECONDS)
        return self.gateway.recover_stale(cutoff.isoformat().replace("+00:00", "Z"), self.max_attempts)

    def run_once(self) -> bool:
        for candidate in self.gateway.list_queued():
            options = candidate.get("options") if isinstance(candidate.get("options"), dict) else {}
            meta = options.get("contractiqWorker") if isinstance(options.get("contractiqWorker"), dict) else {}
            previous_attempt = meta.get("attempt") if isinstance(meta.get("attempt"), int) else 0
            if previous_attempt >= self.max_attempts:
                self.gateway.fail_queued(candidate, "attempt_limit", "The analyzer retry limit was reached.")
                continue
            started_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            claimed = self.gateway.claim_scan(candidate, previous_attempt + 1, uuid.uuid4().hex, started_at)
            if not claimed:
                continue
            self._analyze_claimed(claimed, started_at)
            return True
        return False

    def _analyze_claimed(self, row: dict, started_at: str) -> None:
        source = row.get("source_code")
        compiler = row.get("compiler_version")
        source_hash = hashlib.sha256(source.encode("utf-8")).hexdigest() if isinstance(source, str) else ""
        if not isinstance(source, str) or source_hash != row.get("source_hash"):
            self._failure(row, started_at, "invalid_source", retryable=False)
            return
        try:
            container_name = "contractiq-job-" + row["id"]
            result = self.analyzer(source, compiler, self.scan_timeout_seconds, container_name)
            if not isinstance(result, dict) or not isinstance(result.get("findings"), list):
                raise WorkerError("Analyzer returned an invalid result.")
            owner_id = row["user_id"]
            findings = []
            for index, item in enumerate(result["findings"]):
                finding_id = str(uuid.uuid5(uuid.UUID(row["id"]), f"{index}:{item.get('rule_id', 'unknown')}:{item.get('line_start')}"))
                findings.append({
                    "id": finding_id, "scan_id": row["id"], "user_id": owner_id,
                    "rule_id": str(item.get("rule_id", "unknown"))[:160],
                    "title": str(item.get("title", "Slither detector result"))[:240],
                    "description": str(item.get("description", ""))[:8_000],
                    "impact": str(item.get("impact", item.get("severity", "informational")))[:80],
                    "severity": item.get("severity", "informational"),
                    "confidence": item.get("confidence", "low"),
                    "category": str(item.get("category", "slither"))[:160],
                    "source_path": "contract.sol",
                    "line_start": item.get("line_start"), "line_end": item.get("line_end"),
                    "code_excerpt": str(item.get("code_excerpt"))[:12_000] if item.get("code_excerpt") is not None else None,
                    "recommendation": str(item.get("recommendation", "Review this detector output."))[:2_000],
                    "evidence": item.get("evidence", {}),
                    "verification": item.get("verification", {"status": "not_verified", "engine": "slither"}),
                })
            self.gateway.replace_findings(row["id"], owner_id, findings)
            if not self.gateway.complete_scan(row, started_at, result):
                # A lease lost to recovery must not report success. Source is immutable,
                # so deterministic finding IDs make a later attempt idempotent.
                raise WorkerError("The job lease expired before finalization.")
        except InputError:
            self._failure(row, started_at, "invalid_source", retryable=False)
        except Exception:
            self._failure(row, started_at, "analyzer_error", retryable=True)

    def _failure(self, row: dict, started_at: str, error_code: str, *, retryable: bool) -> None:
        options = row.get("options") if isinstance(row.get("options"), dict) else {}
        meta = options.get("contractiqWorker") if isinstance(options.get("contractiqWorker"), dict) else {}
        attempt = meta.get("attempt") if isinstance(meta.get("attempt"), int) else 1
        if retryable and attempt < self.max_attempts:
            self.gateway.retry_scan(row, started_at, error_code)
        else:
            self.gateway.fail_scan(row, started_at, error_code, SAFE_PUBLIC_FAILURE)

