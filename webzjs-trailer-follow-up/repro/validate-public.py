"""Check transcript conformance separately from the Node and Chromium timing probes."""
import json
from pathlib import Path
import re
import statistics
import sys

root = Path(sys.argv[1])
methods = ("GetLightdInfo", "GetLatestBlock", "GetBlockRange")
expected_sequence = [(run, method) for run in range(1, 6) for method in methods]


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def check_request(hex_body, method, height):
    raw = bytes.fromhex(hex_body)
    if len(raw) < 5 or raw[0] != 0 or int.from_bytes(raw[1:5], "big") != len(raw) - 5:
        return False
    payload = raw[5:]
    if method != "GetBlockRange":
        return payload == b""
    if height is None:
        return False
    remainder = payload
    for tag, want in [(0x0A, height - 20), (0x12, height - 11)]:
        if len(remainder) < 4 or remainder[0] != tag:
            return False
        size = remainder[1]
        record, remainder = remainder[2:2 + size], remainder[2 + size:]
        if len(record) != size or not 2 <= size <= 11 or record[0] != 0x08:
            return False
        digits = record[1:]
        if digits[-1] > 127 or any(byte < 128 for byte in digits[:-1]):
            return False
        if sum((byte & 127) << (7 * i) for i, byte in enumerate(digits)) != want:
            return False
    return not remainder


def row_issues(row, browser, block_range):
    problems = []
    if row.get("error"):
        return [row["error"]]
    if row.get("status") != 200:
        problems.append(f"unexpected HTTP status {row.get('status')!r}")
    media = (row.get("contentType") or "").split(";", 1)[0].strip().lower()
    if media not in ("application/grpc-web", "application/grpc-web+proto"):
        problems.append(f"unexpected content type {media!r}")
    frames = row.get("frames", [])
    count = 10 if row["method"] == "GetBlockRange" else 1
    if [frame["type"] for frame in frames] != ["0x00"] * count + ["0x80"]:
        problems.append("wrong data count, frame flags or trailer position")
    if any(frame["len"] < 1 for frame in frames):
        problems.append("unexpected empty frame")
    if sum(5 + frame["len"] for frame in frames) != row.get("totalBytes"):
        problems.append("body byte count differs from complete frame sizes")
    status_lines = [line for line in (row.get("trailerText") or "").splitlines()
                    if line.split(":", 1)[0].lower() == "grpc-status"]
    if len(status_lines) != 1 or not re.fullmatch(r"(?i:grpc-status):[ \t]*0[ \t]*", status_lines[0]):
        problems.append("missing, invalid or nonzero terminal grpc-status")
    if row.get("headerGrpcStatus") is not None:
        problems.append("unexpected visible status in HTTP headers for a body-trailer response")
    stamps = [row.get(key) for key in ("firstDataMs", "trailerMs", "endMs")]
    if not all(isinstance(t, (int, float)) for t in stamps) or not 0 <= stamps[0] <= stamps[1] <= stamps[2]:
        problems.append("data, trailer or EOF observation missing or out of order")
    if row.get("trailerToEndMs") is None or row["trailerToEndMs"] < 0 or row.get("extraBytesAfterTrailer") != 0:
        problems.append("missing trailer-to-EOF timing or trailing bytes")
    if browser:
        if row.get("eof") is not True or row.get("unparsedBytes") != 0:
            problems.append("incomplete browser body")
        if row["method"] == "GetBlockRange" and row["heights"] != list(range(block_range[0], block_range[1] + 1)):
            problems.append("streamed block heights did not match the requested range")
    return problems


def analyze(directory, browser):
    if browser:
        run = read(directory / "chromium-public-raw.json")
        data = run.get("measurement") or {}
        rows = data.get("rows", [])
        tip = data.get("tip")
        requests = [{"method": row["method"], "hex": row["requestHex"]} for row in data.get("setup", []) + rows]
        post_count = sum(row.get("event") == "request" and row.get("method") == "POST" for row in run["events"])
        evidence = ["chromium-public-raw.json"]
    else:
        run = read(directory / "node-run.json")
        raw = (directory / "node-raw.json").read_bytes()
        rows = json.loads(raw) if raw else []
        events = (directory / "node-stderr.log").read_text(encoding="utf-8").splitlines()
        tip = next((int(match[1]) for line in events if (match := re.search(r"\btip=(\d+)$", line))), None)
        requests = [{"method": event["method"], "hex": event["bodyHex"]}
                    for event in (json.loads(line) for line in events if line.startswith("{"))
                    if event["event"] == "request"]
        post_count = len(requests)
        evidence = ["node-raw.json", "node-stderr.log", "node-run.json"]
    block_range = (tip - 20, tip - 11) if tip is not None else None
    issues = []
    if [(row.get("run"), row["method"]) for row in rows] != expected_sequence:
        issues.append("missing or misordered measurement rows")
    if not block_range:
        issues.append("setup did not establish a block height")
    if post_count != 17 or [r["method"] for r in requests] != list(methods[:2]) + [m for _, m in expected_sequence]:
        issues.append(f"expected two setup POSTs plus 15 recorded POSTs, observed {post_count}")
    for r in requests:
        if not check_request(r["hex"], r["method"], tip):
            issues.append(f"{r['method']} request does not match the pinned protobuf fields")
    failures = [{"run": row["run"], "method": row["method"], "issues": problems}
                for row in rows if (problems := row_issues(row, browser, block_range))]
    totals = {method: [row["trailerToEndMs"] for row in rows if row["method"] == method and row.get("trailerToEndMs") is not None]
              for method in methods}
    stats = {method: {"count": len(values), "min": min(values), "median": statistics.median(values), "max": max(values)}
             for method, values in totals.items() if values}
    blocked = not rows and (run.get("error") or (not browser and run.get("exit_code") != 0)
                            or (browser and run.get("measurement", {}).get("setup") and not tip))
    result = {
        "status": "BLOCKED" if blocked else "FAIL" if issues or failures else "PASS",
        "runtime": run.get("chromium") if browser else run.get("node"),
        "platform": run["platform"],
        "endpoint": run["endpoint"],
        "tip_at_setup": tip,
        "block_range_inclusive": block_range,
        "post_count": post_count,
        "recorded_calls": len(rows),
        "trailer_to_eof_ms": stats,
        "maximum_trailer_to_eof_ms": max((v for values in totals.values() for v in values), default=None),
        "problems": issues,
        "row_failures": failures,
        "evidence": evidence,
    }
    if browser:
        result["header_visibility"] = (
            "Fetch exposes response headers allowed by CORS. A null grpc-status in Fetch alone "
            "cannot prove absence on the wire. Status in the body trailer was checked directly."
        )
    (directory / "conformance.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


analyze(root / "public-node", False)
analyze(root / "public-chromium", True)
