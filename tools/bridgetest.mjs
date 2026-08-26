/* The renderer with a STUB bridge in front of it — clicktest proves the
   no-bridge path still degrades, this proves the bridge path does not throw.
     node tools/bridgetest.mjs                                              */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
const ROOT = join(process.cwd(), 'ui');
const server = createServer(async (req, res) => {
  try {
    const rel = normalize(decodeURIComponent(req.url.split('?')[0]).split('/').filter(Boolean).join('/'));
    const f = join(ROOT, rel === '' ? 'index.html' : rel);
    const buf = await readFile(f);
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('x'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
let b; for (const o of [{ channel: 'chrome' }, {}]) { try { b = await chromium.launch({ headless: true, ...o }); break; } catch { } }
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));

await p.addInitScript(() => {
  const bus = {};
  const on = (k) => (fn) => { (bus[k] = bus[k] || []).push(fn); };
  window.__fire = (k, v) => (bus[k] || []).forEach((f) => f(v));
  window.__calls = [];
  const rec = (n, v) => (...a) => { window.__calls.push(n + '(' + JSON.stringify(a).slice(0, 80) + ')'); return Promise.resolve(v); };
  const vs = [];
  for (let i = 0; i < 400; i++) vs.push({ id: '1.' + i, type: i % 3 ? 'snapshot' : 'release', released: '2024-01-0' + (i % 9 + 1) + 'T00:00:00+00:00' });
  window.kestrel = {
    available: true,
    window: { minimize() {}, maximize() {}, close() {}, isMaximized: () => false, onState() {} },
    instances: {
      boot: () => ({ seeded: true, libKb: 1024, items: [{ id: 'crystal-pvp', name: 'Crystal PvP', ver: '1.8.9', current: true, art: 'b-obsid', loader: 'Vanilla', lver: '', mods: 0, size: '327 MB', when: 'Never', group: 'PvP', playtime: { hrs: 'lo', h: '0h', m: '00m' }, pos: 0 }] }),
      seed: () => [], list: rec('list', []), get: rec('get', null), create: rec('create', {}),
      update: rec('update', {}), remove: rec('remove', true), duplicate: rec('duplicate', {})
    },
    settings: { get: rec('settings.get', {}), set: rec('settings.set', {}) },
    auth: { status: rec('auth.status', { mode: 'demo' }), begin: rec('auth.begin', {}), cancel: rec('auth.cancel', true), onEvent: on('auth') },
    accounts: { list: rec('accounts.list', []), activate: rec('a', []), remove: rec('r', []) },
    game: {
      versions: rec('game.versions', { latest: { release: '1.0' }, versions: vs }),
      java: rec('game.java', []), javaFor: rec('game.javaFor', { want: 8, runtime: null, have: [], message: 'no java' }),
      status: rec('game.status', {}), install: rec('game.install', {}),
      play: rec('game.play', { session: 's1', pid: 1, version: '1.8.9', offline: true, player: 'P', java: {}, install: {} }),
      cancel: rec('game.cancel', true), kill: rec('game.kill', true), running: rec('game.running', []),
      onProgress: on('prog'), onLog: on('log'), onExit: on('exit'), onStarted: on('start')
    },
    openDataFolder: rec('openDataFolder', '')
  };
});

await p.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle' });
await p.waitForTimeout(600);

// the version table should now hold the 400 stub versions, not the fixture
await p.evaluate(() => { location.hash = '#new'; });
await p.waitForTimeout(400);
const rows = await p.evaluate(() => document.querySelectorAll('#mkVers .tr-pick').length);
const first = await p.evaluate(() => { const r = document.querySelector('#mkVers .tr-pick .td-fig'); return r ? r.textContent : ''; });
console.log('version rows after manifest:', rows, ' first:', first, rows === 400 ? '(PASS)' : '(FAIL — expected 400)');

// a launch, driven by fake progress events
await p.evaluate(() => { location.hash = '#play'; });
await p.waitForTimeout(200);
await p.evaluate(() => document.getElementById('goBtn').click());
await p.waitForTimeout(200);
for (const ev of [
  { instance: 'crystal-pvp', phase: 'preparing', done: 100, total: 770, bytes: 0, totalBytes: 0, file: 'x' },
  { instance: 'crystal-pvp', phase: 'downloading', done: 142, total: 770, bytes: 38_000_000, totalBytes: 146_000_000, file: 'lwjgl.jar' },
  { instance: 'crystal-pvp', phase: 'installing', done: 1, total: 4, bytes: 146_000_000, totalBytes: 146_000_000, file: 'unpacking natives' }
]) {
  await p.evaluate((e) => window.__fire('prog', e), ev);
  await p.waitForTimeout(120);
  const shot = await p.evaluate(() => ({
    launch: document.documentElement.dataset.launch,
    label: document.getElementById('goLabel').textContent,
    sub: document.getElementById('goSub').textContent,
    fill: document.getElementById('goFill').style.getPropertyValue('--p')
  }));
  console.log(' ', ev.phase.padEnd(12), JSON.stringify(shot));
}

// a log line should reach the log panel
await p.evaluate(() => window.__fire('log', { instance: 'crystal-pvp', session: 's1', stream: 'out', line: '[03:28:39] [Client thread/INFO]: Setting user: KestrelTest' }));
await p.waitForTimeout(150);
const logged = await p.evaluate(() => (document.querySelector('#tp-instance-logs .logsnip') || {}).textContent || '');
console.log('log panel:', JSON.stringify(logged.trim().slice(0, 70)), /Setting user/.test(logged) ? '(PASS)' : '(FAIL)');

// exit
await p.evaluate(() => window.__fire('exit', { instance: 'crystal-pvp', session: 's1', code: 0, ms: 42000 }));
await p.waitForTimeout(150);
console.log('after exit, launch state:', await p.evaluate(() => document.documentElement.dataset.launch));

const calls = await p.evaluate(() => window.__calls);
console.log('bridge calls made:', calls.filter((c) => c.startsWith('game.')).join(' · ') || 'none');
console.log('page errors:', errs.length ? errs : 'none');
await b.close(); server.close();
process.exit(errs.length ? 1 : 0);
