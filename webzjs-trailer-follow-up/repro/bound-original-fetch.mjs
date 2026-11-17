// Preload for Daniel's unmodified script. Restrict calls and bound test time.
const endpoint = 'https://zcash-mainnet.chainsafe.dev';
const service = 'cash.z.wallet.sdk.rpc.CompactTxStreamer';
const methods = new Set(['GetLightdInfo', 'GetLatestBlock', 'GetBlockRange']);
const originalFetch = globalThis.fetch;
let requests = 0;

function record(event, fields) {
  console.error(JSON.stringify({ event, at: new Date().toISOString(), ...fields }));
}

globalThis.fetch = async (input, options) => {
  const url = new URL(input);
  const method = url.pathname.slice(service.length + 2);
  if (url.origin !== endpoint || url.pathname !== `/${service}/${method}`
      || url.search || options?.method !== 'POST' || !methods.has(method) || requests >= 17) {
    throw new Error('Unexpected request in the read-only measurement');
  }
  const id = ++requests;
  record('request', { id, method, bodyHex: Buffer.from(options.body).toString('hex') });
  const start = performance.now();
  try {
    const response = await originalFetch(input, {
      ...options,
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
    record('headers', {
      id, method,
      http: response.status,
      contentType: response.headers.get('content-type'),
      exposedHeaders: response.headers.get('access-control-expose-headers'),
      headerGrpcStatus: response.headers.get('grpc-status'),
      elapsedMs: performance.now() - start,
    });
    return response;
  } catch (error) {
    record('fetch-error', {
      id, method, name: error.name, message: error.message,
      cause: error.cause?.code, elapsedMs: performance.now() - start,
    });
    throw error;
  }
};
