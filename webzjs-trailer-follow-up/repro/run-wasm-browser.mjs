import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [driver, artifact, evidence] = process.argv.slice(2);
if (!driver || !artifact || !evidence) {
  throw Error('Usage: node run-wasm-browser.mjs PLAYWRIGHT_DIR WASM_ARTIFACT_DIR EVIDENCE_DIR');
}
const { chromium } = createRequire(path.resolve(driver, 'package.json'))('playwright');
const build = JSON.parse(await readFile(path.join(artifact, 'manifest.json'), 'utf8'));
const result = {
  command: process.argv, node: process.version, platform: process.platform, started: new Date().toISOString(),
  build, checks: {}, events: [],
};
function note(event, data) {
  result.events.push({ event, at: new Date().toISOString(), ...data });
}
function accept(name, pass, details) {
  result.checks[name] = { status: pass ? 'PASS' : 'FAIL', details };
}
function frame(flag, message) {
  const out = Buffer.alloc(5 + message.length);
  out[0] = flag;
  out.writeUInt32BE(message.length, 1);
  out.set(message, 5);
  return out;
}
const data = frame(0, Buffer.from([10, 20, 30]));
const trailer = text => frame(128, Buffer.from(text, 'ascii'));
const ok = trailer('grpc-status: 0\r\n');
const dataOk = Buffer.concat([data, ok]);
const finite = new Map([
  ['ok', { body: dataOk }],
  ['body-error', { body: Buffer.concat([data, trailer('grpc-status: 13\r\ngrpc-message: fixture%20failed\r\nx-proof: kept\r\n')]) }],
  ['unknown', { body: Buffer.concat([data, trailer(`grpc-status: ${'9'.repeat(128)}\r\ngrpc-message: new%20code\r\nx-proof: kept\r\n`)]) }],
  ['missing-status', { body: Buffer.concat([data, trailer('x-proof: kept\r\n')]) }],
  ['duplicate-status', { body: Buffer.concat([data, trailer('grpc-status: 0\r\nGrpc-Status: 0\r\n')]) }],
  ['malformed-status', { body: Buffer.concat([data, trailer('grpc-status: +0\r\n')]) }],
  ['truncated', { body: dataOk.subarray(0, -1) }],
  ['same-chunk-extra', { body: Buffer.concat([dataOk, data]) }],
  ['header-ok', { headers: { 'grpc-status': '0' }, body: Buffer.alloc(0) }],
  ['header-error', { headers: { 'grpc-status': '5', 'grpc-message': 'header%20status' }, body: Buffer.alloc(0) }],
]);
const holdNames = new Set(['delayed-stream', 'delayed-unary', 'late-bytes', 'connection-reset', 'deadline-wait']);
const holds = new Map();
const holdArrivals = new Map();
const headers = { 'content-type': 'application/grpc-web+proto', 'cache-control': 'no-store' };
const assets = {
  '/wasm-page.mjs': new URL('./wasm-page.mjs', import.meta.url),
  '/trailer_harness.js': path.join(artifact, 'trailer_harness.js'),
  '/trailer_harness_bg.wasm': path.join(artifact, 'trailer_harness_bg.wasm'),
};
const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end('<!doctype html><title>WebZjs trailer decoder fixture</title><script type="module" src="/wasm-page.mjs"></script>');
    }
    if (req.method === 'GET' && Object.hasOwn(assets, req.url)) {
      res.writeHead(200, { 'content-type': req.url.endsWith('.wasm') ? 'application/wasm' : 'text/javascript' });
      return res.end(await readFile(assets[req.url]));
    }
    const match = /^\/fixture\/([a-z-]+)\/followup\.Probe\/(Unary|Stream)$/.exec(req.url);
    if (!match || req.method !== 'POST') {
      res.writeHead(404);
      return res.end();
    }
    const [, name, method] = match;
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 5) throw Error('Unexpected fixture request length');
      chunks.push(chunk);
    }
    if (!Buffer.concat(chunks).equals(Buffer.alloc(5))) throw Error('Expected one empty gRPC request');
    note('fixture-request', { name, method, contentType: req.headers['content-type'] });
    res.on('close', () => note('response-close', { name, method, writableFinished: res.writableFinished }));
    if (holdNames.has(name)) {
      if (holds.has(name)) throw Error('Unexpected duplicate held request');
      holds.set(name, res);
      res.writeHead(200, headers);
      res.write(dataOk);
      note('trailer-sent-without-eof', { name, bytes: dataOk.length });
      holdArrivals.get(name)?.();
    } else {
      const response = finite.get(name);
      if (!response) throw Error('Unknown fixture');
      res.writeHead(200, { ...headers, ...response.headers, 'content-length': response.body.length });
      res.end(response.body);
    }
  } catch (error) {
    note('fixture-error', { error: String(error) });
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

async function within(operation, milliseconds = 10000) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Fixture runner timeout')), milliseconds); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
const message = value => JSON.stringify(value) === '[10,20,30]';
const last = value => value?.value === null;
const protocolError = value => value?.code === 2 && /malformed response|failed to parse headers/.test(value.error);

await mkdir(evidence, { recursive: true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, timeout: 15000 });
  result.chromium = browser.version();
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', error => note('page-error', { error: String(error) }));
  page.on('requestfailed', request => note('request-failed', { url: request.url(), error: request.failure()?.errorText }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(origin, { timeout: 10000 });
  await page.waitForFunction(() => Boolean(globalThis.probe), undefined, { timeout: 10000 });
  await within(page.evaluate(() => probe.ready.then(() => true)));
  const unary = name => within(page.evaluate(n => probe.unary(n), name));
  const stream = name => within(page.evaluate(n => probe.stream(n), name));
  const pair = async name => ({ unary: await unary(name), stream: await stream(name) });
  const messageAnd = (entry, check) =>
    entry.messages.length === 1 && message(entry.messages[0]) && check(entry.terminal);

  let both = await pair('ok');
  accept('body_success', message(both.unary.value) && messageAnd(both.stream, last), both);
  for (const [name, code, expected] of [['body-error', 13, 'fixture failed'], ['unknown', 2, 'new code']]) {
    both = await pair(name);
    const status = value => value.code === code && value.error === expected && value.metadata === 'kept';
    accept(name, status(both.unary) && messageAnd(both.stream, status), both);
  }
  for (const name of ['missing-status', 'duplicate-status', 'malformed-status', 'truncated', 'same-chunk-extra']) {
    both = await pair(name);
    accept(name, protocolError(both.unary) && messageAnd(both.stream, protocolError), both);
  }
  both = await pair('header-ok');
  accept('headers_only_ok', both.unary.code === 13 && /missing response message/i.test(both.unary.error)
    && both.stream.messages.length === 0 && last(both.stream.terminal), both);
  both = await pair('header-error');
  const headerError = r => r.code === 5 && r.error === 'header status';
  accept('headers_only_error', headerError(both.unary)
    && both.stream.messages.length === 0 && headerError(both.stream.terminal), both);

  for (const name of holdNames) {
    const isUnary = name === 'delayed-unary';
    const arrived = new Promise(resolve => holdArrivals.set(name, resolve));
    const first = await within(page.evaluate(
      ({ name, isUnary }) => probe.begin(name, isUnary, name === 'deadline-wait' ? 2500 : 7000),
      { name, isUnary },
    ));
    await within(arrived);
    holdArrivals.delete(name);
    const before = await within(page.evaluate(n => probe.observePending(n), name));
    const response = holds.get(name);
    const heldOpen = Boolean(response && !response.writableEnded && !response.destroyed);
    if (heldOpen) {
      if (name === 'connection-reset') {
        note('server-reset', { name });
        response.destroy();
      } else if (name !== 'deadline-wait') {
        note('server-release', { name });
        response.end(name === 'late-bytes' ? Buffer.from([255]) : undefined);
      }
    }
    const terminal = await within(page.evaluate(n => probe.finish(n), name));
    if (name === 'deadline-wait') {
      // The request must close while the fixture still withholds EOF.
      const deadline = Date.now() + 2000;
      while (!response.destroyed && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    const upstreamClosedEarly = result.events.some(e =>
      e.event === 'response-close' && e.name === name && !e.writableFinished);
    const terminalPass = name === 'late-bytes' ? protocolError(terminal)
      : name === 'connection-reset' ? terminal.code !== null && /js api error/i.test(terminal.error ?? '')
      : name === 'deadline-wait' ? Boolean(terminal.error) && upstreamClosedEarly
      : isUnary ? message(terminal.value) : last(terminal);
    accept(name, before === null && heldOpen && (isUnary || message(first?.value)) && terminalPass, {
      first, terminalBeforeRelease: before, heldOpen, terminal, upstreamClosedEarly,
    });
  }
} catch (error) {
  result.error = String(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  server.close();
  result.finished = new Date().toISOString();
  result.status = result.error || Object.values(result.checks).some(check => check.status !== 'PASS') ? 'FAIL' : 'PASS';
  await writeFile(path.join(evidence, 'chromium-wasm.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  if (result.status !== 'PASS') process.exitCode = 1;
}
