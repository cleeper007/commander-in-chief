import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputArg = process.argv.indexOf('--output');
const output = outputArg >= 0 && process.argv[outputArg + 1]
  ? path.resolve(ROOT, process.argv[outputArg + 1]) : null;
const labelArg = process.argv.indexOf('--label');
const label = labelArg >= 0 && process.argv[labelArg + 1] ? process.argv[labelArg + 1] : 'measurement';

const candidates = [
  process.env.BROWSER_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const browser = candidates.find((candidate) => fs.existsSync(candidate));
if (!browser) throw new Error('Chrome is required (set BROWSER_BIN when it is not in a standard location)');

const profiles = [
  {
    name: 'desktop', width: 1440, height: 900, mobile: false,
    deviceScaleFactor: 1, cpuSlowdown: 1, latencyMs: 0, downloadBps: -1, uploadBps: -1,
  },
  {
    // A reproducible lab proxy for a current mid-range Android handset: four
    // times CPU slowdown and a stable, usable mobile connection. This is not
    // presented as field telemetry; docs/performance/README.md keeps that
    // distinction next to every recorded result.
    name: 'mid-range-phone', width: 390, height: 844, mobile: true,
    deviceScaleFactor: 2.75, cpuSlowdown: 4, latencyMs: 80,
    downloadBps: 4_000_000 / 8, uploadBps: 1_000_000 / 8,
  },
];

const mime = {
  '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.mp4': 'video/mp4',
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
  response.setHeader('cache-control', 'no-store');
  fs.createReadStream(filename).pipe(response);
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(read, labelText, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await read();
      if (last) return last;
    } catch (error) { last = error; }
    await delay(50);
  }
  throw new Error(`timed out waiting for ${labelText}: ${last instanceof Error ? last.message : last || 'no result'}`);
}

async function measure(profile, port) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `cic-perf-${profile.name}-`));
  const child = spawn(browser, [
    '--headless=new', '--disable-gpu', '--mute-audio', '--no-sandbox', '--no-first-run',
    '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let chromeStderr = '';
  child.stderr.on('data', (chunk) => { chromeStderr += chunk; });
  let socket;

  try {
    const activePort = path.join(profileDir, 'DevToolsActivePort');
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
    const listeners = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
        return;
      }
      for (const fn of listeners.get(message.method) || []) fn(message.params || {});
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const on = (method, fn) => {
      if (!listeners.has(method)) listeners.set(method, []);
      listeners.get(method).push(fn);
    };
    const evaluate = async (expression) => {
      const evaluated = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression });
      if (evaluated.exceptionDetails) {
        throw new Error(evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text);
      }
      return evaluated.result.value;
    };

    const requests = new Map();
    const finished = [];
    let titleUsable = false;
    on('Network.requestWillBeSent', (event) => {
      requests.set(event.requestId, {
        url: event.request.url, type: event.type, beforeInteraction: !titleUsable,
      });
    });
    on('Network.loadingFinished', (event) => {
      const request = requests.get(event.requestId);
      if (request) finished.push({ ...request, bytes: event.encodedDataLength, beforeTitleUsable: !titleUsable });
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Performance.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: profile.width, height: profile.height,
      screenWidth: profile.width, screenHeight: profile.height,
      deviceScaleFactor: profile.deviceScaleFactor, mobile: profile.mobile,
    });
    await send('Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown });
    await send('Network.emulateNetworkConditions', {
      offline: false, latency: profile.latencyMs,
      downloadThroughput: profile.downloadBps, uploadThroughput: profile.uploadBps,
      connectionType: profile.mobile ? 'cellular4g' : 'none',
    });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__cicPerf = { phase: 'title boot', longTasks: [] };
      window.__cicBrowserErrors = [];
      addEventListener('error', event => __cicBrowserErrors.push(String(event.error || event.message)), true);
      addEventListener('unhandledrejection', event => __cicBrowserErrors.push(String(event.reason)), true);
      try {
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            __cicPerf.longTasks.push({
              phase: __cicPerf.phase, startMs: +entry.startTime.toFixed(1),
              durationMs: +entry.duration.toFixed(1),
            });
          }
        }).observe({ type: 'longtask', buffered: true });
      } catch (error) { __cicPerf.longTaskObserverError = String(error); }
    ` });

    const navStarted = Date.now();
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html?perf=${Date.now()}` });
    await waitFor(async () => evaluate(`(() => {
      const start = document.getElementById('btn-start');
      return typeof Game === 'object' && start && !start.disabled &&
        document.querySelectorAll('input[name="difficulty"]').length > 0 &&
        getComputedStyle(start).display !== 'none';
    })()`), 'interactive title screen');
    titleUsable = true;
    const titleWallClockMs = Date.now() - navStarted;

    const titleTiming = await evaluate(`(() => ({
      nowMs: performance.now(),
      paints: Object.fromEntries(performance.getEntriesByType('paint').map(e => [e.name, e.startTime])),
      navigation: performance.getEntriesByType('navigation')[0] && {
        responseStart: performance.getEntriesByType('navigation')[0].responseStart,
        domContentLoaded: performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,
        load: performance.getEntriesByType('navigation')[0].loadEventEnd,
      },
    }))()`);
    const titleHeap = await send('Runtime.getHeapUsage');
    const titleDom = await send('Memory.getDOMCounters');
    const titleRequests = [...requests.values()];
    const mediaBeforeInteraction = titleRequests.filter((request) =>
      /\/(?:audio|video)\//.test(new URL(request.url).pathname));

    await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    await evaluate(`(() => {
      __cicPerf.phase = 'map/globe render';
      const button = document.getElementById('btn-start');
      const started = performance.now();
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
      button.click();
      __cicPerf.mapRenderSyncMs = performance.now() - started;
    })()`);
    await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);

    // Exercise the projection transition as a separate phase. The public zoom
    // controls are used so the probe measures the same route as a player.
    await evaluate(`(() => {
      __cicPerf.phase = 'globe transition';
      const button = document.getElementById('zoom-out');
      const started = performance.now();
      for (let i = 0; i < 8; i++) button.click();
      __cicPerf.globeTransitionSyncMs = performance.now() - started;
    })()`);
    await delay(750);

    // Use the same strike-wall entry point as campaign resolution. Fast-forward
    // after the wall has painted so a measurement run stays short while still
    // covering wall construction, its frame loops, and teardown.
    await evaluate(`(() => {
      __cicPerf.phase = 'strike wall';
      MapView.resetView();
      const target = TARGETS.find(t => Game.plotted(t) && t.status !== 'destroyed');
      window.__cicStrikeDone = false;
      MapView.animateStrike('f35', target, () => { window.__cicStrikeDone = true; }, 2,
        { asset: 'f35', label: 'F-35A performance probe' });
    })()`);
    await waitFor(() => evaluate(`!document.getElementById('strike-wall').classList.contains('hidden')`), 'strike wall');
    await delay(750);
    await evaluate(`MapView.setFastForward(true)`);
    await waitFor(() => evaluate(`window.__cicStrikeDone === true && document.getElementById('strike-wall').classList.contains('hidden')`),
      'strike-wall cleanup');
    await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);

    const strikeHeap = await send('Runtime.getHeapUsage');
    const strikeDom = await send('Memory.getDOMCounters');
    const runtime = await evaluate(`__cicPerf`);
    const browserErrors = await evaluate(`window.__cicBrowserErrors || []`);

    const bytesBeforeTitle = finished
      .filter((request) => request.beforeTitleUsable)
      .reduce((total, request) => total + request.bytes, 0);
    const coreBeforeTitle = finished
      .filter((request) => request.beforeTitleUsable && !/\/(?:audio|video)\//.test(new URL(request.url).pathname))
      .reduce((total, request) => total + request.bytes, 0);

    return {
      profile: profile.name,
      emulation: {
        viewport: `${profile.width}x${profile.height}`,
        deviceScaleFactor: profile.deviceScaleFactor,
        cpuSlowdown: profile.cpuSlowdown,
        latencyMs: profile.latencyMs,
        downloadMbps: profile.downloadBps < 0 ? null : profile.downloadBps * 8 / 1_000_000,
      },
      title: {
        wallClockMs: titleWallClockMs,
        firstPaintMs: titleTiming.paints['first-paint'] ?? null,
        firstContentfulPaintMs: titleTiming.paints['first-contentful-paint'] ?? null,
        interactiveMs: titleTiming.nowMs,
        navigation: titleTiming.navigation,
        transferredBytes: Math.round(bytesBeforeTitle),
        coreTransferredBytes: Math.round(coreBeforeTitle),
        mediaRequestsBeforeInteraction: mediaBeforeInteraction.map((request) =>
          path.basename(new URL(request.url).pathname)).sort(),
        memory: {
          jsHeapUsedBytes: titleHeap.usedSize, jsHeapTotalBytes: titleHeap.totalSize,
          documents: titleDom.documents, nodes: titleDom.nodes, eventListeners: titleDom.jsEventListeners,
        },
      },
      rendering: {
        mapRenderSyncMs: +runtime.mapRenderSyncMs.toFixed(1),
        globeTransitionSyncMs: +runtime.globeTransitionSyncMs.toFixed(1),
        longTasks: runtime.longTasks,
      },
      afterStrikeWall: {
        memory: {
          jsHeapUsedBytes: strikeHeap.usedSize, jsHeapTotalBytes: strikeHeap.totalSize,
          documents: strikeDom.documents, nodes: strikeDom.nodes, eventListeners: strikeDom.jsEventListeners,
        },
      },
      browserErrors,
    };
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
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
try {
  const results = [];
  for (const profile of profiles) results.push(await measure(profile, port));
  const report = {
    schemaVersion: 1,
    label,
    measuredAt: new Date().toISOString(),
    gitCommit: process.env.GITHUB_SHA || null,
    browser: path.basename(browser),
    results,
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (output) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, json);
    console.log(`performance measurement written to ${path.relative(ROOT, output)}`);
  } else {
    process.stdout.write(json);
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
