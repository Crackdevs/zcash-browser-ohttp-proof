import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { measureBrowser } from './measure-browser.mjs';

const [driver, evidence] = process.argv.slice(2);
if (!driver || !evidence) throw Error('Usage: node run-chromium-public.mjs PLAYWRIGHT_DIR EVIDENCE_DIR');
const { chromium } = createRequire(path.resolve(driver, 'package.json'))('playwright');
const endpoint = 'https://zcash-mainnet.chainsafe.dev';
const result = {
  command: process.argv, endpoint, node: process.version, platform: process.platform,
  chromeArgs: [], normalBrowserCORS: true, perRequestTimeoutMs: 8000, measurementTimeoutMs: 160000,
  start: new Date().toISOString(), events: [],
};
const add = (event, fields) => result.events.push({ event, at: new Date().toISOString(), ...fields });
const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><title>Read-only gRPC-web measurement</title>');
});
await mkdir(evidence, { recursive: true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
let timer;
try {
  browser = await chromium.launch({ headless: true, timeout: 15000 });
  result.chromium = browser.version();
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const scopedRequests = new Set();
  cdp.on('Network.requestWillBeSent', ({ requestId, request, type }) => {
    if (request.url.startsWith(endpoint + '/')) {
      scopedRequests.add(requestId);
      add('request', { requestId, url: request.url, method: request.method, type });
    }
  });
  cdp.on('Network.loadingFailed', ({ requestId, errorText, blockedReason, corsErrorStatus }) => {
    if (scopedRequests.has(requestId)) add('network-failure', { requestId, errorText, blockedReason, corsErrorStatus });
  });
  cdp.on('Network.responseReceived', ({ requestId, response }) => {
    if (scopedRequests.has(requestId)) {
      add('response', { requestId, status: response.status, protocol: response.protocol });
    }
  });
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') {
      add('console', { text: message.text() });
    }
  });
  result.origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(result.origin, { timeout: 15000 });
  result.measurement = await Promise.race([
    page.evaluate(measureBrowser, { base: endpoint, runs: 5, timeoutMs: 8000 }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('Overall browser measurement timeout')), result.measurementTimeoutMs);
    }),
  ]);
} catch (error) {
  result.error = String(error);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  if (browser) await browser.close();
  server.closeAllConnections();
  server.close();
  result.finished = new Date().toISOString();
  await writeFile(path.join(evidence, 'chromium-public-raw.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
}
