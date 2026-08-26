'use strict';
/* ============================================================================
   MODRINTH MODPACKS — .mrpack, read, planned, then installed.

   A .mrpack is a zip holding two things:

     modrinth.index.json   the manifest: what Minecraft version, which loader,
                           and a list of files with hashes and download urls
     overrides/            a tree copied verbatim into the instance — configs,
                           keybinds, a options.txt, sometimes a resource pack

   THE MANIFEST IS A LIST OF URLS SOMEBODY ELSE WROTE.  That sentence appears
   three times in this codebase — for a loader profile, for a Modrinth version
   document, and now here — and it means the same thing each time: the host is
   checked against an exact-match list before anything is fetched, and the
   digest is checked after.  A pack author can put any url in `downloads`.
   The format permits it; this does not.

   AND THE PATHS ARE THE PACK'S TOO.  `path` on each file, and every entry
   name under overrides/, decides where a byte lands in the user's instance.
   "mods/x.jar" is what they all look like, and "../../../AppData/Roaming/..."
   is what one would look like if somebody wanted it to. Both go through the
   same containment check as a zip entry anywhere else in this project, and a
   pack that escapes is refused whole rather than partially installed.

   ── PLAN, SHOW, THEN WRITE ────────────────────────────────────────────────
   Same shape as mc/content.js: reading a pack produces a PLAN — a name, a
   Minecraft version, a loader, a file count and a byte count — and writes
   nothing.  Installing takes that plan.  The reason is the same too: a
   modpack is a few hundred jars from a few hundred authors, and the moment
   to find out that one of them will not verify is before the instance folder
   exists, not half way through filling it.

   WHAT IS NOT DONE HERE.  CurseForge packs are a different manifest with a
   different rights story (their API requires a key and their terms restrict
   redistribution), so `.zip` exports are refused by name rather than
   half-read.  See kindOf() in mc/content.js for the same discipline.
   ========================================================================= */

const fsp = require('node:fs/promises');
const path = require('node:path');
const net = require('./net');
const { entries, readEntry, safeJoin } = require('./unzip');

/* ── the allow-list this file adds ────────────────────────────────────────
   Modrinth's own packs point every file at their CDN.  A pack that points
   somewhere else is not installed and says which host it wanted, because
   "it failed" and "it wanted to fetch a jar from a host this launcher has
   never heard of" are different facts and only the second one is useful. */
const PACK_HOSTS = new Set(['cdn.modrinth.com']);

const INDEX = 'modrinth.index.json';
const OVERRIDES = 'overrides/';
const CLIENT_OVERRIDES = 'client-overrides/';

/* A pack is a manifest and a config tree; it is not a disk image.  These are
   the points past which something is wrong rather than large. */
const PACK_CAP = 256 * 1024 * 1024;      /* the .mrpack itself */
const MAX_FILES = 4096;                  /* manifest entries */
const MAX_OVERRIDES = 8192;              /* entries under overrides/ */
const TOTAL_CAP = 8 * 1024 * 1024 * 1024;

const SHA1_RE = /^[0-9a-f]{40}$/;

/* the loader keys a Modrinth pack may name, mapped to what loaders.js calls
   them.  Anything else is a loader this build does not install, and saying
   which one beats "unsupported pack". */
const LOADERS = {
  'fabric-loader': 'fabric',
  'quilt-loader': 'quilt',
  'forge': 'forge',
  'neoforge': 'neoforge'
};

function hostOk(url) {
  const u = net.httpsOnly(url);      /* https, or it is not a url we fetch */
  if (!PACK_HOSTS.has(u.hostname)) {
    throw new Error('this pack wants a file from ' + u.hostname
      + ', which is not a host this launcher downloads from');
  }
  return u.href;
}

/* ── READ THE MANIFEST ─────────────────────────────────────────────────────
   Every field is checked before it is used for anything, because every one
   of them ends up as a path, a url or a version id.                       */
function readIndex(buf) {
  if (!Buffer.isBuffer(buf)) throw new Error('that is not a file');
  if (buf.length > PACK_CAP) throw new Error('that .mrpack is implausibly large');

  const list = entries(buf);
  const idx = list.filter(function (e) { return e.name === INDEX; })[0];
  if (!idx) {
    throw new Error('that zip has no ' + INDEX + ' in it, so it is not a Modrinth modpack'
      + '. CurseForge exports carry a manifest.json instead and this build does not read those.');
  }

  let j;
  try { j = JSON.parse(readEntry(buf, idx).toString('utf8')); }
  catch (e) { throw new Error(INDEX + ' is not readable JSON'); }

  if (Number(j.formatVersion) !== 1) {
    throw new Error('this pack is format version ' + String(j.formatVersion).slice(0, 8)
      + ' and this build reads version 1');
  }
  if (String(j.game || '') !== 'minecraft') {
    throw new Error('that pack is for ' + String(j.game).slice(0, 24) + ', not Minecraft');
  }
  return { index: j, zip: list };
}

/* ── THE PLAN ──────────────────────────────────────────────────────────────
   Nothing is written.  What comes back is what the user should see before
   they agree to any of it: which Minecraft version, which loader, how many
   files, how many bytes, and — the part that matters — anything refused and
   the reason.                                                             */
function plan(buf) {
  const read = readIndex(buf);
  const j = read.index;
  const zip = read.zip;

  /* the loader, out of `dependencies` */
  const deps = (j.dependencies && typeof j.dependencies === 'object') ? j.dependencies : {};
  const mc = String(deps.minecraft || '').trim();
  if (!mc) throw new Error('that pack does not say which Minecraft version it is for');

  let loader = '', loaderVersion = '';
  for (const key of Object.keys(deps)) {
    if (key === 'minecraft') continue;
    if (!Object.prototype.hasOwnProperty.call(LOADERS, key)) {
      throw new Error('that pack needs ' + key.slice(0, 32) + ', which this build does not install');
    }
    if (loader) throw new Error('that pack names two mod loaders, which is not a thing an instance can be');
    loader = LOADERS[key];
    loaderVersion = String(deps[key] || '').trim();
  }

  /* the files */
  const raw = Array.isArray(j.files) ? j.files : [];
  if (raw.length > MAX_FILES) throw new Error('that pack lists ' + raw.length + ' files, which is past what this build will install');

  const files = [];
  const skipped = [];
  let bytes = 0;

  for (const f of raw) {
    const p = String((f && f.path) || '');
    /* SERVER-ONLY FILES ARE NOT A FAILURE.  A pack marks a mod
       client: "unsupported" when it belongs on the server half, and
       installing it into a client instance is how you get a crash that
       reads like the pack is broken. */
    const env = (f && f.env) || {};
    if (String(env.client || '') === 'unsupported') { skipped.push({ path: p, why: 'server-side only' }); continue; }

    const h = (f && f.hashes) || {};
    const sha1 = String(h.sha1 || '').toLowerCase();
    if (!SHA1_RE.test(sha1)) throw new Error('that pack publishes no sha1 for ' + p.slice(0, 60) + ', so it will not be installed');

    const urls = Array.isArray(f.downloads) ? f.downloads : [];
    if (!urls.length) throw new Error('that pack lists ' + p.slice(0, 60) + ' with nowhere to get it from');
    const url = hostOk(String(urls[0]));

    const size = Number(f.fileSize) || 0;
    bytes += size;
    if (bytes > TOTAL_CAP) throw new Error('that pack comes to more than ' + (TOTAL_CAP / 1073741824) + ' GB, which is past what this build will install');

    /* the path is the pack's, so it is proved rather than trusted.  safeJoin
       is the same guard the natives extractor uses; it is called here
       against a stand-in root purely to make it throw early, and again for
       real against the instance folder at install time. */
    if (!safeJoin('C:\\k', p)) throw new Error('that pack wants to write outside the instance: ' + p.slice(0, 80));

    files.push({ path: p, sha1: sha1, size: size, url: url });
  }

  /* the overrides tree, counted but not extracted */
  const over = zip.filter(function (e) {
    return !e.name.endsWith('/')
      && (e.name.startsWith(OVERRIDES) || e.name.startsWith(CLIENT_OVERRIDES));
  });
  if (over.length > MAX_OVERRIDES) throw new Error('that pack has ' + over.length + ' override files, which is past what this build will extract');
  for (const e of over) {
    const rel = e.name.startsWith(CLIENT_OVERRIDES) ? e.name.slice(CLIENT_OVERRIDES.length) : e.name.slice(OVERRIDES.length);
    if (!rel) continue;
    if (!safeJoin('C:\\k', rel)) throw new Error('that pack has an override that writes outside the instance: ' + e.name.slice(0, 80));
  }

  return {
    name: String(j.name || 'Modpack').slice(0, 80),
    versionId: String(j.versionId || '').slice(0, 40),
    summary: String(j.summary || '').slice(0, 200),
    mc: mc,
    loader: loader,
    loaderVersion: loaderVersion,
    files: files,
    overrides: over.length,
    skipped: skipped,
    bytes: bytes
  };
}

/* ── INSTALL ───────────────────────────────────────────────────────────────
   Files first, then overrides.  Both write into gameDir, which is the
   instance's own minecraft folder, and every destination is re-derived with
   safeJoin against that real root rather than trusting the plan's copy.  */
async function install(o) {
  const p = o.plan;
  const gameDir = o.gameDir;
  const log = typeof o.log === 'function' ? o.log : function () {};
  const onProgress = typeof o.onProgress === 'function' ? o.onProgress : function () {};
  if (!p || !Array.isArray(p.files)) throw new Error('no plan to install');

  await fsp.mkdir(gameDir, { recursive: true });

  let done = 0, fetched = 0, already = 0, wrote = 0;
  const total = p.files.length;

  await net.pool(p.files, 6, async function (f) {
    const dest = safeJoin(gameDir, f.path);
    if (!dest) throw new Error('refusing a pack path that leaves the instance: ' + f.path.slice(0, 80));
    if (await net.verified(dest, f.sha1, f.size)) { already++; }
    else {
      await net.download(hostOk(f.url), dest, { sha1: f.sha1 });
      fetched++;
    }
    done++;
    onProgress({ phase: 'installing', done: done, total: total, file: path.basename(f.path) });
  }, o.signal);

  log('modpack: ' + fetched + ' fetched, ' + already + ' already verified, of ' + total + ' files');

  /* the overrides, extracted with the same guard */
  if (o.buf) {
    const zip = entries(o.buf);
    for (const e of zip) {
      if (e.name.endsWith('/')) continue;
      const isClient = e.name.startsWith(CLIENT_OVERRIDES);
      if (!isClient && !e.name.startsWith(OVERRIDES)) continue;
      const rel = isClient ? e.name.slice(CLIENT_OVERRIDES.length) : e.name.slice(OVERRIDES.length);
      if (!rel) continue;
      const dest = safeJoin(gameDir, rel);
      if (!dest) throw new Error('refusing an override that leaves the instance: ' + e.name.slice(0, 80));
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.writeFile(dest, readEntry(o.buf, e));
      wrote++;
    }
    log('modpack: ' + wrote + ' override files written into the instance');
  }

  return { files: total, fetched: fetched, already: already, overrides: wrote, skipped: p.skipped.length };
}

module.exports = { plan, install, readIndex, hostOk, PACK_HOSTS, LOADERS };
