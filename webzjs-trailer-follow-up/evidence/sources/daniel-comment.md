Script and per-run results for the gRPC-web trailer check, run on 2026-11-16 with Node v24.21.0 on Linux.

**How to run.** We ran it on Node v24.21.0. It should run on Node 18 or later, which we did not test. There is no install step: the script uses only Node's built-in `fetch` and `performance`, with no npm dependencies. Save the script below as `grpcweb-trailer-check.mjs`, then:

```
node grpcweb-trailer-check.mjs https://zcash-mainnet.chainsafe.dev 5 > raw.json
```

The first argument is the base URL and the second is the number of runs (default 5). It prints one JSON array to stdout and the tip height to stderr. Each run makes three read-only calls: `GetLightdInfo`, `GetLatestBlock`, and `GetBlockRange` over 10 blocks (tip minus 20 to tip minus 11). Before the loop it makes two unrecorded calls (GetLightdInfo and GetLatestBlock, to read the tip), so it sends 17 requests and records 15. The request frames are encoded by hand, so there is nothing to compile. The only fields it sends are `BlockID.height` (1) and `BlockRange.start` / `end` (1, 2) from `service.proto` in zcash/lightwallet-protocol. We did not record the commit we read them from. The script is MIT or Apache-2.0, at your choice.

<details>
<summary>grpcweb-trailer-check.mjs</summary>

```js
// SPDX-License-Identifier: MIT OR Apache-2.0
// Measures how gRPC-web responses end. Read-only lightwalletd queries only.
// usage: node grpcweb-trailer-check.mjs <baseUrl> [runs]
const base = process.argv[2].replace(/\/$/, '');
const runs = Number(process.argv[3] ?? 5);
const SVC = 'cash.z.wallet.sdk.rpc.CompactTxStreamer';

const varint = (n) => { const o = []; n = BigInt(n); while (n > 0x7fn) { o.push(Number(n & 0x7fn) | 0x80); n >>= 7n; } o.push(Number(n)); return o; };
const field = (num, bytes) => [(num << 3) | 2, ...varint(bytes.length), ...bytes];
const fVar = (num, n) => [(num << 3) | 0, ...varint(n)];
const blockId = (h) => fVar(1, h);                       // BlockID{height}
const blockRange = (a, b) => [...field(1, blockId(a)), ...field(2, blockId(b))];
const frame = (msg) => { const b = new Uint8Array(5 + msg.length); b[0] = 0; new DataView(b.buffer).setUint32(1, msg.length); b.set(msg, 5); return b; };
function readVarintField1(buf) { // first field=1 varint in a message
  let i = 0;
  while (i < buf.length) {
    const tag = buf[i++]; const fn = tag >> 3, wt = tag & 7;
    if (wt === 0) { let v = 0n, s = 0n; for (;;) { const c = buf[i++]; v |= BigInt(c & 0x7f) << s; s += 7n; if (!(c & 0x80)) break; } if (fn === 1) return Number(v); }
    else if (wt === 2) { let l = 0, s = 0; for (;;) { const c = buf[i++]; l |= (c & 0x7f) << s; s += 7; if (!(c & 0x80)) break; } i += l; }
    else return null;
  }
  return null;
}

async function call(method, msg) {
  const t0 = performance.now();
  const res = await fetch(`${base}/${SVC}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/grpc-web+proto', 'x-grpc-web': '1', 'accept': 'application/grpc-web+proto', 'user-agent': 'grpcweb-check/1.0', 'x-user-agent': 'grpc-web-javascript/0.1' },
    body: frame(msg),
  });
  const out = { method, status: res.status, contentType: res.headers.get('content-type'), headerGrpcStatus: res.headers.get('grpc-status'), headerGrpcMessage: res.headers.get('grpc-message'),
    frames: [], trailerMs: null, trailerToEndMs: null, extraBytesAfterTrailer: 0, trailerStatus: null, trailerText: null, totalBytes: 0, firstDataMs: null, firstData: null };
  const reader = res.body.getReader();
  let buf = new Uint8Array(0), trailerSeen = false, tTrailer = 0;
  for (;;) {
    const { done, value } = await reader.read();
    const now = performance.now();
    if (done) { if (trailerSeen) out.trailerToEndMs = now - tTrailer; out.endMs = now - t0; break; }
    out.totalBytes += value.length;
    if (trailerSeen) { out.extraBytesAfterTrailer += value.length; continue; }
    const nb = new Uint8Array(buf.length + value.length); nb.set(buf); nb.set(value, buf.length); buf = nb;
    while (buf.length >= 5) {
      const len = new DataView(buf.buffer, buf.byteOffset).getUint32(1);
      if (buf.length < 5 + len) break;
      const type = buf[0]; const payload = buf.slice(5, 5 + len);
      out.frames.push({ type: '0x' + type.toString(16).padStart(2, '0'), len });
      if (out.firstDataMs === null && (type & 0x80) === 0) { out.firstDataMs = now - t0; out.firstData = payload; }
      if (type & 0x80) { trailerSeen = true; tTrailer = now; out.trailerMs = now - t0; out.trailerText = new TextDecoder().decode(payload);
        const m = /grpc-status:\s*(\d+)/i.exec(out.trailerText); out.trailerStatus = m ? m[1] : null;
        out.extraBytesAfterTrailer += buf.length - (5 + len); }
      buf = buf.slice(5 + len);
      if (trailerSeen) break;
    }
  }
  return out;
}

const results = [];
const info = await call('GetLightdInfo', []);
const tip = await call('GetLatestBlock', []);
const tipH = tip.firstData ? readVarintField1(tip.firstData) : null;
console.error(`# ${base} tip=${tipH}`);
for (let i = 0; i < runs; i++) {
  const calls = [['GetLightdInfo', []], ['GetLatestBlock', []]];
  if (tipH) calls.push(['GetBlockRange', blockRange(tipH - 20, tipH - 11)]);
  for (const [m, msg] of calls) {
    try { const r = await call(m, msg); delete r.firstData; results.push({ base, run: i + 1, ...r }); }
    catch (e) { results.push({ base, run: i + 1, method: m, error: String(e) }); }
    await new Promise(r => setTimeout(r, 400));
  }
}
console.log(JSON.stringify(results, null, 1));
```

</details>

**Results.** Endpoint `https://zcash-mainnet.chainsafe.dev`, tip 3,580,146, 5 runs of 3 calls, 15 calls in all. Every call returned HTTP 200 with content-type `application/grpc-web`. Each body was the data frame or frames (`0x00`) followed by one trailer frame (`0x80`) carrying `grpc-status: 0`. "Time to trailer" is measured from the request start to the moment the trailer frame was complete. "Trailer to end" is measured from that moment to the end of the body. Per call type, the median trailer to end was 0.14 ms (GetLightdInfo), 0.21 ms (GetLatestBlock) and 0.16 ms (GetBlockRange); the maximum across all 15 calls was 0.28 ms, as in our earlier comment.

| Call | Run | HTTP status | Time to trailer (ms) | Trailer to end (ms) | Bytes after trailer | Where grpc-status was |
|---|---|---|---|---|---|---|
| GetLightdInfo | 1 | 200 | 164.3 | 0.26 | 0 | trailer frame (0), none in HTTP headers |
| GetLatestBlock | 1 | 200 | 167.3 | 0.20 | 0 | trailer frame (0), none in HTTP headers |
| GetBlockRange | 1 | 200 | 884.4 | 0.23 | 0 | trailer frame (0), none in HTTP headers |
| GetLightdInfo | 2 | 200 | 251.7 | 0.13 | 0 | trailer frame (0), none in HTTP headers |
| GetLatestBlock | 2 | 200 | 169.5 | 0.28 | 0 | trailer frame (0), none in HTTP headers |
| GetBlockRange | 2 | 200 | 336.0 | 0.16 | 0 | trailer frame (0), none in HTTP headers |
| GetLightdInfo | 3 | 200 | 167.9 | 0.17 | 0 | trailer frame (0), none in HTTP headers |
| GetLatestBlock | 3 | 200 | 165.3 | 0.21 | 0 | trailer frame (0), none in HTTP headers |
| GetBlockRange | 3 | 200 | 323.9 | 0.16 | 0 | trailer frame (0), none in HTTP headers |
| GetLightdInfo | 4 | 200 | 164.6 | 0.11 | 0 | trailer frame (0), none in HTTP headers |
| GetLatestBlock | 4 | 200 | 163.6 | 0.23 | 0 | trailer frame (0), none in HTTP headers |
| GetBlockRange | 4 | 200 | 322.7 | 0.13 | 0 | trailer frame (0), none in HTTP headers |
| GetLightdInfo | 5 | 200 | 163.1 | 0.14 | 0 | trailer frame (0), none in HTTP headers |
| GetLatestBlock | 5 | 200 | 163.8 | 0.12 | 0 | trailer frame (0), none in HTTP headers |
| GetBlockRange | 5 | 200 | 327.1 | 0.10 | 0 | trailer frame (0), none in HTTP headers |

**Control.** `https://zec.rocks` answered 404 with an HTML page to every call of one run (2 recorded), which fits the WebZjs README saying a plain lightwalletd URL needs a gRPC-web proxy in front of it. It gives no comparison.

**Limits.** This is one endpoint, measured with Node's `fetch` from one machine, not a browser.
