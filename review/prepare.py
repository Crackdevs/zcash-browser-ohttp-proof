"""Prepare a fresh Windows reviewer build from the extracted archive."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

archive = Path(__file__).resolve().parents[1]
proof = archive / "continuation-02"
deps = archive / "dependencies"
here = Path(__file__).resolve().parent


def run(cwd, *args):
    subprocess.run(args, cwd=cwd, check=True)


def copy(src, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dest)


def write_json(file, value):
    file.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def layout(root):
    root.mkdir(parents=True, exist_ok=True)
    if any(root.iterdir()):
        raise SystemExit("Use a new, empty, short writable work directory.")
    inventory = json.loads((proof / "evidence/inventory.json").read_text(encoding="utf-8"))
    base = deps / "webzjs-base"
    for name, hashes in inventory["wallet_lockfiles_sha256"].items():
        if hashlib.sha256((base / name).read_bytes()).hexdigest() != hashes["commit"]:
            raise ValueError(f"Pinned {name} does not match the recorded build")
    if hashlib.sha256((proof / "wallet.patch").read_bytes()).hexdigest() != inventory["wallet_patch_sha256"]:
        raise ValueError("WebZjs patch does not match the recorded build")
    shutil.copytree(base, root / "s")
    shutil.copytree(base, root / "s2")
    run(root / "s2", "git", "init", "--quiet")
    run(root / "s2", "git", "apply", "--check", str(proof / "wallet.patch"))
    run(root / "s2", "git", "apply", str(proof / "wallet.patch"))
    for directory in ("bin", "tmp"):
        (root / directory).mkdir()
    for directory, src in (("o2", proof), ("js-tools", deps / "js-tools"), ("driver", deps / "playwright")):
        for name in ("package.json", "pnpm-lock.yaml"):
            copy(src / name, root / directory / name)


def stage(root):
    o = root / "o2"
    for file in sorted((proof / "src").iterdir()):
        copy(file, o / file.name)
    for name in ("core.ts", "server.ts"):
        copy(deps / "ohttp-relay" / name, o / "relay" / name)
    services = o / "services.mjs"
    original = services.read_text(encoding="utf-8")
    recorded = "'C:/Users/NewOwner/Documents/Codex/work/o1/bin/grpcwebproxy.exe'"
    if original.count(recorded) != 1:
        raise ValueError("Expected exactly one recorded proxy executable path")
    services.write_text(
        original.replace(recorded, "path.resolve(import.meta.dirname,'..','bin','grpcwebproxy.exe')"),
        encoding="utf-8",
    )
    run(
        o, "node", "--input-type=module", "-e",
        "import {build} from 'esbuild'; "
        "await build({entryPoints:['adapter.js'],bundle:true,format:'esm',"
        "platform:'browser',outfile:'proof-adapter.js'});",
    )
    dist = o / "component-dist"
    for name in ("component.js", "proof-adapter.js"):
        copy(o / name, dist / name)
    (dist / "index.html").write_text(
        '<!doctype html><meta charset=utf-8><script type=module src="./component.js"></script>',
        encoding="utf-8",
    )


def parcel(root, page, folder):
    run(folder, "node", str(root / "js-tools/node_modules/parcel/lib/bin.js"),
        "build", page, "--dist-dir", "dist", "--no-optimize", "--no-scope-hoist")


def wallet(root):
    o = root / "o2"
    pkg = root / "s2/packages/webzjs-wallet"
    workers = list(pkg.glob("snippets/wasm_thread-*/src/wasm32/js/web_worker_module.bundler.js"))
    if len(workers) != 1 or "installProofTransport();" not in workers[0].read_text(encoding="utf-8"):
        raise ValueError("Build the patched wallet with the upstream just recipe first")
    copy(o / "proof-adapter.js", pkg / "proof-adapter.js")
    app = o / "app"
    for name in ("index.html", "app.js", "component.js"):
        copy(o / name, app / name)
    for name in ("app.js", "component.js"):
        file = app / name
        source = file.read_text(encoding="utf-8")
        file.write_text(source.replace("'./proof-adapter.js'", "'@proof/adapter'"), encoding="utf-8")
    write_json(app / "package.json", {
        "name": "proof-ohttp-harness", "private": True, "type": "module",
        "alias": {
            "@proof/adapter": "../../s2/packages/webzjs-wallet/proof-adapter.js",
            "@zcashcommunitygrants/webzjs-wallet": "../../s2/packages/webzjs-wallet/webzjs_wallet.js",
            "@zcashcommunitygrants/webzjs-keys": "../../s2/packages/webzjs-keys/webzjs_keys.js",
        },
    })
    parcel(root, "index.html", app)


def legacy(root):
    app = root / "h2"
    for name in ("recovery.js", "recovery.html"):
        copy(here / "legacy" / name, app / name)
    write_json(app / "package.json", {
        "name": "continuation-01-direct-control", "private": True, "type": "module",
        "alias": {
            "@zcashcommunitygrants/webzjs-wallet": "../s/packages/webzjs-wallet/webzjs_wallet.js",
            "@zcashcommunitygrants/webzjs-keys": "../s/packages/webzjs-keys/webzjs_keys.js",
        },
    })
    parcel(root, "recovery.html", app)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("layout", "stage", "wallet", "legacy"))
    parser.add_argument("short_work_directory", type=Path)
    args = parser.parse_args()
    actions = {"layout": layout, "stage": stage, "wallet": wallet, "legacy": legacy}
    actions[args.action](args.short_work_directory.resolve())
