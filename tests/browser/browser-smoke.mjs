import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const candidates = [
  process.env.BROWSER_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const browser = candidates.find((candidate) => fs.existsSync(candidate));

if (!browser) {
  if (process.env.CI) throw new Error('Chrome is required for the pull-request browser smoke test');
  console.log('browser smoke skipped: Chrome was not found');
  process.exit(0);
}

const mime = {
  '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.woff2': 'font/woff2',
};

const server = http.createServer((request, response) => {
  const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
  const filename = path.resolve(ROOT, relative);
  if (!filename.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(filename) || fs.statSync(filename).isDirectory()) {
    response.writeHead(404).end('not found');
    return;
  }
  response.setHeader('content-type', mime[path.extname(filename)] || 'application/octet-stream');
  fs.createReadStream(filename).pipe(response);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cic-browser-smoke-'));
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeStderr = '';
child.stderr.on('data', (chunk) => { chromeStderr += chunk; });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(read, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await read();
      if (last) return last;
    } catch (error) { last = error; }
    await delay(50);
  }
  throw new Error(`timed out waiting for ${label}: ${last instanceof Error ? last.message : last || 'no result'}`);
}

let socket;
try {
  const activePort = path.join(profile, 'DevToolsActivePort');
  await waitFor(() => fs.existsSync(activePort), 'Chrome DevTools port');
  const debugPort = Number(fs.readFileSync(activePort, 'utf8').split(/\r?\n/)[0]);
  const page = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    const pages = await response.json();
    return pages.find((item) => item.type === 'page');
  }, 'Chrome page target');

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__cicBrowserErrors = [];
    addEventListener('error', event => __cicBrowserErrors.push(String(event.error || event.message)), true);
    addEventListener('unhandledrejection', event => __cicBrowserErrors.push(String(event.reason)), true);
  ` });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` });
  await waitFor(async () => {
    const result = await send('Runtime.evaluate', { expression: 'document.readyState === "complete" && typeof Game === "object"' });
    return result.result && result.result.value;
  }, 'game boot');

  const evaluated = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const normal = document.querySelector('input[name="difficulty"][value="normal"]');
      if (normal) normal.checked = true;
      document.getElementById('btn-start').click();
      return {
        turn: Game.G.turn,
        over: Game.G.over,
        targets: TARGETS.length,
        invariant: Game.assertInvariants('browser smoke'),
        appVisible: !document.getElementById('app').classList.contains('hidden'),
        titleHidden: document.getElementById('title-screen').classList.contains('hidden'),
        errors: window.__cicBrowserErrors,
      };
    })()`,
  });
  if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.text);
  const state = evaluated.result.value;
  assert.deepEqual(state.errors, []);
  assert.equal(state.turn, 1);
  assert.equal(state.over, false);
  assert.ok(state.targets >= 30);
  assert.equal(state.invariant, true);
  assert.equal(state.appVisible, true);
  assert.equal(state.titleHidden, true);
  console.log(`browser smoke passed: ${state.targets} targets, campaign at turn ${state.turn}`);
} catch (error) {
  if (chromeStderr) error.message += `\nChrome stderr:\n${chromeStderr.slice(-3000)}`;
  throw error;
} finally {
  if (socket && socket.readyState < 2) socket.close();
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    child.once('exit', resolve);
    setTimeout(resolve, 2000);
  });
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(profile, { recursive: true, force: true });
}
