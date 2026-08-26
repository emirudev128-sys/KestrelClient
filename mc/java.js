'use strict';
/* ============================================================================
   FINDING JAVA.  Four sources, in the order that a person would look:

     1. JAVA_HOME                    what the user set on purpose
     2. the registry                 what an MSI installer recorded
     3. the usual folders            Adoptium, Oracle, Microsoft, Azul, Zulu
     4. `where java`                 whatever is actually on PATH

   Then every candidate is ASKED rather than guessed at.  A folder called
   jdk-21.0.5 can contain anything; `java -XshowSettings:properties -version`
   prints java.version, java.vendor, java.home and os.arch from the runtime
   itself, and that is what gets reported.  Parsing a version out of a
   directory name is how launchers end up telling people they have Java 17 and
   then handing them an UnsupportedClassVersionError.

   THE RIGHT RUNTIME IS A FACT ABOUT THE VERSION, not a preference:

     <= 1.16      Java 8      (1.17 was the break; 1.16.5 will not start on 17+
                               because of the LWJGL/ASM it ships)
     1.17-1.20.4  Java 17
     1.20.5+      Java 21

   Modern version manifests state this themselves in `javaVersion.majorVersion`
   and that is preferred when present; the table above is the fallback for the
   versions that predate the field.

   WHEN THE RIGHT ONE IS MISSING WE SAY SO.  We do not launch Java 8 at 1.21
   and let the JVM produce a stack trace the user has to interpret.
   ========================================================================= */

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const IS_WIN = process.platform === 'win32';
const EXE = IS_WIN ? 'java.exe' : 'java';

function run(cmd, args, ms) {
  return new Promise(function (resolve) {
    let done = false;
    const child = execFile(cmd, args, { timeout: ms || 6000, windowsHide: true, maxBuffer: 1 << 20 },
      function (err, stdout, stderr) {
        if (done) return;
        done = true;
        resolve({ err: err || null, out: String(stdout || '') + String(stderr || '') });
      });
    child.on('error', function () { if (!done) { done = true; resolve({ err: new Error('spawn failed'), out: '' }); } });
  });
}

/* "1.8.0_461" -> 8, "21.0.5" -> 21, "17" -> 17 */
function majorOf(v) {
  const s = String(v || '');
  const m = s.match(/^1\.(\d+)/);
  if (m) return Number(m[1]);
  const n = s.match(/^(\d+)/);
  return n ? Number(n[1]) : 0;
}

/* ── the registry ─────────────────────────────────────────────────────────
   reg.exe rather than a native module: it is on every Windows install, it is
   read-only here, and the alternative is a dependency with a build step.  The
   query is a fixed string with no user input in it.                        */
const REG_KEYS = [
  'HKLM\\SOFTWARE\\JavaSoft\\JDK',
  'HKLM\\SOFTWARE\\JavaSoft\\JRE',
  'HKLM\\SOFTWARE\\JavaSoft\\Java Development Kit',
  'HKLM\\SOFTWARE\\JavaSoft\\Java Runtime Environment',
  'HKLM\\SOFTWARE\\Eclipse Adoptium\\JDK',
  'HKLM\\SOFTWARE\\Eclipse Adoptium\\JRE',
  'HKLM\\SOFTWARE\\Eclipse Foundation\\JDK',
  'HKLM\\SOFTWARE\\AdoptOpenJDK\\JDK',
  'HKLM\\SOFTWARE\\Azul Systems\\Zulu',
  'HKLM\\SOFTWARE\\Microsoft\\JDK',
  'HKLM\\SOFTWARE\\BellSoft\\Liberica'
];
async function fromRegistry() {
  if (!IS_WIN) return [];
  const found = [];
  for (const key of REG_KEYS) {
    /* /s walks the subkeys; JavaHome / Path is where the install lives */
    const r = await run('reg', ['query', key, '/s', '/v', 'JavaHome'], 4000);
    if (r.err && !r.out) continue;
    for (const m of r.out.matchAll(/JavaHome\s+REG_SZ\s+(.+)/g)) {
      found.push(m[1].trim());
    }
    const r2 = await run('reg', ['query', key, '/s', '/v', 'Path'], 4000);
    for (const m of r2.out.matchAll(/\bPath\s+REG_SZ\s+(.+)/g)) found.push(m[1].trim());
  }
  return found;
}

/* ── the usual folders ────────────────────────────────────────────────── */
function fromFolders() {
  const bases = [];
  if (IS_WIN) {
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const la = process.env.LOCALAPPDATA || '';
    for (const root of [pf, pf86]) {
      bases.push(path.join(root, 'Eclipse Adoptium'), path.join(root, 'Eclipse Foundation'),
        path.join(root, 'Java'), path.join(root, 'AdoptOpenJDK'), path.join(root, 'Microsoft'),
        path.join(root, 'Zulu'), path.join(root, 'Amazon Corretto'), path.join(root, 'BellSoft'),
        path.join(root, 'Common Files', 'Oracle', 'Java'));
    }
    if (la) bases.push(path.join(la, 'Programs', 'Eclipse Adoptium'));
    /* the official launcher's own bundled runtimes, if it is installed */
    if (la) bases.push(path.join(la, 'Packages'));
    bases.push('C:\\Program Files\\Java');
  } else {
    bases.push('/usr/lib/jvm', '/Library/Java/JavaVirtualMachines', '/opt/java');
  }
  const out = [];
  for (const b of bases) {
    let names;
    try { names = fs.readdirSync(b, { withFileTypes: true }); } catch (e) { continue; }
    for (const e of names) {
      if (!e.isDirectory()) continue;
      out.push(path.join(b, e.name));
      /* macOS nests one level deeper */
      out.push(path.join(b, e.name, 'Contents', 'Home'));
    }
  }
  return out;
}

async function fromPath() {
  const r = await run(IS_WIN ? 'where' : 'which', ['java'], 4000);
  if (r.err && !r.out) return [];
  return r.out.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean)
    .filter(function (p) { return /java(\.exe)?$/i.test(p); })
    .map(function (p) { return path.dirname(path.dirname(p)); });
}

/* a home -> the executable inside it, if there is one */
function exeIn(home) {
  const c = path.join(home, 'bin', EXE);
  try { if (fs.statSync(c).isFile()) return c; } catch (e) { /* not here */ }
  const d = path.join(home, EXE);
  try { if (fs.statSync(d).isFile()) return d; } catch (e) { /* nor here */ }
  return null;
}

/* ASK THE RUNTIME.  -XshowSettings:properties prints the real values on
   stderr; -version keeps it from trying to run anything. */
async function probe(exe) {
  const r = await run(exe, ['-XshowSettings:properties', '-version'], 8000);
  if (!r.out) return null;
  const get = function (k) {
    const m = r.out.match(new RegExp('\\n\\s*' + k.replace(/\./g, '\\.') + '\\s*=\\s*(.+)'));
    return m ? m[1].trim() : '';
  };
  const version = get('java.version');
  if (!version) return null;
  return {
    path: exe,
    home: get('java.home') || path.dirname(path.dirname(exe)),
    version: version,
    major: majorOf(version),
    vendor: get('java.vendor') || get('java.vm.vendor') || 'unknown',
    arch: get('os.arch') || '',
    runtime: get('java.runtime.name') || ''
  };
}

/* ── the table ────────────────────────────────────────────────────────── */
function majorForMinecraft(id, fromManifest) {
  if (Number(fromManifest) >= 8) return Number(fromManifest);
  /* numeric compare of a dotted id, snapshots excluded — they carry the
     manifest field anyway, so this only ever sees a release number */
  const m = String(id).match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return 8;
  const a = Number(m[1]), b = Number(m[2]), c = Number(m[3] || 0);
  if (a < 1 || (a === 1 && b <= 16)) return 8;
  if (a === 1 && b === 20 && c >= 5) return 21;
  if (a === 1 && b >= 21) return 21;
  return 17;
}

let CACHE = null;
async function detect(force) {
  if (CACHE && !force) return CACHE;
  const homes = new Set();
  const jh = String(process.env.JAVA_HOME || '').trim();
  if (jh) homes.add(jh);
  for (const h of await fromPath()) homes.add(h);
  for (const h of await fromRegistry()) homes.add(h);
  for (const h of fromFolders()) homes.add(h);

  const exes = new Set();
  for (const h of homes) {
    const e = exeIn(h);
    if (e) exes.add(path.normalize(e));
  }

  const out = [];
  const seenHome = new Set();
  for (const e of exes) {
    let info = null;
    try { info = await probe(e); } catch (err) { info = null; }
    if (!info || !info.major) continue;
    const key = path.normalize(info.home).toLowerCase();
    if (seenHome.has(key)) continue;
    seenHome.add(key);
    out.push(info);
  }
  out.sort(function (a, b) { return b.major - a.major || a.path.localeCompare(b.path); });
  CACHE = out;
  return out;
}

/* PICK, OR SAY WHY NOT.  Returns {runtime} or {runtime:null, want, have,
   message} — the caller shows the message rather than inventing one. */
async function pick(mcId, manifestMajor, override) {
  const want = majorForMinecraft(mcId, manifestMajor);
  if (override) {
    const info = await probe(override).catch(function () { return null; });
    if (!info) return { runtime: null, want: want, have: [], message: 'The Java runtime set for this instance could not be run.' };
    return { runtime: info, want: want, have: [info], overridden: true };
  }
  const all = await detect();
  /* exact major first — Minecraft is fussy in both directions, so a newer
     runtime is not automatically a better one below 1.17 */
  let hit = all.filter(function (j) { return j.major === want; })[0];
  if (!hit && want >= 17) hit = all.filter(function (j) { return j.major >= want; })[0];
  if (hit) return { runtime: hit, want: want, have: all };
  const list = all.length
    ? all.map(function (j) { return j.vendor.split(' ')[0] + ' ' + j.version; }).join(', ')
    : 'none';
  return {
    runtime: null, want: want, have: all,
    message: 'Minecraft ' + mcId + ' needs Java ' + want + ' and this machine has ' + list
      + '. Install a Java ' + want + ' runtime (Adoptium Temurin ' + want + ') and it will be picked up automatically.'
  };
}

module.exports = { detect, probe, pick, majorForMinecraft, majorOf };
