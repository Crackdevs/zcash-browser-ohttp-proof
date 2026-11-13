# PROCEED — bounded Chromium/testnet proof passed

The pinned WebZjs candidate completed a real receive-and-send workflow with browser-side Chunked OHTTP through the locally controlled relay and gateway. This result supports the feasibility of the tested transport path. It is limited to this browser, pinned implementation pair, backend, and test wallet flow.

| Check | Observed result |
| --- | --- |
| Real receipt and direct control | One faucet claim funded **0.1 TAZ** to a fresh account (birthday **4,606,466**). Fresh direct and OHTTP scans matched balance, Ironwood pool, and confirmed receipt history at **4,606,479**, with the same block hash on both paths. |
| Receipt details | The browser harness's separate OHTTP `GetTransaction` and the direct RPC returned the same inclusion height and raw transaction SHA-256. The local wallet history query was not counted as that RPC. |
| Real send | The existing wallet APIs authorized one **0.01 TAZ** payment. Its canonical ID was retained before the only submission. The backend returned `SendResponse.error_code = 0` and `grpc-status: 0`; lookup of the same ID found inclusion at **4,606,481**. The sender showed a confirmed send and **0.0899 TAZ** remaining; the fresh recipient showed the confirmed **0.01 TAZ** Ironwood receipt. |
| Streaming, cancellation and errors | A real 100-block stream delivered its first bytes **1,129 ms** before authenticated completion. Relay interruption, caller cancellation, an invalid config digest, and a wrong key failed explicitly. The compiled wallet rejected missing and tampered OHTTP endings even after a valid RPC trailer had arrived; it propagated an authenticated nonzero RPC status. |
| Routing and headers | The funded run recorded **70** browser relay POSTs, including dedicated-worker RPCs, and **zero** attempted direct bypasses in OHTTP mode. A separate relay probe found no forwarded client identity markers at gateway ingress. |

[Machine-readable results](acceptance.json) · [Transaction IDs and checkpoints](evidence/transactions.json) · [Live wallet result](evidence/wallet-live-01/wallet-results.json) · [Live browser and service trace](evidence/wallet-live-01/wallet-events.jsonl) · [Component tests](evidence/component-02/component-results.json) · [Wallet tail faults](evidence/wallet-faults-01/wallet-faults-results.json).

Work began at **00:31:56 UTC** on 2026-11-11. The funded run finished at **01:05:00 UTC**, and the supplemental wallet fault checks finished at **01:05:46 UTC**. About **34 minutes** elapsed through the last browser run, including packaging, faucet and mining waits. The first component start and Parcel bundle attempts hit local readiness and cache issues; both were corrected and retained. No unresolved acceptance failure remains in the tested path. The previous evidence package passed byte-for-byte verification.

The local listeners do not demonstrate independent operators or non-collusion. A remote trust anchor for gateway configuration, public operation, additional browsers, production review, and interoperability with the separate thibmeu and Zodl gateway implementations remain untested. See the earlier [scope comparison](../GAP.md) for WebZjs/red·bridge and Konclave. This run adds local technical evidence; it does not establish integration ownership, adoption, funding suitability, or resolution of the earlier scope overlap.
