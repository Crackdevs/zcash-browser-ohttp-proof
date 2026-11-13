# Continuation 02: browser-side OHTTP transport

This is a local, bounded test of the pinned WebZjs library in Chromium, with a diagnostic harness rather than the MetaMask Snap or a production wallet. See [acceptance.json](acceptance.json) for observed outcomes and [DECISION.md](DECISION.md) for the decision.

**Continuation 01 correction:** the successful account birthday was **4,606,214**, not **4,606,211** as printed in the earlier README. The authoritative [Continuation 01 result](../continuation-01/results.json) and [successful direct control](../continuation-01/evidence/alternate-receipt-final/wallet-control.json) show the correct height. The earlier account was not reused. [Preservation check](evidence/previous-verification.json).

## Pins and wire format

| Layer | What ran |
| --- | --- |
| WebZjs | Detached PR #27 candidate `c0457174ecb99c67a9d081fba0be54f50d0cf012`; MIT OR Apache-2.0; unchanged Cargo and Yarn locks. `tonic`/Prost 0.14.3, vendored `tonic-web-wasm-client` 0.8.0. |
| Browser, OHTTP and HPKE | Chromium 156.0.8078.4 (Playwright 1.64.1), npm `ohttp-ts` 0.6.2, `bhttp-ts` 0.6.1, `hpke` 1.1.7. npm integrity is pinned in [pnpm-lock.yaml](pnpm-lock.yaml); the npm manifest does not declare a Git commit. |
| Relay | The unmodified Node handler from [thibmeu/ohttp-relay at 75e0a76](https://github.com/thibmeu/ohttp-relay/tree/75e0a766ded56fe4ed8562d8953160fd35b171b0), MIT; copied blob equivalence recorded in the [inventory](evidence/inventory.json). |
| Gateway | Local [HTTP glue](src/services.mjs) calls the same pinned npm library's `ChunkedOHTTPServer`. This does not run the separate `thibmeu/ohttp-gateway` or `zodl-ohttp` process or claim interoperability with them. |
| Backend | Recovered loopback `grpcwebproxy` v0.15.0, verified TLS to the documented [Zec.rocks testnet endpoint](https://zec.rocks/); pinned wallet explicitly selects `test`. See [proxy arguments](evidence/component-02/component-events.jsonl) and the original [network profile](../VERSIONS.md). |
| Build | Short `o1` layout from Continuation 01. Rust `nightly-2025-06-15`, wasm-pack 0.15.1, wasm-bindgen 0.2.100, Binaryen 133, Parcel 2.13.3, Node 24.22.1, pnpm 11.25.0, esbuild 0.28.2. [Upstream packaging](evidence/packaging.json), [Chromium bundle](evidence/parcel-retry.log). |

`Chromium page or dedicated wallet worker → relay :3111 → gateway :3112 → grpcwebproxy :3100 → native TLS gRPC testnet :443`. The browser applies HPKE using X25519/HKDF-SHA256 and AES-128-GCM; the relay receives opaque `message/ohttp-chunked-req` and returns `message/ohttp-chunked-res`. This is the implementation of [Chunked OHTTP draft -08](https://datatracker.ietf.org/doc/html/draft-ietf-ohai-chunked-ohttp-08) documented by the npm package, with BHTTP and **binary gRPC-web** inside. Native HTTP/2 gRPC begins at the proxy's backend leg. No gRPC-web text mode or compressed RPC messages are used. The browser sends only bounded unary uploads and receives incremental response data.

The run trusts the locally controlled application origin `http://127.0.0.1:3110`, which supplies a public config and its SHA-256 pin from the gateway instance it launched. The client rejects a mismatch before relay access, and does not query the relay for a key. Keys are generated in memory per run (normal key ID 7, wrong-key fixture ID 8). The pin is anchored in the trust placed in the local app origin, which also serves the JavaScript; it is not an independently authenticated remote configuration system. Evidence contains only the public-config digest. Relay and gateway are distinct loopback listeners in one controlled Node process. Header stripping and routing observations do not establish independent operators, non-collusion, traffic analysis resistance, or production privacy protection.

## Exact patch and status handling

- [wallet.patch](wallet.patch) is the complete diff against the pinned checkout. `fetch.rs` selects the adapter only for the logical `http://wallet-rpc.invalid/` origin and errors if the named hook is absent in that realm. It leaves explicitly selected direct mode alone. No global `fetch` replacement is used.
- `add-worker-module.sh` installs the same adapter in the generated dedicated worker entry; [app.js](src/app.js) explicitly installs it on the page. The wallet package and keys package are the upstream WASM build outputs. No wallet storage, network rules, scanning, address, proving, or send logic was reimplemented.
- [adapter.js](src/adapter.js) re-emits each gRPC-web data frame incrementally. It holds the terminal trailer until the BHTTP reader drains the OHTTP stream and verifies the authenticated end; a valid inner status cannot override an invalid outer ending. It normalizes a true trailers-only response into a final in-body trailer after authenticated completion. The per-request abort signal follows the fetch, decoder, relay exchange, and gateway upstream fetch.
- `response_body.rs` and `call.rs` make the vendored Rust decoder emit an actual `Frame::trailers` to Tonic and require a complete frame and EOF, with the existing trailers-only compatibility kept. The old built candidate reproduced loss of final status 13 after a valid data frame; the patched wallet surfaces the RPC error. [Old](evidence/legacy-01/legacy-results.json), [new](evidence/wallet-qualify-01/qualify-results.json). The pinned candidate already carried its own `trailers-only.patch`. Upstream [issue #99](https://github.com/devashishdxt/tonic-web-wasm-client/issues/99) and [PR #113](https://github.com/devashishdxt/tonic-web-wasm-client/pull/113) describe empty-body trailers-only handling; no proposed upstream commit was cherry-picked. The experiment's final OHTTP authentication gate is separate.
- The [gateway glue](src/services.mjs) authenticates the bounded upload before calling the proxy, uses an inner header allowlist, and streams backend responses. Fault branches only accept controlled reads. The optional padding for fault injection puts the valid inner trailer before a later encrypted chunk so that the test exercises the final authentication boundary.

## Reproduce from the existing workspace

Run from the original projectless workspace with the Continuation 01 toolchain, Chromium install, relay checkout and packaged direct harness available. For a separate environment first reproduce [Continuation 01](../continuation-01/README.md). No mainnet path is configured. Use a fresh evidence destination; existing run directories are refused.

```powershell
$p = (Resolve-Path outputs/zcash-browser-ohttp-proof/continuation-02).Path
$prev = (Resolve-Path outputs/zcash-browser-ohttp-proof/continuation-01).Path
$short = 'C:/Users/NewOwner/Documents/Codex/work/o1'
$o = "$short/o2"
$d = (Resolve-Path work/zcash-browser-ohttp-proof/browser-probe).Path
$env:PLAYWRIGHT_BROWSERS_PATH = (Resolve-Path work/zcash-browser-ohttp-proof/tools/browsers).Path
. "$prev/scripts/env.ps1"

# Only when creating the separate patched checkout (do not patch o1/s):
git clone --no-hardlinks -c core.autocrlf=false "$short/s" "$short/s2"
git -C "$short/s2" checkout --detach c0457174ecb99c67a9d081fba0be54f50d0cf012
git -C "$short/s2" apply "$p/wallet.patch"
python "$prev/scripts/run.py" --cwd "$short/s2" --out "$p/evidence/packaging-repro.json" --timeout 3600 -- just --shell "C:/Program Files/Git/bin/bash.exe" build

New-Item -ItemType Directory -Force $o | Out-Null
Copy-Item "$p/package.json","$p/pnpm-lock.yaml" $o
pnpm --dir $o install --frozen-lockfile --ignore-scripts
python "$p/scripts/stage.py"
node "$o/run.mjs" legacy "$p/evidence/legacy-repro" "$short/h2/dist" $d
node "$o/run.mjs" component "$p/evidence/component-repro" "$o/component-dist" $d

python "$p/scripts/stage.py" --wallet
Push-Location "$o/app"
node "$short/js-tools/node_modules/parcel/lib/bin.js" build index.html --dist-dir dist --no-optimize --no-scope-hoist
Pop-Location
node "$o/run.mjs" qualify "$p/evidence/qualify-repro" "$o/app/dist" $d
node "$o/run.mjs" wallet-faults "$p/evidence/wallet-faults-repro" "$o/app/dist" $d
```

The read-only driver retains browser requests, dedicated-worker RPC telemetry, relay ingress, gateway ingress/ending, and upstream RPC outcomes as JSON Lines. The browser route guard is an extra tripwire: a request to an unapproved destination is recorded as an attempted bypass, even if blocked. The tests do not infer a pass merely from the guard. No persistent Chromium profile, wallet store, seeds, gateway keys or faucet credentials are written into the evidence.

The `wallet` phase uses a fresh in-memory account, the [pinned proof-of-work faucet CLI](https://github.com/anukulpandey/zcash-faucet) 1.2.1, and the existing WebZjs wallet authorization methods. It requires successful component and legacy evidence, and runs the worker check before requesting funds. It requires `PROOF_ALLOW_TESTNET_PAYMENT=1` and creates exclusive intent files **before** dispatch. The evidence destination's parent is the one-attempt boundary. Do not remove the intent files or repeat a claim or send to work around a timeout. For an independent run, use an isolated experiment directory with fresh disposable state, then use the full-run invocation below. After any ambiguous send it queries only the original canonical transaction ID.

```powershell
$env:PROOF_ALLOW_TESTNET_PAYMENT = '1'
node "$o/run.mjs" wallet "$p/evidence/wallet-repro" "$o/app/dist" $d "$p/evidence/component-repro/component-results.json" "$p/evidence/legacy-repro/legacy-results.json"
```

Verification tools: [build and previous evidence inventory](scripts/inventory.py); [logs and transaction references](evidence/).

## Retained run notes

The first component run checked an unsuitable `/metrics` readiness path and stopped before launching Chromium. The successful run uses a framed `GetLatestBlock` POST and verifies the actual response. The first Parcel bundle attempt hit a local SWC native cache permission issue; the same pinned Parcel build ran successfully with the recovered environment outside the restricted cache. No source, SDK, network, or dependency upgrade was used to fix these two setup issues. See [first component start](evidence/component-01/component-results.json), [working component run](evidence/component-02/component-results.json), [first Parcel log](evidence/parcel.log), and [successful Parcel log](evidence/parcel-retry.log).

The live wallet used `GetLatestBlock`, `GetSubtreeRoots`, `GetAddressUtxosStream`, `GetBlockRange`, `GetTreeState`, and `SendTransaction`. The harness separately issued `GetBlock` to verify the scan checkpoint and `GetTransaction` for the funded receipt. The wallet's local history lookup itself did not issue `GetTransaction`. [Per-realm counts and checks](acceptance.json); [live browser, relay, gateway, and backend events](evidence/wallet-live-01/wallet-events.jsonl).
