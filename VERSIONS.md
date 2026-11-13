# Pinned starting point and network profile

Inspected 2026-11-10. The machine-readable authority for source identities is [pins.json](pins.json); copied manifests/lockfiles and SHA-256 values are in [source-inventory.json](evidence/source-inventory.json). All six worktrees were clean at inventory time. Package version fields below do not by themselves establish a published release.

| Source | Exact commit | Version field | Repository license |
|---|---|---|---|
| [WebZjs main](https://github.com/red-dev-inc/WebZjs/tree/317d790f4a3af9da08f191c17e7c1b4269417ab4) | `317d790f4a3af9da08f191c17e7c1b4269417ab4` | wallet Rust crate 0.1.0; web UI 0.0.0 | MIT OR Apache-2.0; root JS manifest declares Apache-2.0 |
| [WebZjs PR #27 head](https://github.com/red-dev-inc/WebZjs/tree/c0457174ecb99c67a9d081fba0be54f50d0cf012) | `c0457174ecb99c67a9d081fba0be54f50d0cf012` | same wallet/UI fields | MIT OR Apache-2.0; vendored transport retains its licenses |
| [ohttp-ts](https://github.com/thibmeu/ohttp-ts/tree/4f4f277f64bf002af2e10da6daeb773f70d8e6c8) | `4f4f277f64bf002af2e10da6daeb773f70d8e6c8` | 0.6.2 | MIT |
| [ohttp-relay](https://github.com/thibmeu/ohttp-relay/tree/75e0a766ded56fe4ed8562d8953160fd35b171b0) | `75e0a766ded56fe4ed8562d8953160fd35b171b0` | 0.0.1, private package | MIT |
| [ohttp-gateway](https://github.com/thibmeu/ohttp-gateway/tree/21593a4b6777d85c3475ff948e62b4216770462b) | `21593a4b6777d85c3475ff948e62b4216770462b` | 0.0.1, private package | MIT |
| [zodl-ohttp](https://github.com/zodl-inc/zodl-ohttp/tree/478a4e80458f57379b813d3970d2188813d4c4a9) | `478a4e80458f57379b813d3970d2188813d4c4a9` | client 1.0.1; gateway/relay-simulator 1.0.0 | AGPL-3.0-only; commercial/exception documents retained |

[PR #27](https://github.com/red-dev-inc/WebZjs/pull/27) was **open, merged=false, merged_at=null**, both initially and at the final check, 21:12:32 UTC. Its head is an **unreleased candidate for this experiment**. The API's `merge_commit_sha` `f5eef9815349640a6ee3db47326bf10018fe155a` is a test merge, not proof of merge or release. The upstream CI logs checked out that test merge; they are not local results for the detached head. Evidence: [initial](evidence/pr27-initial.json), [recheck](evidence/pr27-final.json), [CI](evidence/pr27-ci.json).

## Dependency versions

Complete versions/checksums are retained in the lockfiles and inventory. [Selected dependency summary](evidence/selected-dependencies.json) distinguishes the different lockfiles; [resolved wallet licenses](evidence/wallet-resolved-dependency-licenses.json) records Cargo-reported SPDX fields. This is an inventory, not a transitive license audit. Rust dependencies of unbuilt projects were not downloaded solely to resolve missing license metadata.

| Component | Exact relevant dependencies |
|---|---|
| WebZjs main | wasm-bindgen 0.2.100; js-sys 0.3.77; tonic-web-wasm-client 0.8.0; tonic/prost 0.14.3; zcash_client_backend 0.24.0-rc.1; zcash_protocol 0.10.0; zcash_primitives/proofs 0.29.0 |
| WebZjs main Git dependencies | librustzcash `0a2c6d1ae6274e6af2291e312f7b7459516882f2`; orchard 0.15.0 at `3bd2b736d1273226595773265313fc3f3428af16`; zcash_client_memory 0.0.0 at `1feb38d92d214ec65d410a01c0f9da42b787f76b` |
| WebZjs PR #27 | wasm-bindgen 0.2.100; js-sys 0.3.77; tonic/prost 0.14.3; zcash_client_backend 0.25.0; zcash_protocol 0.11.0; zcash_primitives/proofs 0.31.0; zcash_keys 0.17.0; orchard 0.16.0; pczt 0.10.0; vendored tonic-web-wasm-client 0.8.0 with trailers-only patch |
| PR Git dependency | zcash_client_memory 0.0.0 at `b4c8f0d33c65c5bab4155ddeba4f201ea2d28c43`, despite the manifest's moving `feat/snap-nu7` branch name |
| Both WebZjs revisions | wasm_thread `9e432077948d927d49373d1d039c23447d3648df`; Yarn 4.5.1 in packageManager; complete JS resolutions in yarn.lock |
| ohttp-ts client and thibmeu gateway | hpke 1.1.7; bhttp-ts 0.6.1; quicvarint 0.2.1; gateway ohttp-ts 0.6.2, Hono 4.13.9, @hono/node-server 2.1.1, @panva/hpke-noble 1.1.7 |
| thibmeu relay | ohttp-ts 0.6.2; bhttp-ts 0.6.1; quicvarint 0.2.1; lockfile resolves hpke 1.1.4 (relay forwards opaque bytes; it does not use HPKE to decrypt) |
| ZODL relevant locks | hpke 0.13.0; bhttp 0.5.4; aes-gcm 0.10.3; hkdf 0.12.4; gateway tonic 0.12.3/prost 0.13.5; client reqwest 0.12.28; ed25519-dalek 2.2.0 |
| Browser diagnostic | Playwright 1.64.1; Chromium for Testing 156.0.8078.4, Playwright revision 1248 |

## Build commands and actual toolchain

Observed host: Windows, Git 2.53.0.windows.2, Node v24.22.1, pnpm 11.25.0, initial Rust/Cargo 1.89.0. The repository-pinned `nightly-2025-06-15` plus rust-src and wasm32-unknown-unknown were installed in an isolated work directory. Its compiler reports `rustc 1.89.0-nightly (49a8ba068 2025-06-14)` ([version probe](evidence/pinned-rust-version.json)). Actual compiler/linker output is retained in [build evidence](evidence/baseline-cargo-build.json). MSVC 14.44.35207 was found by Rust despite `link.exe` not being on the initial PATH. The initial tool inventory therefore means **not on PATH**, not necessarily absent from disk.

`just`, `wasm-pack`, Yarn, clang and npm were not on PATH. Their local executable versions are unknown/not run. Docker was unavailable and WSL reported not installed. No node/indexer was provisioned. CI attempted wasm-pack 0.15.1 but its install failed with EXDEV; that is not a local installation.

Upstream commands below are recorded from source; except the explicit Cargo attempt in README they were **not executed**. They require their upstream prerequisites. Do not infer a successful build from their presence here.

```sh
# WebZjs main or candidate; Rust toolchain comes from rust-toolchain.toml.
# Upstream requires clang >=17, just, wasm-pack, Yarn 4.5.1.
just build
yarn install --immutable
# Explicit testnet build for the existing UI and Snap, never the default mainnet build:
NETWORK=test LIGHTWALLETD_PROXY=https://zjs.zec.rocks/testnet yarn web-wallet:build
cd packages/web-wallet
NETWORK=test LIGHTWALLETD_PROXY=https://zjs.zec.rocks/testnet yarn dev

# ohttp-ts: use its own lockfile
npm ci
npm run build
npm test
# Browser suite includes Chromium and Firefox; not run here.
npm run test:browser

# thibmeu relay and gateway, each in its own checkout
npm ci
npm run build
npm test
# Local runtime command declared by each package:
npm start

# ZODL: each component has its own Cargo.lock
cargo build --locked --release --manifest-path gateway/Cargo.toml
cargo build --locked --release --manifest-path relay-simulator/Cargo.toml
cargo test --locked --manifest-path client/Cargo.toml
cargo build --locked --release --manifest-path e2e-client/Cargo.toml
```

The thibmeu Node scripts listen on `0.0.0.0` by default; a future controlled run must use a loopback-only wrapper or explicit local isolation. The gateway needs an ephemeral private configuration seed; the browser must receive only the pinned public key configuration. No key or service configuration was generated in this run. Do not use README deployment buttons or default public target URLs for this experiment.

## Network profile: intended testnet, live profile unverified

The candidate accepts `network="test"`; its UI uses `NETWORK=test` and its Snap must use the same network. Mainnet is the UI's default, so an unset environment is not acceptable. The wallet constructor accepts main/test, not a configurable regtest activation schedule; an isolated chain would need to match supported rules without broad SDK changes.

The following are the **candidate dependency's compiled testnet rules**, extracted from zcash_protocol 0.11.0, not observations of the currently serving chain. [Source evidence](evidence/dependency-source-review.json).

| Upgrade | Testnet activation height | Branch ID |
|---|---:|---|
| Overwinter | 207500 | 5ba81b19 |
| Sapling | 280000 | 76b809bb |
| Blossom | 584000 | 2bb40e60 |
| Heartwood | 903800 | f5b9230b |
| Canopy | 1028500 | e9ff75a6 |
| NU5 | 1842420 | c2d6d0b4 |
| NU6 | 2976000 | c8e71055 |
| NU6.1 | 3536500 | 4dec4df0 |
| NU6.2 | 4052000 | 5437f330 |
| NU6.3 | 4134000 | 37a5165b |
| NU7 | 4465026 | 77190ad9 |

The default `main` checkout pins NU6.3-era dependencies; the candidate carries NU7 support. This explains candidate selection, but does not establish successful current-testnet sync/spend support. No current network-upgrade claim is inferred from repository comments alone.

Endpoint attempted: `https://zjs.zec.rocks/testnet`. Current node/lightwalletd version, current consensus branch, tip/hash, scan range, birthday, fee/confirmation profile actually exercised, incoming txid, outgoing txid and inclusion heights: **unknown / not established**. The candidate's vendored documentation mentions lightwalletd 0.5.4, but the timed-out RPC did not verify that version. No transaction references exist for this experiment. See [network-profile.json](evidence/network-profile.json).
