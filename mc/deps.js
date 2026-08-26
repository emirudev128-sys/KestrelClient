'use strict';
/* ============================================================================
   WHAT THE MODS IN A FOLDER SAY THEY NEED.

   A mod installed from Modrinth arrives with its dependencies resolved —
   mc/content.js plans the whole tree and hash-checks every file. A jar
   somebody DROPPED IN has no project behind it and nothing to resolve, so
   the first anyone hears about a missing dependency is Fabric refusing to
   start:

     Mod 'Kestrel HUD' (kestrel-hud) 0.1.0 requires any version of
     fabric-api, which is missing!

   That message is good — the loader is doing its job, and stopping before
   the world loads beats a crash inside it. But the launcher put the jar
   there and could have known. This reads what the jars declare and fills in
   what is missing, before the game is asked to.

   ── THE MAP IS NAMED, ONE BY ONE ──────────────────────────────────────────
   A mod id is not a Modrinth project id, and there is no lookup that turns
   one into the other without asking Modrinth to search — which would mean
   installing whatever came back FIRST for a name a stranger chose. That is
   the same mistake as trusting a url out of a manifest.

   So the bridge between the two is a literal table below, and a dependency
   that is not in it is REPORTED rather than guessed at. Kestrel installing
   the wrong "fabric-api" because a search ranked something else first would
   be worse than Kestrel saying it does not know.

   ── AND ONLY WHAT IS ACTUALLY MISSING ─────────────────────────────────────
   `provides` is part of the manifest format and Fabric API in particular
   declares dozens of ids that way — fabric-networking-api-v1 and friends are
   all provided by the one jar. Treating a provided id as absent would
   install Fabric API a second time on top of itself.
   ========================================================================= */

const fsp = require('node:fs/promises');
const path = require('node:path');
const { entries, readEntry } = require('./unzip');

/* ids every mod may depend on that no mod provides: the game, the loader and
   the runtime. Nothing installs these. */
const BUILT_IN = ['minecraft', 'java', 'fabricloader', 'fabric-loader', 'quilt_loader', 'quiltloader', 'neoforge', 'forge'];

/* mod id -> the Modrinth project that IS it. Written out on purpose; see the
   header. Add to it deliberately, never by search. */
const KNOWN = {
  'fabric-api': { project: 'P7dR8mSH', title: 'Fabric API' },
  'fabric-language-kotlin': { project: 'Ha28R6CL', title: 'Fabric Language Kotlin' }
};

/* a mods folder with more jars than this is not a mods folder anybody is
   debugging by hand, and reading every one costs a zip parse each */
const MAX_JARS = 512;
const JAR_CAP = 64 * 1024 * 1024;

/* ── read one jar's fabric.mod.json ────────────────────────────────────── */
async function manifestOf(file) {
  let buf;
  try {
    const st = await fsp.stat(file);
    if (!st.isFile() || st.size > JAR_CAP) return null;
    buf = await fsp.readFile(file);
  } catch (e) { return null; }
  try {
    const e = entries(buf).filter(function (x) { return x.name === 'fabric.mod.json'; })[0];
    if (!e) return null;
    return JSON.parse(readEntry(buf, e).toString('utf8'));
  } catch (err) {
    /* a jar that is not a Fabric mod, or a manifest that will not parse, is
       not this function's problem — it is simply not a source of deps */
    return null;
  }
}

/* ── what is in the folder, and what it wants ──────────────────────────── */
async function scan(modsDir) {
  let names;
  try { names = await fsp.readdir(modsDir); } catch (e) { return { present: [], wanted: [], jars: 0 }; }
  const jars = names.filter(function (n) { return /\.jar$/i.test(n); }).slice(0, MAX_JARS);

  const present = new Set();
  const wanted = new Map();   /* id -> the mod that asked for it */

  for (const n of jars) {
    const j = await manifestOf(path.join(modsDir, n));
    if (!j) continue;
    if (j.id) present.add(String(j.id));
    /* one jar can BE several ids */
    const provides = Array.isArray(j.provides) ? j.provides : [];
    for (const p of provides) present.add(String(p));
    const depends = (j.depends && typeof j.depends === 'object') ? j.depends : {};
    for (const d of Object.keys(depends)) {
      if (!wanted.has(d)) wanted.set(d, String(j.name || j.id || n));
    }
  }
  return { present: [...present], wanted: [...wanted.entries()], jars: jars.length };
}

/* ── the ones that are missing, split by whether we can fix them ────────── */
async function missing(modsDir) {
  const s = await scan(modsDir);
  const have = new Set(s.present.concat(BUILT_IN));
  const out = { installable: [], unknown: [], jars: s.jars };
  for (const [id, askedBy] of s.wanted) {
    if (have.has(id)) continue;
    if (Object.prototype.hasOwnProperty.call(KNOWN, id)) {
      out.installable.push({ id: id, askedBy: askedBy, project: KNOWN[id].project, title: KNOWN[id].title });
    } else {
      out.unknown.push({ id: id, askedBy: askedBy });
    }
  }
  return out;
}

module.exports = { missing, scan, manifestOf, KNOWN, BUILT_IN };
