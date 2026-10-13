"""Local authenticated HTTP API for real-account queued scans."""

from __future__ import annotations

import hashlib
import json
import re
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import unquote, urlsplit

from supabase_gateway import AuthenticationError, UpstreamError
from worker import MAX_SOURCE_BYTES, SUPPORTED_COMPILERS


IDEMPOTENCY_NAMESPACE = uuid.UUID("96c8847a-6c12-45fc-b11e-f63f84c03ac2")
MAX_REQUEST_BYTES = MAX_SOURCE_BYTES + 16_000
IMPORT_PATTERN = re.compile(r"\bimport\s*(?:\"|'|\{|\*)")
SCAN_ID_PATTERN = re.compile(r"^[0-9a-fA-F-]{36}$")
DEFAULT_ALLOWED_ORIGINS = {"http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"}


def parse_allowed_origins(value: str | None) -> set[str]:
    origins = DEFAULT_ALLOWED_ORIGINS if value is None else {origin.strip() for origin in value.split(",") if origin.strip()}
    if not origins:
        raise ValueError("CONTRACTIQ_ALLOWED_ORIGINS must contain at least one exact origin.")
    for origin in origins:
        parsed = urlsplit(origin)
        try:
            parsed.port
        except ValueError:
            raise ValueError("Allowed origins must use a valid port number.") from None
        local_http = parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}
        if (origin == "*" or not parsed.netloc or parsed.path or parsed.query or parsed.fragment
                or not (parsed.scheme == "https" or local_http) or parsed.username or parsed.password):
            raise ValueError("Allowed origins must be exact HTTPS origins; HTTP is allowed only for localhost development.")
    return origins


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def _uuid(value: str, label: str) -> str:
    try:
        return str(uuid.UUID(value))
    except (ValueError, TypeError, AttributeError):
        raise ApiError(400, "invalid_id", f"{label} must be a UUID.") from None


def _safe_scan(row: dict) -> dict:
    return {
        "id": row["id"],
        "contractName": row.get("contract_name"),
        "sourceFilename": row.get("source_filename"),
        "inputType": row.get("input_type"),
        "compilerVersion": row.get("compiler_version"),
        "sourceHash": row.get("source_hash"),
        "status": row.get("status"),
        "summary": row.get("summary") or {},
        "errorCode": row.get("error_code"),
        "errorMessage": row.get("error_message"),
        "analysisEngine": row.get("analysis_engine"),
        "analysisVersion": row.get("analysis_version"),
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
        "startedAt": row.get("started_at"),
        "completedAt": row.get("completed_at"),
    }


class ScanApi:
    """Business rules; owner IDs are supplied only by verified token middleware."""

    def __init__(self, gateway) -> None:
        self.gateway = gateway

    def submit(self, owner_id: str, idempotency_key: str, payload: Any) -> tuple[dict, bool]:
        owner_id = _uuid(owner_id, "Verified owner ID")
        if not isinstance(payload, dict):
            raise ApiError(400, "invalid_body", "Request body must be a JSON object.")
        allowed = {"contractName", "sourceFilename", "sourceCode", "inputType", "compilerVersion", "notes"}
        if set(payload) - allowed:
            raise ApiError(400, "unexpected_fields", "Request contains unsupported fields.")
        try:
            idem = str(uuid.UUID(idempotency_key))
        except (ValueError, TypeError, AttributeError):
            raise ApiError(400, "invalid_idempotency_key", "Idempotency-Key must be a UUID.") from None

        source = payload.get("sourceCode")
        if not isinstance(source, str) or not source.strip():
            raise ApiError(422, "invalid_source", "Provide non-empty Solidity source.")
        try:
            encoded = source.encode("utf-8")
        except UnicodeEncodeError:
            raise ApiError(422, "invalid_source", "Source must be valid UTF-8 text.") from None
        if len(encoded) > MAX_SOURCE_BYTES:
            raise ApiError(413, "source_too_large", f"Source must be at most {MAX_SOURCE_BYTES:,} bytes.")
        if "\x00" in source or IMPORT_PATTERN.search(source):
            raise ApiError(422, "unsupported_source", "NUL bytes and imports are not supported by the single-file worker.")

        compiler = payload.get("compilerVersion")
        if compiler not in SUPPORTED_COMPILERS:
            raise ApiError(422, "unsupported_compiler", "Choose one of the pinned worker compiler versions.")
        input_type = payload.get("inputType")
        if input_type not in ("upload", "paste"):
            raise ApiError(422, "invalid_input_type", "inputType must be upload or paste.")
        contract_name = payload.get("contractName", "Untitled Contract")
        filename = payload.get("sourceFilename")
        notes = payload.get("notes")
        if not isinstance(contract_name, str) or len(contract_name.strip()) > 60:
            raise ApiError(422, "invalid_contract_name", "Contract name must be at most 60 characters.")
        if filename is not None and (
            not isinstance(filename, str) or len(filename) > 160 or not filename.lower().endswith(".sol")
            or "/" in filename or "\\" in filename or filename in (".", "..")
        ):
            raise ApiError(422, "invalid_filename", "sourceFilename must be a simple .sol filename.")
        if notes is not None and (not isinstance(notes, str) or len(notes) > 500):
            raise ApiError(422, "invalid_notes", "Notes must be at most 500 characters.")

        scan_id = str(uuid.uuid5(IDEMPOTENCY_NAMESPACE, f"{owner_id}:{idem}"))
        source_hash = hashlib.sha256(encoded).hexdigest()
        canonical_payload = {
            "contractName": contract_name.strip() or "Untitled Contract",
            "sourceFilename": filename,
            "sourceCode": source,
            "inputType": input_type,
            "compilerVersion": compiler,
            "notes": notes.strip() if isinstance(notes, str) and notes.strip() else None,
        }
        request_hash = hashlib.sha256(json.dumps(canonical_payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

        existing = self.gateway.get_scan(scan_id, owner_id)
        if existing:
            if existing.get("source_hash") != source_hash or self._request_hash(existing) != request_hash:
                raise ApiError(409, "idempotency_conflict", "This Idempotency-Key was already used for a different request.")
            return _safe_scan(existing), True

        row = {
            "id": scan_id,
            "user_id": owner_id,
            "contract_name": canonical_payload["contractName"],
            "source_filename": filename,
            "source_code": source,
            "source_hash": source_hash,
            "input_type": input_type,
            "compiler_version": compiler,
            "status": "queued",
            "is_demo": False,
            "analysis_engine": None,
            "analysis_version": None,
            "options": {"contractiqWorker": {"attempt": 0, "requestHash": request_hash}},
            "summary": {},
            "error_code": None,
            "error_message": None,
            "started_at": None,
            "completed_at": None,
            "notes": canonical_payload["notes"],
        }
        try:
            created = self.gateway.insert_queued_scan(row)
        except UpstreamError:
            # Concurrent duplicate requests may race on the deterministic primary key.
            existing = self.gateway.get_scan(scan_id, owner_id)
            if existing:
                if existing.get("source_hash") == source_hash and self._request_hash(existing) == request_hash:
                    return _safe_scan(existing), True
                raise ApiError(409, "idempotency_conflict", "This Idempotency-Key was already used for a different request.") from None
            raise
        if not created:
            existing = self.gateway.get_scan(scan_id, owner_id)
            if not existing:
                raise UpstreamError("Supabase did not return the queued scan.")
            if existing.get("source_hash") != source_hash or self._request_hash(existing) != request_hash:
                raise ApiError(409, "idempotency_conflict", "This Idempotency-Key was already used for a different request.")
            return _safe_scan(existing), True
        return _safe_scan(created), False

    @staticmethod
    def _request_hash(row: dict) -> str | None:
        options = row.get("options") if isinstance(row.get("options"), dict) else {}
        meta = options.get("contractiqWorker") if isinstance(options.get("contractiqWorker"), dict) else {}
        return meta.get("requestHash")

    def list_scans(self, owner_id: str) -> list[dict]:
        owner_id = _uuid(owner_id, "Verified owner ID")
        return [_safe_scan(row) for row in self.gateway.list_scans(owner_id)]

    def get_scan(self, owner_id: str, scan_id: str) -> dict:
        owner_id = _uuid(owner_id, "Verified owner ID")
        scan_id = _uuid(scan_id, "Scan ID")
        row = self.gateway.get_scan(scan_id, owner_id)
        if not row:
            raise ApiError(404, "not_found", "Scan was not found for this account.")
        return _safe_scan(row)

    def list_findings(self, owner_id: str, scan_id: str) -> list[dict]:
        owner_id = _uuid(owner_id, "Verified owner ID")
        scan_id = _uuid(scan_id, "Scan ID")
        scan = self.gateway.get_scan(scan_id, owner_id)
        if not scan:
            raise ApiError(404, "not_found", "Scan was not found for this account.")
        if scan.get("status") != "completed":
            raise ApiError(409, "scan_not_completed", "Findings are available after scan completion.")
        return self.gateway.list_findings(scan_id, owner_id)

    def get_source(self, owner_id: str, scan_id: str) -> dict:
        owner_id = _uuid(owner_id, "Verified owner ID")
        scan_id = _uuid(scan_id, "Scan ID")
        row = self.gateway.get_scan(scan_id, owner_id)
        if not row:
            raise ApiError(404, "not_found", "Scan was not found for this account.")
        source = row.get("source_code")
        if not isinstance(source, str):
            raise ApiError(404, "not_found", "Source was not found for this account.")
        return {"sourceCode": source, "sourceFilename": row.get("source_filename")}


def create_server(gateway, queue_worker, port: int = 8765, *, host: str = "127.0.0.1",
                  allowed_origins: set[str] | None = None, max_concurrency: int = 16) -> ThreadingHTTPServer:
    api = ScanApi(gateway)
    allowed = allowed_origins if allowed_origins is not None else parse_allowed_origins(None)
    if not 1 <= max_concurrency <= 128:
        raise ValueError("max_concurrency must be between 1 and 128.")

    class Handler(BaseHTTPRequestHandler):
        server_version = "ContractIQLocalAPI/1"
        sys_version = ""

        def log_message(self, format: str, *args) -> None:
            # Request paths/bodies and Authorization headers are deliberately not logged.
            return

        def setup(self) -> None:
            self.request.settimeout(15)
            super().setup()

        def _send(self, status: int, body: Any) -> None:
            encoded = json.dumps(body, separators=(",", ":")).encode("utf-8")
            origin = self.headers.get("Origin")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            if origin in allowed:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            self.end_headers()
            self.wfile.write(encoded)

        def _body(self) -> Any:
            raw_length = self.headers.get("Content-Length")
            if raw_length is None:
                raise ApiError(411, "content_length_required", "Content-Length is required.")
            try:
                length = int(raw_length)
            except ValueError:
                raise ApiError(400, "invalid_content_length", "Content-Length is invalid.") from None
            if length < 0 or length > MAX_REQUEST_BYTES:
                raise ApiError(413, "request_too_large", "Request exceeds the local API size limit.")
            try:
                return json.loads(self.rfile.read(length))
            except (json.JSONDecodeError, UnicodeDecodeError):
                raise ApiError(400, "invalid_json", "Request body must contain valid JSON.") from None

        def _owner(self) -> str:
            auth = self.headers.get("Authorization", "")
            scheme, separator, token = auth.partition(" ")
            if not separator or scheme.lower() != "bearer" or not token or len(token) > 8192:
                raise ApiError(401, "unauthorized", "A valid Supabase bearer token is required.")
            try:
                return gateway.verify_access_token(token.strip())
            except AuthenticationError:
                raise ApiError(401, "unauthorized", "Supabase access token is invalid or expired.") from None
            except UpstreamError:
                raise ApiError(503, "auth_unavailable", "Supabase Auth is temporarily unavailable.") from None

        def _handle(self, method: str) -> None:
            try:
                parsed = urlsplit(self.path)
                path = parsed.path.rstrip("/") or "/"
                if method == "GET" and path == "/health":
                    self._send(200, {"status": "ok", "service": "contractiq-local-api"})
                    return
                if path.startswith("/api/"):
                    owner_id = self._owner()
                    if method == "POST" and path == "/api/scans":
                        key = self.headers.get("Idempotency-Key", "")
                        scan, replayed = api.submit(owner_id, key, self._body())
                        self._send(200 if replayed else 202, {"scan": scan, "replayed": replayed})
                        return
                    if method == "GET" and path == "/api/scans":
                        self._send(200, {"scans": api.list_scans(owner_id)})
                        return
                    match = re.fullmatch(r"/api/scans/([^/]+)(?:/(findings|results|source))?", path)
                    if match:
                        scan_id = unquote(match.group(1))
                        suffix = match.group(2)
                        if method == "GET" and suffix is None:
                            self._send(200, {"scan": api.get_scan(owner_id, scan_id)})
                            return
                        if method == "GET" and suffix == "findings":
                            self._send(200, {"findings": api.list_findings(owner_id, scan_id)})
                            return
                        if method == "GET" and suffix == "source":
                            self._send(200, api.get_source(owner_id, scan_id))
                            return
                        # Results and claim operations have no HTTP route by design.
                        raise ApiError(404, "not_found", "Route was not found.")
                raise ApiError(404, "not_found", "Route was not found.")
            except ApiError as exc:
                self._send(exc.status, {"error": {"code": exc.code, "message": exc.message}})
            except UpstreamError:
                self._send(503, {"error": {"code": "storage_unavailable", "message": "Scan storage is temporarily unavailable."}})
            except Exception:
                self._send(500, {"error": {"code": "internal_error", "message": "The local API could not complete the request."}})

        def do_OPTIONS(self) -> None:
            origin = self.headers.get("Origin")
            self.send_response(204 if origin in allowed else 403)
            if origin in allowed:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key")
                self.send_header("Access-Control-Max-Age", "300")
                self.send_header("Vary", "Origin")
            self.end_headers()

        def do_GET(self) -> None:
            self._handle("GET")

        def do_POST(self) -> None:
            self._handle("POST")

    class BoundedApiServer(ThreadingHTTPServer):
        daemon_threads = True

        def __init__(self, address, handler):
            self._request_slots = threading.BoundedSemaphore(max_concurrency)
            super().__init__(address, handler)
            self.queue_worker = queue_worker

        def process_request(self, request, client_address):
            if not self._request_slots.acquire(blocking=False):
                try:
                    request.sendall(b"HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n")
                finally:
                    self.shutdown_request(request)
                return
            try:
                super().process_request(request, client_address)
            except Exception:
                self._request_slots.release()
                raise

        def process_request_thread(self, request, client_address):
            try:
                super().process_request_thread(request, client_address)
            finally:
                self._request_slots.release()

    return BoundedApiServer((host, port), Handler)

