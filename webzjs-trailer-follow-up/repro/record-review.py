"""Record branch integrity and compare the historical proof with its retained archives."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import subprocess
import sys
import zipfile

checkout = Path(sys.argv[1]).resolve()
outputs = Path(sys.argv[2]).resolve()
package = Path(__file__).resolve().parent.parent
evidence = package / "evidence"
history = outputs / "zcash-browser-ohttp-proof"
base = "a1891413e5caa33bf3747ab478b9f65cbe0561a1"
review_zip_hash = "9331785ac50fa8cc50bfd2ed24179a4caa37527fb76158669d708f525d919aae"


def digest(path):
    if not path.is_file():
        return None
    with path.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", "-C", checkout, *args])


def write(name, data):
    (evidence / name).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


c02 = history / "continuation-02"
old = json.loads((c02 / "evidence/previous-hashes.json").read_bytes())
bad_old = [name for name, checksum in old.items() if digest(outputs / name) != checksum]
archive = outputs / "zcash-browser-ohttp-proof-continuation-02-review.zip"
review_ok = digest(archive) == review_zip_hash
with zipfile.ZipFile(archive) as zipfile_handle:
    manifest = json.loads(zipfile_handle.read("SHA256SUMS.json"))
expected = {name for name in manifest if name.startswith("continuation-02/")}
files = {path.relative_to(history).as_posix() for path in c02.rglob("*") if path.is_file()}
bad_c02 = sorted(files ^ expected)
bad_c02.extend(name for name in sorted(files & expected) if digest(history / name) != manifest[name])
equivalent_proof_reference = (
    digest(evidence / "sources/proof-wallet.patch") == digest(c02 / "wallet.patch")
)
preserved = review_ok and not bad_c02 and not bad_old
write("historical-integrity.json", {
    "status": "PASS" if preserved else "FAIL",
    "checked_at_utc": datetime.now(timezone.utc).isoformat(),
    "pre_continuation_02_files_checked": len(old),
    "continuation_02_files_checked": len(expected),
    "modified_or_missing_pre_continuation_02": bad_old,
    "modified_added_or_missing_continuation_02": bad_c02,
    "continuation_02_review_archive_sha256": digest(archive),
    "review_archive_matches_recorded_sha256": review_ok,
    "remote_reference_patch_matches_retained_proof_patch": equivalent_proof_reference,
})

head, parent = git("rev-parse", "HEAD", "HEAD^").decode().splitlines()
clean = not git("status", "--porcelain")
changes = git("diff", "--name-status", base, head).decode().splitlines()
paths = [line.split("\t", 1)[1] for line in changes]
expected_paths = {
    "vendor/tonic-web-wasm-client/" + name for name in (
        "VENDORED.md", "src/body_stream.rs", "src/response_body.rs",
        "src/response_body/tests.rs", "trailers-completion.patch",
    )
}
pins_after = {}
same_pins = True
for name in ("Cargo.toml", "Cargo.lock", "yarn.lock", "rust-toolchain.toml",
             "vendor/tonic-web-wasm-client/Cargo.toml"):
    before = sha(git("show", f"{base}:{name}"))
    after = sha(git("show", f"HEAD:{name}"))
    same_pins = same_pins and before == after
    pins_after[name] = {"base_sha256": before, "head_sha256": after}
patch = package / "webzjs-trailer-follow-up.patch"
same_patch = patch.read_bytes() == git("diff", "--binary", "--full-index", base, head)
git("diff", "--check", base, head)
verified = clean and parent == base and set(paths) == expected_paths and same_pins and same_patch
write("branch.json", {
    "status": "PASS" if verified else "FAIL",
    "checkout": str(checkout),
    "branch": git("branch", "--show-current").decode().strip(),
    "base": base, "head": head, "parent": parent, "clean": clean,
    "changes": changes,
    "workspace_manifests_and_pins": pins_after,
    "patch_sha256": digest(patch),
    "patch_matches_incremental_diff": same_patch,
})
if not preserved or not verified:
    raise SystemExit("Preservation or branch verification failed")
print(f"Verified branch {head}, incremental patch, and {len(old) + len(expected)} prior files.")
