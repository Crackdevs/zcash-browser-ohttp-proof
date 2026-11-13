# Reproduce on Windows x64

This is the route for an extracted review archive. [The original experiment README](continuation-02/README.md) records the exact author-workspace commands. `review/prepare.py` stages copies for the reviewer; it only relocates the proxy executable path in the staged service code. Browser adapter source, relay behavior, TLS backend, bindings and patch are unchanged. The archived evidence is never a destination for new logs.

## Setup

Install Python 3.11+, Git for Windows (including Git Bash), rustup, Node **24.22.1**, pnpm **11.25.0**, and the Visual Studio x64 MSVC C++ toolset and Windows SDK. The run used MSVC linker **14.44.35207** and clang/llvm-ar **23.1.4**; the upstream WASM build requires clang 17 or newer. For exact version and binary hashes see [tool versions](dependencies/toolchain/versions.json). Use a real, short, writable directory to avoid the path-length failure observed before Continuation 01. Avoid using a personal browser profile or existing wallet.

From the archive root in PowerShell (use a different short root if needed):

```powershell
$archive = (Get-Location).Path
$root = 'C:\zproof'  # New, empty and writable.
python review/verify.py
python review/prepare.py layout $root

$env:RUSTUP_HOME = "$root\r"
$env:CARGO_HOME = "$root\c"
$env:CARGO_TARGET_DIR = "$root\t"
$env:TEMP = "$root\tmp"
$env:TMP = $env:TEMP
$env:WASM_PACK_CACHE = "$root\wp"
$env:YARN_CACHE_FOLDER = "$root\yc"
$env:CARGO_BUILD_JOBS = '4'
$env:PATH = "$root\bin;$root\js-tools\node_modules\.bin;${env:ProgramFiles}\Git\bin;${env:ProgramFiles}\Git\usr\bin;$env:PATH"
$env:CC_wasm32_unknown_unknown = (Get-Command clang.exe).Source
$env:AR_wasm32_unknown_unknown = (Get-Command llvm-ar.exe).Source
# In an x64 Developer PowerShell, first verify that link.exe is the MSVC linker:
$env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = (Get-Command link.exe).Source
$bash = "${env:ProgramFiles}\Git\bin\bash.exe"
$env:PLAYWRIGHT_BROWSERS_PATH = "$root\browsers"

rustup toolchain install nightly-2025-06-15 --profile minimal --component rust-src --target wasm32-unknown-unknown --no-self-update
pnpm --dir "$root\o2" install --frozen-lockfile --ignore-scripts
pnpm --dir "$root\js-tools" install --frozen-lockfile --ignore-scripts
pnpm --dir "$root\driver" install --frozen-lockfile --ignore-scripts
pnpm --dir "$root\driver" exec playwright install chromium
```

Download the Windows x64 releases for just **1.59.0**, wasm-pack **0.15.1**, wasm-bindgen **0.2.100**, Binaryen **133**, and grpcwebproxy **0.15.0**. Use the exact asset URLs and SHA-256 values in [download pins](dependencies/toolchain/downloads.json); compare with `Get-FileHash -Algorithm SHA256` before extraction. Put `just.exe`, `wasm-pack.exe`, `wasm-bindgen.exe`, the Binaryen `bin` contents, and `grpcwebproxy.exe` in `$root\bin`. Check the executable names and versions. For example, run `wasm-bindgen --version` and `wasm-opt --version`. The proxy executable's post-extraction SHA-256 is recorded in [inventory.json](continuation-02/evidence/inventory.json).

## Read-only checks

```powershell
python review/prepare.py stage $root
$o = "$root\o2"
$d = "$root\driver"
$e = "$root\review-run\evidence"
node "$o\run.mjs" component "$e\component" "$o\component-dist" $d

Push-Location "$root\s2"
just --shell $bash build
Pop-Location
python review/prepare.py wallet $root
node "$o\run.mjs" qualify "$e\qualify" "$o\app\dist" $d
node "$o\run.mjs" wallet-faults "$e\wallet-faults" "$o\app\dist" $d

Push-Location "$root\s"
just --shell $bash build
Pop-Location
python review/prepare.py legacy $root
node "$o\run.mjs" legacy "$e\legacy" "$root\h2\dist" $d
```

The source under `dependencies/webzjs-base/` is the pinned unmodified Cargo build subset of [WebZjs candidate c0457174](https://github.com/red-dev-inc/WebZjs/commit/c0457174ecb99c67a9d081fba0be54f50d0cf012); the prep script applies the exact patch only in `s2`. It includes both original lockfiles. The in-tree vendor dependency and upstream relay sources are included with their licenses. Git and registry dependencies resolved by the lockfiles are downloaded at build time. Allow loopback ports **3100** and **3110–3112** and outbound TLS to **testnet.zec.rocks:443**. Do not relax TLS verification. Check the JSON result files; runner exit status alone does not imply every check passed. The legacy fixture's PASS means the unpatched wallet *reproduced* final-status loss as expected.

## Optional full live wallet check

Run this once with fresh testnet state after the read-only checks pass. The runner requires component and legacy results from the new run, and performs a worker qualification before it requests funds. It creates one disposable account and one controlled recipient, then writes exclusive intent files in the evidence parent before the faucet claim or payment submission. If a write is ambiguous, reconcile the original canonical ID; do not delete an intent file or send a replacement.

```powershell
$env:PROOF_ALLOW_TESTNET_PAYMENT = '1'
try {
    node "$o\run.mjs" wallet "$e\wallet" "$o\app\dist" $d "$e\component\component-results.json" "$e\legacy\legacy-results.json"
} finally {
    Remove-Item Env:PROOF_ALLOW_TESTNET_PAYMENT -ErrorAction SilentlyContinue
}
```

Compare the new run's balances/history at its own verified same-height checkpoint and confirm the one payment's backend acceptance, inclusion and sender/recipient state. The historical transaction IDs and event logs shipped in the archive document the original run; they are not inputs for a new payment. If the public backend, faucet or a pinned dependency is unavailable, record the limitation rather than substituting a different backend or wallet version silently.
