// SPDX-License-Identifier: MIT OR Apache-2.0
// Browser derivative of Daniel/Konclave's grpcweb-trailer-check.mjs:
// https://github.com/Crackdevs/zcash-browser-ohttp-proof/issues/1#issuecomment-6932918641
// Uses the same read RPCs and block range with browser UA, normal CORS and a deadline.
export async function measureBrowser({ base, runs, timeoutMs }) {
  const service = 'cash.z.wallet.sdk.rpc.CompactTxStreamer';
  const methods = ['GetLightdInfo', 'GetLatestBlock', 'GetBlockRange'];
  const maxBytes = 32 * 1024 * 1024;
  const started = new Date().toISOString();
  const setup = [];
  const rows = [];
  let requestsStarted = 0;

  function varint(n) {
    const bytes = [];
    let value = BigInt(n);
    while (value > 127n) {
      bytes.push(Number(value & 127n) | 128);
      value >>= 7n;
    }
    return [...bytes, Number(value)];
  }
  function blockRange(start, end) {
    const from = [8, ...varint(start)];
    const to = [8, ...varint(end)];
    return [10, ...varint(from.length), ...from, 18, ...varint(to.length), ...to];
  }
  function readHeight(bytes, target) {
    let pos = 0;
    function takeVarint() {
      let value = 0n;
      for (let shift = 0n; shift < 70n && pos < bytes.length; shift += 7n) {
        const byte = bytes[pos++];
        value |= BigInt(byte & 127) << shift;
        if (byte < 128) return value;
      }
      throw Error('Truncated or oversized protobuf varint');
    }
    while (pos < bytes.length) {
      const tag = takeVarint();
      const type = Number(tag & 7n);
      if (type === 0) {
        const value = takeVarint();
        if (tag >> 3n === BigInt(target)) {
          if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('Height exceeds safe range');
          return Number(value);
        }
      } else if (type === 2) {
        const n = takeVarint();
        if (n > BigInt(bytes.length - pos)) throw Error('Truncated protobuf field');
        pos += Number(n);
      } else if (type === 1 || type === 5) {
        pos += type === 1 ? 8 : 4;
      } else {
        throw Error('Unexpected protobuf wire type');
      }
    }
    throw Error('Height field absent');
  }

  async function call(method, message = []) {
    const body = new Uint8Array(5 + message.length);
    new DataView(body.buffer).setUint32(1, message.length);
    body.set(message, 5);
    const out = {
      id: ++requestsStarted, method, at: new Date().toISOString(),
      requestHex: Array.from(body, byte => byte.toString(16).padStart(2, '0')).join(''),
      frames: [], heights: [], trailerText: null, trailerMs: null, trailerToEndMs: null,
      extraBytesAfterTrailer: 0, firstDataMs: null, endMs: null, totalBytes: 0, eof: false,
    };
    const t0 = performance.now();
    let reader;
    try {
      const response = await fetch(`${base}/${service}/${method}`, {
        method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'error',
        headers: {
          'content-type': 'application/grpc-web+proto', 'x-grpc-web': '1',
          'accept': 'application/grpc-web+proto', 'x-user-agent': 'grpc-web-javascript/0.1',
        },
        body, signal: AbortSignal.timeout(timeoutMs),
      });
      out.status = response.status;
      out.contentType = response.headers.get('content-type');
      out.headerGrpcStatus = response.headers.get('grpc-status');
      out.headerGrpcMessage = response.headers.get('grpc-message');
      out.visibleHeaderNames = [...response.headers.keys()];
      reader = response.body.getReader();
      let buf = new Uint8Array();
      for (;;) {
        const { value, done } = await reader.read();
        const now = performance.now() - t0;
        if (done) {
          out.eof = true;
          out.endMs = now;
          out.unparsedBytes = buf.length;
          if (out.trailerMs !== null) out.trailerToEndMs = now - out.trailerMs;
          break;
        }
        out.totalBytes += value.length;
        if (out.totalBytes > maxBytes) throw Error('Response byte limit exceeded');
        if (out.trailerMs !== null) {
          out.extraBytesAfterTrailer += value.length;
          continue;
        }
        const joined = new Uint8Array(buf.length + value.length);
        joined.set(buf);
        joined.set(value, buf.length);
        buf = joined;
        while (buf.length >= 5) {
          const size = new DataView(buf.buffer, buf.byteOffset).getUint32(1);
          if (size > maxBytes) throw Error('Frame byte limit exceeded');
          if (buf.length < 5 + size) break;
          const flag = buf[0];
          const payload = buf.subarray(5, 5 + size);
          out.frames.push({ type: '0x' + flag.toString(16).padStart(2, '0'), len: size });
          buf = buf.subarray(5 + size);
          if (flag & 128) {
            out.trailerMs = now;
            out.trailerText = new TextDecoder().decode(payload);
            out.extraBytesAfterTrailer += buf.length;
            buf = new Uint8Array();
            break;
          }
          out.firstDataMs ??= now;
          if (flag === 0 && method !== 'GetLightdInfo') {
            out.heights.push(readHeight(payload, method === 'GetLatestBlock' ? 1 : 2));
          }
        }
      }
    } catch (error) {
      out.error = String(error);
      out.errorAfterMs = performance.now() - t0;
      if (reader) await reader.cancel().catch(() => {});
    } finally {
      reader?.releaseLock();
    }
    return out;
  }

  setup.push(await call(methods[0]));
  setup.push(await call(methods[1]));
  const tip = setup[1].heights[0] ?? null;
  const range = tip === null ? null : { start: tip - 20, end: tip - 11 };
  if (range && setup.every(row => row.status === 200 && row.eof && !row.error)) {
    for (let run = 1; run <= runs; run++) {
      for (const method of methods) {
        const bytes = method === 'GetBlockRange' ? blockRange(range.start, range.end) : [];
        rows.push({ run, ...await call(method, bytes) });
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    }
  }
  return { started, finished: new Date().toISOString(), requestsStarted, setup, rows, tip, range };
}
