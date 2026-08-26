/* PHASE 5, the main-process half, exercised without a window.
   Store + Game + ContentStore against the real Modrinth API and the real
   %APPDATA%/Kestrel data root.  Run:  node tools/phase5check.mjs [instance]  */
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Store } = require('../store.js');
const { Game } = require('../mc/index.js');
const { safeName } = require('../mc/content.js');

const ROOT = path.join(process.env.APPDATA, 'Kestrel');
const INST = process.argv[2] || 'p4-fabric-1165';
const store = new Store(ROOT);
const game = new Game({ store, emit: () => {}, log: (l) => console.log('   ' + l) });

function sha1File(f) {
  return crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
}
let fails = 0;
function check(label, cond, detail) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '  ' + detail : ''));
  if (!cond) fails++;
}

const inst = store.get(INST);
console.log('instance', INST, '=', inst && inst.ver, inst && inst.loader, '| prof', inst && inst.prof);

console.log('\n1. filename sanitising');
const cases = [
  ['../../../../Windows/System32/evil.jar', 'evil.jar'],
  ['a\\b\\..\\..\\x.jar', 'x.jar'],
  ['CON.jar', '_CON.jar'],
  ['sodium.jar.exe', 'sodium.jar.exe.jar'],
  ['  .hidden.jar', 'hidden.jar'],
  ['x'.repeat(300) + '.jar', 'x'.repeat(140) + '.jar']
];
for (const [raw, want] of cases) check('safeName ' + JSON.stringify(raw.slice(0, 40)), safeName(raw, 'mod', 'fb') === want, '-> ' + safeName(raw, 'mod', 'fb'));
try { game.L.contentFile(INST, 'mod', '../evil.jar'); check('Layout refuses ..', false); }
catch (e) { check('Layout refuses ..', true, e.message); }

console.log('\n2. plan Sodium (AANobbMI)');
const plan = await game.contentPlan(INST, 'AANobbMI', 'mod');
console.log('   plan', plan.id, '| items', plan.items.length, '| bytes', plan.bytes);
for (const i of plan.items) console.log('     ' + '  '.repeat(i.depth) + i.title + ' ' + i.version + ' -> ' + i.filename + ' (' + i.size + ' B, sha1 ' + i.sha1.slice(0, 12) + '…' + (i.present ? ', present' : '') + ')');
check('plan has a sodium file', plan.items.length >= 1 && /sodium/i.test(plan.items[0].filename));
check('every item carries a sha1', plan.items.every((i) => i.error || /^[0-9a-f]{40}$/.test(i.sha1)));

console.log('\n3. install it');
const res = await game.contentInstall(INST, plan.id);
console.log('   installed', res.installed.length, 'file(s),', res.bytes, 'bytes');
for (const d of res.installed) {
  const p = game.L.contentFile(INST, 'mod', d.filename);
  const on = fs.existsSync(p);
  const dig = on ? sha1File(p) : '';
  check('on disk + hash ' + d.filename, on && dig === d.sha1, dig ? dig : '(missing)');
  check('size matches ' + d.filename, on && fs.statSync(p).size === d.size, on ? String(fs.statSync(p).size) : '');
}

console.log('\n4. list the folder');
let list = await game.contentList(INST, 'mod');
for (const m of list) console.log('   ' + (m.enabled ? '[on ] ' : '[off] ') + m.file + '  ' + m.size + ' B  ' + m.title + ' ' + m.version + (m.managed ? '' : '  (unmanaged)'));
check('list sees the file', list.length >= 1);
check('record mods count follows', store.get(INST).mods === list.filter((m) => m.enabled).length, String(store.get(INST).mods));

console.log('\n5. disable / enable');
const first = list[0];
const off = await game.contentSetEnabled(INST, 'mod', first.file, false);
check('renamed to .jar.disabled', /\.jar\.disabled$/.test(off.file) && fs.existsSync(game.L.contentFile(INST, 'mod', off.file)), off.file);
check('the .jar is gone', !fs.existsSync(game.L.contentFile(INST, 'mod', first.name)));
check('count dropped', store.get(INST).mods === (await game.contentList(INST, 'mod')).filter((m) => m.enabled).length);
await game.contentSetEnabled(INST, 'mod', off.file, true);
check('back to .jar', fs.existsSync(game.L.contentFile(INST, 'mod', first.name)));

console.log('\n6. a project with required dependencies (REI)');
try {
  const p2 = await game.contentPlan(INST, 'nfn13YXA', 'mod');
  console.log('   plan', p2.items.length, 'items,', p2.bytes, 'bytes');
  for (const i of p2.items) console.log('     ' + '  '.repeat(i.depth) + (i.depth ? 'needs ' : '') + i.title + ' ' + i.version + ' -> ' + i.filename + (i.error ? '  !! ' + i.error : ''));
  check('the dependency tree is more than one file', p2.items.length > 1, p2.items.length + ' items');
  check('dependencies are marked required', p2.items.filter((i) => i.depth > 0).every((i) => i.required));
  const r2 = await game.contentInstall(INST, p2.id);
  console.log('   installed', r2.installed.map((d) => d.filename).join(', '));
  for (const d of r2.installed) {
    const p = game.L.contentFile(INST, 'mod', d.filename);
    check('dep on disk + hash ' + d.filename, fs.existsSync(p) && sha1File(p) === d.sha1);
  }
} catch (e) { check('REI plan', false, e.message); }

console.log('\n7. update check');
const ups = await game.contentUpdates(INST, 'mod');
for (const u of ups) console.log('   ' + u.state.padEnd(9) + u.name + (u.state === 'update' ? '  ' + u.from + ' -> ' + u.to : ''));
check('every installed file got an answer', ups.length === (await game.contentList(INST, 'mod')).length);

console.log('\n8. refusals');
try { await game.contentPlan(INST, 'AANobbMI', 'modpack'); check('modpack refused', false); }
catch (e) { check('modpack refused', /modpack/i.test(e.message), e.message.slice(0, 70) + '…'); }
try { await game.contentRemove(INST, 'mod', '../../instance.json'); check('remove refuses a path', false); }
catch (e) { check('remove refuses a path', true, e.message); }
try { await game.contentInstall(INST, 'not-a-plan'); check('unknown plan refused', false); }
catch (e) { check('unknown plan refused', true, e.message); }

/* ── 9. modpacks ───────────────────────────────────────────────────────────
   A .mrpack is a manifest of urls and paths written by a pack author, so the
   assertions that matter are the two that make it safe to read one: the host
   of every download is on an exact-match list, and every file carries a
   digest.  The pack is fetched live, like everything else in this file.    */
console.log('\n9. modpacks');
const modpack = require('../mc/modpack.js');
const net = require('../mc/net.js');

check('a foreign host is refused', (function () {
  try { modpack.hostOk('https://example.com/evil.jar'); return false; } catch (e) { return /not a host/.test(e.message); }
})());
check('plain http is refused', (function () {
  try { modpack.hostOk('http://cdn.modrinth.com/a.jar'); return false; } catch (e) { return true; }
})());
check('the CDN is allowed', modpack.hostOk('https://cdn.modrinth.com/a.jar') === 'https://cdn.modrinth.com/a.jar');

const packVersions = await net.getJSON('https://api.modrinth.com/v2/project/fabulously-optimized/version');
const packFile = packVersions[0].files.find((f) => f.primary) || packVersions[0].files[0];
const packBuf = await net.getBuffer(packFile.url, 64 * 1024 * 1024);
const p = modpack.plan(packBuf);
console.log('   ' + p.name + ' ' + p.versionId + ' — Minecraft ' + p.mc + ', ' + p.loader + ' ' + p.loaderVersion);
check('the pack names a Minecraft version', !!p.mc, p.mc);
check('and exactly one loader this build installs', !!p.loader, p.loader + ' ' + p.loaderVersion);
check('every file carries a sha1', p.files.length > 0 && p.files.every((f) => /^[0-9a-f]{40}$/.test(f.sha1)),
  p.files.length + ' files');
check('every download is on the allow-listed CDN',
  p.files.every((f) => new URL(f.url).hostname === 'cdn.modrinth.com'));
check('the overrides tree is counted before anything is written', p.overrides > 0, p.overrides + ' files');
/* THE BUG THAT FOUND THE SPACE GUARD.  unzip.js refused every entry with a
   space in its name while reporting it as a null byte, so this pack would
   not install at all.  Asserted properly rather than as `check(..., true)`:
   the entry is located in the archive first, so the check fails if the pack
   ever stops containing one — a test that cannot fail proves nothing. */
const { safeJoin } = require('../mc/unzip.js');
const spacedEntry = modpack.readIndex(packBuf).zip
  .filter((e) => !e.name.endsWith('/') && e.name.startsWith('overrides/') && e.name.includes(' '))
  .map((e) => e.name)[0];
check('the pack really does contain an override with a space in its name',
  !!spacedEntry, spacedEntry || 'none found — this assertion is now vacuous');
check('and safeJoin accepts it', !!spacedEntry && !!safeJoin('C:\\k', spacedEntry));

console.log('\n' + (fails ? fails + ' FAILURES' : 'all checks passed'));
process.exit(fails ? 1 : 0);
