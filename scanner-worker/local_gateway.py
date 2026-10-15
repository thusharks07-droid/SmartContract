"""SQLite-backed storage adapter for explicitly unauthenticated localhost scans."""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from supabase_gateway import UpstreamError


LOCAL_OWNER_ID = "00000000-0000-4000-8000-000000000001"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class LocalSQLiteGateway:
    """Implements the queue gateway contract without auth or Supabase access.

    The SQLite database persists across API restarts. It is local development
    data and is not associated with a Supabase account or user identity.
    """

    def __init__(self, database_path: str | Path) -> None:
        self.database_path = Path(database_path).expanduser().resolve()
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._db = sqlite3.connect(self.database_path, check_same_thread=False, timeout=10)
        self._db.row_factory = sqlite3.Row
        with self._lock:
            self._db.execute("PRAGMA foreign_keys = ON")
            self._db.execute("PRAGMA journal_mode = WAL")
            self._db.executescript("""
                CREATE TABLE IF NOT EXISTS local_scans (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    row_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS local_scans_queue_idx
                    ON local_scans(status, created_at);
                CREATE TABLE IF NOT EXISTS local_findings (
                    id TEXT PRIMARY KEY,
                    scan_id TEXT NOT NULL REFERENCES local_scans(id) ON DELETE CASCADE,
                    user_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    row_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS local_findings_scan_idx
                    ON local_findings(scan_id, user_id, created_at, id);
            """)
            self._db.commit()

    def close(self) -> None:
        with self._lock:
            self._db.close()

    @staticmethod
    def _decode(row: sqlite3.Row | None) -> dict | None:
        return json.loads(row["row_json"]) if row else None

    def get_scan(self, scan_id: str, user_id: str) -> dict | None:
        with self._lock:
            row = self._db.execute(
                "SELECT row_json FROM local_scans WHERE id = ? AND user_id = ?", (scan_id, user_id)
            ).fetchone()
            return self._decode(row)

    def list_scans(self, user_id: str) -> list[dict]:
        with self._lock:
            rows = self._db.execute(
                "SELECT row_json FROM local_scans WHERE user_id = ? ORDER BY created_at DESC, id DESC",
                (user_id,),
            ).fetchall()
            return [json.loads(row["row_json"]) for row in rows]

    def list_findings(self, scan_id: str, user_id: str) -> list[dict]:
        with self._lock:
            rows = self._db.execute(
                "SELECT row_json FROM local_findings WHERE scan_id = ? AND user_id = ? ORDER BY created_at, id",
                (scan_id, user_id),
            ).fetchall()
            return [json.loads(row["row_json"]) for row in rows]

    def insert_queued_scan(self, row: dict) -> dict | None:
        with self._lock:
            cursor = self._db.execute(
                "INSERT OR IGNORE INTO local_scans(id, user_id, status, created_at, started_at, row_json) VALUES (?, ?, ?, ?, ?, ?)",
                (row["id"], row["user_id"], row["status"], row["created_at"], row.get("started_at"), _json(row)),
            )
            self._db.commit()
            return self.get_scan(row["id"], row["user_id"]) if cursor.rowcount else None

    def list_queued(self, limit: int = 8) -> list[dict]:
        with self._lock:
            rows = self._db.execute(
                "SELECT row_json FROM local_scans WHERE status = 'queued' ORDER BY created_at, id LIMIT ?",
                (limit,),
            ).fetchall()
            return [json.loads(row["row_json"]) for row in rows]

    def claim_scan(self, row: dict, attempt: int, lease_token: str, started_at: str) -> dict | None:
        updated = dict(row)
        options = dict(updated.get("options") or {})
        meta = dict(options.get("contractiqWorker") or {})
        meta.update({"attempt": attempt, "lease": lease_token})
        options["contractiqWorker"] = meta
        updated.update({"status": "running", "started_at": started_at, "completed_at": None,
                        "updated_at": started_at, "error_code": None, "error_message": None, "options": options})
        with self._lock:
            cursor = self._db.execute(
                "UPDATE local_scans SET status = 'running', started_at = ?, row_json = ? WHERE id = ? AND user_id = ? AND status = 'queued'",
                (started_at, _json(updated), row["id"], row["user_id"]),
            )
            self._db.commit()
        return updated if cursor.rowcount else None

    def retry_scan(self, row: dict, started_at: str, safe_error_code: str) -> bool:
        updated = dict(row)
        options = dict(updated.get("options") or {})
        meta = dict(options.get("contractiqWorker") or {})
        meta["lastErrorCode"] = safe_error_code
        options["contractiqWorker"] = meta
        updated.update({"status": "queued", "started_at": None, "completed_at": None,
                        "updated_at": _now(), "error_code": None, "error_message": None, "options": options})
        return self._update_running(row, started_at, updated)

    def fail_scan(self, row: dict, started_at: str, error_code: str, public_message: str) -> bool:
        updated = dict(row)
        updated.update({"status": "failed", "completed_at": _now(), "updated_at": _now(),
                        "error_code": error_code, "error_message": public_message})
        return self._update_running(row, started_at, updated)

    def _update_running(self, row: dict, started_at: str, updated: dict) -> bool:
        with self._lock:
            cursor = self._db.execute(
                "UPDATE local_scans SET status = ?, started_at = ?, row_json = ? WHERE id = ? AND user_id = ? AND status = 'running' AND started_at = ?",
                (updated["status"], updated.get("started_at"), _json(updated), row["id"], row["user_id"], started_at),
            )
            self._db.commit()
            return bool(cursor.rowcount)

    def fail_queued(self, row: dict, error_code: str, public_message: str) -> bool:
        updated = dict(row)
        updated.update({"status": "failed", "completed_at": _now(), "updated_at": _now(),
                        "error_code": error_code, "error_message": public_message})
        with self._lock:
            cursor = self._db.execute(
                "UPDATE local_scans SET status = 'failed', row_json = ? WHERE id = ? AND user_id = ? AND status = 'queued'",
                (_json(updated), row["id"], row["user_id"]),
            )
            self._db.commit()
            return bool(cursor.rowcount)

    def recover_stale(self, before_iso: str, max_attempts: int) -> int:
        cutoff = _parse_datetime(before_iso)
        recovered = 0
        with self._lock:
            rows = self._db.execute("SELECT row_json FROM local_scans WHERE status = 'running'").fetchall()
        for result in rows:
            row = json.loads(result["row_json"])
            started_at = row.get("started_at")
            if not isinstance(started_at, str) or _parse_datetime(started_at) >= cutoff:
                continue
            options = row.get("options") if isinstance(row.get("options"), dict) else {}
            meta = options.get("contractiqWorker") if isinstance(options.get("contractiqWorker"), dict) else {}
            attempt = meta.get("attempt") if isinstance(meta.get("attempt"), int) else 1
            if attempt >= max_attempts:
                recovered += int(self.fail_scan(row, started_at, "worker_timeout", "The analyzer worker timed out."))
            else:
                recovered += int(self.retry_scan(row, started_at, "worker_timeout"))
        return recovered

    def replace_findings(self, scan_id: str, user_id: str, findings: list[dict]) -> None:
        with self._lock:
            try:
                self._db.execute("DELETE FROM local_findings WHERE scan_id = ? AND user_id = ?", (scan_id, user_id))
                self._db.executemany(
                    "INSERT INTO local_findings(id, scan_id, user_id, created_at, row_json) VALUES (?, ?, ?, ?, ?)",
                    [(item["id"], scan_id, user_id, item.get("created_at") or _now(), _json(item)) for item in findings],
                )
                self._db.commit()
            except sqlite3.Error as exc:
                self._db.rollback()
                raise UpstreamError("Local scan storage failed.") from exc

    def complete_scan(self, row: dict, started_at: str, result: dict) -> bool:
        updated = dict(row)
        updated.update({"status": "completed", "analysis_engine": "slither",
                        "analysis_version": result.get("analysis_version"),
                        "summary": result.get("summary") if isinstance(result.get("summary"), dict) else {},
                        "error_code": None, "error_message": None,
                        "completed_at": _now(), "updated_at": _now()})
        with self._lock:
            cursor = self._db.execute(
                "UPDATE local_scans SET status = 'completed', row_json = ? WHERE id = ? AND user_id = ? AND status = 'running' AND started_at = ?",
                (_json(updated), row["id"], row["user_id"], started_at),
            )
            self._db.commit()
            return bool(cursor.rowcount)


def _json(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def _parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))
