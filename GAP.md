# Existing work, additional work and overlap

The requested result is not a new cryptographic protocol, wallet SDK, browser proving implementation or relay product. Existing code supplies most individual components. No complete, reviewer-verifiable browser wallet receive-and-send OHTTP adapter was found in this bounded inspection. That is a limited finding, not a claim that no such adapter exists anywhere.

| Existing capability | Reuse and remaining gap |
|---|---|
| WebZjs browser wallet, workers, scan/proving/send APIs | Reuse the wallet. The pinned main and PR export a fixed gRPC-web client, not a public JS transport interface. Direct receipt/control never ran here. Candidate build/network readiness and final trailer behavior remain prerequisites. |
| WebZjs PR #27 | Existing NU7/key portability and trailers-only work; open and unmerged. None of those changes are our contribution. We did not repair its build or upgrade its SDK. |
| ohttp-ts and hpke | Existing browser crypto, chunked encapsulation and stream APIs. No new cryptography is needed. Wallet integration, terminal completion and worker coverage are unproven. |
| thibmeu relay/gateway | Existing opaque forwarding and generic HTTP target service. Reuse after bounded runtime fixes and tests; no need to build another relay service. A gRPC-web proxy is still required for the wallet profile. |
| ZODL gateway/client | Existing Zcash-aware native gRPC OHTTP, streaming, authenticated configuration and error machinery. Native client/protocol capability is not evidence of a WebZjs browser workflow. Cross-vendor wire/status integration and license choice require explicit evaluation. |

Our additional work in this folder is pinning, source/dependency/license inventory, a recorded failed wallet build attempt and retry, Chromium page/worker metadata probes, a small Node Request-constructor diagnostic, the wire/error/cancellation assessment, and a fail-closed acceptance/evidence plan. **No transport adapter or wallet feature was implemented.** No upstream source modifications or upstream submissions were made.

Search coverage: local requested repositories, WebZjs main and PR #27, plus indexed GitHub `ohttp` searches scoped to red-dev-inc/WebZjs and deegalabs/konclave. The latter returned no results. Private branches, unindexed forks and unpublished adapters were not investigated. Existing library examples or native ZODL exchanges were not reproduced as a substitute for the direct-wallet gate. [Search limitation record](evidence/adapter-search.json).

## Grant-scope comparison

This comparison is based on the public issue bodies inspected on 2026-11-10. Source labels mark both applications approved, but labels do not establish individual milestone completion. No team was contacted, and no independent review, adoption, exclusive scope or funding entitlement is claimed. [Source metadata](evidence/grant-scope-sources.json).

**WebZjs/red·bridge:** the [red·bridge Launch application](https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/335) includes WebZjs/Snap maintenance, vulnerability work, NU6.3/Ironwood migration, NU7 and key-derivation work. Repairing wallet compatibility, adding protocol-upgrade support or replacing its key architecture would overlap that scope and exceed this transport experiment. The potential additional contribution here is a demonstrated browser transport boundary and evidence of routing, cancellation and final status. No distinct ownership of that work is established; the issue's full attached milestone PDF and any subsequent scope agreements were not reviewed.

**Konclave:** its [approved application](https://github.com/ZcashCommunityGrants/zcashcommunitygrants/issues/486) covers browser scan/proving measurements and design review, evaluation of WebZjs, moving viewing keys and scanning/building/proving onto devices, and migration of existing vaults where possible. It explicitly recognizes that device queries expose IP/timing and can reveal transaction associations. Rebuilding mobile benchmarks, wallet scanning, encrypted stores or device proving here would duplicate that work. This experiment addresses the narrower transport question. The written scope does not establish delivery of an OHTTP browser adapter; future integration or scope changes are unknown. A grant's planned independent design review is not a review of this experiment.

## Work required before a PROCEED decision

1. A reproducible candidate build and working direct testnet/isolated-chain receipt control, with exact server/consensus versions, fixed heights and transaction references. Do this without turning the task into a network upgrade or node-repair project.
2. A verified transport injection boundary that covers workers; first reproduce any complete adapter found before writing another one.
3. A bounded fix or alternative for final gRPC status delivery, plus OHTTP final-authentication gating. Resolve the gateway Node request construction/cancellation details if using that stack.
4. A controlled relay/gateway configuration and real-browser A–E execution with sanitized evidence.

Unknowns remain: live testnet server/tip and funds availability; an appropriate isolated-chain profile without SDK changes; complete runtime RPC inventory; cross-vendor interoperability; browser memory/backpressure and cancellation; all protected worker egress; existing unpublished integrations; upstream acceptance of transport changes; and the precise funding overlap beyond the cited public scopes. None is filled in with an assumed success.
