"""Verify prior evidence and retain the actual source/build/package inventory."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
from datetime import datetime, timezone

cont = Path(__file__).resolve().parents[1]
outputs = cont.parents[1]
root = outputs.parent
evidence = cont / "evidence"
short = Path(r"C:\Users\NewOwner\Documents\Codex\work\o1")
s = short / "s2"
o = short / "o2"
relay = root / "work/zcash-browser-ohttp-proof/sources/ohttp-relay"

def sha(file):
    with file.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()

def cmd(*args):
    return subprocess.check_output(args, text=True).strip()

def git_file(repo, name):
    return hashlib.sha256(subprocess.check_output(["git", "-C", str(repo), "show", "HEAD:"+name])).hexdigest()

def write(name, data):
    (evidence / name).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

previous = json.loads((evidence / "previous-hashes.json").read_text())
checked = {n: sha(outputs / n) if (outputs / n).is_file() else None for n in previous}
differences = [n for n, h in checked.items() if previous[n] != h]
current = {
    f.relative_to(outputs).as_posix()
    for f in (outputs / "zcash-browser-ohttp-proof").rglob("*")
    if f.is_file() and not f.is_relative_to(cont)
}
extra = sorted(current - previous.keys())
write("previous-verification.json", {
    "verified_at_utc": datetime.now(timezone.utc).isoformat(),
    "files_checked": len(checked), "changed_or_missing": differences,
    "new_files_outside_continuation_02": extra,
    "status": "PASS" if not differences and not extra else "FAIL",
})
dep = {}
for n in ("ohttp-ts", "hpke", "hono", "@hono/node-server", "esbuild"):
    pkg = json.loads((o / "node_modules" / n / "package.json").read_text(encoding="utf-8"))
    dep[n] = {"version": pkg["version"], "license": pkg.get("license")}
    if n == "ohttp-ts":
        dep[n]["bhttp-ts"] = pkg["dependencies"]["bhttp-ts"]
        dep[n]["package_gitHead"] = pkg.get("gitHead")
for n in ("package.json", "pnpm-lock.yaml"):
    shutil.copyfile(o / n, cont / n)
lockfiles = {}
for n in ("Cargo.lock", "yarn.lock"):
    lockfiles[n] = {"checkout": sha(s / n), "commit": git_file(s, n)}
    if lockfiles[n]["checkout"] != lockfiles[n]["commit"]:
        raise RuntimeError("Pinned wallet lockfile differs: "+n)
retained_patch = (cont / "wallet.patch").read_bytes()
live_patch = subprocess.check_output(["git","-C",str(s),"-c","core.safecrlf=false","diff","--binary"])
if live_patch != retained_patch:
    raise RuntimeError("Wallet patch differs from built source")
files = [o / "proof-adapter.js", short / "bin/grpcwebproxy.exe"]
files += sorted(f for f in (o / "app/dist").iterdir() if f.is_file() and not f.name.endswith(".map"))
write("inventory.json", {
    "wallet_head": cmd("git", "-C", str(s), "rev-parse", "HEAD"),
    "wallet_lockfiles_sha256": lockfiles, "wallet_patch_sha256": sha(cont / "wallet.patch"),
    "relay_head": cmd("git", "-C", str(relay), "rev-parse", "HEAD"),
    "relay_staged": {
        n: {"committed_blob_sha256": git_file(relay, "src/"+n),
            "staged_sha256": sha(o / "relay" / n),
            "equals_commit_after_normalizing_CRLF": hashlib.sha256(
                (o / "relay" / n).read_bytes().replace(b"\r\n", b"\n")).hexdigest() == git_file(relay, "src/"+n)}
        for n in ("core.ts","server.ts")
    },
    "node": cmd("node", "--version"),
    "npm_packages": dep,
    "files_in_work_tree_not_delivered": [
        {"path": str(f), "sha256": sha(f), "bytes": f.stat().st_size} for f in files
    ],
})
if differences or extra:
    raise SystemExit("Prior evidence preservation check failed")
