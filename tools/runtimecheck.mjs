/* ============================================================================
   FETCHING JAVA, CHECKED WITHOUT FETCHING ANY.

     node tools/runtimecheck.mjs          the platform map, the choice, the paths
     node tools/runtimecheck.mjs live     ... and read Mojang's real catalogue

   mc/runtime.js is what runs when nothing installed is the Java a version
   needs. It has three ways to be wrong that no launch would show until it
   was too late:

     the wrong platform     a Linux runtime laid out on Windows runs nothing
     the wrong runtime      a "-snapshot" component, or the launcher's own
                            exe stub, picked for a major that has a real one
     an unsafe path         a manifest is a document another machine wrote;
                            "../../x.dll" and a link out of the folder must
                            be refused before they become paths

   The live pass costs two HTTP requests and is the only one that can say
   Mojang really publishes a Java 25 for this machine.
   ========================================================================= */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const rt = require('../mc/runtime.js');
const { Layout, RUNTIME_RE } = require('../mc/paths.js');
const V = require('../mc/version.js');
import path from 'node:path';
import os from 'node:os';

const LIVE = process.argv.slice(2).indexOf('live') >= 0;
let fails = 0;
const ok = (name, cond, extra) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (extra ? '   ' + extra : ''));
  if (!cond) fails++;
};

/* ── 1. the platform map ─────────────────────────────────────────────────── */
console.log('the platform, as Mojang names it');
ok('64-bit Windows is windows-x64', rt.platformKey('win32', 'x64') === 'windows-x64');
ok('Windows on ARM is windows-arm64', rt.platformKey('win32', 'arm64') === 'windows-arm64');
ok('Apple silicon is mac-os-arm64, Intel Macs mac-os', rt.platformKey('darwin', 'arm64') === 'mac-os-arm64' && rt.platformKey('darwin', 'x64') === 'mac-os');
ok('64-bit Linux is linux', rt.platformKey('linux', 'x64') === 'linux');
ok('a platform Mojang ships nothing for is null, not a guess', rt.platformKey('freebsd', 'x64') === null && rt.platformKey('linux', 'arm64') === null);
ok('this machine has a key', !!rt.platformKey(), rt.platformKey());

/* ── 2. the choice ───────────────────────────────────────────────────────── */
console.log('\nwhich runtime');
const entry = (name, released) => [{ manifest: { url: 'https://piston-meta.mojang.com/v1/packages/x/manifest.json', sha1: 'a'.repeat(40), size: 1 }, version: { name, released } }];
const ALL = {
  'windows-x64': {
    'java-runtime-alpha': entry('16.0.1.9.1', '2021-05-10T00:00:00+00:00'),
    'java-runtime-beta': entry('17.0.15', '2025-05-19T00:00:00+00:00'),
    'java-runtime-gamma': entry('17.0.15', '2025-05-19T00:00:00+00:00'),
    'java-runtime-gamma-snapshot': entry('17.0.99', '2026-01-01T00:00:00+00:00'),
    'java-runtime-delta': entry('21.0.7', '2025-05-19T00:00:00+00:00'),
    'java-runtime-epsilon': entry('25.0.1', '2025-12-10T00:00:00+00:00'),
    'jre-legacy': entry('8u51', '2025-10-06T00:00:00+00:00'),
    'minecraft-java-exe': entry('14', '2021-03-25T00:00:00+00:00')
  },
  'windows-x86': { 'jre-legacy': entry('8u51', '2025-10-06T00:00:00+00:00') }
};
const c25 = rt.choose(ALL, 'windows-x64', 'java-runtime-epsilon', 25);
ok('the component the version json names wins', c25 && c25.component === 'java-runtime-epsilon' && c25.version === '25.0.1');
const c25b = rt.choose(ALL, 'windows-x64', '', 25);
ok('with no component named, the runtime of the wanted major is found', c25b && c25b.component === 'java-runtime-epsilon');
const c17 = rt.choose(ALL, 'windows-x64', '', 17);
ok('a "-snapshot" component is never chosen over a real one of the same major', c17 && c17.component !== 'java-runtime-gamma-snapshot' && c17.version === '17.0.15');
const c8 = rt.choose(ALL, 'windows-x64', '', 8);
ok('Java 8 is jre-legacy, whose version reads 8u51', c8 && c8.component === 'jre-legacy');
ok('a major Mojang has no runtime for is null', rt.choose(ALL, 'windows-x64', '', 11) === null);
ok('and so is a platform that lacks it', rt.choose(ALL, 'windows-x86', 'java-runtime-epsilon', 25) === null);
ok('a component named with a bad name falls back to the major, never to a path', rt.choose(ALL, 'windows-x64', '../java-runtime-epsilon', 21).component === 'java-runtime-delta');
ok('the exe stub is never chosen', rt.choose(ALL, 'windows-x64', '', 14) === null);
ok('and version.js reads the component out of a version json', V.javaComponentFor({ javaVersion: { component: 'java-runtime-epsilon', majorVersion: 25 } }) === 'java-runtime-epsilon'
  && V.javaComponentFor({ javaVersion: { component: '../x', majorVersion: 25 } }) === '' && V.javaComponentFor({}) === '');

/* ── 3. the paths ────────────────────────────────────────────────────────── */
console.log('\nevery path a manifest names, before it is one');
const good = ['bin/java.exe', 'lib/modules', 'legal/java.base/LICENSE', 'release', 'lib/server/classes.jsa'];
ok('ordinary runtime paths are accepted', good.every(rt.relativeOk));
const bad = ['../bin/java.exe', 'bin/../../x.dll', '/etc/passwd', 'C:/Windows/x.dll', 'bin\\java.exe', 'bin//java.exe', './release', 'a\u0000b', ''];
ok('every unsafe path is refused', bad.every((p) => !rt.relativeOk(p)), bad.filter(rt.relativeOk).join(', ') || 'all refused');
ok('the layout refuses a component that is not a name', !RUNTIME_RE.test('../x') && !RUNTIME_RE.test('Java Runtime') && RUNTIME_RE.test('java-runtime-epsilon') && RUNTIME_RE.test('jre-legacy'));

const file = (sha1, url) => ({ type: 'file', executable: false, downloads: { raw: { sha1, size: 10, url: url || 'https://piston-data.mojang.com/v1/objects/' + sha1 + '/x' } } });
const H = 'b'.repeat(40);
const plan = rt.entries({
  'bin': { type: 'directory' },
  'bin/java.exe': Object.assign(file(H), { executable: true }),
  'lib/modules': file(H),
  'legal/LICENSE': { type: 'link', target: '../release' },
  'release': file(H)
});
ok('a manifest is sorted into folders, files and links', plan.dirs.length === 1 && plan.files.length === 3 && plan.links.length === 1);
ok('the executable flag is kept', plan.files.find((f) => f.name === 'bin/java.exe').executable === true);
ok('a link that stays inside is resolved', plan.links[0].resolved === 'release');
const refuses = (files, why) => { try { rt.entries(files); return false; } catch (e) { return /refusing|digest|files/.test(e.message); } };
ok('a file path that climbs out is refused', refuses({ '../x.dll': file(H) }));
ok('a link that climbs out is refused', refuses({ 'bin/java': { type: 'link', target: '../../../usr/bin/java' } }));
ok('a file from a host that is not Mojang\'s is refused', refuses({ 'bin/java.exe': file(H, 'https://example.com/java.exe') }));
ok('a file over plain http is refused', refuses({ 'bin/java.exe': file(H, 'http://piston-data.mojang.com/x') }));
ok('a file without a digest is refused', refuses({ 'bin/java.exe': { type: 'file', downloads: { raw: { size: 1, url: 'https://piston-data.mojang.com/x' } } } }));
ok('a manifest with no files is refused', refuses(null));
ok('the executable to probe is bin/java.exe on Windows and inside the bundle on macOS',
  rt.exeName('win32', []) === 'bin/java.exe' && rt.exeName('linux', []) === 'bin/java'
    && rt.exeName('darwin', [{ name: 'jre.bundle/Contents/Home/bin/java' }]) === 'jre.bundle/Contents/Home/bin/java');

/* the layout proves containment a second time */
const L = new Layout(path.join(os.tmpdir(), 'kestrel-runtimecheck'));
let escaped = false;
try { L.runtimeFile('java-runtime-epsilon', '../../x'); escaped = true; } catch (e) { /* refused */ }
ok('and the layout refuses an escape even if a check above were wrong', !escaped);
ok('the runtimes folder sits under the data root', L.runtimes === path.join(L.root, 'runtimes'));

/* ── 4. live ─────────────────────────────────────────────────────────────── */
if (LIVE) {
  console.log('\nMojang\'s real catalogue');
  try {
    const all = await rt.catalogue(L, () => {}, true);
    const key = rt.platformKey();
    const choice = rt.choose(all, key, 'java-runtime-epsilon', 25);
    ok('Mojang publishes a Java 25 for this machine', !!choice && choice.version.startsWith('25'), choice ? choice.component + ' ' + choice.version : 'none');
    for (const [maj, comp] of [[8, 'jre-legacy'], [17, 'java-runtime-gamma'], [21, 'java-runtime-delta']]) {
      const c = rt.choose(all, key, comp, maj);
      ok('and a Java ' + maj + ' (' + comp + ')', !!c && String(c.version).startsWith(maj === 8 ? '8' : String(maj)), c ? c.version : 'none');
    }
    const https = await import('node:https');
    const buf = await new Promise((res, rej) => https.get(choice.manifest.url, { headers: { 'User-Agent': 'Kestrel/0.5.0 (+https://github.com/emirudev128-sys/KestrelClient)' } }, (r) => { const parts = []; r.on('data', (d) => parts.push(d)); r.on('end', () => res(Buffer.concat(parts))); }).on('error', rej));
    const plan = rt.entries(JSON.parse(buf.toString('utf8')).files);
    ok('every file in its manifest passes the path and host checks', plan.files.length > 300, plan.files.length + ' files, ' + plan.dirs.length + ' folders, ' + plan.links.length + ' links');
    ok('and it contains the executable this platform probes', plan.files.some((f) => f.name === rt.exeName(process.platform, plan.files)));
  } catch (e) {
    ok('the catalogue could be read', false, e.message);
  }
}

console.log('\n' + (fails ? fails + ' FAILURES' : 'all checks passed') + '\n');
process.exitCode = fails ? 1 : 0;
