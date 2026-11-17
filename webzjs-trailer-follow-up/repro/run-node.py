"""Run Daniel's original script with a read-only, bounded fetch preload."""
import json
import platform
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

here = Path(__file__).resolve().parent
out = Path(sys.argv[1]).resolve()
out.mkdir(parents=True, exist_ok=True)
endpoint = "https://zcash-mainnet.chainsafe.dev"
command = [
    "node", "--import", (here / "bound-original-fetch.mjs").as_uri(),
    str(here / "grpcweb-trailer-check.mjs"), endpoint, "5",
]
result = {
    "command": command,
    "platform": platform.platform(),
    "node": subprocess.check_output(["node", "--version"], text=True).strip(),
    "endpoint": endpoint,
    "per_request_timeout_ms": 8000,
    "process_timeout_s": 170,
    "started_utc": datetime.now(timezone.utc).isoformat(),
}
start = time.monotonic()
with (out / "node-raw.json").open("xb") as stdout, (out / "node-stderr.log").open("xb") as stderr:
    try:
        result["exit_code"] = subprocess.run(
            command, cwd=here, stdout=stdout, stderr=stderr, timeout=result["process_timeout_s"]
        ).returncode
    except subprocess.TimeoutExpired:
        result.update(exit_code=None, timed_out=True)
result["elapsed_s"] = round(time.monotonic() - start, 3)
result["finished_utc"] = datetime.now(timezone.utc).isoformat()
(out / "node-run.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, indent=2))
