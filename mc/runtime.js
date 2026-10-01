'use strict';
/* ============================================================================
   FETCHING JAVA — THE RUNTIME MOJANG ITSELF SHIPS, WHEN THE MACHINE HAS NONE.

   The thesis in docs/thesis.md: the launcher picks the runtime, and nobody
   meets a Java download page. java.js finds what is installed; this is what
   happens when nothing it finds will do. 26.3 wants Java 25, and a machine
   with Java 21 on it used to stop at a message telling the user to go and
   install one.

   ── WHOSE JAVA ─────────────────────────────────────────────────────────────
   Mojang publishes the runtimes its own launcher uses, per platform and per
   component, at launchermeta.mojang.com — a catalogue that names a manifest,
   and a manifest that lists every file with a sha1, a size and a URL on
   piston-data.mojang.com. The version json already says which component a
   version wants (`javaVersion.component`: "java-runtime-epsilon" for 26.3),
   so the choice is Mojang's, not ours; when a version predates that field the
   catalogue is searched for the major the version needs.

   ── THE SAME RULES AS EVERY OTHER DOWNLOAD ─────────────────────────────────
   Exact-match host allow-list, https only, every file verified against the
   manifest's digest before it is kept, and every path proven to sit inside
   <root>/runtimes/<component>/ before a byte lands — a manifest is a document
   a machine that is not this one wrote, and a file called
   "../../../Windows/System32/x.dll" lands nowhere. Links (macOS and Linux
   manifests have them) are resolved against the runtime folder and refused
   if they point out of it.

   ── AND THEN ASKED, NOT TRUSTED ────────────────────────────────────────────
   A fetched runtime is probed like any other — `java -XshowSettings:properties
   -version` — and used only if it answers with the major that was wanted. A
   marker file beside it records what it is, so the next launch finds it with
   one stat and one probe instead of a digest of a hundred megabytes.

   An installed Java of the right major is still preferred: somebody who put
   Temurin 25 on their machine chose it, and this only fills the gap.
   ========================================================================= */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const net = require('./net');
const java = require('./java');

const ALL_URL = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';
/* the catalogue changes when Mojang publishes a runtime, which is rarely; a
   stale copy is still a true copy */
const ALL_TTL = 6 * 60 * 60 * 1000;
const ALL_CACHE = 'java-runtimes.json';
const MARKER = 'kestrel-runtime.json';

/* the three hosts Mojang serves runtimes from — exact match, as install.js
   does for the game's own files */
const HOSTS = new Set(['launchermeta.mojang.com', 'piston-meta.mojang.com', 'piston-data.mojang.com']);

function trusted(url) {
  const u = net.httpsOnly(url);
  if (!HOSTS.has(u.hostname)) throw new Error('refusing a runtime download from an unexpected host: ' + u.hostname);
  return u.href;
}

/* ── which platform's runtimes ───────────────────────────────────────────── */

/* Mojang's platform keys, from Node's names; null where Mojang ships none */
function platformKey(platform, arch) {
  const p = platform || process.platform, a = arch || process.arch;
  if (p === 'win32') return a === 'x64' ? 'windows-x64' : a === 'arm64' ? 'windows-arm64' : a === 'ia32' ? 'windows-x86' : null;
  if (p === 'darwin') return a === 'arm64' ? 'mac-os-arm64' : a === 'x64' ? 'mac-os' : null;
  if (p === 'linux') return a === 'x64' ? 'linux' : a === 'ia32' ? 'linux-i386' : null;
  return null;
}

/* ── the catalogue ───────────────────────────────────────────────────────── */

/* all.json, cached under the data root; a network failure falls back to the
   last copy, however old, because an old catalogue beats no Java */
async function catalogue(layout, log, force) {
  const file = path.join(layout.cache, ALL_CACHE);
  let cached = null;
  try {
    const st = await fsp.stat(file);
    cached = JSON.parse(await fsp.readFile(file, 'utf8'));
    if (!force && Date.now() - st.mtimeMs < ALL_TTL) return cached;
  } catch (e) {
    cached = null;
  }
  try {
    const fresh = await net.getJSON(trusted(ALL_URL));
    if (!fresh || typeof fresh !== 'object') throw new Error('not a catalogue');
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, JSON.stringify(fresh));
    return fresh;
  } catch (e) {
    if (cached) {
      if (log) log('runtime: using the cached runtime catalogue (' + e.message + ')');
      return cached;
    }
    throw e;
  }
}

/* ONE ENTRY OUT OF THE CATALOGUE: the component the version json names when
   the platform has it, otherwise the newest runtime of the wanted major —
   skipping "-snapshot" components and the launcher's own exe stub. Returns
   {component, version, released, manifest:{url,sha1,size}} or null. */
function choose(all, platform, component, major) {
  const plat = all && all[platform];
  if (!plat || typeof plat !== 'object') return null;
  const entryOf = function (comp) {
    const list = Array.isArray(plat[comp]) ? plat[comp] : [];
    const e = list[0];
    if (!e || !e.manifest || !e.manifest.url || !e.version || !e.version.name) return null;
    return { component: comp, version: String(e.version.name), released: String(e.version.released || ''), manifest: e.manifest };
  };
  if (component && /^[a-z0-9][a-z0-9-]{0,63}$/.test(component)) {
    const e = entryOf(component);
    if (e) return e;
  }
  const want = Number(major) || 0;
  let best = null;
  for (const comp of Object.keys(plat)) {
    if (/snapshot/.test(comp) || comp === 'minecraft-java-exe') continue;
    const e = entryOf(comp);
    if (!e || java.majorOf(e.version) !== want) continue;
    if (!best || e.released > best.released) best = e;
  }
  return best;
}

/* ── the manifest's files, checked before they become paths ──────────────── */

/* a relative path as the manifest writes it: forward slashes, no leading
   slash or drive letter, no "." or ".." segments, no backslash, no control
   characters. The layout proves containment again after this; this is the
   first of two checks because the names came off the network. */
function relativeOk(name) {
  if (typeof name !== 'string' || !name.length || name.length > 512) return false;
  if (/[\\\0-\x1f]/.test(name)) return false;
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) return false;
  const segs = name.split('/');
  return segs.every(function (s) { return s.length > 0 && s !== '.' && s !== '..'; });
}

/* the manifest's `files` map sorted into what has to be done; throws on the
   first entry that is not a safe relative path or a link that escapes */
function entries(files) {
  const out = { dirs: [], files: [], links: [] };
  if (!files || typeof files !== 'object') throw new Error('a runtime manifest with no files');
  for (const name of Object.keys(files)) {
    if (!relativeOk(name)) throw new Error('refusing a runtime file path: ' + String(name).slice(0, 80));
    const f = files[name];
    if (!f || typeof f !== 'object') continue;
    if (f.type === 'directory') {
      out.dirs.push(name);
    } else if (f.type === 'file') {
      const raw = f.downloads && f.downloads.raw;
      if (!raw || !raw.url || !/^[0-9a-f]{40}$/.test(String(raw.sha1 || ''))) throw new Error('a runtime file without a digest: ' + name);
      out.files.push({ name: name, url: trusted(raw.url), sha1: raw.sha1, size: Number(raw.size) || 0, executable: !!f.executable });
    } else if (f.type === 'link') {
      const target = String(f.target || '');
      /* where the link would point, as a path inside the runtime */
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(name), target));
      if (!relativeOk(resolved)) throw new Error('refusing a runtime link that leaves the runtime: ' + name);
      out.links.push({ name: name, target: target, resolved: resolved });
    }
    /* any other type is something this build does not know how to make, and
       leaves alone */
  }
  return out;
}

/* the executable to probe, by platform: Mojang's macOS runtimes are bundles */
function exeName(platform, files) {
  const p = platform || process.platform;
  if (p === 'win32') return 'bin/java.exe';
  if (p === 'darwin') {
    const inBundle = (files || []).map(function (f) { return f.name; }).filter(function (n) { return /(^|\/)Contents\/Home\/bin\/java$/.test(n); })[0];
    return inBundle || 'bin/java';
  }
  return 'bin/java';
}

/* ── what is already here ────────────────────────────────────────────────── */

function markerFile(layout, component) {
  return path.join(layout.runtimeDir(component), MARKER);
}

/* every runtime this launcher has fetched, by its marker, each probed; the
   one for `component` first, then any of the wanted major */
async function installedFor(layout, component, major) {
  let names;
  try { names = await fsp.readdir(layout.runtimes, { withFileTypes: true }); } catch (e) { return null; }
  const found = [];
  for (const d of names) {
    if (!d.isDirectory()) continue;
    let marker;
    try { marker = JSON.parse(await fsp.readFile(markerFile(layout, d.name), 'utf8')); } catch (e) { continue; }
    if (!marker || typeof marker.exe !== 'string' || !relativeOk(marker.exe)) continue;
    let exe;
    try { exe = layout.runtimeFile(d.name, marker.exe); } catch (e) { continue; }
    if (!fs.existsSync(exe)) continue;
    found.push({ component: d.name, exe: exe, marker: marker });
  }
  found.sort(function (a, b) { return (b.component === component) - (a.component === component); });
  for (const f of found) {
    if (f.component !== component && java.majorOf(f.marker.version || '') !== Number(major)) continue;
    const info = await java.probe(f.exe).catch(function () { return null; });
    if (info && info.major === Number(major)) return Object.assign(info, { managed: true, component: f.component });
  }
  return null;
}

/* ── fetching one ────────────────────────────────────────────────────────── */

/* reads, checks and lays out a chosen runtime; returns the probed runtime.
   opts.report gets the same {phase, done, total, bytes, totalBytes, file}
   the game installer sends, with "Java <version>" in the file name so the
   Play screen can say what it is doing. */
async function ensure(layout, choice, opts) {
  const o = opts || {};
  const report = typeof o.report === 'function' ? o.report : function () {};
  const log = typeof o.log === 'function' ? o.log : function () {};
  const label = 'Java ' + choice.version;

  const have = await installedFor(layout, choice.component, java.majorOf(choice.version));
  if (have) return have;

  report({ phase: 'preparing', done: 0, total: 0, bytes: 0, totalBytes: 0, file: label + ' · reading the manifest' });
  const buf = await net.getBuffer(trusted(choice.manifest.url), 64 * 1024 * 1024);
  if (choice.manifest.sha1 && net.sha1Of(buf) !== choice.manifest.sha1) throw new Error('sha1 mismatch on the runtime manifest for ' + choice.component);
  const manifest = JSON.parse(buf.toString('utf8'));
  const plan = entries(manifest.files);

  const root = layout.runtimeDir(choice.component);
  await fsp.mkdir(root, { recursive: true });
  for (const d of plan.dirs) await fsp.mkdir(layout.runtimeFile(choice.component, d), { recursive: true });

  /* what is already right stays; this is also what makes a retry after a
     dropped connection pick up where it stopped */
  const missing = [];
  let checked = 0;
  await net.pool(plan.files, 16, async function (f) {
    const dest = layout.runtimeFile(choice.component, f.name);
    if (!(await net.verified(dest, f.sha1, f.size))) missing.push(Object.assign({ dest: dest }, f));
    checked++;
    if (checked % 50 === 0) report({ phase: 'preparing', done: checked, total: plan.files.length, bytes: 0, totalBytes: 0, file: label + ' · checking ' + plan.files.length + ' files' });
  });
  const totalBytes = missing.reduce(function (a, f) { return a + f.size; }, 0);
  log('runtime: ' + label + ' (' + choice.component + ') — ' + plan.files.length + ' files, ' + missing.length + ' to fetch (' + totalBytes + ' bytes)');

  let bytes = 0, done = 0;
  report({ phase: 'downloading', done: 0, total: missing.length, bytes: 0, totalBytes: totalBytes, file: label });
  await net.pool(missing, 8, async function (f) {
    await net.download(f.url, f.dest, {
      sha1: f.sha1, size: f.size,
      onChunk: function (n) { bytes += n; report({ phase: 'downloading', done: done, total: missing.length, bytes: bytes, totalBytes: totalBytes, file: label + ' · ' + path.basename(f.dest) }); }
    });
    done++;
    report({ phase: 'downloading', done: done, total: missing.length, bytes: bytes, totalBytes: totalBytes, file: label + ' · ' + path.basename(f.dest) });
  }, o.signal);

  if (process.platform !== 'win32') {
    for (const f of plan.files) {
      if (f.executable) await fsp.chmod(layout.runtimeFile(choice.component, f.name), 0o755).catch(function () {});
    }
    for (const l of plan.links) {
      const at = layout.runtimeFile(choice.component, l.name);
      layout.runtimeFile(choice.component, l.resolved);   /* proven inside, again */
      await fsp.rm(at, { force: true });
      await fsp.symlink(l.target, at).catch(function (e) { log('runtime: could not make link ' + l.name + ' (' + e.message + ')'); });
    }
  }

  const exe = exeName(process.platform, plan.files);
  const exePath = layout.runtimeFile(choice.component, exe);
  report({ phase: 'installing', done: missing.length, total: missing.length, bytes: bytes, totalBytes: totalBytes, file: label + ' · checking it runs' });
  const info = await java.probe(exePath).catch(function () { return null; });
  const want = java.majorOf(choice.version);
  if (!info || info.major !== want) {
    throw new Error('the fetched ' + label + ' did not answer as Java ' + want + (info ? ' (it said ' + info.version + ')' : ''));
  }
  await fsp.writeFile(markerFile(layout, choice.component), JSON.stringify({
    component: choice.component, version: choice.version, released: choice.released,
    exe: exe, files: plan.files.length, fetched: new Date().toISOString(), source: 'Mojang'
  }, null, 2));
  log('runtime: ' + label + ' ready — ' + info.vendor + ' ' + info.version + ', ' + plan.files.length + ' files');
  return Object.assign(info, { managed: true, component: choice.component });
}

module.exports = { ALL_URL, HOSTS, platformKey, catalogue, choose, relativeOk, entries, exeName, installedFor, ensure };
