// Shoot the light theme. The theme is addressable, so this is the same
// pipeline as tools/shootui.mjs with ?theme=light on the URL.
//   UI_ROOT=variants/c4 node tools/_shootlight.mjs c4-light play settings
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const ROOT = join(process.cwd(), process.env.UI_ROOT || 'ui');
const server = createServer(async (req, res) => {
  try {
    const raw = decodeURIComponent(req.url.split('?')[0]);
    const rel = normalize(raw.split('/').filter(Boolean).join('/'));
    const file = join(ROOT, rel === '' ? 'index.html' : rel);
    const buf = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const prefix = process.argv[2] || 'light';
const screens = process.argv.slice(3);
const palette = process.env.PALETTE || 'slate';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: 'light' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
for (const s of screens) {
  await page.goto(`http://127.0.0.1:${port}/index.html?theme=light&palette=${palette}#${s}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const out = `shots/${prefix}-${s}.png`;
  await page.screenshot({ path: out });
  console.log('ok ' + out);
}
if (errors.length) { console.log('--- console errors ---'); errors.slice(0, 20).forEach((e) => console.log('  ' + e)); }
await browser.close();
server.close();
