"""Replay the documented three-patch procedure and compare the complete src tree."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile

checkout, archive, root, evidence = (Path(arg).resolve() for arg in sys.argv[1:])
vendor = checkout / "vendor/tonic-web-wasm-client"
patches = ("trailers-only.patch", "trailers.patch", "trailers-completion.patch")
extract = root / "tonic-web-wasm-client-0.8.0"
archive_sha = hashlib.sha256(archive.read_bytes()).hexdigest()
expected = "898cd44be5e23e59d2956056538f1d6b3c5336629d384ffd2d92e76f87fb98ff"
if archive_sha != expected:
    raise SystemExit("Unexpected crate archive SHA-256")
if extract.exists():
    raise SystemExit("Choose a new scratch extraction path")
root.mkdir(parents=True, exist_ok=True)
with tarfile.open(archive) as tar:
    tar.extractall(root, filter="data")

commands = []
for name in patches:
    result = subprocess.run(
        ["patch", "-p1", "--fuzz=0", "--batch", "--forward", "-i", str(vendor / name)],
        cwd=extract, text=True, capture_output=True, timeout=30,
    )
    commands.append({
        "patch": name, "sha256": hashlib.sha256((vendor / name).read_bytes()).hexdigest(),
        "exit_code": result.returncode, "stdout": result.stdout, "stderr": result.stderr,
    })
    if result.returncode != 0:
        break

match = all(entry["exit_code"] == 0 for entry in commands) and len(commands) == len(patches)
differences = []
files = []
if match:
    shutil.copytree(vendor / "src/response_body", extract / "src/response_body")
    paths = lambda directory: {file.relative_to(directory).as_posix() for file in directory.rglob("*") if file.is_file()}
    actual, expected_src = extract / "src", vendor / "src"
    for name in sorted(paths(actual) | paths(expected_src)):
        a, b = actual / name, expected_src / name
        if not a.is_file() or not b.is_file() or a.read_bytes() != b.read_bytes():
            differences.append(name)
        else:
            files.append(name)

evidence.write_text(json.dumps({
    "status": "PASS" if match and not differences else "FAIL",
    "crate": "tonic-web-wasm-client 0.8.0", "archive_sha256": archive_sha,
    "patch_cli": "patch -p1 --fuzz=0 --batch --forward", "steps": commands,
    "identical_src_files": files, "missing_or_different_files": differences,
}, indent=2) + "\n", encoding="utf-8")
if not match or differences:
    raise SystemExit("Vendor patch replay did not reproduce the src tree")
print(f"Replayed {len(patches)} patches. All {len(files)} src files match byte for byte.")
