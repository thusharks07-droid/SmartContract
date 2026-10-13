"""Small server-only Supabase Auth/PostgREST adapter (no secrets in Vite)."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any


class AuthenticationError(Exception):
    pass


class UpstreamError(Exception):
    pass


class SupabaseGateway:
    PAGE_SIZE = 200

    def __init__(self, project_url: str, public_key: str, service_role_key: str, timeout: float = 10) -> None:
        self.project_url = project_url.rstrip("/")
        self.public_key = public_key
        self.service_role_key = service_role_key
        self.timeout = timeout

    def _urlopen(self, request: urllib.request.Request) -> bytes:
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            if request.full_url.endswith("/auth/v1/user") and exc.code in (401, 403):
                raise AuthenticationError("Supabase access token was rejected.") from None
            raise UpstreamError("Supabase request failed.") from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise UpstreamError("Supabase is unavailable.") from None

    def verify_access_token(self, access_token: str) -> str:
        request = urllib.request.Request(
            f"{self.project_url}/auth/v1/user",
            headers={"apikey": self.public_key, "Authorization": f"Bearer {access_token}", "Accept": "application/json"},
            method="GET",
        )
        try:
            payload = json.loads(self._urlopen(request))
            user_id = payload.get("id")
            # Canonical UUID validation prevents malformed identity values entering PostgREST filters.
            import uuid
            return str(uuid.UUID(user_id))
        except AuthenticationError:
            raise
        except (ValueError, TypeError, AttributeError, json.JSONDecodeError):
            raise AuthenticationError("Supabase access token did not resolve to a valid user.") from None

    def _rest(self, table_path: str, method: str = "GET", body: Any = None, *, prefer: str | None = None) -> Any:
        headers = {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Accept": "application/json",
        }
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body, separators=(",", ":")).encode("utf-8")
        if prefer:
            headers["Prefer"] = prefer
        request = urllib.request.Request(
            f"{self.project_url}/rest/v1/{table_path}", data=data, headers=headers, method=method
        )
        raw = self._urlopen(request)
        if not raw:
            return []
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            raise UpstreamError("Supabase returned an invalid response.") from None

    def get_scan(self, scan_id: str, user_id: str) -> dict | None:
        query = urllib.parse.urlencode({
            "id": f"eq.{scan_id}", "user_id": f"eq.{user_id}", "select": "*", "limit": "1",
        })
        rows = self._rest(f"contractiq_scans?{query}")
        return rows[0] if rows else None

    def list_scans(self, user_id: str) -> list[dict]:
        rows = []
        offset = 0
        while True:
            query = urllib.parse.urlencode({
                "user_id": f"eq.{user_id}",
                "select": "id,contract_name,source_filename,input_type,compiler_version,status,summary,error_code,error_message,created_at,updated_at,started_at,completed_at,analysis_engine,analysis_version",
                "order": "created_at.desc,id.desc", "limit": str(self.PAGE_SIZE), "offset": str(offset),
            })
            page = self._rest(f"contractiq_scans?{query}")
            rows.extend(page)
            if len(page) < self.PAGE_SIZE:
                return rows
            offset += self.PAGE_SIZE

    def list_findings(self, scan_id: str, user_id: str) -> list[dict]:
        rows = []
        offset = 0
        while True:
            query = urllib.parse.urlencode({
                "scan_id": f"eq.{scan_id}", "user_id": f"eq.{user_id}", "select": "*",
                "order": "created_at.asc,id.asc", "limit": str(self.PAGE_SIZE), "offset": str(offset),
            })
            page = self._rest(f"contractiq_findings?{query}")
            rows.extend(page)
            if len(page) < self.PAGE_SIZE:
                return rows
            offset += self.PAGE_SIZE

    def insert_queued_scan(self, row: dict) -> dict | None:
        rows = self._rest(
            "contractiq_scans?on_conflict=id", "POST", row,
            prefer="resolution=ignore-duplicates,return=representation",
        )
        return rows[0] if rows else None

    def list_queued(self, limit: int = 8) -> list[dict]:
        query = urllib.parse.urlencode({
            "status": "eq.queued", "select": "id,user_id,source_code,source_hash,compiler_version,options,created_at",
            "order": "created_at.asc", "limit": str(limit),
        })
        return self._rest(f"contractiq_scans?{query}")

    @staticmethod
    def _filter(scan_id: str, user_id: str, status: str | None = None, started_at: str | None = None) -> str:
        params = {"id": f"eq.{scan_id}", "user_id": f"eq.{user_id}"}
        if status:
            params["status"] = f"eq.{status}"
        if started_at:
            params["started_at"] = f"eq.{started_at}"
        params["select"] = "*"
        return urllib.parse.urlencode(params)

    def claim_scan(self, row: dict, attempt: int, lease_token: str, started_at: str) -> dict | None:
        options = row.get("options") if isinstance(row.get("options"), dict) else {}
        options = dict(options)
        existing_meta = options.get("contractiqWorker") if isinstance(options.get("contractiqWorker"), dict) else {}
        options["contractiqWorker"] = {**existing_meta, "attempt": attempt, "lease": lease_token}
        rows = self._rest(
            f"contractiq_scans?{self._filter(row['id'], row['user_id'], 'queued')}",
            "PATCH",
            {"status": "running", "started_at": started_at, "completed_at": None, "updated_at": started_at,
             "error_code": None, "error_message": None, "options": options},
            prefer="return=representation",
        )
        return rows[0] if rows else None

    def retry_scan(self, row: dict, started_at: str, safe_error_code: str) -> bool:
        options = row.get("options") if isinstance(row.get("options"), dict) else {}
        options = dict(options)
        meta = options.get("contractiqWorker") if isinstance(options.get("contractiqWorker"), dict) else {}
        options["contractiqWorker"] = {**meta, "lastErrorCode": safe_error_code}
        rows = self._rest(
            f"contractiq_scans?{self._filter(row['id'], row['user_id'], 'running', started_at)}", "PATCH",
            {"status": "queued", "started_at": None, "completed_at": None, "updated_at": _now(),
             "error_code": None, "error_message": None, "options": options},
            prefer="return=representation",
        )
        return bool(rows)

    def fail_scan(self, row: dict, started_at: str, error_code: str, public_message: str) -> bool:
        rows = self._rest(
            f"contractiq_scans?{self._filter(row['id'], row['user_id'], 'running', started_at)}", "PATCH",
            {"status": "failed", "completed_at": _now(), "updated_at": _now(),
             "error_code": error_code, "error_message": public_message},
            prefer="return=representation",
        )
        return bool(rows)

    def fail_queued(self, row: dict, error_code: str, public_message: str) -> bool:
        rows = self._rest(
            f"contractiq_scans?{self._filter(row['id'], row['user_id'], 'queued')}", "PATCH",
            {"status": "failed", "completed_at": _now(), "updated_at": _now(),
             "error_code": error_code, "error_message": public_message},
            prefer="return=representation",
        )
        return bool(rows)

    def recover_stale(self, before_iso: str, max_attempts: int) -> int:
        query = urllib.parse.urlencode({
            "status": "eq.running", "started_at": f"lt.{before_iso}",
            "select": "id,user_id,options,started_at", "limit": "100",
        })
        stale = self._rest(f"contractiq_scans?{query}")
        recovered = 0
        for row in stale:
            options = row.get("options") if isinstance(row.get("options"), dict) else {}
            meta = options.get("contractiqWorker") if isinstance(options.get("contractiqWorker"), dict) else {}
            attempt = meta.get("attempt") if isinstance(meta.get("attempt"), int) else 1
            if attempt >= max_attempts:
                recovered += int(self.fail_scan(row, row["started_at"], "worker_timeout", "The analyzer worker timed out."))
            else:
                recovered += int(self.retry_scan(row, row["started_at"], "worker_timeout"))
        return recovered

    def replace_findings(self, scan_id: str, user_id: str, findings: list[dict]) -> None:
        query = urllib.parse.urlencode({"scan_id": f"eq.{scan_id}", "user_id": f"eq.{user_id}"})
        self._rest(f"contractiq_findings?{query}", "DELETE", prefer="return=minimal")
        if findings:
            self._rest("contractiq_findings", "POST", findings, prefer="return=minimal")

    def complete_scan(self, row: dict, started_at: str, result: dict) -> bool:
        summary = result.get("summary") if isinstance(result.get("summary"), dict) else {}
        rows = self._rest(
            f"contractiq_scans?{self._filter(row['id'], row['user_id'], 'running', started_at)}", "PATCH",
            {"status": "completed", "analysis_engine": "slither", "analysis_version": result.get("analysis_version"),
             "summary": summary, "error_code": None, "error_message": None,
             "completed_at": _now(), "updated_at": _now()},
            prefer="return=representation",
        )
        return bool(rows)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

