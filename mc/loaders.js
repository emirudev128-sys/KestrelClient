'use strict';
/* ============================================================================
   MOD LOADERS.  Four of them, and they are not four variations on one thing:

     Fabric    a JSON meta service hands back a finished version profile
     Quilt     the same service, forked, at v3 instead of v2
     NeoForge  a maven repository; the profile is inside the installer jar
     Forge     a maven repository, and the profile is only *usable* for
               1.12.2 and older — see THE FORGE PROBLEM at the bottom

   WHAT THEY ALL PRODUCE is the same artefact: a version json carrying
   `inheritsFrom`, written to <root>/versions/<id>/<id>.json exactly where a
   vanilla one goes.  From that point the installer and the launcher do not
   care which loader it came from — mc/version.js merge() folds it over the
   parent and everything downstream sees one document.  That is the whole
   design: the loader-specific code stops here.

   THE HOSTS ARE NAMED, ONE BY ONE.  Phase 3's allow-list is an exact-match
   Set and this file adds to it by name rather than relaxing it to "any
   https" or "*.fabricmc.net".  A wildcard on a maven host is not a small
   convenience: these documents are lists of URLs a machine that is not this
   one wrote, and the whole point of the list is that a compromised meta
   service still cannot point the downloader at an arbitrary origin.

   AND EVERY LOADER LIBRARY IS STILL HASHED.  Fabric and Quilt publish no
   digest in their profiles — the JSON has `name` and `url` and nothing else.
   That is not a licence to skip verification: a maven repository publishes
   `<artifact>.sha1` next to every artifact, so the digest is fetched from
   there and the download is checked against it exactly like a Mojang one.
   Where a repository genuinely has no checksum published, that fact is
   counted and logged rather than quietly ignored.
   ========================================================================= */

const fsp = require('node:fs/promises');
const path = require('node:path');
const net = require('./net');
const V = require('./version');
const { entries, readEntry } = require('./unzip');
const { isVersionId } = require('./paths');

/* ── the allow-list this file adds ────────────────────────────────────────
   Named, exact, and no wildcards.  install.js unions this into its own.   */
const LOADER_HOSTS = [
  'meta.fabricmc.net', 'maven.fabricmc.net',
  'meta.quiltmc.org', 'maven.quiltmc.org',
  'maven.neoforged.net',
  'maven.minecraftforge.net',
  /* the two public mirrors a Forge or NeoForge profile legitimately points a
     handful of ordinary libraries at (ASM, Guava, log4j) */
  'repo1.maven.org', 'repo.maven.apache.org'
];

const FABRIC_META = 'https://meta.fabricmc.net/v2/versions/loader/';
const QUILT_META = 'https://meta.quiltmc.org/v3/versions/loader/';
const NEO_MAVEN = 'https://maven.neoforged.net/releases/';
const FORGE_MAVEN = 'https://maven.minecraftforge.net/';

const INSTALLER_CAP = 64 * 1024 * 1024;   /* a Forge installer is ~10 MB; this is slack */

/* the loader names the UI uses, lower-cased, and nothing else is a loader */
const NAMES = { fabric: 'Fabric', quilt: 'Quilt', neoforge: 'NeoForge', forge: 'Forge' };
function normalise(loader) {
  const k = String(loader || '').toLowerCase().trim();
  if (k === 'vanilla' || k === 'none' || k === '') return '';
  if (!Object.prototype.hasOwnProperty.call(NAMES, k)) throw new Error('not a mod loader this build knows: ' + String(loader).slice(0, 32));
  return k;
}

/* A MINECRAFT VERSION GOING INTO A URL.  paths.js already refuses anything
   that is not [A-Za-z0-9._-], and that is exactly the set that is safe in a
   path segment, so the same predicate does both jobs. */
function mcId(v) {
  const s = String(v || '').trim();
  if (!isVersionId(s)) throw new Error('not a Minecraft version id: ' + s.slice(0, 40));
  return s;
}
/* a loader's own version.  Fabric's carry + and Forge's carry dots and
   dashes; nothing in the wild carries a slash, and nothing is allowed to. */
const LOADER_VER_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
function loaderVer(v) {
  const s = String(v || '').trim();
  if (!LOADER_VER_RE.test(s)) throw new Error('not a loader version: ' + s.slice(0, 40));
  return s;
}

/* NEWEST FIRST, BY NUMBER.  maven-metadata.xml is not sorted in any order a
   picker wants — Forge's is roughly chronological across every Minecraft
   version at once — and a string sort puts 11.15.0.9 above 11.15.0.10.  So
   the numeric runs are compared as numbers, position by position, and a
   non-numeric piece falls back to a string compare at that position.       */
function byVersionDesc(a, b) {
  const x = String(a).split(/[^0-9A-Za-z]+/);
  const y = String(b).split(/[^0-9A-Za-z]+/);
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const p = x[i] === undefined ? '' : x[i];
    const q = y[i] === undefined ? '' : y[i];
    /* a version that ran out of pieces is the release; 0.20.0 beats 0.20.0-beta.9 */
    if (p === '' || q === '') return p === '' ? -1 : 1;
    const pn = /^[0-9]+$/.test(p), qn = /^[0-9]+$/.test(q);
    if (pn && qn) { if (Number(p) !== Number(q)) return Number(q) - Number(p); continue; }
    if (p !== q) return q < p ? -1 : 1;
  }
  return 0;
}

/* ── maven-metadata.xml, without an XML parser ────────────────────────────
   The document is a flat list of <version> elements and the only thing taken
   out of it is their text, each of which is then matched against the loader
   version pattern before it is used for anything.  A regex is the right tool
   precisely because nothing structural is being trusted: an entity, a comment
   or a nested element cannot smuggle a value past LOADER_VER_RE.          */
function mavenVersions(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<version>([^<]{1,80})<\/version>/g)) {
    const v = m[1].trim();
    if (LOADER_VER_RE.test(v)) out.push(v);
  }
  return out;
}

/* ── digests for a maven artifact ─────────────────────────────────────────
   Maven publishes <artifact>.sha1 beside every artifact.  It is 40 hex
   characters, sometimes with a filename after them.                       */
async function mavenSha1(url) {
  try {
    const buf = await net.getBuffer(url + '.sha1', 256);
    const m = buf.toString('utf8').trim().match(/^([0-9a-f]{40})\b/i);
    return m ? m[1].toLowerCase() : '';
  } catch (e) { return ''; }
}

/* ── Fabric and Quilt ─────────────────────────────────────────────────────
   Identical shapes; Quilt is a fork of the same service.  The list call
   returns newest-first with a `stable` flag, and the profile call returns a
   finished version json — no jar to open, no processors to run.           */
async function fabricish(base, mc) {
  let list;
  try {
    list = await net.getJSON(base + mcId(mc));
  } catch (e) {
    /* THE SERVICE ANSWERS 400 for a Minecraft version it has never supported.
       That is "no builds", not "no network", and only the second one is worth
       propagating: the first greys a button out, the second has to leave the
       offline fallback standing.  See the note on 4xx in net.js. */
    if (e && e.status >= 400 && e.status < 500) return [];
    throw e;
  }
  if (!Array.isArray(list)) throw new Error('the loader meta service returned something that is not a list');
  return list.map(function (e) {
    const l = (e && e.loader) || {};
    return { version: String(l.version || ''), stable: !!l.stable, build: Number(l.build) || 0 };
  }).filter(function (e) { return LOADER_VER_RE.test(e.version); })
    /* the service's order is close to newest-first but not dependable, and its
       `build` counter restarts per minor line, so the version itself is what
       gets sorted */
    .sort(function (a, b) { return byVersionDesc(a.version, b.version); });
}

async function fabricishProfile(base, mc, lv) {
  const j = await net.getJSON(base + mcId(mc) + '/' + loaderVer(lv) + '/profile/json');
  if (!j || typeof j !== 'object' || !j.id) throw new Error('the loader meta service returned no profile');
  return j;
}

/* ── NeoForge ─────────────────────────────────────────────────────────────
   Maven only.  NeoForge numbers itself from the Minecraft version it loads
   on: 1.21.1 -> 21.1.x, 1.20.2 -> 20.2.x, and 1.20.1 is the fork's one
   exception, still carrying Forge's 47 line.                              */
function neoPrefix(mc) {
  const m = mcId(mc).match(/^1\.(\d+)(?:\.(\d+))?$/);
  if (!m) return null;
  if (mc === '1.20.1') return '47.';
  return m[1] + '.' + (m[2] || '0') + '.';
}

async function neoVersions(mc) {
  const p = neoPrefix(mc);
  if (!p) return [];
  const xml = await net.getBuffer(NEO_MAVEN + 'net/neoforged/neoforge/maven-metadata.xml', 4 * 1024 * 1024);
  const all = mavenVersions(xml.toString('utf8'));
  return all.filter(function (v) { return v.indexOf(p) === 0; })
    .sort(byVersionDesc)
    .map(function (v) { return { version: v, stable: !/beta|alpha/i.test(v), build: 0 }; });
}

function neoInstallerUrl(v) {
  return NEO_MAVEN + 'net/neoforged/neoforge/' + loaderVer(v) + '/neoforge-' + loaderVer(v) + '-installer.jar';
}

/* ── Forge ────────────────────────────────────────────────────────────────
   Forge's maven keys everything by "<mc>-<forge>" and, for a few old lines,
   "<mc>-<forge>-<mc>".  Both shapes are in the metadata and both are legal
   directory names on the repository.                                      */
async function forgeVersions(mc) {
  const id = mcId(mc);
  const xml = await net.getBuffer(FORGE_MAVEN + 'net/minecraftforge/forge/maven-metadata.xml', 8 * 1024 * 1024);
  const all = mavenVersions(xml.toString('utf8'));
  return all.filter(function (v) { return v.indexOf(id + '-') === 0; })
    .sort(byVersionDesc)
    .map(function (v) {
      /* what the picker shows is the Forge number, not the whole key */
      const short = v.slice(id.length + 1).replace(new RegExp('-' + id.replace(/\./g, '\\.') + '$'), '');
      return { version: short, key: v, stable: true, build: 0 };
    });
}

function forgeInstallerUrl(key) {
  return FORGE_MAVEN + 'net/minecraftforge/forge/' + loaderVer(key) + '/forge-' + loaderVer(key) + '-installer.jar';
}

/* ── reading a profile out of an installer jar ────────────────────────────
   Both Forge and NeoForge ship the same two documents at the root of their
   installer:

     version.json           the profile, with inheritsFrom — 1.13+ only
     install_profile.json   what the installer itself would do

   For 1.12.2 and older there is no version.json; install_profile.json has a
   `versionInfo` member which IS the profile.  For 1.13+ the two are separate
   and install_profile.json carries `processors`, which is the part this
   build cannot run.                                                       */
function readInstaller(buf) {
  const list = entries(buf);
  const byName = new Map();
  for (const e of list) byName.set(e.name, e);
  const get = function (n) {
    const e = byName.get(n);
    if (!e) return null;
    try { return JSON.parse(readEntry(buf, e).toString('utf8')); } catch (err) { return null; }
  };
  return {
    version: get('version.json'),
    install: get('install_profile.json'),
    entry: function (n) { return byName.get(n) || null; },
    all: list
  };
}

/* ══ the public surface ═══════════════════════════════════════════════════ */

/* WHICH BUILDS EXIST for this loader on this Minecraft version.  Returns
   [{version, stable, key}] newest first; an empty list means "this loader
   has nothing for that version", which is the answer the picker needs. */
async function versionsFor(loader, mc) {
  const k = normalise(loader);
  if (!k) return [];
  if (k === 'fabric') return await fabricish(FABRIC_META, mc);
  if (k === 'quilt') return await fabricish(QUILT_META, mc);
  if (k === 'neoforge') return await neoVersions(mc);
  if (k === 'forge') return await forgeVersions(mc);
  return [];
}

/* THE INSTALL.  Fetches whatever the loader needs to produce a version json,
   writes it where a vanilla one lives, and hands back
   {id, json, notes[], partial}.  `partial` is the honest flag: true means the
   profile is on disk and merges correctly but the install is NOT complete
   enough to launch, and `notes` says why. */
async function installLoader(o) {
  const L = o.layout;
  const log = typeof o.log === 'function' ? o.log : function () {};
  const k = normalise(o.loader);
  if (!k) throw new Error('no loader to install');
  const mc = mcId(o.mc);
  const notes = [];
  let json = null;
  let partial = false;
  let extraFiles = [];

  if (k === 'fabric' || k === 'quilt') {
    const base = k === 'fabric' ? FABRIC_META : QUILT_META;
    let lv = String(o.loaderVersion || '').trim();
    if (!lv) {
      const list = await fabricish(base, mc);
      const pick = list.filter(function (e) { return e.stable; })[0] || list[0];
      if (!pick) throw new Error(NAMES[k] + ' has no build for ' + mc);
      lv = pick.version;
    }
    json = await fabricishProfile(base, mc, lv);
    log('loader: ' + NAMES[k] + ' ' + lv + ' profile for ' + mc + ' — ' + (json.libraries || []).length + ' libraries, mainClass ' + json.mainClass);
  } else if (k === 'neoforge' || k === 'forge') {
    let key, url;
    if (k === 'neoforge') {
      let lv = String(o.loaderVersion || '').trim();
      if (!lv) {
        const list = await neoVersions(mc);
        const pick = list.filter(function (e) { return e.stable; })[0] || list[0];
        if (!pick) throw new Error('NeoForge has no build for ' + mc);
        lv = pick.version;
      }
      key = loaderVer(lv);
      url = neoInstallerUrl(key);
    } else {
      const list = await forgeVersions(mc);
      let hit = null;
      const want = String(o.loaderVersion || '').trim();
      if (want) hit = list.filter(function (e) { return e.version === want || e.key === want; })[0];
      else hit = list[0];
      if (!hit) throw new Error('Forge has no build ' + (want || '') + ' for ' + mc);
      key = hit.key;
      url = forgeInstallerUrl(key);
    }

    /* the installer jar, hashed against the digest its own repository
       publishes, into the cache rather than into libraries — it is not a
       thing anything launches */
    const sha1 = await mavenSha1(url);
    const dest = require('./paths').inside(L.cache, 'loaders', path.basename(url));
    if (!await net.verified(dest, sha1, 0)) {
      await net.download(url, dest, { sha1: sha1 });
    }
    if (!sha1) notes.push(path.basename(url) + ' had no published .sha1 on its repository, so it was taken on size alone');
    const buf = await fsp.readFile(dest);
    if (buf.length > INSTALLER_CAP) throw new Error('that installer is implausibly large');
    const inst = readInstaller(buf);

    if (inst.version && inst.version.inheritsFrom) {
      json = inst.version;
      /* MODERN FORGE AND NEOFORGE both need install_profile.json's processors
         run — they binary-patch the vanilla client jar into a patched one and
         the profile's classpath names that patched jar.  Running them means
         executing Java, which this build does not do. */
      const procs = (inst.install && Array.isArray(inst.install.processors)) ? inst.install.processors.length : 0;
      if (procs) {
        partial = true;
        notes.push(NAMES[k] + ' ' + key + ' ships ' + procs + ' installer processors that binary-patch the client jar. '
          + 'This build reads the profile and fetches its libraries but does not execute them, so the merged version json '
          + 'and classpath are correct and the instance is NOT launchable yet.');
      }
    } else if (inst.install && inst.install.versionInfo) {
      /* LEGACY FORGE: 1.12.2 and older.  install_profile.json carries a whole
         usable version json, and the universal jar it names is inside the
         installer rather than on the repository. */
      json = inst.install.versionInfo;
      const ip = inst.install.install || {};
      if (ip.filePath && ip.path) {
        const e = inst.entry(String(ip.filePath));
        if (e) {
          const co = V.parseCoord(String(ip.path));
          const jar = L.library(co.path);
          await fsp.mkdir(path.dirname(jar), { recursive: true });
          await fsp.writeFile(jar, readEntry(buf, e));
          extraFiles.push(co.path);
          log('loader: unpacked ' + path.basename(String(ip.filePath)) + ' from the installer to libraries/' + co.path);
        } else {
          notes.push('the installer did not contain ' + String(ip.filePath).slice(0, 80));
        }
      }
    } else {
      throw new Error('that ' + NAMES[k] + ' installer carries neither a version.json nor a legacy versionInfo');
    }
  }

  if (!json || typeof json !== 'object') throw new Error('no loader profile was produced');
  const id = String(json.id || '');
  if (!isVersionId(id)) throw new Error('the loader profile has an id this launcher will not turn into a folder name: ' + id.slice(0, 60));
  if (V.inheritsFrom(json) !== mc) {
    /* a profile that inherits from a different version than the one asked for
       would install the wrong parent and then merge over it */
    throw new Error('that profile inherits from ' + V.inheritsFrom(json) + ', not ' + mc);
  }

  const file = L.versionJson(id);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(json, null, 2));
  log('loader: wrote ' + id + '.json (' + (json.libraries || []).length + ' libraries)');
  return { id: id, json: json, notes: notes, partial: partial, files: extraFiles, loader: NAMES[k], mc: mc };
}

module.exports = {
  LOADER_HOSTS, NAMES, normalise, versionsFor, installLoader,
  mavenVersions, mavenSha1, readInstaller, neoPrefix, byVersionDesc
};

/* ── THE FORGE PROBLEM, stated rather than papered over ────────────────────
   Forge changed shape at 1.13.  Before it, the installer's install_profile
   .json carries `versionInfo`: a complete version json with the LaunchWrapper
   main class and a --tweakClass argument, plus one universal jar that is
   inside the installer itself.  Unpack the jar, write the profile, merge it
   over vanilla, and the thing launches.  That is what this file does, and it
   is what makes Forge 1.8.9 and 1.12.2 real here.

   From 1.13 on, Forge does not ship a client jar at all.  It ships binary
   patches and a list of `processors` — jars the installer runs, in order,
   with argument vectors of their own, to produce a patched client from the
   vanilla one and to remap the Forge sources against it.  Running them means
   spawning a JVM per processor, checking each output's digest against the
   `data` block, and dealing with the fact that some of them need a JDK rather
   than a JRE.  That is a phase of its own, not a corner of this one.

   So modern Forge and modern NeoForge stop at `partial: true` with a note
   that says exactly this, the profile is still written and still merges, and
   nothing pretends the instance is ready.  A launcher that installed half of
   Forge and then let Play be pressed would produce a ClassNotFoundException
   the user has no way to interpret; one that says "the processors have not
   been run" is telling the truth about the same state.                     */
