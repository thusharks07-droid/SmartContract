"""Container-side Slither execution and result normalization."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path


SUPPORTED_COMPILERS = ("0.8.24", "0.8.23", "0.8.22", "0.8.19")
MAX_SOURCE_BYTES = 500_000
IMPORT_PATTERN = re.compile(r"\bimport\s*(?:\"|'|\{|\*)")
IMPACT = {"high": "high", "medium": "medium", "low": "low", "informational": "informational", "optimization": "informational"}
CONFIDENCE = {"high": "high", "medium": "medium", "low": "low"}


def normalize(slither_result: dict, source: str, source_hash: str) -> dict:
    lines = source.splitlines()
    raw_findings = slither_result.get("results", {}).get("detectors", [])
    findings = []
    for index, item in enumerate(raw_findings):
        impact = str(item.get("impact", "Informational")).lower()
        confidence = str(item.get("confidence", "Low")).lower()
        elements = item.get("elements") or []
        mapping = elements[0].get("source_mapping", {}) if elements else {}
        line_numbers = mapping.get("lines") or []
        valid_lines = [line for line in line_numbers if isinstance(line, int) and 1 <= line <= len(lines)]
        start = min(valid_lines) if valid_lines else None
        end = max(valid_lines) if valid_lines else start
        code_excerpt = "\n".join(lines[start - 1:end]) if start and end else None
        compact_elements = []
        for element in elements:
            element_mapping = element.get("source_mapping", {})
            element_lines = element_mapping.get("lines") or []
            compact_elements.append({
                "type": str(element.get("type", "unknown")),
                "name": str(element.get("name", ""))[:500],
                "source_path": "contract.sol",
                "lines": [line for line in element_lines if isinstance(line, int) and 1 <= line <= len(lines)],
            })
        description = str(item.get("description", "")).strip()
        description = re.sub(r"(?:\.\./)+input/contract\.sol", "contract.sol", description)
        findings.append({
            "id": f"slither-{index + 1}",
            "rule_id": str(item.get("check", "unknown")),
            "title": str(item.get("check", "Slither detector result")).replace("-", " ").title(),
            "description": description[:8_000],
            "severity": IMPACT.get(impact, "informational"),
            "confidence": CONFIDENCE.get(confidence, "low"),
            "category": str(item.get("check", "unknown")),
            "source_path": "contract.sol",
            "line_start": start,
            "line_end": end,
            "code_excerpt": code_excerpt,
            "recommendation": "Review this detector result and independently validate an appropriate mitigation.",
            "evidence": {"elements": compact_elements},
            "verification": {"status": "not_verified", "engine": "slither"},
        })
    return {
        "status": "completed_with_findings" if findings else "completed_no_findings",
        "analysis_engine": "slither",
        "analysis_version": "0.11.6",
        "is_demo": False,
        "summary": {
            "finding_count": len(findings),
            "severity_counts": {
                severity: sum(1 for finding in findings if finding["severity"] == severity)
                for severity in ("high", "medium", "low", "informational")
            },
            "source_hash": source_hash,
            "disclaimer": "Static analyzer output only. Findings require independent validation; no completeness or safety guarantee is provided.",
        },
        "findings": findings,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--compiler-version", required=True, choices=SUPPORTED_COMPILERS)
    args = parser.parse_args()
    path = Path(args.source)
    try:
        source_bytes = path.read_bytes()
        if not source_bytes or len(source_bytes) > MAX_SOURCE_BYTES:
            raise ValueError("Source is empty or exceeds the size limit.")
        source = source_bytes.decode("utf-8")
        if "\x00" in source or IMPORT_PATTERN.search(source):
            raise ValueError("NUL bytes and imports are not supported.")
    except (OSError, UnicodeDecodeError, ValueError) as exc:
        print(json.dumps({"error": "invalid_input", "message": str(exc)}), file=sys.stderr)
        return 2

    compiler = f"/opt/solc/{args.compiler_version}"
    command = [
        "slither", str(path), "--solc", compiler, "--json", "-", "--disable-color",
    ]
    try:
        proc = subprocess.run(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    except OSError:
        print(json.dumps({"error": "slither_unavailable"}), file=sys.stderr)
        return 3
    try:
        raw = json.loads(proc.stdout.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        # Keep compiler diagnostics private to this short-lived container process.
        print(json.dumps({"error": "invalid_analyzer_output"}), file=sys.stderr)
        return 5
    # Slither uses exit code 255 when configured findings meet its default fail
    # threshold, while still returning a valid successful JSON analysis result.
    results = raw.get("results")
    detectors = results.get("detectors") if isinstance(results, dict) else None
    if not raw.get("success") or not isinstance(results, dict) or (detectors is not None and not isinstance(detectors, list)):
        print(json.dumps({"error": "analysis_failed"}), file=sys.stderr)
        return 4
    source_hash = hashlib.sha256(source_bytes).hexdigest()
    print(json.dumps(normalize(raw, source, source_hash), separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

