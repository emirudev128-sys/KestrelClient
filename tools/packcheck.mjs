/* ============================================================================
   WHAT ACTUALLY CAME OUT OF THE BUILD, asserted rather than assumed.

     npm run pack && npm run packcheck

   electron-builder.yml states an allow-list of the files that ship.  A config
   file is an intention; this reads dist/win-unpacked and checks the intention
   survived contact with the packer.  Three classes of assertion:

     WHAT MUST BE THERE — every source file the app needs, derived by walking
       mc/ and ui/ rather than listed here, so adding a source file that was
       never added to the allow-list fails this check instead of failing at
       runtime in a user's install with a require() that cannot resolve.

     WHAT MUST NOT — the harness, the build history, and above all the real
       auth.config.json.  The last one is not checked by looking for the
       filename: the configured client id is read out of the developer's own
       auth.config.json and then searched for, byte by byte, through the whole
       archive AND the whole executable.  A filename check proves a filename
       is absent.  This proves the value is.

     WHAT MUST MATCH — package.json's version against brand.js's, because
     packaging introduced a second place the version is written and two
     places is the bug; and the icon inside the .exe against build/icon.ico,
     because "the icon is set" is otherwise something nobody verifies until
     they see the wrong one in a taskbar.
   ========================================================================= */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'win-unpacked');
const EXE = path.join(OUT, 'Kestrel.exe');
const ASAR = path.join(OUT, 'resources', 'app.asar');
const ICO = path.join(ROOT, 'build', 'icon.ico');

let fails = 0;
const ok = (name, cond, extra) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (extra ? '   ' + extra : ''));
  if (!cond) fails++;
};

if (!fs.existsSync(EXE) || !fs.existsSync(ASAR)) {
  console.error('\nno build to check. run:  npm run pack\n');
  process.exit(2);
}

/* ── the asar header ───────────────────────────────────────────────────────
   Four little-endian uint32s and then the JSON tree: a pickle length, the
   payload size, the string-pickle size, and the JSON byte length.  File data
   starts at 8 + the second field, padded to four.  Parsed here rather than
   required from @electron/asar, which is a transitive dependency of the
   builder and would make this check depend on the thing it is checking.   */
const raw = await fsp.readFile(ASAR);
const jsonLen = raw.readUInt32LE(12);
const header = JSON.parse(raw.subarray(16, 16 + jsonLen).toString('utf8'));
const DATA = 8 + raw.readUInt32LE(4);

/* flatten the tree to posix-ish paths -> {size, offset} */
const inArchive = new Map();
(function walk(node, prefix) {
  for (const [name, v] of Object.entries(node.files || {})) {
    const p = prefix ? prefix + '/' + name : name;
    if (v.files) walk(v, p);
    else inArchive.set(p, v);
  }
})(header, '');

const contents = (p) => {
  const e = inArchive.get(p);
  if (!e) return null;
  const off = DATA + Number(e.offset);
  return raw.subarray(off, off + e.size);
};

const bytes = [...inArchive.values()].reduce((n, e) => n + e.size, 0);
console.log('\napp.asar   ' + inArchive.size + ' files, '
  + (bytes / 1024).toFixed(0) + ' KB of content, ' + (raw.length / 1024).toFixed(0) + ' KB packed');

/* ── what must be there ──────────────────────────────────────────────────── */
console.log('\nevery source file the app needs');

const TOP = ['main.js', 'preload.js', 'store.js', 'accounts.js', 'msauth.js',
  'auth-config.js', 'auth.config.example.json', 'LICENSE', 'package.json'];
for (const f of TOP) ok(f, inArchive.has(f));

/* derived, not listed: whatever is in mc/ and ui/ now must be in the build */
async function tree(dir, prefix) {
  const out = [];
  for (const d of await fsp.readdir(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = prefix + '/' + d.name;
    if (d.isDirectory()) out.push(...await tree(path.join(dir, d.name), rel));
    else out.push(rel);
  }
  return out;
}
for (const f of [...await tree('mc', 'mc'), ...await tree('ui', 'ui')]) ok(f, inArchive.has(f));

/* ── what must not ───────────────────────────────────────────────────────── */
console.log('\nand nothing that has no business shipping');

const paths = [...inArchive.keys()];
const noneMatching = (label, re) => {
  const hit = paths.filter((p) => re.test(p));
  ok(label, hit.length === 0, hit.slice(0, 3).join(' '));
};
noneMatching('no tools/ — the Playwright harness stays home', /^tools\//);
noneMatching('no node_modules — the app has zero runtime dependencies', /(^|\/)node_modules\//);
noneMatching('no build history (ref, shots, variants)', /^(ref|shots|variants|docs|build)\//);
noneMatching('no generated single-file dump', /kestrel\.html$/);
noneMatching('no scratch files', /(^|\/)\.tmp-/);
noneMatching('no auth.config.json by name', /(^|\/)auth\.config\.json$/);

/* the example that ships is the placeholder one, read out of the archive */
const example = contents('auth.config.example.json');
let exampleId = '';
try { exampleId = JSON.parse(example.toString('utf8')).clientId || ''; } catch { /* below */ }
ok('the shipped auth.config.example.json still carries the placeholder',
  /^REPLACE-WITH/.test(exampleId), JSON.stringify(exampleId.slice(0, 24)));

/* ── the value, not the filename ───────────────────────────────────────────
   Scanning the 240 MB executable as well as the archive, because an icon,
   a version resource and an asar are all things that get written into that
   file and any of them could carry a string nobody meant to send.         */
console.log('\nthe real client id is nowhere in the build');
let devId = '';
try { devId = (JSON.parse(fs.readFileSync(path.join(ROOT, 'auth.config.json'), 'utf8')).clientId || '').trim(); }
catch { /* none configured on this machine */ }

/* A CHUNKED SEARCH, because the executable is 240 MB and the needle may
   straddle a chunk boundary, so each read keeps the last needle-length bytes
   of the previous one in front of it.

   THE NEEDLE IS A BUFFER, NEVER A STRING: two of the things searched for
   below are raw png bytes and a utf-16 run, and putting either through a
   utf-8 encode would quietly look for something else and pass.           */
async function scan(file, needle) {
  const fh = await fsp.open(file, 'r');
  const CHUNK = 1 << 22;
  const buf = Buffer.alloc(CHUNK + needle.length);
  let carry = 0, pos = 0, found = false;
  for (;;) {
    const { bytesRead } = await fh.read(buf, carry, CHUNK, pos);
    if (!bytesRead) break;
    const end = carry + bytesRead;
    if (buf.subarray(0, end).includes(needle)) { found = true; break; }
    if (end >= needle.length) { buf.copy(buf, 0, end - needle.length, end); carry = needle.length; }
    pos += bytesRead;
  }
  await fh.close();
  return found;
}

if (devId && /^[0-9a-f-]{36}$/i.test(devId)) {
  ok('not in app.asar', !raw.includes(Buffer.from(devId, 'utf8')));
  ok('not in Kestrel.exe', !(await scan(EXE, Buffer.from(devId, 'utf8'))));
  /* a resource string is wide characters, so the same id looks different */
  ok('not in Kestrel.exe as utf-16 either', !(await scan(EXE, Buffer.from(devId, 'utf16le'))));
} else {
  console.log('  SKIP  no auth.config.json on this machine to search for');
}

/* ── what must match ─────────────────────────────────────────────────────── */
console.log('\ntwo places the version is written, and they agree');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const brand = fs.readFileSync(path.join(ROOT, 'ui', 'scripts', 'brand.js'), 'utf8');
const bv = (brand.match(/version:\s*'([^']+)'/) || [])[1];
ok('package.json ' + pkg.version + ' === brand.js ' + bv, pkg.version === bv);
ok('the archived package.json is the same version',
  JSON.parse(contents('package.json').toString('utf8')).version === pkg.version);

console.log('\nthe licence ships, unmodified');
const licSrc = fs.readFileSync(path.join(ROOT, 'LICENSE'));
ok('LICENSE in the asar is byte-identical to the repository copy',
  Buffer.compare(licSrc, contents('LICENSE')) === 0);
ok('and it is the all-rights-reserved one, not MIT',
  /All Rights Reserved/i.test(licSrc.toString('utf8')) && !/MIT License/i.test(licSrc.toString('utf8')));

console.log('\nthe icon in the executable is the icon that was built');
const ico = fs.readFileSync(ICO);
const count = ico.readUInt16LE(4);
const sizes = [];
let biggest = null;
for (let i = 0; i < count; i++) {
  const e = 6 + i * 16;
  const w = ico[e] === 0 ? 256 : ico[e];
  sizes.push(w);
  const off = ico.readUInt32LE(e + 12), len = ico.readUInt32LE(e + 8);
  if (w === 256) biggest = ico.subarray(off, off + len);
}
ok('build/icon.ico holds ' + count + ' entries: ' + sizes.join(' '), count >= 5);
ok('including 256, which electron-builder requires', sizes.includes(256));
ok('the 256 entry is a png', !!biggest && biggest[0] === 0x89 && biggest[1] === 0x50);
/* RT_ICON stores a png entry verbatim, so its opening bytes are in the exe */
ok('those exact bytes are inside Kestrel.exe',
  !!biggest && await scan(EXE, biggest.subarray(0, 96)));

/* ── the installer ─────────────────────────────────────────────────────────
   Reported, and deliberately NOT byte-scanned.  Its payload is LZMA-
   compressed, so searching it for a secret would find nothing whether or not
   the secret is in there — a check that cannot fail is worse than no check,
   because it reads like one that passed.  What makes the installer clean is
   that the tree it was built from is the one verified above.              */
const setup = path.join(ROOT, 'dist', 'Kestrel-' + JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version + '-Setup.exe');
if (fs.existsSync(setup)) {
  console.log('\nthe installer, built from the tree checked above');
  ok(path.basename(setup) + '   ' + (fs.statSync(setup).size / 1048576).toFixed(0) + ' MB', true);
} else {
  console.log('\n  SKIP  no installer built yet — npm run dist');
}

console.log('\nthe executable identifies itself as Kestrel');
ok('Kestrel.exe exists, ' + (fs.statSync(EXE).size / 1048576).toFixed(0) + ' MB', fs.existsSync(EXE));
/* a VERSIONINFO resource is utf-16 */
ok('a version resource names the product', await scan(EXE, Buffer.from('Kestrel', 'utf16le')));

console.log('\n' + (fails ? fails + ' FAILURES' : 'all checks passed') + '\n');
process.exit(fails ? 1 : 0);
