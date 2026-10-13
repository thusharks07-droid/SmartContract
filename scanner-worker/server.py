"""Run the loopback-only authenticated API and private queue consumer."""

from __future__ import annotations

import os
import threading
import time

from api_server import create_server
from queue_worker import QueueWorker
from supabase_gateway import SupabaseGateway


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


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

    gateway = SupabaseGateway(project_url, public_key, service_role_key)
    worker = QueueWorker(gateway)
    server = create_server(gateway, worker, port)
    stop = threading.Event()
    thread = threading.Thread(target=worker_loop, args=(worker, stop), name="contractiq-queue-worker", daemon=True)
    thread.start()
    print(f"ContractIQ local API listening at http://127.0.0.1:{port}", flush=True)
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

