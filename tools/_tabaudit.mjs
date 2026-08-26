// Tabular-rule audit.  Walks every screen, finds every rendered text run that
// contains a digit, and reports whether it is set in the mono face and what
// kind of context it sits in.  The rule (tokens.css): mono marks a measured
// value and stops at its edge — unit nouns and connecting words stay
// proportional; inside a list the face belongs to the column.
//   UI_ROOT=variants/c4 node tools/_tabaudit.mjs [--list]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = join(process.cwd(), process.env.UI_ROOT || 'ui');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
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

const SCREENS = ['play', 'instances', 'instance', 'mods', 'new', 'import', 'servers',
                 'accounts', 'settings', 'appearance', 'states',
                 'states/empty', 'states/downloading', 'states/failed', 'states/no-java',
                 'states/offline', 'states/running', 'states/crashed'];

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

const NOUNS = /\b(mods?|files?|sessions?|instances?|jars?|minutes?|seconds?|hours?|objects?|results?|left|free|ago|available|and|of|on disk|for|timed|selected|newer)\b/i;
const rows = [];
for (const s of SCREENS) {
  await page.goto(`http://127.0.0.1:${port}/index.html#${s}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  const found = await page.evaluate(() => {
    const out = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      const el = n.parentElement;
      if (!el || el.closest('.sprite')) continue;
      if (!el.offsetParent && el.tagName !== 'BODY' && getComputedStyle(el).display === 'none') continue;
      const txt = n.nodeValue.replace(/\s+/g, ' ').trim();
      if (!txt || !/\d/.test(txt)) continue;
      const mono = getComputedStyle(el).fontFamily.toLowerCase().includes('azeret');
      const col = el.className && typeof el.className === 'string' ? el.className : '';
      out.push({ txt, mono, col, tag: el.tagName.toLowerCase() });
    }
    // inputs and placeholders carry values too
    document.querySelectorAll('input,textarea').forEach((el) => {
      if (!el.value || !/\d/.test(el.value)) return;
      if (getComputedStyle(el).display === 'none') return;
      const mono = getComputedStyle(el).fontFamily.toLowerCase().includes('azeret');
      out.push({ txt: String(el.value).slice(0, 80), mono, col: el.className || '', tag: 'input' });
    });
    return out;
  });
  found.forEach((f) => rows.push({ screen: s, ...f }));
}
await browser.close(); server.close();

// de-duplicate: the same string in the same treatment is one decision
const seen = new Map();
for (const r of rows) {
  const k = r.txt + '|' + r.mono + '|' + r.col;
  if (!seen.has(k)) seen.set(k, r);
}
const uniq = [...seen.values()];
const monoRuns = uniq.filter((r) => r.mono);
const propRuns = uniq.filter((r) => !r.mono);
const suspect = monoRuns.filter((r) => NOUNS.test(r.txt));

console.log('distinct digit-bearing runs : ' + uniq.length);
console.log('  set in the mono face      : ' + monoRuns.length);
console.log('  set proportional          : ' + propRuns.length);
console.log('  mono runs containing a unit noun or connective (rule violations): ' + suspect.length);
if (suspect.length) suspect.forEach((r) => console.log('    ! ' + r.screen + '  [' + r.col + ']  ' + r.txt));
if (process.argv.includes('--list')) {
  console.log('\n--- every run ---');
  uniq.sort((a, b) => Number(b.mono) - Number(a.mono)).forEach((r) =>
    console.log((r.mono ? 'MONO ' : 'prop ') + '[' + (r.col || r.tag) + '] ' + r.txt.slice(0, 90)));
}
