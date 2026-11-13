"""Derive the reviewer summary from retained run files; never synthesize a pass."""
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

cont = Path(__file__).resolve().parents[1]
e = cont / "evidence"

def load(name):
    file = e / name
    return json.loads(file.read_text(encoding="utf-8")) if file.is_file() else {}

def show(file):
    return "evidence/" + file

component = "component-02/component-results.json"
legacy = "legacy-01/legacy-results.json"
qualify = "wallet-qualify-01/qualify-results.json"
live = "wallet-live-01/wallet-results.json"
faults = "wallet-faults-01/wallet-faults-results.json"
stream_trace = "component-02/component-events.jsonl"
wallet_trace = "wallet-live-01/wallet-events.jsonl"
q = load(qualify)
w = load(live)
checks = {}

def add(name, file, local=None, extra=()):
    r = load(file).get("checks", {}).get(local or name, {})
    checks[name] = {"status": r.get("status", "NOT_RUN"),
                    "evidence": [show(file), *(show(x) for x in extra)]}

def fallback(name):
    add(name, live if name in w.get("checks", {}) else qualify,
        extra=(wallet_trace if name in w.get("checks", {}) else "wallet-qualify-01/qualify-events.jsonl",))

add("reproduced_legacy_final_status_loss", legacy, extra=("legacy-01/legacy-events.jsonl",))
for name in ("live_stream", "truncated_after_valid_trailer", "tampered_after_valid_trailer",
             "invalid_config_pin", "wrong_gateway_key", "nonzero_rpc_status", "relay_interruption",
             "cancellation", "identity_headers"):
    add(name, component, extra=(stream_trace,))
add("component_no_attempted_direct_bypass", component, "attempted_direct_bypass", (stream_trace,))
for name in ("wallet_loaded", "wallet_final_rpc_error", "wallet_worker_route"):
    fallback(name)
for name in ("real_ohttp_receipt", "same_checkpoint_comparison", "transaction_details_rpc", "outgoing_payment"):
    add(name, live, extra=(wallet_trace,))
add("wallet_no_attempted_direct_bypass", live, "attempted_direct_bypass", (wallet_trace,))
for name, label in (("wallet_truncate-ending", "wallet_rejects_missing_ohttp_ending"),
                    ("wallet_tamper-ending", "wallet_rejects_corrupt_ohttp_ending")):
    add(label, faults, name, ("wallet-faults-01/wallet-faults-events.jsonl",))
checks["previous_evidence_unchanged"] = {
    "status": load("previous-verification.json").get("status", "NOT_RUN"),
    "evidence": [show("previous-verification.json")],
}
if checks["real_ohttp_receipt"]["status"] == "NOT_RUN" and (e/"funding-intent.json").exists():
    checks["real_ohttp_receipt"]["status"] = "BLOCKED"
    checks["real_ohttp_receipt"]["reason"] = "One faucet intent was recorded; no reconciled qualifying receipt result."
if checks["outgoing_payment"]["status"] == "NOT_RUN" and (e/"send-intent.json").exists():
    checks["outgoing_payment"]["status"] = "BLOCKED"
    checks["outgoing_payment"]["reason"] = "A send intent exists; reconcile this canonical transaction ID only."
if (e/"funding-intent.json").exists():
    checks["real_ohttp_receipt"]["evidence"].append(show("funding-intent.json"))
if (e/"send-intent.json").exists():
    checks["outgoing_payment"]["evidence"].append(show("send-intent.json"))
complete = all(c["status"] == "PASS" for c in checks.values())
status = "PASS" if complete else ("FAIL" if any(c["status"] == "FAIL" for c in checks.values()) else "BLOCKED")

by_realm = defaultdict(lambda: defaultdict(int))
rpc_events = defaultdict(int)
for file in (wallet_trace,):
    p = e / file
    if p.is_file():
        for line in p.read_text(encoding="utf-8").splitlines():
            row = json.loads(line)
            if row.get("event") == "browser-adapter" and row.get("stage") == "authenticated-end":
                by_realm[row["realm"]][row["method"]] += 1
            if row.get("event") == "backend-start":
                rpc_events[row["method"]] += 1
stamp = datetime.now(timezone.utc)
start = load("start.json").get("first_retained_observation_utc")
elapsed = (stamp-datetime.fromisoformat(start)).total_seconds() if start else None
result = {
    "experiment": "continuation-02",
    "status": status,
    "checks": checks,
    "live_wallet_run_error": w.get("error"),
    "earlier_recovered_setup_failures": [
        {"reason": "The first readiness probe used /metrics and never reached Chromium.",
         "evidence": show("component-01/component-results.json")},
        {"reason": "The first harness bundle hit a restricted SWC native-cache permission error.",
         "evidence": show("parcel.log")},
    ],
    "timing": {"started_utc": start, "summarized_utc": stamp.isoformat(),
               "wall_clock_seconds_including_build_and_testnet_wait": round(elapsed, 1) if elapsed is not None else None,
               "maximum_focused_hours": 8},
    "authenticated_browser_responses_by_realm_and_method": by_realm,
    "gateway_dispatches_by_rpc": rpc_events,
}
(cont / "acceptance.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")

wc = w.get("checks", {})
receipt = wc.get("real_ohttp_receipt", {}).get("details", {})
receipt_entry = receipt.get("receipt", {})
payment = wc.get("outgoing_payment", {}).get("details", {})
intent = w.get("sendIntent", {})
comparison = wc.get("same_checkpoint_comparison", {}).get("details", {}).get("compared", {})
if receipt.get("txid") or intent.get("txid"):
    txs = {
        "network": "Zcash testnet",
        "receipt": {"canonical_txid": receipt.get("txid"), "block_height": receipt_entry.get("block_height"),
                    "amount_zatoshi": receipt_entry.get("value"), "pool": receipt_entry.get("pool"),
                    "source": w.get("funding", {}).get("source"), "node": receipt.get("node")},
        "checkpoint": comparison.get("checkpoint"),
        "outgoing": {"canonical_txid_recorded_before_submission": intent.get("txid"),
                     "amount_zatoshi": intent.get("amount_zatoshi"), "included_at": payment.get("included"),
                     "backend_accepted": payment.get("accepted"), "submission_attempts": payment.get("submissionAttempts")},
        "evidence": [live, wallet_trace, "funding-intent.json"] + (["send-intent.json"] if intent else []),
    }
    (e / "transactions.json").write_text(json.dumps(txs, indent=2) + "\n", encoding="utf-8")
