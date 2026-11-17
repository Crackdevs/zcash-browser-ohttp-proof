# WebZjs trailer follow-up review

Review the [incremental patch](webzjs-trailer-follow-up.patch) against WebZjs commit `a1891413e5caa33bf3747ab478b9f65cbe0561a1`. The recorded follow-up commit is `46dccdcd9e090f9cc07f001c3b1d9f10f2627bfb`. The patch waits for HTTP body EOF before reporting the gRPC-web trailer and validates that the trailer has exactly one `grpc-status`. [Draft PR](DRAFT-PR.md) · [Acceptance report](acceptance.json).

The recorded runs include 25 passing native tests, six expected failures on the base decoder with the new tests, and 15 passing Chromium fixtures using the compiled Rust/WASM client. The separate Node and Chromium network probes measure read-only gRPC-web calls. The acceptance report links to raw logs and records the pre-existing workspace WASM failure and the standalone build that passed. [Reproduction and scope](README.md) · [Raw evidence](evidence/).

## Reproduce on another machine

Use a fresh checkout containing the exact base commit. From the extracted archive directory, set `REPO` to the checkout path and run these commands in a shell with Git.

```bash
git -C "$REPO" switch --detach a1891413e5caa33bf3747ab478b9f65cbe0561a1
git -C "$REPO" switch -c review/grpc-web-trailers
git -C "$REPO" apply --check "$PWD/webzjs-trailer-follow-up.patch"
git -C "$REPO" apply "$PWD/webzjs-trailer-follow-up.patch"
git -C "$REPO" add vendor/tonic-web-wasm-client
git -C "$REPO" commit -m "Apply WebZjs trailer review patch"
```

The WASM harness reads the source from the local commit. Use Rust `nightly-2025-06-15` with rustfmt, Clippy, and the `wasm32-unknown-unknown` target, plus wasm-bindgen CLI **0.2.100**. Populate the Cargo cache with the workspace's locked dependencies before running the offline harness build. Use a short writable checkout and Cargo path on Windows. The historical toolchain link in `README.md` points to a separate experiment outside this archive.

For the Chromium scripts, install Node **24.22.1** and prepare the included Playwright project. Point the `DRIVER` argument in the reproduction instructions to this project. [Playwright pins](review/playwright/pnpm-lock.yaml).

```bash
pnpm --dir review/playwright install --frozen-lockfile --ignore-scripts
pnpm --dir review/playwright exec playwright install chromium
```

The original follow-up files in this archive are byte-for-byte copies, including the raw logs and their recorded workstation paths. Toolchain binaries, generated WASM, caches and the full upstream checkout are external prerequisites. The historical integrity helper expects the earlier proof archives. Verify the extracted files with `sha256sum -c SHA256SUMS.txt`. License notices are included under [licenses/](licenses/).
