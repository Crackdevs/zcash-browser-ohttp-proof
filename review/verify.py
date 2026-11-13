"""Verify the archive's extracted files against its SHA-256 manifest."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
files = json.loads((root / "SHA256SUMS.json").read_text(encoding="utf-8"))
errors = []
for name, expected in files.items():
    item = root / name
    if not item.is_file():
        errors.append(f"missing {name}")
        continue
    with item.open("rb") as f:
        if hashlib.file_digest(f, "sha256").hexdigest() != expected:
            errors.append(f"hash mismatch {name}")
if errors:
    raise SystemExit("\n".join(errors))
print(f"Verified {len(files)} files")
