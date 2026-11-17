# fix(vendor): validate gRPC-web body trailers before completion

## Changes

A response carrying `grpc-status: 0` in its body trailer can still fail if the HTTP body resets or sends more bytes. Keep delivering data frames as they arrive and forward the terminal trailer only after clean body EOF. Surface later bytes and stream failures as errors.

Require exactly one decimal `grpc-status` in a body trailer, including after header-name normalization. Tonic preserves recognized codes and maps unfamiliar numeric values to `Unknown` without an integer conversion. Valid empty trailers-only streams still finish successfully. An empty successful unary response still reports a missing message.

This stacks on WebZjs #28 at `a1891413e5caa33bf3747ab478b9f65cbe0561a1`. Tonic's existing precedence in conflicting HTTP-header/body statuses and duplicate handling for other metadata remain outside this change. [WebZjs #28](https://github.com/red-dev-inc/WebZjs/pull/28) · [Upstream #117](https://github.com/devashishdxt/tonic-web-wasm-client/pull/117).

## Tests

- `cargo test --locked -p tonic-web-wasm-client` passes 25 tests. Six follow-up regressions fail on the unmodified #28 decoder with the same test-only changes applied.
- Rust formatting and Clippy checks, a pinned WASM build, and replay of the three vendoring patches verified the source and dependency pins.
- The compiled Rust/WASM client ran unary and streaming Chromium fixtures for delayed EOF, cancellation, transport failure, bad trailers and empty trailers-only responses. Separate read-only Node and Chromium measurements found clean EOF and no trailing bytes in all 15 recorded calls per runtime at the documented public endpoint.

## Issues

Follow-up to the Crackdevs proof and Daniel/Konclave's review. Thanks to Crackdevs for the original finding and decoder work, and Daniel/Konclave for the #28 backport, tests and public timing check. [Follow-up thread](https://github.com/Crackdevs/zcash-browser-ohttp-proof/issues/1#issuecomment-6898562403) · [Original measurements](https://github.com/Crackdevs/zcash-browser-ohttp-proof/issues/1#issuecomment-6932918641).
