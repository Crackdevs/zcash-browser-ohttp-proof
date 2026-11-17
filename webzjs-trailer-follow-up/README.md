# WebZjs gRPC-web trailer follow-up

Local branch `fix/grpc-web-trailer-completion` in `C:/Users/NewOwner/Documents/Codex/work/w28`, commit `46dccdcd9e090f9cc07f001c3b1d9f10f2627bfb`. Its parent is `a1891413e5caa33bf3747ab478b9f65cbe0561a1`, the verified open PR #28 head on `deegalabs/WebZjs:fix/grpc-web-trailers`. The target branch of #28 was `red-dev-inc/WebZjs:feat/nu7-portable-keys`. Apply the incremental patch to the #28 head. If #28 lands by squash merge, rebase the follow-up onto the commit that contains it. [PR state](evidence/sources/pr-28.json) · [Local branch and lock verification](evidence/branch.json) · [Incremental patch](webzjs-trailer-follow-up.patch) · [Draft PR](DRAFT-PR.md).

The decoder delivers complete data frames and waits for HTTP body EOF before forwarding one terminal trailer. Later bytes and transport errors prevent success. It requires exactly one syntactically valid `grpc-status` in a body trailer, counts normalized header names, and leaves well-formed values to Tonic's bytewise status decoder. Codes 0–16 retain their meaning and unfamiliar numeric values map to `Unknown`, including values too large for a machine integer. The matching HTTP-header-only results are an empty successful stream for status 0, a missing-message error for a unary response with status 0 and no message, and the server's status for a nonzero code. [gRPC-web protocol](https://github.com/grpc/grpc/blob/master/doc/PROTOCOL-WEB.md) · [gRPC status codes](https://github.com/grpc/grpc/blob/master/doc/statuscodes.md).

## Test and reproduction results

| Check | Result | Evidence |
| --- | --- | --- |
| Original native suite at #28 | 15 passed | [Baseline](evidence/native-baseline.log) |
| Same decoder with the follow-up tests | 19 passed, 6 failed as expected | [Test-only run](evidence/native-regressions-on-base.log), [replay from the exported patch](evidence/native-regressions-exported-patch.log) |
| Patched native suite | All 25 passed | [Patched run](evidence/native-patched.log) |
| Format, native and WASM Clippy | Passed with the pinned toolchain | [Formatting](evidence/rustfmt.json), [native Clippy](evidence/clippy-native.json), [WASM Clippy](evidence/clippy-wasm.json) |
| Three vendor patches and existing test directory | All 18 source files match byte for byte | [Vendoring replay](evidence/vendoring.json) |
| Public Node v24.22.1 on Windows | 17 sequential POSTs, 15 recorded calls passed | [Node command](evidence/public-node/node-run.json), [raw results](evidence/public-node/node-raw.json), [conformance](evidence/public-node/conformance.json) |
| Public Chromium 156.0.8078.4 on Windows | 17 sequential POSTs, 15 recorded calls passed with normal CORS | [Chromium raw results](evidence/public-chromium/chromium-public-raw.json), [conformance](evidence/public-chromium/conformance.json) |
| Patched Rust/WASM browser harness | All 15 Chromium fixture checks passed | [Fixture results](evidence/wasm-chromium/chromium-wasm.json), [WASM build](evidence/wasm-harness-build.json), [build manifest](evidence/harness-build-manifest.json) |

The public endpoint was `https://zcash-mainnet.chainsafe.dev`. Node observed tip **3,581,593** and streamed blocks **3,581,573–3,581,582**. Chromium observed tip **3,581,603** and verified streamed blocks **3,581,583–3,581,592**. In both runs all recorded calls returned HTTP 200 and binary gRPC-web frames followed by status 0, body EOF and no trailing bytes. The maximum observed trailer-to-EOF intervals were **0.3634 ms** in Node and **1.7 ms** in Chromium. Those timings describe one endpoint and are separate from both the decoder rules and the probe deadlines. Browser Fetch exposes only headers permitted by CORS. The browser verified the status in the response body directly.

Daniel/Konclave authored the original timing script and ran it on Linux with Node v24.21.0. The unchanged script is reproduced with its MIT OR Apache-2.0 SPDX notice. The original code fragment matches the retained comment byte for byte. A separate preload bounded runtime requests for our Node run. The Chromium derivative omits the custom Node User-Agent, uses normal cross-origin Fetch and records the Chromium-specific results. Protobuf request fields were verified against the exact WebZjs #28 head's `protos/service.proto` and `compact_formats.proto`. The validator separately checks framing, status, EOF, trailing bytes and outgoing request encoding. [Daniel's script and results](https://github.com/Crackdevs/zcash-browser-ohttp-proof/issues/1#issuecomment-6932918641) · [Unchanged script](repro/grpcweb-trailer-check.mjs) · [Pinned proto check](evidence/sources/schema-check.json).

## Rerun the checks

Start from the local branch or apply the patch to a fresh checkout of the base commit with `git apply /path/to/webzjs-trailer-follow-up.patch`. Use `nightly-2025-06-15` with the `wasm32-unknown-unknown` target, rustfmt and Clippy, and install the matching wasm-bindgen CLI **0.2.100**. Native commands use the existing workspace lock. On Windows use a short writable Rust and Cargo layout. The earlier investigation's short-path setup was reused for these runs. [Toolchain setup](../zcash-browser-ohttp-proof/continuation-01/README.md).

```bash
# In a clean checkout at a1891413e5caa33bf3747ab478b9f65cbe0561a1
cargo test --locked -p tonic-web-wasm-client

# In a second checkout at the same base, replay the regression tests against the base decoder.
git apply --include='vendor/tonic-web-wasm-client/src/body_stream.rs' \
  --include='vendor/tonic-web-wasm-client/src/response_body/tests.rs' \
  /path/to/webzjs-trailer-follow-up.patch
cargo test --locked -p tonic-web-wasm-client

# In the patched checkout, or on the local follow-up branch.
cargo test --locked -p tonic-web-wasm-client
cargo clippy --locked -p tonic-web-wasm-client --all-targets -- -D warnings
rustfmt +nightly-2025-06-15 --check --edition 2021 \
  vendor/tonic-web-wasm-client/src/body_stream.rs \
  vendor/tonic-web-wasm-client/src/response_body.rs
```

From the deliverable directory, use the following commands with new scratch directories. `REPO` points to the committed local follow-up, `DRIVER` to a Node project with Playwright **1.64.1** and its Chromium installed, and `BROWSER_WASM` to the destination for generated WASM and bindings. Use Node **24.22.1** and Python **3.11.9** to match this run. Set `PLAYWRIGHT_BROWSERS_PATH` if using a non-default browser install. Preserve original evidence by writing to a new `RUN` directory.

```bash
python repro/run-node.py "$RUN/public-node"
node repro/run-chromium-public.mjs "$DRIVER" "$RUN/public-chromium"
python repro/validate-public.py "$RUN"

# Build the minimal browser harness and run loopback-only fixtures.
python repro/build-harness.py "$REPO" "$SCRATCH" "$BROWSER_WASM"
node repro/run-wasm-browser.mjs "$DRIVER" "$BROWSER_WASM" "$RUN/wasm-chromium"

# Reproduce the vendored source from the published 0.8.0 .crate archive.
python repro/verify-vendoring.py "$REPO" "$CRATE_ARCHIVE" "$VENDOR_SCRATCH" "$RUN/vendoring.json"
```

The bare workspace command `cargo build --locked --target wasm32-unknown-unknown -p tonic-web-wasm-client` enables native Tokio networking and fails in `mio` on both commits. The harness builds a standalone snapshot of the committed vendored crate. It creates a reduced scratch lock from a copy of `Cargo.lock`, checks every selected package's name, version, source and checksum against the workspace, then builds the library and probe with `--locked --offline`. All 51 selected package identities came from the workspace. The original lockfiles and CI setup are untouched. The reproduction requires the corresponding Cargo dependencies already in cache. [Base workspace failure](evidence/wasm-workspace-base.log) · [Patched workspace failure](evidence/wasm-build.log) · [Successful recorded build](evidence/wasm-harness-build.log) · [Scratch lock](evidence/harness.Cargo.lock).

The vendor replay uses the [published 0.8.0 archive](https://static.crates.io/crates/tonic-web-wasm-client/tonic-web-wasm-client-0.8.0.crate), SHA-256 `898cd44be5e23e59d2956056538f1d6b3c5336629d384ffd2d92e76f87fb98ff`, confirmed against the [crates.io index](https://index.crates.io/to/ni/tonic-web-wasm-client). It applies `trailers-only.patch`, `trailers.patch`, and `trailers-completion.patch` in sequence and copies the test directory as documented in `VENDORED.md`.

## Limits and attribution

Tonic 0.14.3 can skip a body when an HTTP-header status is present. Conflicting header and body statuses therefore retain Tonic's existing precedence. Repeated metadata other than `grpc-status` still uses the last value. Existing text/base64 parsing, compressed trailers, frame size limits and Tonic's invalid binary status-details handling are outside these checks. The public runs measure binary gRPC-web from one backend. The patched Rust/WASM client is exercised against loopback fixtures. Public traffic consists only of read RPCs. [Upstream repeated-key discussion](https://github.com/devashishdxt/tonic-web-wasm-client/pull/117).

Crackdevs found, reproduced and first fixed the lost trailer in the browser proof. Daniel/Konclave prepared #28, preserved its upstream attribution, and proposed and measured this follow-up. The existing tests and capture fixtures are retained from #28. The transport hook is tracked separately. Prior proof files and archives were checked against their retained SHA-256 manifests. [Crackdevs implementation](https://github.com/Crackdevs/zcash-browser-ohttp-proof/blob/main/continuation-02/wallet.patch) · [Follow-up discussion](https://github.com/Crackdevs/zcash-browser-ohttp-proof/issues/1#issuecomment-6898562403) · [WebZjs #30](https://github.com/red-dev-inc/WebZjs/issues/30) · [Historical evidence integrity](evidence/historical-integrity.json).

Maintainers can review this as a stacked change or retarget it when #28 lands. A change to the existing default deadline behavior would be a separate compatibility decision.
