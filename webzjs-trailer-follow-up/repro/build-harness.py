"""Build the vendored crate and browser probe with the workspace's locked versions."""
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tomllib

checkout, scratch, artifact = (Path(arg).resolve() for arg in sys.argv[1:])
here = Path(__file__).resolve().parent
if scratch.exists():
    raise SystemExit("Choose a new scratch directory")
if artifact.exists():
    raise SystemExit("Choose a new artifact directory")


def run(*args, cwd=None):
    print(subprocess.list2cmdline([str(arg) for arg in args]), flush=True)
    subprocess.run(args, cwd=cwd, check=True, timeout=720)


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


head = subprocess.check_output(["git", "-C", checkout, "rev-parse", "HEAD"], text=True).strip()
subpath = "vendor/tonic-web-wasm-client"
source = subprocess.check_output(["git", "-C", checkout, "archive", head, subpath])
scratch.mkdir(parents=True)
with tarfile.open(fileobj=io.BytesIO(source)) as tar:
    tar.extractall(scratch, filter="data")
vendor = scratch / subpath
for name in ("Cargo.lock", "rust-toolchain.toml"):
    data = subprocess.check_output(["git", "-C", checkout, "show", f"{head}:{name}"])
    (vendor / name).write_bytes(data)

def lock_identities(filename):
    with filename.open("rb") as f:
        packages = tomllib.load(f)["package"]
    return {
        (p["name"], p["version"], p.get("source"), p.get("checksum"))
        for p in packages
    }


lock = vendor / "Cargo.lock"
workspace_sha = sha(lock)
workspace_pins = lock_identities(lock)
examples = vendor / "examples"
examples.mkdir(exist_ok=True)
shutil.copyfile(here / "trailer_harness.rs", examples / "trailer_harness.rs")
with (vendor / "Cargo.toml").open("a", encoding="utf-8", newline="\n") as f:
    f.write('\n[[example]]\nname = "trailer_harness"\ncrate-type = ["cdylib"]\n')

build_target = scratch.parent / "wb28"
# As a workspace dependency, a bare -p selection pulls in native transport features
# (tokio/net and mio). Resolve this standalone crate from a copy of the workspace lock.
metadata = ["cargo", "metadata", "--offline", "--format-version", "1"]
print(subprocess.list2cmdline(metadata), flush=True)
with (scratch / "cargo-metadata.json").open("wb") as output:
    subprocess.run(metadata, cwd=vendor, check=True, stdout=output, timeout=120)
standalone_pins = lock_identities(lock)
if standalone_pins - workspace_pins:
    raise RuntimeError(f"Unexpected dependency version or source: {standalone_pins - workspace_pins}")
standalone_sha = sha(lock)
print(f"Projected lock retains {len(standalone_pins)} exact package identities from the workspace.", flush=True)
run(
    "cargo", "build", "--locked", "--offline", "--target-dir", build_target,
    "--target", "wasm32-unknown-unknown", "--lib", "--example", "trailer_harness", cwd=vendor,
)
if sha(lock) != standalone_sha or sha(checkout / "Cargo.lock") != workspace_sha:
    raise RuntimeError("Build changed a locked dependency file")

module = build_target / "wasm32-unknown-unknown/debug/examples/trailer_harness.wasm"
version = subprocess.check_output(["wasm-bindgen", "--version"], text=True).strip()
if version != "wasm-bindgen 0.2.100":
    raise RuntimeError(f"Incompatible binding generator: {version}")
run("wasm-bindgen", "--target", "web", "--out-dir", artifact, module)
manifest = {
    "checkout": head,
    "workspace_lock_sha256": workspace_sha,
    "standalone_lock_sha256": standalone_sha,
    "standalone_packages_from_workspace": len(standalone_pins),
    "changed_package_identities": [],
    "wasm_bindgen": version,
    "source_sha256": sha(here / "trailer_harness.rs"),
    "files": {file.name: sha(file) for file in sorted(artifact.iterdir()) if file.is_file()},
}
shutil.copyfile(lock, artifact / "harness.Cargo.lock")
(artifact / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(json.dumps(manifest, indent=2))
