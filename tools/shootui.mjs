// Screenshot our own launcher UI. Serves ui/ over http (so modules/fetch work) and
// captures each named screen at desktop app size.
//   node tools/shootui.mjs <outPrefix> [screen ...]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
const ROOT = join(process.cwd(), process.env.UI_ROOT || 'ui');

const server = createServer(async (req, res) => {
  try {
    const raw = decodeURIComponent(req.url.split('?')[0]);
    const rel = normalize(raw.split('/').filter(Boolean).join('/'));
    const file = join(ROOT, rel === '' ? 'index.html' : rel);
    const buf = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const prefix = process.argv[2] || 'ui';
const screens = process.argv.slice(3);
const list = screens.length ? screens : ['play'];

let browser;
for (const o of [{ channel: 'chrome' }, { channel: 'msedge' }, {}]) {
  try { browser = await chromium.launch({ headless: true, ...o }); break; } catch {}
}
if (!browser) { console.error('no browser binary'); process.exit(2); }

// Desktop-app window size, matching how the reference screenshots were taken.
const ctx = await browser.newContext({ viewport: { width: +(process.env.VW || 1280), height: +(process.env.VH || 800) }, deviceScaleFactor: 2, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

for (const screen of list) {
  await page.goto(`http://127.0.0.1:${port}/index.html#${screen}`, { waitUntil: 'networkidle', timeout: 30000 });
  if (process.env.INIT_JS) { await page.evaluate(process.env.INIT_JS); await page.waitForTimeout(400); }
  await page.waitForTimeout(700);
  const out = `shots/${prefix}-${screen}.png`;
  await page.screenshot({ path: out });
  console.log('ok ' + out);
}
if (errors.length) { console.log('--- console errors ---'); errors.slice(0, 20).forEach((e) => console.log('  ' + e)); }
await browser.close();
server.close();
