"""Local-only orchestration for isolated ContractIQ Slither jobs."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import uuid
from pathlib import Path
from typing import BinaryIO


IMAGE = "contractiq-slither-worker:0.1.0"
SUPPORTED_COMPILERS = ("0.8.24", "0.8.23", "0.8.22", "0.8.19")
MAX_SOURCE_BYTES = 500_000
MAX_RESULT_BYTES = 2_000_000
DEFAULT_TIMEOUT_SECONDS = 90
MAX_TIMEOUT_SECONDS = 180
IMPORT_PATTERN = re.compile(r"\bimport\s*(?:\"|'|\{|\*)")


class InputError(ValueError):
    """Raised when a submitted source file is outside the local worker contract."""


class WorkerError(RuntimeError):
    """Raised when Docker or the isolated analyzer cannot complete a job."""


def validate_compiler_version(version: str) -> str:
    if version not in SUPPORTED_COMPILERS:
        raise InputError(
            "Unsupported compiler version. Choose one of: " + ", ".join(SUPPORTED_COMPILERS)
        )
    return version


def read_source(path_value: str) -> str:
    path = Path(path_value)
    if path.suffix.lower() != ".sol":
        raise InputError("Input must be a Solidity .sol file.")
    if path.is_symlink():
        raise InputError("Symbolic-link inputs are not accepted.")
    try:
        resolved = path.resolve(strict=True)
        raw = resolved.read_bytes()
    except (OSError, RuntimeError) as exc:
        raise InputError("Could not read the selected Solidity file.") from exc
    if not resolved.is_file():
        raise InputError("Input must be a regular file.")
    if not raw:
        raise InputError("The Solidity file is empty.")
    if len(raw) > MAX_SOURCE_BYTES:
        raise InputError(f"Source exceeds the {MAX_SOURCE_BYTES:,}-byte limit.")
    try:
        source = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise InputError("Solidity source must be UTF-8 encoded.") from exc
    if "\x00" in source:
        raise InputError("NUL bytes are not accepted in Solidity source.")
    if IMPORT_PATTERN.search(source):
        raise InputError(
            "Imports are not supported in this local single-file worker; dependencies are never fetched."
        )
    return source


class BoundedCapture:
    """Drain a subprocess stream while retaining at most a fixed number of bytes."""

    def __init__(self, stream: BinaryIO, limit: int = MAX_RESULT_BYTES) -> None:
        self.stream = stream
        self.limit = limit
        self.data = bytearray()
        self.overflow = False
        self.thread = threading.Thread(target=self._read, daemon=True)

    def start(self) -> None:
        self.thread.start()

    def join(self) -> None:
        self.thread.join(timeout=5)

    def _read(self) -> None:
        while True:
            chunk = self.stream.read(65536)
            if not chunk:
                return
            remaining = self.limit - len(self.data)
            if remaining > 0:
                self.data.extend(chunk[:remaining])
            if len(chunk) > remaining:
                self.overflow = True


def _container_command(temp_dir: Path, compiler_version: str, job_id: str) -> list[str]:
    # Docker Desktop on Windows accepts forward-slash absolute bind source paths.
    mount_source = str(temp_dir.resolve()).replace("\\", "/")
    return [
        "docker", "run", "--name", job_id, "--pull=never", "--network=none", "--rm",
        "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges:true",
        "--pids-limit=128", "--memory=1g", "--memory-swap=1g", "--cpus=1.0",
        "--user=10001:10001", "--env", "HOME=/tmp",
        "--tmpfs", "/tmp:rw,noexec,nosuid,size=256m,uid=10001,gid=10001",
        "--mount", f"type=bind,source={mount_source},target=/input,readonly",
        IMAGE,
        "--source", "/input/contract.sol",
        "--compiler-version", compiler_version,
    ]


def _cleanup_container(job_id: str) -> None:
    # --rm handles normal completion; this covers timeout and interrupted CLI cases.
    try:
        subprocess.run(
            ["docker", "rm", "--force", job_id],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired):
        pass


def run_scan(source: str, compiler_version: str, timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
             container_name: str | None = None) -> dict:
    compiler_version = validate_compiler_version(compiler_version)
    if not 1 <= timeout_seconds <= MAX_TIMEOUT_SECONDS:
        raise InputError(f"Timeout must be between 1 and {MAX_TIMEOUT_SECONDS} seconds.")
    encoded = source.encode("utf-8")
    if not encoded or len(encoded) > MAX_SOURCE_BYTES or "\x00" in source:
        raise InputError("Source is empty, contains NUL bytes, or exceeds the size limit.")
    if IMPORT_PATTERN.search(source):
        raise InputError("Imports are not supported; dependencies are never fetched.")

    job_id = container_name or ("contractiq-" + uuid.uuid4().hex)
    if not re.fullmatch(r"contractiq-[a-zA-Z0-9-]{8,80}", job_id):
        raise InputError("Invalid local analyzer container name.")
    source_hash = hashlib.sha256(encoded).hexdigest()
    try:
        with tempfile.TemporaryDirectory(prefix="contractiq-scan-") as temp_name:
            temp_dir = Path(temp_name)
            (temp_dir / "contract.sol").write_text(source, encoding="utf-8", newline="\n")
            # A previous process may have exited after its job lease expired while
            # Docker kept the named container alive. Remove that container first.
            _cleanup_container(job_id)
            process = subprocess.Popen(
                _container_command(temp_dir, compiler_version, job_id),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                shell=False,
            )
            assert process.stdout is not None and process.stderr is not None
            stdout = BoundedCapture(process.stdout)
            stderr = BoundedCapture(process.stderr, limit=256_000)
            stdout.start()
            stderr.start()
            try:
                return_code = process.wait(timeout=timeout_seconds)
            except subprocess.TimeoutExpired as exc:
                _cleanup_container(job_id)
                try:
                    process.kill()
                except OSError:
                    pass
                process.wait(timeout=10)
                stdout.join()
                stderr.join()
                raise WorkerError(f"Analysis exceeded the {timeout_seconds}-second timeout.") from exc
            stdout.join()
            stderr.join()
            if stdout.overflow:
                raise WorkerError("Analyzer output exceeded the configured output limit.")
            if return_code != 0:
                # Do not echo raw compiler diagnostics or source lines to terminal logs.
                raise WorkerError("Slither could not compile or analyze this source (see local worker docs).")
            try:
                result = json.loads(stdout.data.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise WorkerError("Analyzer returned an invalid result document.") from exc
            result["scan_id"] = job_id.removeprefix("contractiq-")
            result["source_hash"] = source_hash
            result["compiler_version"] = compiler_version
            return result
    except FileNotFoundError as exc:
        raise WorkerError("Docker CLI was not found. Install/start Docker Desktop and enable Linux containers.") from exc
    finally:
        _cleanup_container(job_id)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run a local, isolated ContractIQ Slither scan.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    scan_parser = subparsers.add_parser("scan", help="Analyze one local Solidity file.")
    scan_parser.add_argument("--source", required=True, help="Path to a single .sol file (no imports).")
    scan_parser.add_argument("--compiler-version", required=True, choices=SUPPORTED_COMPILERS)
    scan_parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    args = parser.parse_args(argv)
    try:
        source = read_source(args.source)
        result = run_scan(source, args.compiler_version, args.timeout)
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    except (InputError, WorkerError) as exc:
        print(json.dumps({"status": "failed", "error": str(exc)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

