# Continuation 01 — bounded baseline recovery

**Direct wallet baseline recovered.** The pass finished within its four-hour limit, measured conservatively from the first retained clock observation at **2026-11-10 21:59:42 UTC** (16:59:42 America/Toronto). The hard end was 2026-11-11 01:59:42 UTC. See [results.json](results.json) for the finish time and machine-readable results.

| Requested result | Status | Evidence |
|---|---|---|
| Packaged wallet loads in Chromium | **PASS** | [Complete upstream package build](evidence/upstream-packaging-retry.json), [fresh Chromium load](evidence/alternate-receipt-final/wallet-load.json) |
| Compatible metadata RPC responds | **PASS** | [curl and Chromium comparison](evidence/metadata-comparison.json), [testnet version/branch](evidence/native-metadata-decoded.json). The hosted browser endpoint still timed out; the documented loopback proxy works. |
| Real receipt appears in wallet balance/history | **PASS** | [Wallet control](evidence/alternate-receipt-final/wallet-control.json), [node inclusion cross-check](evidence/receipt-node-crosscheck.json) |

All new evidence is in this directory. The original README, acceptance results, source evidence, integrity manifest and original ZIP are preserved. [original-hashes.json](evidence/original-hashes.json) captures their starting hashes; [original-integrity.json](evidence/original-integrity.json) verifies preservation. No OHTTP adapter is part of this pass, and the original OHTTP checks remain unpassed.

## Recovery environment

The real short directory is `C:\Users\NewOwner\Documents\Codex\work\o1`, containing source `s`, RUSTUP_HOME `r`, CARGO_HOME `c`, CARGO_TARGET_DIR `t`, and temporary files `tmp`. These directories are ordinary directories, not junctions. The source is detached at `c0457174ecb99c67a9d081fba0be54f50d0cf012`.

The original failing library exists: its 269-character ordinary path failed, while an extended Windows path opened it. After a fresh toolchain installation, the same library is readable at a **186-character ordinary path**. Its SHA-256, size and actual compiler/linker paths are recorded in [minimal-builds.json](evidence/minimal-builds.json). Both the minimal host compile/run and minimal WASM compile passed before wallet packaging was attempted.

The initial rustup command installed the toolchain but returned 1 during its subsequent self-update check because the isolated CARGO_HOME has no rustup installation. Repeating with `--no-self-update` returned 0 and verified the installed components. Both logs are retained. The compiler actually used is Rust 1.89.0-nightly (`49a8ba068`, 2025-06-14), from pinned channel `nightly-2025-06-15`; Cargo is 1.89.0-nightly (`fc1518ef0`). The host linker is MSVC 14.44.35207's `Hostx64\x64\link.exe`.

Packaging tools: wasm-pack 0.15.1, wasm-bindgen CLI **0.2.100** matching the locked crate, just 1.59.0, Yarn 4.5.1, npm 10.9.4, Node 24.22.1, and existing clang 23.1.4 (the documented prerequisite is clang >=17). An existing LLVM installation was copied into real short directory `l`; no junction points back to it. An LLVM 17 installer was downloaded while checking prerequisites but was not installed or used. Git Bash supplies the shell for upstream recipes. Tool versions/hashes are in [versions.json](evidence/versions.json); release download hashes are in the tool-download JSON files. A crate-cache reuse attempt encountered a destination already created by Cargo; the running build fetched/extracted the dependencies it needed into the new CARGO_HOME.

The recovery does not run `cargo update`. Original lockfiles are compared before/after. New diagnostic harness/tool package files are distinct from the pinned wallet source and its lockfiles.

## Commands used

From the original experiment workspace, the environment is established by:

```powershell
. outputs/zcash-browser-ohttp-proof/continuation-01/scripts/env.ps1
```

The source was copied with Git, with no hardlinks to the original object files:

```powershell
git clone --no-hardlinks work/zcash-browser-ohttp-proof/sources/WebZjs-pr27 C:/Users/NewOwner/Documents/Codex/work/o1/s
git -C C:/Users/NewOwner/Documents/Codex/work/o1/s checkout --detach c0457174ecb99c67a9d081fba0be54f50d0cf012
```

The first sandboxed local clone failed to start Git's shell; the authorized unsandboxed local copy succeeded. It did not alter the original checkout.

```powershell
rustup toolchain install nightly-2025-06-15 --profile minimal --component rust-src --target wasm32-unknown-unknown --no-self-update
python outputs/zcash-browser-ohttp-proof/continuation-01/scripts/minimal.py
python outputs/zcash-browser-ohttp-proof/continuation-01/scripts/download-tools.py
python outputs/zcash-browser-ohttp-proof/continuation-01/scripts/prepare-binding.py
```

The download helpers use the saved official release metadata in the short directory; their selected URLs/hashes are retained as evidence. Yarn/npm and the matching Parcel version were installed in an isolated tooling package:

```powershell
pnpm --dir C:/Users/NewOwner/Documents/Codex/work/o1/js-tools add --save-exact @yarnpkg/cli-dist@4.5.1 npm@10.9.4 --ignore-scripts
pnpm --dir C:/Users/NewOwner/Documents/Codex/work/o1/js-tools add --save-exact parcel@2.13.3 --ignore-scripts
```

The wallet packaging command, executed in short source directory `s`, is:

```powershell
just --shell 'C:/Program Files/Git/bin/bash.exe' build
```

This is the upstream `just build` recipe, including wallet/keys/requests wasm-pack builds and `add-worker-module.sh`. The [first run](evidence/upstream-packaging.json) compiled the wallet but exited at the missing optimizer path. We installed official Binaryen 133 (`python scripts/optimizer.py`) and restored the exact committed Bash worker script bytes (`python scripts/restore-worker-eol.py`), replacing checkout CRLF only. [Optimizer identity](evidence/optimizer.json), [checkout evidence](evidence/worker-checkout-eol.json).

The same `just build` command [completed with exit 0](evidence/upstream-packaging-retry.json), producing all three usable JS/WASM packages and the worker module, with optimization enabled. [Complete packaging log](evidence/upstream-packaging-retry.log), [package file hashes and exact lock comparison](evidence/packaged-artifacts.json). The generated wallet WASM was 60,525,733 bytes. Both tracked lockfiles match the original package byte for byte and `git diff --exit-code` reports no tracked changes. wasm-pack printed a nonfatal notice that crate directories did not contain copies of the repository licenses; these artifacts were used locally, not published.

## RPC recovery

The documented hosted browser endpoint, `https://zjs.zec.rocks/testnet`, was tested with a five-byte empty-message gRPC-web POST. Default IPv6, explicit IPv4, and fresh Chromium page/worker requests timed out. [CLI evidence](evidence/rpc-cli.json), [IPv4](evidence/rpc-cli-ipv4.json), [Chromium](evidence/browser-metadata/browser-preflight.json). HTTP status is 0 when no response arrived; headers/body/RPC status remain absent, rather than being invented. HEAD/OPTIONS are not used to establish health.

Local proxy inspection found no HTTP_PROXY/HTTPS_PROXY/ALL_PROXY/NO_PROXY environment values, no system proxy schemes, and WinHTTP reported direct access. No credentials were printed. Local source IP details are omitted from retained curl metrics. [Proxy configuration evidence](evidence/proxy-configuration-full.json).

The native backend **already documented by the pinned justfile**, `testnet.zec.rocks:443`, responds over verified TLS and HTTP/2. [native-metadata.json](evidence/native-metadata.json) retains HTTP headers, trailer status and body; [decoded fields](evidence/native-metadata-decoded.json) show `chain_name=test`, branch `77190ad9`, lightwalletd `v0.6.1`, Zakura `1.7.0`, and observed height 4,606,132. The branch agrees with the candidate's NU7 testnet rules. Metadata compatibility alone does not demonstrate all wallet RPCs.

The upstream-documented grpcwebproxy alternative was installed from [its official release](https://github.com/improbable-eng/grpc-web/releases/tag/v0.15.0), bound only to loopback, and connected to that existing backend:

```powershell
grpcwebproxy.exe --backend_addr=testnet.zec.rocks:443 --backend_tls --run_tls_server=false --server_bind_address=127.0.0.1 --server_http_debug_port=3100 --allow_all_origins --backend_max_call_recv_msg_size=10485760
```

No `backend_tls_noverify` option is used. The browser-to-proxy leg is local HTTP; the remote leg uses TLS with certificate/hostname verification. This is the repository's existing proxy tool, not a new node or an OHTTP adapter. [process configuration](evidence/proxy-process.json), [download identity](evidence/proxy-download.json).

```powershell
python outputs/zcash-browser-ohttp-proof/continuation-01/scripts/rpc.py
python outputs/zcash-browser-ohttp-proof/continuation-01/scripts/rpc.py --ipv4 --name rpc-cli-ipv4
node outputs/zcash-browser-ohttp-proof/continuation-01/scripts/native-metadata.mjs outputs/zcash-browser-ohttp-proof/continuation-01/evidence/native-metadata.json
python outputs/zcash-browser-ohttp-proof/continuation-01/scripts/rpc.py --url http://127.0.0.1:3100/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetLightdInfo --name rpc-local-proxy
```

For Chromium, use the existing isolated Playwright 1.64.1 driver and Chromium 156.0.8078.4 from the original scratch setup:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $PWD 'work/zcash-browser-ohttp-proof/tools/browsers'
$env:RECOVERY_METADATA_ENDPOINT = 'http://127.0.0.1:3100/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetLightdInfo'
node outputs/zcash-browser-ohttp-proof/continuation-01/scripts/browser-metadata.mjs work/zcash-browser-ohttp-proof/browser-probe outputs/zcash-browser-ohttp-proof/continuation-01/evidence/browser-local-proxy
```

The local proxy returns HTTP 200 and a complete gRPC-web payload with terminal `grpc-status: 0` in curl, the Chromium page, and a dedicated Chromium worker. [Comparison assertions](evidence/metadata-comparison.json), [browser status/headers/body/timing](evidence/browser-local-proxy/browser-preflight.json), [network events](evidence/browser-local-proxy/browser-preflight-network.json).

## Direct receipt control

The harness in `harness/` uses the packaged WebWallet/keys APIs, explicitly selects `test`, and connects to the named loopback proxy. It initializes WASM and the two-worker thread pool, creates a fresh account using a seed generated in browser memory, and retains no wallet store. No existing browser profile is loaded. This is a diagnostic frontend for the existing compiled wallet library; it does not exercise MetaMask Snap UX or implement wallet/SDK features.

For the first run, the harness was prepared with `python scripts/prepare-harness.py` and bundled in `o1/h` with the pinned Parcel 2.13.3 command below. The [bundle](evidence/browser-bundle.json) exited 0; only the Python wrapper's console rendering of Parcel's Unicode checkmark failed. [Bundle output](evidence/browser-bundle.log). The first harness source is retained in `evidence/first-harness-source/`. The alternate harness uses the same package artifacts, prepared with `python scripts/prepare-harness.py --alternate` and bundled in `o1/h2` ([alternate bundle](evidence/browser-bundle-alternate.json)).

```powershell
node C:/Users/NewOwner/Documents/Codex/work/o1/js-tools/node_modules/parcel/lib/bin.js build recovery.html --dist-dir dist --no-optimize --no-scope-hoist
```

These flags control the separate Parcel harness bundle; the upstream WASM packages were already optimized by wasm-opt. The harness directly uses those packages rather than installing the full Snap/frontend workspace; Yarn 4.5.1 was installed and verified, but a full Yarn workspace install was not needed for this harness. The first bundle was served with `node scripts/serve.mjs C:/Users/NewOwner/Documents/Codex/work/o1/h/dist` on loopback port 3200. The last alternate run serves `h2/dist` in-process on a fresh loopback port. The exact Playwright invocations are in [first run](evidence/direct-control-run.json) and [last alternate run](evidence/alternate-final-run.json).

The first disposable account initialized and scanned to 4,606,169, with zero balance/history before funding. [Chromium load](evidence/wallet-load.json), [empty control](evidence/wallet-before-funding.json). [Valar's documented testnet faucet](https://github.com/valargroup/valar-testnet-faucet) queued one 0.125 TAZ request and then definitively rejected the unified address, with no txid or successful broadcast. [Funding result](evidence/funding.json). The reason returned was “the wallet cannot pay this address”; its exact underlying address/receiver rejection was not disclosed. No repeat request was sent to that address.

The alternate is the documented [zcash-faucet CLI](https://github.com/anukulpandey/zcash-faucet), pinned at 1.2.1, with a funded testnet server reporting 1.3.1 and proof-of-work mode. [Readiness evidence](evidence/alternate-faucet-readiness.json). The CLI is invoked by its real filesystem path because pnpm's symlink path did not satisfy the CLI's entry-point check. The older invocation exited without entering the CLI or sending a claim. The executable invocation uses no GitHub login, an isolated `XDG_CONFIG_HOME`, and a fresh unified testnet recipient. A transparent recipient was considered but never funded; the pinned incoming history reader iterates shielded notes. The harness retains the wallet's raw transaction ID and reverses its bytes for comparison with the faucet's canonical ID, as required by the pinned `TxId` implementation. A receipt requires that ID at a mined height in wallet history together with the recognized balance.

```powershell
pnpm --dir C:/Users/NewOwner/Documents/Codex/work/o1/js-tools add --save-exact zcash-faucet@1.2.1 --ignore-scripts
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $PWD 'work/zcash-browser-ohttp-proof/tools/browsers'
$env:RECOVERY_ALTERNATE_FUNDING = '1'
node outputs/zcash-browser-ohttp-proof/continuation-01/scripts/wallet-browser.mjs work/zcash-browser-ohttp-proof/browser-probe outputs/zcash-browser-ohttp-proof/continuation-01/evidence/alternate-receipt-final
```

The combined start-and-run command for the alternate was initially rejected because automatic review timed out. It did not execute. A separately started sandboxed static server then timed out when accessed by the unsandboxed browser; that run created no account and sent no claim. Serving the static bundle in the browser driver's own process resolved the launch problem. The later CLI real-path correction resolved the no-op invocation. These retries reused no wallet state or prior faucet claim.

The driver records only public test address/transaction references, balances, heights and network metadata. It omits seeds, private/viewing keys, authentication values, request bodies, wallet stores and persistent browser profiles. It closes the temporary Chromium context at the end.

The alternate faucet sent **0.1 TAZ** (10,000,000 zatoshi) to the new account, whose birthday was **4,606,211**. Before funding, its balance was zero and history empty. At **block 4,606,216** the wallet showed **10,000,000 zatoshi of spendable Ironwood balance** and one confirmed `Received` entry for that amount. The faucet's canonical transaction ID was `4423d42759802a20b55b3178839b116cfb6f9be4b90e34ecb9c84e1a604ac066`. The node returned the same inclusion height with HTTP 200 and `grpc-status: 0` via verified native gRPC. [Funding output](evidence/alternate-receipt-final/funding.json), [scan sequence](evidence/alternate-receipt-final/wallet-scans.json), [wallet result](evidence/alternate-receipt-final/wallet-control.json), [node cross-check](evidence/receipt-node-crosscheck.json).

```powershell
node outputs/zcash-browser-ohttp-proof/continuation-01/scripts/verify-receipt.mjs outputs/zcash-browser-ohttp-proof/continuation-01/evidence/alternate-receipt-final/wallet-control.json outputs/zcash-browser-ohttp-proof/continuation-01/evidence/receipt-node-crosscheck.json
```

The [direct network trace](evidence/alternate-receipt-final/wallet-network.json) and [RPC inventory](evidence/wallet-rpc-inventory.json) record the browser's actual wallet requests and worker events. The observed RPCs were GetLatestBlock, GetTreeState, GetSubtreeRoots, GetAddressUtxosStream and GetBlockRange. The read-only inclusion query above was separate from the browser wallet run. Both temporary persistent loopback services were [stopped](evidence/service-cleanup.json), and the final in-process server closed with the browser driver.

The direct receive prerequisite is now established for this candidate and network route. The separate OHTTP integration and acceptance checks still have no execution evidence. This continuation does not change the original OHTTP statuses.
