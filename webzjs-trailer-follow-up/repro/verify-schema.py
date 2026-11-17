"""Retain and verify the exact protobuf declarations used for the read probes."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

repo, out = (Path(arg).resolve() for arg in sys.argv[1:])
out.mkdir(parents=True, exist_ok=True)
revision = "a1891413e5caa33bf3747ab478b9f65cbe0561a1"
schema = {}
files = {}
for name in ("service.proto", "compact_formats.proto"):
    target = f"{revision}:protos/{name}"
    data = subprocess.check_output(["git", "-C", repo, "show", target])
    (out / name).write_bytes(data)
    schema[name] = re.sub(r"//[^\n]*", "", data.decode())
    files[name] = {
        "git_blob": subprocess.check_output(["git", "-C", repo, "rev-parse", target], text=True).strip(),
        "sha256": hashlib.sha256(data).hexdigest(),
    }

service = schema["service.proto"]
assert re.search(r"\bpackage\s+cash\.z\.wallet\.sdk\.rpc\s*;", service)
assert re.search(r"\bservice\s+CompactTxStreamer\s*\{", service)
for method, signature in {
    "GetLightdInfo": r"\(Empty\)\s*returns\s*\(LightdInfo\)",
    "GetLatestBlock": r"\(ChainSpec\)\s*returns\s*\(BlockID\)",
    "GetBlockRange": r"\(BlockRange\)\s*returns\s*\(stream CompactBlock\)",
}.items():
    assert re.search(rf"\brpc\s+{method}\s*{signature}", service)
for name in ("Empty", "ChainSpec"):
    assert re.search(rf"\bmessage\s+{name}\s*\{{\s*\}}", service)
for message, pattern, source in [
    ("BlockID", r"uint64\s+height\s*=\s*1\s*;", service),
    ("BlockRange", r"BlockID\s+start\s*=\s*1\s*;", service),
    ("BlockRange", r"BlockID\s+end\s*=\s*2\s*;", service),
    ("CompactBlock", r"uint64\s+height\s*=\s*2\s*;", schema["compact_formats.proto"]),
]:
    definition = re.search(rf"\bmessage\s+{message}\s*\{{([^}}]*)\}}", source).group(1)
    assert re.search(pattern, definition)

script = (out.parent.parent / "repro/grpcweb-trailer-check.mjs")
comment = out / "daniel-comment.md"
original = re.search(rb"```js\n(.*?)```", comment.read_bytes().replace(b"\r\n", b"\n"), flags=re.S)[1]
assert script.read_bytes() == original
result = {
    "status": "PASS",
    "pinned_webzjs_commit": revision,
    "schema_path": "protos",
    "files": files,
    "asserted": [
        "Empty and ChainSpec encode to zero bytes",
        "CompactTxStreamer GetLightdInfo and GetLatestBlock are unary",
        "GetBlockRange is server streaming with BlockRange as input",
        "BlockRange.start and end are embedded message fields 1 and 2 (tags 0x0a and 0x12)",
        "BlockID.height is uint64 field 1 (tag 0x08)",
        "CompactBlock.height is uint64 field 2 (tag 0x10)",
    ],
    "original_script_sha256": hashlib.sha256(original).hexdigest(),
    "original_script_exact_fragment_match": True,
}
(out / "schema-check.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, indent=2))
