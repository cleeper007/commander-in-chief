import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const captureDir = process.env.CIC_CAPTURE_DIR
  ? path.resolve(ROOT, process.env.CIC_CAPTURE_DIR)
  : null;
if (captureDir) fs.mkdirSync(captureDir, { recursive: true });
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
  '--headless=new', '--disable-gpu', '--mute-audio', '--no-sandbox', '--no-first-run',
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
  const evaluate = async (expression) => {
    const evaluated = await send('Runtime.evaluate', { returnByValue: true, expression });
    if (evaluated.exceptionDetails) {
      throw new Error(evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text);
    }
    return evaluated.result.value;
  };
  const viewport = async (width, height, mobile = width <= 900) => {
    await send('Emulation.setDeviceMetricsOverride', {
      width, height, screenWidth: width, screenHeight: height,
      deviceScaleFactor: 1, mobile,
    });
    await delay(80);
  };
  const capture = async (name) => {
    if (!captureDir) return;
    const shot = await send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: false,
    });
    fs.writeFileSync(path.join(captureDir, `${name}.png`), Buffer.from(shot.data, 'base64'));
  };

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

  // The reading preference is available before a campaign, reaches 14px, and
  // survives a real navigation rather than only living in module state.
  await viewport(390, 844, true);
  const titleReading = await evaluate(`(() => {
    document.getElementById('btn-comfort-title').click();
    const brief = getComputedStyle(document.querySelector('.title-brief'));
    return {
      reading: document.documentElement.dataset.reading,
      pressed: document.getElementById('btn-comfort-title').getAttribute('aria-pressed'),
      fontSize: parseFloat(brief.fontSize),
      stored: localStorage.getItem('cic-comfortable-reading'),
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  })()`);
  assert.equal(titleReading.reading, 'comfortable');
  assert.equal(titleReading.pressed, 'true');
  assert.ok(titleReading.fontSize >= 14);
  assert.equal(titleReading.stored, '1');
  assert.ok(titleReading.overflow <= 1, `title overflows horizontally by ${titleReading.overflow}px`);
  if (captureDir) {
    await viewport(1440, 900, false);
    await capture('title-1440x900');
    await viewport(390, 844, true);
  }

  await send('Page.reload', { ignoreCache: true });
  await waitFor(async () => {
    const result = await send('Runtime.evaluate', {
      expression: 'document.readyState === "complete" && typeof Game === "object" && document.documentElement.dataset.reading === "comfortable"',
    });
    return result.result && result.result.value;
  }, 'comfortable reading persistence');

  await viewport(1366, 768, false);
  const state = await evaluate(`(() => {
      const hard = document.querySelector('input[name="difficulty"][value="hard"]');
      if (hard) hard.checked = true;
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
    })()`);
  assert.deepEqual(state.errors, []);
  assert.equal(state.turn, 1);
  assert.equal(state.over, false);
  assert.ok(state.targets >= 30);
  assert.equal(state.invariant, true);
  assert.equal(state.appVisible, true);
  assert.equal(state.titleHidden, true);

  // Every icon control is named, every toggle exposes state, and each panel
  // disclosure points to the region it expands.
  const a11y = await evaluate(`(() => {
    const ids = ['toggle-bases','zoom-in','zoom-out','zoom-reset','btn-mute','btn-music','btn-feedback'];
    const iconNames = ids.map(id => [id, document.getElementById(id).getAttribute('aria-label')]);
    const toggles = ['toggle-bases','btn-mute','btn-music','btn-comfort','ops-toggle-bases']
      .map(id => [id, document.getElementById(id).getAttribute('aria-pressed')]);
    const badPanels = [...document.querySelectorAll('.panel-head')].filter(head => {
      const controlled = head.getAttribute('aria-controls');
      return !['true','false'].includes(head.getAttribute('aria-expanded')) || !controlled || !document.getElementById(controlled);
    }).length;
    return { iconNames, toggles, badPanels };
  })()`);
  assert.equal(a11y.iconNames.every(([, name]) => name && name.trim()), true);
  assert.equal(a11y.toggles.every(([, pressed]) => ['true', 'false'].includes(pressed)), true);
  assert.equal(a11y.badPanels, 0);

  // The operations list reaches the same hard-mode strike planner as the SVG.
  const operations = await evaluate(`(() => {
    const panel = document.getElementById('operations-panel');
    panel.classList.remove('hidden');
    panel.querySelector('.panel-head').click();
    const targetDetails = panel.querySelector('[data-ops-section="targets"]');
    targetDetails.open = true;
    const target = targetDetails.querySelector('[data-ops-target]');
    target.click();
    const help = document.getElementById('strike-confirm-help');
    return {
      targets: targetDetails.querySelectorAll('[data-ops-target]').length,
      expanded: panel.querySelector('.panel-head').getAttribute('aria-expanded'),
      strikeOpen: !document.getElementById('strike-modal').classList.contains('hidden'),
      confirmDisabled: document.getElementById('btn-confirm-strike').disabled,
      disabledReason: help && !help.classList.contains('hidden') && help.textContent.trim(),
    };
  })()`);
  assert.ok(operations.targets > 0);
  assert.equal(operations.expanded, 'true');
  assert.equal(operations.strikeOpen, true);
  assert.equal(operations.confirmDisabled, true);
  assert.ok(operations.disabledReason);
  await evaluate(`document.querySelector('#strike-modal .modal-close').click()`);

  // Opening a dialog moves focus inside it, wraps Shift+Tab at the first item,
  // and closing it returns focus to the invoking control.
  await evaluate(`(() => {
    const button = document.getElementById('btn-feedback');
    button.focus();
    button.click();
  })()`);
  await delay(80);
  const focusIn = await evaluate(`document.activeElement.getAttribute('aria-label')`);
  assert.equal(focusIn, 'Close problem report');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', modifiers: 8 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', modifiers: 8 });
  await delay(30);
  const wrapped = await evaluate(`document.activeElement.id`);
  assert.equal(wrapped, 'btn-feedback-open');
  await evaluate(`document.querySelector('#feedback-modal .modal-close').click()`);
  await delay(30);
  const focusReturned = await evaluate(`document.activeElement.id`);
  assert.equal(focusReturned, 'btn-feedback');

  // Comfortable mode must leave the map, action deck, and horizontal layout
  // reachable across the required device matrix. The final entry approximates
  // a 1366x768 display at 200% browser zoom in CSS pixels.
  const matrix = [
    [390, 844, true, 'portrait phone'],
    [844, 390, true, 'landscape phone'],
    [768, 1024, true, 'tablet'],
    [1366, 768, false, 'laptop'],
    [1440, 900, false, 'desktop'],
    [683, 384, false, '200% zoom'],
  ];
  const layouts = [];
  for (const [width, height, mobile, label] of matrix) {
    await viewport(width, height, mobile);
    const layout = await evaluate(`(() => {
      const rect = id => {
        const r = document.getElementById(id).getBoundingClientRect();
        return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height };
      };
      return {
        innerWidth, innerHeight,
        overflow: document.documentElement.scrollWidth - innerWidth,
        map: rect('map-panel'), sidebar: rect('sidebar'), session: rect('session-buttons'),
        endTurn: rect('btn-end-turn'),
        reading: document.documentElement.dataset.reading,
        errors: window.__cicBrowserErrors,
      };
    })()`);
    assert.equal(layout.reading, 'comfortable', `${label}: reading mode was lost`);
    assert.ok(layout.overflow <= 1, `${label}: page overflows horizontally by ${layout.overflow}px`);
    assert.ok(layout.map.width > 0 && layout.map.height >= 120, `${label}: map collapsed`);
    assert.ok(layout.sidebar.width > 0 && layout.sidebar.height >= 120, `${label}: action deck collapsed`);
    assert.ok(layout.session.width > 0 && layout.endTurn.width > 0, `${label}: session actions are unreachable`);
    assert.deepEqual(layout.errors, [], `${label}: browser error`);
    layouts.push(`${label} ${width}x${height}`);
    await capture(label === '200% zoom'
      ? 'situation-room-200pct-683x384'
      : `situation-room-${width}x${height}`);
  }

  // Optional release evidence: stage representative UI states after the
  // behavioral assertions so the capture path cannot make the test pass.
  if (captureDir) {
    await viewport(1440, 900, false);
    await evaluate(`(() => {
      Game.G.difficulty = 'easy';
      UI.renderAll(Game.G);
      UI.openBrief(Game.briefOptions(), []);
    })()`);
    await delay(80);
    await capture('decision-brief-1440x900');
    await evaluate(`UI.closeBrief()`);

    await evaluate(`(() => {
      const target = TARGETS.find(t => Game.plotted(t) && t.status !== 'destroyed');
      MapView.animateStrike('f35', target, () => {}, 2, { label: 'F-35A strike package' });
    })()`);
    await delay(350);
    await capture('strike-wall-1440x900');
    await evaluate(`MapView.setFastForward(true)`);
    await delay(100);

    await evaluate(`UI.showReport('OVERNIGHT DEVELOPMENTS', [
      { title:'AIR-DEFENSE NETWORK HIT', sum:'Tehran air-defense complex damaged',
        text:'Battle damage assessment shows multiple radar arrays out of service. Follow-on collection is required.',
        outcome:'damaged', dWorld:-2 },
      { title:'IRANIAN MISSILE ATTACK', sum:'Aegis defeated an inbound salvo',
        text:'The escort screen intercepted the attack before it reached the carrier.', dApproval:1 },
      { title:'STRAIT TRAFFIC', sum:'Hormuz remains open',
        text:'Commercial traffic continues under naval escort.', hormuz:'OPEN' }
    ], null)`);
    await delay(80);
    await capture('report-1440x900');
    await evaluate(`document.getElementById('btn-report-ok').click()`);

    await evaluate(`UI.showEndgame({
      title:'CAMPAIGN COMPLETE — DECISIVE VICTORY', kind:'victory',
      total:{letter:'A',mark:'A',score:92,blurb:'The central war aims were achieved before the coalition or the home front broke.'},
      verdict:'Iran can no longer sustain the war or rebuild a nuclear breakout under fire.',
      narrative:'The campaign ended with the Strait open, the strike force intact, and Tehran accepting an armistice from a position of military defeat.',
      stats:{approval:54,oil:118,casualties:18,limit:190,destroyed:17,turns:12,difficulty:'EASY',seed:Game.G.campaignSeed},
      grades:[
        {label:'MILITARY OBJECTIVES',weight:4,letter:'A',score:96,note:'The nuclear program and the main instruments of war were broken.'},
        {label:'AMERICAN LIVES',weight:2,letter:'B',score:84,note:'Losses stayed well below the campaign limit.'},
        {label:'HOME FRONT',weight:1,letter:'A',score:92,note:'Public support held through the final night.'}
      ],
      posture:{name:'COERCIVE ATTRITION',brief:'Tehran tried to outlast the coalition through calibrated missile and maritime pressure.'},
      postureKnown:true, aircrew:[], bdaLog:[],
      timeline:[
        {turn:1,approval:62,dead:7,deg:0,text:'The opening strike order was signed.'},
        {turn:6,approval:58,dead:12,deg:55,text:'Air superiority opened the deep strike route.'},
        {turn:12,approval:54,dead:18,deg:100,text:'Tehran accepted the armistice.'}
      ]
    })`);
    await delay(80);
    await capture('endgame-1440x900');
  }

  console.log(`browser smoke passed: ${state.targets} targets, campaign at turn ${state.turn}; ${layouts.join(', ')}`);
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
