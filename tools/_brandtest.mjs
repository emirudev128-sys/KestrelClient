// Brand substitution test.  Temporarily renames the product, walks every
// screen, and reports any rendered text, attribute or URL that still carries
// the old name.  The check is the deliverable, not the constant.
//   UI_ROOT=variants/c4 node tools/_brandtest.mjs Zzyzx
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = join(process.cwd(), process.env.UI_ROOT || 'ui');
const NEW = process.argv[2] || 'Zzyzx';
const OLD = 'Kestrel';
const brandPath = join(ROOT, 'scripts/brand.js');
const original = await readFile(brandPath, 'utf8');
await writeFile(brandPath, original.replace("name: '" + OLD + "'", "name: '" + NEW + "'"));

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const raw = decodeURIComponent(req.url.split('?')[0]);
    const rel = normalize(raw.split('/').filter(Boolean).join('/'));
    const buf = await readFile(join(ROOT, rel === '' ? 'index.html' : rel));
    res.writeHead(200, { 'Content-Type': MIME[extname(join(ROOT, rel))] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const SCREENS = ['play', 'instances', 'instance', 'mods', 'mods-drop', 'new', 'import', 'servers',
                 'accounts', 'settings', 'appearance', 'states',
                 'states/empty', 'states/downloading', 'states/failed', 'states/no-java',
                 'states/offline', 'states/running', 'states/crashed'];

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const hits = [];
const rx = new RegExp(OLD, 'i');

for (const s of SCREENS) {
  await page.goto(`http://127.0.0.1:${port}/index.html#${s}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  const found = await page.evaluate((old) => {
    const out = [];
    const re = new RegExp(old, 'i');
    if (re.test(document.title)) out.push('<title> = ' + document.title);
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      if (n.parentElement && n.parentElement.closest('.sprite')) continue;
      if (re.test(n.nodeValue)) out.push('text: ' + n.nodeValue.trim().slice(0, 120));
    }
    document.querySelectorAll('*').forEach((el) => {
      for (const a of el.attributes) {
        if (a.name === 'class' || a.name === 'id' || a.name === 'style') continue;
        if (re.test(a.value)) out.push('@' + a.name + ' on ' + el.tagName.toLowerCase() + ' = ' + a.value.slice(0, 120));
      }
      if (el.value && re.test(el.value)) out.push('value on ' + el.tagName.toLowerCase() + ' = ' + String(el.value).slice(0, 120));
    });
    return out;
  }, OLD);
  found.forEach((f) => hits.push(s + '  ' + f));
}
await browser.close();
server.close();
await writeFile(brandPath, original);

const uniq = [...new Set(hits)];
if (!uniq.length) console.log('PASS — nothing rendered says "' + OLD + '" after renaming to "' + NEW + '"');
else { console.log('FAIL — ' + uniq.length + ' rendered occurrence(s):'); uniq.forEach((h) => console.log('  ' + h)); }
