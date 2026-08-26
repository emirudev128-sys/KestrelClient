/* The security assertions for phase 3, run as one command:
     node tools/phase3check.mjs
   Zip-slip, the path guard, the hash hard-failure and the argfile quoting. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { safeJoin } = require('../mc/unzip.js');
const { inside } = require('../mc/paths.js');
const { argfileLine, buildArgs } = require('../mc/launch.js');
const { Layout } = require('../mc/paths.js');
const net = require('../mc/net.js');
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (extra ? '   ' + extra : '')); if (!cond) fails++; };

console.log('\nzip-slip guard');
const TARGET = 'C:\\tmp\\natives';
for (const n of ['../../evil.dll', '..\\..\\evil.dll', '/abs/evil.dll', 'C:\\Windows\\System32\\x.dll',
  'a/../../../b.dll', '', 'x/\u0000y.dll', '....//....//evil.dll']) {
  let leaked = null;
  try { leaked = safeJoin(TARGET, n); } catch (e) { /* expected */ }
  ok('rejects ' + JSON.stringify(n), leaked === null, leaked ? '-> ' + leaked : '');
}
for (const n of ['lwjgl64.dll', 'sub/x.dll', './OpenAL64.dll']) {
  let got = null; try { got = safeJoin(TARGET, n); } catch (e) { /* unexpected */ }
  ok('accepts ' + JSON.stringify(n), !!got && got.startsWith(TARGET + path.sep));
}

console.log('\ndata-root containment');
for (const p of [['..', 'etc'], ['..\\..\\Windows'], ['a', '..', '..', 'b']]) {
  let leaked = null; try { leaked = inside('C:\\root', ...p); } catch (e) { /* expected */ }
  ok('inside() rejects ' + JSON.stringify(p), leaked === null, leaked || '');
}

console.log('\nsha-1 hard failure');
const tmp = path.join(os.tmpdir(), 'kestrel-hashtest-' + Date.now() + '.bin');
let threw = '';
try {
  /* a real Mojang object, asked for under the wrong digest */
  await net.download('https://libraries.minecraft.net/com/paulscode/librarylwjglopenal/20100824/librarylwjglopenal-20100824.jar',
    tmp, { sha1: '0000000000000000000000000000000000000000' });
} catch (e) { threw = e.message; }
ok('a wrong digest throws', /sha1 mismatch/.test(threw), threw.slice(0, 70));
ok('and leaves no file behind', !fs.existsSync(tmp) && !fs.existsSync(tmp + '.part'));

console.log('\nargfile quoting');
ok('backslashes are doubled', argfileLine('C:\\Users\\x\\a.jar') === '"C:\\\\Users\\\\x\\\\a.jar"', argfileLine('C:\\Users\\x\\a.jar'));
ok('quotes are escaped', argfileLine('a"b') === '"a\\"b"', argfileLine('a"b'));
ok('spaces survive', argfileLine('C:\\Program Files\\x') === '"C:\\\\Program Files\\\\x"');

console.log('\nthe token is not on the command line');
const root = path.join(process.env.APPDATA || os.homedir(), 'Kestrel');
const L = new Layout(root);
const vj = JSON.parse(fs.readFileSync(L.versionJson('1.8.9'), 'utf8'));
const built = buildArgs({
  vjson: vj, layout: L, id: '1.8.9', gameDir: L.gameDir('phase3-test'),
  session: { name: 'KestrelTest', uuid: '0ee64b74-e692-3611-ae3b-2d21112cf1b2', accessToken: '0', userType: 'legacy' }
});
const vector = built.jvm.concat([built.main], built.game);
const at = vector.indexOf('--accessToken');
ok('1.8.9 does take --accessToken', at >= 0);
ok('and offline puts the literal "0" there, not a credential', vector[at + 1] === '0', JSON.stringify(vector[at + 1]));
ok('classpath is built and ends in the client jar', built.classpath[built.classpath.length - 1].endsWith('1.8.9.jar'), built.classpath.length + ' entries');
ok('natives path is on the jvm args', built.jvm.some((a) => a.startsWith('-Djava.library.path=')));
ok('every classpath entry is inside the data root', built.classpath.every((c) => c.startsWith(path.resolve(root) + path.sep)));

/* ── what this client calls itself ─────────────────────────────────────────
   The user-agent goes to Mojang, Modrinth and the loader mavens on every
   request, and it went out for a long time as `Kestrel/1.0
   (+https://github.com/kestrel-launcher)` — an organisation that does not
   exist, and a version the product had not been on for months.  Nothing
   caught it because nothing looked.  These are the checks that look.       */
console.log('\nwhat this client calls itself on the wire');
const { BRAND } = await import('../ui/scripts/brand.js');
const { Game } = require('../mc/index.js');

ok('brand.js builds exactly one user-agent',
  /^\S+\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/[^/]+\/\S+\)$/.test(BRAND.userAgent), BRAND.userAgent);
ok('the version in it is brand.js’s version, not a second copy of it',
  BRAND.userAgent.includes('/' + BRAND.version + ' '));
ok('renaming the product moves the repository with it', (function () {
  const B = Object.create(Object.getPrototypeOf(BRAND), Object.getOwnPropertyDescriptors(BRAND));
  B.name = 'Zzyzx';
  return B.repo !== BRAND.repo && B.userAgent.startsWith('Zzyzx/');
})());
ok('but the owner does not, because an account is not a product name',
  BRAND.repo.split('/')[1] === 'emirudev128-sys', BRAND.repo);

ok('net.js has no snapshot export left to go stale', net.UA === undefined);
ok('its fallback names a repository that resolves',
  /^https:\/\/github\.com\/\S+$/.test(net.userAgent().replace(/^.*\(\+/, '').replace(/\)$/, '')), net.userAgent());
ok('and the fallback carries no version, which is the half that rots',
  !/\d+\.\d+\.\d+/.test(net.userAgent()), net.userAgent());

/* THE WIRING, not just the pieces: main.js hands Game the string and Game
   hands it to net.js.  Built against a temp root so this asserts nothing
   about, and writes nothing into, the real data folder. */
const uaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-ua-'));
new Game({ store: { root: uaRoot }, userAgent: BRAND.userAgent });
ok('constructing Game hands brand.js’s string to net.js',
  net.userAgent() === BRAND.userAgent, net.userAgent());
new Game({ store: { root: uaRoot } });
ok('and a Game built without one leaves the previous value, never "undefined"',
  net.userAgent() === BRAND.userAgent && !/undefined/.test(net.userAgent()));
fs.rmSync(uaRoot, { recursive: true, force: true });

console.log('\n' + (fails ? fails + ' FAILURES' : 'all checks passed') + '\n');
/* exitCode, not exit().  Forcing the process down here raced a handle that
   was already closing and tripped a libuv assertion in async.c AFTER every
   check had passed — so the script reported success and then aborted, which
   is the worst of both and would fail any CI that reads an exit code.
   Setting the code and letting the loop drain is the same answer with none
   of the race. */
process.exitCode = fails ? 1 : 0;
