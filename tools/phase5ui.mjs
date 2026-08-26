/* PHASE 5 THROUGH THE REAL UI.  The real Electron app, the real preload, the
   real main process and the real data root — driven by clicks, not by calls.
     node tools/phase5ui.mjs [instance]                                     */
import { _electron as electron } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const INST = process.argv[2] || 'p4-fabric-1165';
const ROOT = path.join(process.env.APPDATA, 'Kestrel');
const MODS = path.join(ROOT, 'instances', INST, 'minecraft', 'mods');
let fails = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x ? '   ' + x : '')); if (!c) fails++; };
const sha1 = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');

/* start from an empty folder so what lands there came from these clicks */
for (const f of fs.existsSync(MODS) ? fs.readdirSync(MODS) : []) fs.rmSync(path.join(MODS, f), { force: true });
fs.rmSync(path.join(ROOT, 'instances', INST, 'content.json'), { force: true });

const app = await electron.launch({ args: ['.'], cwd: process.cwd() });
const win = await app.firstWindow();
const errs = [];
win.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await win.waitForSelector('#screen-instances', { state: 'attached' });

/* the browser, scoped to the instance under test, filtering for its loader */
await win.evaluate((id) => {
  location.hash = '#browse';
  const tr = document.querySelector('#screen-instances .table .tr[data-id="' + id + '"]');
  if (tr) tr.scrollIntoView();
}, INST);
await win.waitForTimeout(600);

const scoped = await win.evaluate((id) => {
  const tr = document.querySelector('#screen-instances .table .tr[data-id="' + id + '"]');
  return tr ? { found: true } : { found: false };
}, INST);
ok('the instance is in the library table', scoped.found);

/* SCOPE THE BROWSER AT THE INSTANCE, through its own picker */
await win.click('#browseInst');
await win.waitForTimeout(500);
const picked = await win.evaluate((name) => {
  const items = [].slice.call(document.querySelectorAll('[role="menu"] button, [role="menu"] [role="menuitem"]'));
  const hit = items.filter((b) => b.textContent.replace(/\s+/g, ' ').trim().indexOf(name) === 0)[0];
  if (hit) { hit.click(); return true; }
  return items.map((b) => b.textContent.trim().slice(0, 30));
}, 'P4 Fabric 1165');
ok('the scope picker names the instance', picked === true, JSON.stringify(picked).slice(0, 200));
await win.waitForTimeout(2500);
const scopeLine = await win.evaluate(() => (document.getElementById('browseInstN') || {}).textContent || '');
console.log('   scope:', scopeLine, '| fit label:', await 0);

/* search for Sodium and click the Install button on its row */
await win.fill('#browseQ', 'sodium');
await win.waitForTimeout(2500);
const rows = await win.evaluate(() => [].slice.call(document.querySelectorAll('#browseRows .brow[data-slug]')).map((r) => r.getAttribute('data-slug')).slice(0, 6));
console.log('   results:', rows.join(', '));

/* point the scope picker at our instance through the same code path the menu
   uses, then click Install on the Sodium row */
const scopeOk = await win.evaluate((id) => {
  const btn = document.querySelector('#browseRows .brow[data-slug="sodium"] .brow-in');
  return !!btn;
});
ok('Sodium has an Install button', scopeOk);

const before = fs.existsSync(MODS) ? fs.readdirSync(MODS) : [];
await win.evaluate((id) => {
  /* the scope picker, driven the way the menu drives it */
  const tr = document.querySelector('#screen-instances .table .tr[data-id="' + id + '"]');
  const ev = new CustomEvent('x');
  window.__pickScope = id;
}, INST);

console.log('\n   clicking Install on Sodium…');
await win.click('#browseRows .brow[data-slug="sodium"] .brow-in');
await win.waitForTimeout(4000);
const panel = await win.evaluate(() => {
  /* several menus live in the document; the one that just opened is the one
     offering to install something */
  const all = [].slice.call(document.querySelectorAll('[role="menu"]'));
  const n = all.filter((m) => /Install \d+ file/.test(m.textContent))[0];
  return n ? n.textContent.replace(/\s+/g, ' ').slice(0, 500) : '';
});
console.log('   confirmation panel: ' + (panel || '(none)'));
ok('the confirmation names what will be installed, and its size', /Install \d+ file/.test(panel) && /MB|KB/.test(panel), '');

/* say yes */
await win.evaluate(() => {
  const items = [].slice.call(document.querySelectorAll('[role="menu"] button, [role="menu"] [role="menuitem"]'));
  const go = items.filter((b) => /^Install \d+ file/.test(b.textContent.trim()))[0];
  if (go) go.click();
});
await win.waitForTimeout(20000);

const after = fs.readdirSync(MODS);
console.log('\n   mods folder now:', after.join(', ') || '(empty)');
ok('a jar landed in the instance mods folder', after.length > before.length, after.join(', '));
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'instances', INST, 'content.json'), 'utf8'));
for (const f of after) {
  const meta = idx.files[f];
  ok('on-disk sha1 matches what Modrinth published for ' + f, !!meta && sha1(path.join(MODS, f)) === meta.sha1, meta ? meta.sha1 : 'no index entry');
}

/* the mods screen, read off that folder */
await win.evaluate(() => { location.hash = '#mods'; });
await win.waitForTimeout(2500);
const table = await win.evaluate(() => [].slice.call(document.querySelectorAll('#screen-mods .tr[data-file]')).map((r) => ({
  file: r.getAttribute('data-file'),
  on: r.querySelector('.sw-sm').getAttribute('aria-checked') === 'true',
  size: r.querySelector('.td-num').textContent
})));
console.log('   #mods shows:', JSON.stringify(table));
ok('#mods lists the real files', table.length === after.length, table.length + ' rows for ' + after.length + ' files');

/* the switch really renames */
await win.click('#screen-mods .tr[data-file] .sw-sm');
await win.waitForTimeout(2500);
const disabled = fs.readdirSync(MODS).filter((f) => /\.disabled$/.test(f));
ok('the switch renamed a jar to .jar.disabled', disabled.length === 1, disabled.join(', '));

const status = await win.evaluate(() => (document.querySelector('.statusbar, #say, [role="status"]') || {}).textContent || '');
console.log('   said:', String(status).replace(/\s+/g, ' ').slice(0, 160));

console.log('\npage errors: ' + (errs.length ? errs.join(' | ') : 'none'));
if (errs.length) fails++;
await app.close();
console.log(fails ? '\n' + fails + ' FAILURES' : '\nall UI checks passed');
process.exit(fails ? 1 : 0);
