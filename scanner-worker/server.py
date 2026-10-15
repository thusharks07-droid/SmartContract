"""Run the loopback-only local scanner or Supabase-account API and queue worker."""

from __future__ import annotations

import os
from pathlib import Path
import sys
import threading
import time

from api_server import create_server, parse_allowed_origins
from local_gateway import LOCAL_OWNER_ID, LocalSQLiteGateway
from queue_worker import QueueWorker
from supabase_gateway import SupabaseGateway


def load_local_secrets() -> None:
    """Read an explicit allowlist of local-only server settings from the ignored root .env."""
    path = Path(__file__).resolve().parents[1] / ".env"
    try:
        lines = path.read_text(encoding="utf-8-sig").splitlines()
    except OSError:
        return
    allowed = {
        "CONTRACTIQ_SUPABASE_URL",
        "CONTRACTIQ_SUPABASE_ANON_KEY",
        "CONTRACTIQ_SUPABASE_SERVICE_ROLE_KEY",
        "LOCAL_MODE",
        "LOCAL_MODE_DB_PATH",
        "GEMINI_API_KEY",
        "GROQ_API_KEY",
        "GEMINI_MODEL",
        "GROQ_MODEL",
        "SMARTBOB_AI_PRIMARY_PROVIDER",
        "SMARTBOB_AI_FALLBACK_PROVIDER",
        "SMARTBOB_AI_TIMEOUT_SECONDS",
        "VITE_SUPABASE_URL",
        "VITE_SUPABASE_ANON_KEY",
        "VITE_SUPABASE_PUBLISHABLE_KEY",
    }
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name, separator, raw = line.partition("=")
        name = name.strip()
        if not separator or name not in allowed or os.environ.get(name, "").strip():
            continue
        value = raw.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        os.environ[name] = value

    # Local Vite config already has the public project URL and browser key. Reuse
    # those for Auth verification when the backend-specific aliases are omitted;
    # the service-role key is never inferred and must remain server-only.
    aliases = {
        "CONTRACTIQ_SUPABASE_URL": ("VITE_SUPABASE_URL",),
        "CONTRACTIQ_SUPABASE_ANON_KEY": ("VITE_SUPABASE_ANON_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY"),
    }
    for target, candidates in aliases.items():
        if os.environ.get(target, "").strip():
            continue
        for candidate in candidates:
            value = os.environ.get(candidate, "").strip()
            if value:
                os.environ[target] = value
                break


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def configuration_status(environ: dict[str, str] | None = None) -> dict[str, bool]:
    """Return presence flags only; never return or log configuration values."""
    values = environ if environ is not None else os.environ
    return {
        "local_mode": values.get("LOCAL_MODE", "false").strip().lower() == "true",
        "supabase_url": bool(values.get("CONTRACTIQ_SUPABASE_URL", "").strip()),
        "supabase_anon_key": bool(values.get("CONTRACTIQ_SUPABASE_ANON_KEY", "").strip()),
        "supabase_service_role_key": bool(values.get("CONTRACTIQ_SUPABASE_SERVICE_ROLE_KEY", "").strip()),
        "groq_api_key": bool(values.get("GROQ_API_KEY", "").strip()),
        "gemini_api_key": bool(values.get("GEMINI_API_KEY", "").strip()),
    }


def report_configuration_status(environ: dict[str, str] | None = None) -> dict[str, bool]:
    status = configuration_status(environ)
    flags = " ".join(f"{name}={'present' if present else 'missing'}" for name, present in status.items())
    print(f"smartBOB configuration: {flags}", file=sys.stderr, flush=True)
    return status


def local_mode_enabled(value: str | None = None) -> bool:
    setting = (value if value is not None else os.environ.get("LOCAL_MODE", "false")).strip().lower()
    if setting not in {"true", "false"}:
        raise SystemExit("LOCAL_MODE must be true or false.")
    return setting == "true"


def build_gateway(environ: dict[str, str] | None = None, *, repository_root: Path | None = None):
    """Select local SQLite or existing Supabase storage based only on LOCAL_MODE."""
    values = environ if environ is not None else os.environ
    if local_mode_enabled(values.get("LOCAL_MODE")):
        root = repository_root or Path(__file__).resolve().parents[1]
        configured_path = values.get("LOCAL_MODE_DB_PATH", "").strip()
        database_path = Path(configured_path).expanduser() if configured_path else root / ".local-data" / "smartbob.sqlite3"
        return LocalSQLiteGateway(database_path), True

    project_url = values.get("CONTRACTIQ_SUPABASE_URL", "").strip()
    public_key = values.get("CONTRACTIQ_SUPABASE_ANON_KEY", "").strip()
    service_role_key = values.get("CONTRACTIQ_SUPABASE_SERVICE_ROLE_KEY", "").strip()
    missing = [name for name, value in (
        ("CONTRACTIQ_SUPABASE_URL", project_url),
        ("CONTRACTIQ_SUPABASE_ANON_KEY", public_key),
        ("CONTRACTIQ_SUPABASE_SERVICE_ROLE_KEY", service_role_key),
    ) if not value]
    if missing:
        raise SystemExit("Missing required environment variable: " + missing[0])
    if not project_url.startswith("https://"):
        raise SystemExit("CONTRACTIQ_SUPABASE_URL must use HTTPS.")
    return SupabaseGateway(project_url, public_key, service_role_key), False


def worker_loop(worker: QueueWorker, stop: threading.Event) -> None:
    while not stop.is_set():
        try:
            worker.recover_stale_jobs()
            if worker.run_once():
                continue
        except Exception:
            # Avoid logging tokens, source, database payloads, or provider responses.
            print("ContractIQ worker cycle failed; the job will be retried within its configured limit.", flush=True)
        stop.wait(1.5)


def main() -> None:
    load_local_secrets()
    local_mode = local_mode_enabled()
    report_configuration_status()
    gateway, selected_local_mode = build_gateway()
    port_text = os.environ.get("CONTRACTIQ_API_PORT", "8765")
    try:
        port = int(port_text)
        if not 1024 <= port <= 65535:
            raise ValueError
    except ValueError:
        raise SystemExit("CONTRACTIQ_API_PORT must be between 1024 and 65535.") from None
    bind_host = os.environ.get("CONTRACTIQ_API_BIND_HOST", "127.0.0.1").strip()
    origins_text = os.environ.get("CONTRACTIQ_ALLOWED_ORIGINS")
    try:
        allowed_origins = parse_allowed_origins(origins_text)
        max_concurrency = int(os.environ.get("CONTRACTIQ_API_MAX_CONCURRENCY", "16"))
        if not 1 <= max_concurrency <= 128:
            raise ValueError
    except ValueError as exc:
        raise SystemExit(str(exc) or "CONTRACTIQ_API_MAX_CONCURRENCY must be between 1 and 128.") from None

    if selected_local_mode and bind_host not in {"127.0.0.1", "localhost"}:
        raise SystemExit("LOCAL_MODE can bind only to 127.0.0.1 or localhost.")
    worker = QueueWorker(gateway)
    server = create_server(gateway, worker, port, host=bind_host, allowed_origins=allowed_origins,
                           max_concurrency=max_concurrency, local_mode=selected_local_mode)
    stop = threading.Event()
    thread = threading.Thread(target=worker_loop, args=(worker, stop), name="contractiq-queue-worker", daemon=True)
    thread.start()
    print(f"smartBOB API listening on {bind_host}:{port}.", flush=True)
    if selected_local_mode:
        print(f"LOCAL_MODE=true; unauthenticated scans use local SQLite storage at {gateway.database_path} (persists across restarts).", flush=True)
    else:
        print("Supabase Account Mode active; scan source and credentials are not logged.", flush=True)
    print("Queue worker active; scan source and credentials are not logged.", flush=True)
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
        if isinstance(gateway, LocalSQLiteGateway):
            gateway.close()


if __name__ == "__main__":
    main()

