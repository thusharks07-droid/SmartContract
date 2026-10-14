"""Run the loopback-only authenticated API and private queue consumer."""

from __future__ import annotations

import os
from pathlib import Path
import sys
import threading
import time

from api_server import create_server, parse_allowed_origins
from queue_worker import QueueWorker
from supabase_gateway import SupabaseGateway


def load_local_ai_secrets() -> None:
    """Read only backend AI keys from the ignored repository-root .env for local development."""
    path = Path(__file__).resolve().parents[1] / ".env"
    try:
        lines = path.read_text(encoding="utf-8-sig").splitlines()
    except OSError:
        return
    allowed = {"GEMINI_API_KEY", "GROQ_API_KEY"}
    for line in lines:
        name, separator, raw = line.partition("=")
        name = name.strip()
        if not separator or name not in allowed or name in os.environ:
            continue
        value = raw.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        os.environ[name] = value


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def configuration_status(environ: dict[str, str] | None = None) -> dict[str, bool]:
    """Return presence flags only; never return or log configuration values."""
    values = environ if environ is not None else os.environ
    return {
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
    load_local_ai_secrets()
    report_configuration_status()
    project_url = required("CONTRACTIQ_SUPABASE_URL")
    public_key = required("CONTRACTIQ_SUPABASE_ANON_KEY")
    service_role_key = required("CONTRACTIQ_SUPABASE_SERVICE_ROLE_KEY")
    port_text = os.environ.get("CONTRACTIQ_API_PORT", "8765")
    try:
        port = int(port_text)
        if not 1024 <= port <= 65535:
            raise ValueError
    except ValueError:
        raise SystemExit("CONTRACTIQ_API_PORT must be between 1024 and 65535.") from None
    if not project_url.startswith("https://"):
        raise SystemExit("CONTRACTIQ_SUPABASE_URL must use HTTPS.")
    bind_host = os.environ.get("CONTRACTIQ_API_BIND_HOST", "127.0.0.1").strip()
    origins_text = os.environ.get("CONTRACTIQ_ALLOWED_ORIGINS")
    try:
        allowed_origins = parse_allowed_origins(origins_text)
        max_concurrency = int(os.environ.get("CONTRACTIQ_API_MAX_CONCURRENCY", "16"))
        if not 1 <= max_concurrency <= 128:
            raise ValueError
    except ValueError as exc:
        raise SystemExit(str(exc) or "CONTRACTIQ_API_MAX_CONCURRENCY must be between 1 and 128.") from None

    gateway = SupabaseGateway(project_url, public_key, service_role_key)
    worker = QueueWorker(gateway)
    server = create_server(gateway, worker, port, host=bind_host, allowed_origins=allowed_origins,
                           max_concurrency=max_concurrency)
    stop = threading.Event()
    thread = threading.Thread(target=worker_loop, args=(worker, stop), name="contractiq-queue-worker", daemon=True)
    thread.start()
    print(f"ContractIQ API listening on {bind_host}:{port}; TLS must terminate at a trusted HTTPS proxy.", flush=True)
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


if __name__ == "__main__":
    main()

