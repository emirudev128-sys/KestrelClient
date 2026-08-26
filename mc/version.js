'use strict';
/* ============================================================================
   READING A VERSION MANIFEST.  Two jobs live here because both the downloader
   and the launcher need the same answer and must not disagree about it: which
   libraries apply on this machine, and which of them are natives.

   THE RULES BLOCK IS A DENY-BY-DEFAULT ALLOW LIST.  Mojang's format is:

     "rules": [ { "action": "allow" },
                { "action": "disallow", "os": { "name": "osx" } } ]

   No rules at all means allow.  Rules present means start from denied and let
   every matching rule set the verdict, last match winning.  Getting this the
   wrong way round is how a launcher ends up putting LWJGL's macOS natives on
   a Windows classpath and then blaming Java.

   ARCHITECTURE MATTERS ON WINDOWS in both directions: 1.19+ ships an arm64
   LWJGL that must not go on an x64 box, and 1.8-era versions ship a single
   natives-windows jar with both a 32- and a 64-bit DLL inside it, selected at
   runtime by `${arch}` in the extract path.  Both are handled.
   ========================================================================= */

const os = require('node:os');

/* the repository a library with a coordinate but no url means */
const MOJANG_LIBS = 'https://libraries.minecraft.net/';

function osName() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'osx';
  return 'linux';
}
function osArch() {
  const a = process.arch;
  if (a === 'x64') return 'x86_64';
  if (a === 'ia32') return 'x86';
  if (a === 'arm64') return 'arm64';
  return a;
}
/* the "32"/"64" that goes into ${arch} in a natives path */
function archBits() { return process.arch === 'ia32' || process.arch === 'arm' ? '32' : '64'; }

function matchesOs(spec) {
  if (!spec || typeof spec !== 'object') return true;
  if (spec.name && spec.name !== osName()) return false;
  if (spec.arch && spec.arch !== osArch()) return false;
  if (spec.version) {
    /* a regex out of a downloaded document.  It is Mojang's own and the
       strings are tiny ("^10\\." against "10.0.26200"), but it is still
       compiled from data, so a bad pattern must not take the process down. */
    try { if (!new RegExp(spec.version).test(os.release())) return false; }
    catch (e) { return false; }
  }
  return true;
}

/* features are the argument-side half of the same mechanism: is_demo_user,
   has_custom_resolution, has_quick_plays_support.  Anything we have not been
   told about is false, which is the safe reading. */
function allowed(rules, features) {
  if (!Array.isArray(rules) || !rules.length) return true;
  const f = features || {};
  let verdict = false;
  for (const r of rules) {
    if (!r || typeof r !== 'object') continue;
    let hit = matchesOs(r.os);
    if (hit && r.features && typeof r.features === 'object') {
      for (const k of Object.keys(r.features)) {
        if (!!f[k] !== !!r.features[k]) { hit = false; break; }
      }
    }
    if (hit) verdict = r.action === 'allow';
  }
  return verdict;
}

/* which classifier in downloads.classifiers is this platform's natives jar */
function nativeClassifier(lib) {
  if (!lib.natives || typeof lib.natives !== 'object') return null;
  const key = lib.natives[osName()];
  if (!key) return null;
  return String(key).replace(/\$\{arch\}/g, archBits());
}

/* ── the library set for this machine ─────────────────────────────────────
   Returns two lists that never overlap: `jars` go on the classpath, `natives`
   get unpacked.  1.19+ has no classifiers at all and expresses natives as
   ordinary artifacts whose rules only allow one OS, so those land in `jars`
   and that is correct — modern LWJGL wants its natives on the classpath and
   extracts them itself.                                                    */
function librariesFor(vjson) {
  const jars = [];
  const natives = [];
  const seen = new Set();
  for (const lib of (vjson.libraries || [])) {
    if (!lib || typeof lib !== 'object') continue;
    if (!allowed(lib.rules)) continue;
    const d = lib.downloads || {};

    if (d.artifact && d.artifact.path) {
      const key = d.artifact.path;
      if (!seen.has(key)) {
        seen.add(key);
        jars.push({
          name: lib.name || d.artifact.path,
          path: d.artifact.path, url: d.artifact.url,
          sha1: d.artifact.sha1, size: Number(d.artifact.size) || 0
        });
      }
    } else if (typeof lib.name === 'string' && lib.name.indexOf(':') > 0) {
      /* A LOADER LIBRARY: a coordinate and a repository root, with no
         downloads block and — on Fabric and Quilt — no digest either.  The
         path is derived here; where the digest comes from is install.js's
         problem, and it does not skip it. */
      let co;
      try { co = parseCoord(lib.name); } catch (e) { continue; }
      if (seen.has(co.path)) continue;
      seen.add(co.path);
      const root = String(lib.url || MOJANG_LIBS).replace(/\/*$/, '/');
      jars.push({
        name: lib.name, path: co.path, url: root + co.path,
        sha1: String(lib.sha1 || ''), size: Number(lib.size) || 0,
        maven: true
      });
    }

    const cls = nativeClassifier(lib);
    if (cls && d.classifiers && d.classifiers[cls] && d.classifiers[cls].path) {
      const c = d.classifiers[cls];
      natives.push({
        name: (lib.name || '') + ':' + cls,
        path: c.path, url: c.url, sha1: c.sha1, size: Number(c.size) || 0,
        exclude: (lib.extract && Array.isArray(lib.extract.exclude)) ? lib.extract.exclude : []
      });
    }
  }
  return { jars: jars, natives: natives };
}

/* MODDED VERSIONS INHERIT.  Forge, Fabric, Quilt and NeoForge all ship a thin
   profile with "inheritsFrom": "1.20.1" and expect the launcher to merge it
   over the parent. */
function inheritsFrom(vjson) {
  return typeof vjson.inheritsFrom === 'string' && vjson.inheritsFrom ? vjson.inheritsFrom : null;
}

/* ── maven coordinates ────────────────────────────────────────────────────
   A loader library is almost never a `downloads` block.  It is a coordinate
   and a repository root:

     { "name": "net.fabricmc:sponge-mixin:0.15.4+mixin.0.8.7",
       "url":  "https://maven.fabricmc.net/" }

   and the launcher is expected to know that this means
   net/fabricmc/sponge-mixin/0.15.4+mixin.0.8.7/sponge-mixin-0.15.4+mixin.0.8.7.jar
   under that root.  Two things make that a security question rather than a
   string-formatting one: the coordinate becomes a path under <root>/libraries
   and it becomes a URL.  So the parse is strict — the pieces are matched
   against a character class that has no dot-segment in it and no separator —
   and the path it produces still goes through Layout.library(), which
   resolves and proves containment the same way it does for Mojang's own.   */
const COORD_PART = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

/* "group:artifact:version[:classifier][@ext]" */
function parseCoord(name) {
  const s = String(name || '');
  let ext = 'jar';
  let body = s;
  const at = s.indexOf('@');
  if (at >= 0) { ext = s.slice(at + 1); body = s.slice(0, at); }
  const bits = body.split(':');
  if (bits.length < 3 || bits.length > 4) throw new Error('not a maven coordinate: ' + s.slice(0, 80));
  const group = bits[0], artifact = bits[1], version = bits[2];
  const classifier = bits.length === 4 ? bits[3] : '';
  /* the group is the only piece with dots in it, and they are separators, so
     each of its own segments is checked rather than the whole string */
  const groupParts = group.split('.');
  for (const p of groupParts) if (!COORD_PART.test(p) || p.indexOf('.') >= 0) throw new Error('bad maven group in ' + s.slice(0, 80));
  for (const p of [artifact, version]) if (!COORD_PART.test(p)) throw new Error('bad maven coordinate in ' + s.slice(0, 80));
  if (classifier && !COORD_PART.test(classifier)) throw new Error('bad maven classifier in ' + s.slice(0, 80));
  if (!COORD_PART.test(ext)) throw new Error('bad maven extension in ' + s.slice(0, 80));
  const file = artifact + '-' + version + (classifier ? '-' + classifier : '') + '.' + ext;
  return {
    group: group, artifact: artifact, version: version, classifier: classifier, ext: ext,
    path: groupParts.concat([artifact, version, file]).join('/'),
    key: group + ':' + artifact + (classifier ? ':' + classifier : '')
  };
}

/* THE IDENTITY TWO LIBRARIES HAVE TO SHARE for one to replace the other:
   group:artifact, plus the classifier, and NOT the version — replacing on the
   full coordinate is the same as not replacing at all.

   AND NOT ACROSS ROLES.  1.16.5 lists org.lwjgl:lwjgl:3.2.2 TWICE: once as
   an ordinary jar and once again, same coordinate, carrying `natives` and a
   classifiers block, which is the entry that produces the DLLs.  Keying on
   the coordinate alone makes the second one look like a duplicate of the
   first, drops it, and leaves java.library.path pointing at an empty folder —
   a launch that gets all the way to LWJGL and then dies.  So the role is part
   of the key: a natives entry only ever replaces another natives entry. */
function libKey(lib) {
  const role = (lib && lib.natives && typeof lib.natives === 'object') ? '|natives' : '|jar';
  if (lib && typeof lib.name === 'string') {
    try { return parseCoord(lib.name).key + role; } catch (e) { /* fall through */ }
  }
  const p = lib && lib.downloads && lib.downloads.artifact && lib.downloads.artifact.path;
  return p ? String(p) + role : JSON.stringify(lib);
}

function argList(v) {
  if (Array.isArray(v)) return v.slice();
  return [];
}
function splitLegacy(s) {
  return typeof s === 'string' ? s.split(/\s+/).filter(Boolean) : null;
}

/* ── the merge ────────────────────────────────────────────────────────────
   Child over parent, and the four rules that actually matter:

   1. LIBRARIES CONCATENATE, CHILD FIRST, and the child wins a collision on
      group:artifact.  Order is not cosmetic: Fabric ships its own ASM and
      Forge ships its own Guava, and whichever copy is earlier on the
      classpath is the one the JVM loads.  Putting the child first is what
      makes "the loader's build of X shadows the game's" true.

   2. mainClass IS A STRAIGHT OVERRIDE.  It is the whole point of a loader
      profile — KnotClient or LaunchWrapper instead of Main — so a child that
      states one replaces the parent's without conditions.

   3. THE TWO ARGUMENT FORMS ARE NOT THE SAME MERGE.  `arguments` (1.13+) is
      additive: the child's game and jvm lists are appended to the parent's,
      because a modern loader states only what it adds (--fml.forgeVersion,
      -DignoreList=...).  `minecraftArguments` (pre-1.13) is a REPLACEMENT:
      Forge 1.12.2 restates the entire vanilla line with --tweakClass on the
      end, so appending it would pass every argument twice.
      Mixed pairs happen for real — Fabric on 1.12.2 is a modern child over a
      legacy parent — so a legacy string on either side is normalised into a
      game list first and the result is emitted in one form only.

   4. EVERYTHING ELSE IS "the child if it says, otherwise the parent":
      assetIndex, downloads, javaVersion, logging, type.  A Fabric profile
      states none of them and must not blank them out.                      */
function merge(child, parent) {
  const c = child || {};
  const p = parent || {};
  const out = Object.assign({}, p, c);

  /* the merged document does not inherit from anything any more */
  delete out.inheritsFrom;
  out.id = c.id || p.id;

  /* 1. libraries.  THE DEDUPE IS ONE-WAY: the child replaces the parent, and
     the parent's list is never deduped against ITSELF.  That is not a
     shortcut, it is required — 1.16.5 lists org.lwjgl:lwjgl-glfw twice on
     purpose, once under an osx rule and once under everything-but-osx, and
     collapsing them by coordinate throws away half the platform's natives.
     The child's own list is left alone for the same reason. */
  const libs = [];
  const fromChild = new Set();
  for (const lib of argList(c.libraries)) {
    if (!lib || typeof lib !== 'object') continue;
    fromChild.add(libKey(lib));
    libs.push(lib);
  }
  for (const lib of argList(p.libraries)) {
    if (!lib || typeof lib !== 'object') continue;
    if (fromChild.has(libKey(lib))) continue;   /* the child supplied this one */
    libs.push(lib);
  }
  out.libraries = libs;

  /* 2. mainClass */
  out.mainClass = c.mainClass || p.mainClass || '';

  /* 3. arguments */
  const cArgs = c.arguments && typeof c.arguments === 'object' ? c.arguments : null;
  const pArgs = p.arguments && typeof p.arguments === 'object' ? p.arguments : null;
  const cLegacy = splitLegacy(c.minecraftArguments);
  const pLegacy = splitLegacy(p.minecraftArguments);

  if (cArgs || pArgs) {
    const parentGame = pArgs ? argList(pArgs.game) : (pLegacy || []);
    const game = cLegacy ? cLegacy                       /* a legacy child replaces */
      : parentGame.concat(cArgs ? argList(cArgs.game) : []);
    const jvm = (pArgs ? argList(pArgs.jvm) : []).concat(cArgs ? argList(cArgs.jvm) : []);
    out.arguments = { game: game, jvm: jvm };
    delete out.minecraftArguments;
  } else if (cLegacy || pLegacy) {
    out.minecraftArguments = c.minecraftArguments || p.minecraftArguments;
    delete out.arguments;
  }

  /* WHOSE CLIENT JAR.  A loader profile does not ship one — it runs the
     vanilla client, patched or not — and the vanilla format already has a
     word for that: `jar`, meaning "the client jar of that version id".  So
     the merge names the parent there rather than letting the merged id become
     a second, identical copy of the same 10 MB file on disk. */
  out.jar = c.jar || p.jar || p.id || out.id;

  /* 4. the fields a thin profile omits */
  for (const k of ['assetIndex', 'assets', 'downloads', 'javaVersion', 'logging', 'type', 'complianceLevel', 'minimumLauncherVersion']) {
    if (c[k] === undefined || c[k] === null) {
      if (p[k] !== undefined) out[k] = p[k]; else delete out[k];
    }
  }
  /* releaseTime/time are the child's own if it has them, otherwise the
     parent's — this only ever shows up in a UI */
  out.time = c.time || p.time || '';
  out.releaseTime = c.releaseTime || p.releaseTime || '';

  return out;
}

/* the runtime Mojang itself uses for this version.  Present from 1.17 on;
   below that the field is missing and the answer is 8. */
function javaMajorFor(vjson) {
  const jv = vjson.javaVersion;
  if (jv && Number(jv.majorVersion)) return Number(jv.majorVersion);
  /* complianceLevel 0 with no javaVersion is the pre-1.17 world */
  return 8;
}

module.exports = {
  osName, osArch, archBits, allowed, matchesOs,
  nativeClassifier, librariesFor, inheritsFrom, javaMajorFor,
  merge, parseCoord, libKey, MOJANG_LIBS
};
