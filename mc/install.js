'use strict';
/* ============================================================================
   THE DOWNLOADER.  Manifest -> version json -> client jar, libraries, natives,
   asset index, asset objects.  Everything content-addressed, everything
   hashed, everything shared between instances that use the same version.

   THE SHAPE OF A RUN.  A plan is built first — every file the version needs,
   with its url, size and expected digest — and then the plan is walked twice:
   once to ask "is this already here and correct" (a stat, then a digest), and
   once to fetch what is missing.  Building the plan before fetching anything
   is what makes the progress numbers honest: the UI is told the real total
   before the first byte moves, rather than a total that grows as we discover
   more work.

   A SECOND LAUNCH DOES NO NETWORK I/O AT ALL beyond the two small JSON reads
   it takes from cache, because the verify pass answers "yes" for every file
   and the fetch list comes out empty.

   PROGRESS IS PUSHED, NOT POLLED, and it is coalesced to about 12 frames a
   second before it crosses IPC.  A thousand asset objects finishing in four
   seconds is a thousand IPC messages if you let it be, and the renderer will
   spend longer laying out text than the download took.
   ========================================================================= */

const fsp = require('node:fs/promises');
const path = require('node:path');
const net = require('./net');
const V = require('./version');
const { extractNatives } = require('./unzip');
const loaders = require('./loaders');
const content = require('./content');

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const MANIFEST_TTL = 60 * 60 * 1000;     /* an hour; the button on #instances forces a refetch */
const RESOURCES = 'https://resources.download.minecraft.net/';

/* Mojang serves version json and every download from these hosts.  A manifest
   that points somewhere else is not a manifest we follow — this is the same
   instinct as https-only, one level up: parse the host, compare it exactly. */
const HOSTS = new Set([
  'piston-meta.mojang.com', 'piston-data.mojang.com',
  'launcher.mojang.com', 'libraries.minecraft.net',
  'resources.download.minecraft.net', 'launchermeta.mojang.com'
].concat(
  /* PHASE 4 ADDS FOUR LOADERS AND THEIR MAVENS, BY NAME.  The list is still
     exact-match and still deny-by-default; loaders.js states its hosts as a
     literal array and they are unioned in here rather than the check being
     loosened to a suffix match.  A loader profile is a list of URLs written
     by a machine that is not this one, which is precisely the case the
     allow-list exists for. */
  loaders.LOADER_HOSTS
).concat(
  /* PHASE 5 ADDS TWO MODRINTH HOSTS, and only two: api.modrinth.com for the
     project and version documents, cdn.modrinth.com for the jars themselves.
     Same rule, one level further out — a version document is a list of URLs
     somebody else's server wrote, and a mod is arbitrary Java code the game
     will load with full permissions, so the origin it comes from is checked
     exactly rather than by suffix. */
  content.CONTENT_HOSTS
));
function trusted(url) {
  const u = net.httpsOnly(url);
  if (!HOSTS.has(u.hostname)) throw new Error('refusing a download from an unexpected host: ' + u.hostname);
  return u.href;
}

class Installer {
  /* layout is a paths.Layout; log takes one string and says it out loud */
  constructor(layout, log) {
    this.L = layout.ensure();
    this.log = typeof log === 'function' ? log : function () {};
    this.manifest = null;
    this.manifestAt = 0;
  }

  /* ── 1. the version manifest ──────────────────────────────────────────── */

  async getManifest(force) {
    const file = this.L.manifestFile();
    if (!force && this.manifest && Date.now() - this.manifestAt < MANIFEST_TTL) return this.manifest;
    if (!force) {
      try {
        const st = await fsp.stat(file);
        if (Date.now() - st.mtimeMs < MANIFEST_TTL) {
          this.manifest = JSON.parse(await fsp.readFile(file, 'utf8'));
          this.manifestAt = st.mtimeMs;
          return this.manifest;
        }
      } catch (e) { /* no cache yet */ }
    }
    try {
      const j = await net.getJSON(MANIFEST_URL);
      if (!j || !Array.isArray(j.versions)) throw new Error('the manifest has no version list');
      await fsp.mkdir(this.L.cache, { recursive: true });
      await fsp.writeFile(file, JSON.stringify(j));
      this.manifest = j; this.manifestAt = Date.now();
      this.log('manifest: ' + j.versions.length + ' versions, latest release ' + (j.latest && j.latest.release));
      return j;
    } catch (e) {
      /* OFFLINE IS NOT AN ERROR if there is a cached copy.  A stale list of
         versions is a far better answer than a dead screen. */
      try {
        this.manifest = JSON.parse(await fsp.readFile(file, 'utf8'));
        this.log('manifest: network failed (' + e.message + '), using the cached copy');
        return this.manifest;
      } catch (e2) { throw new Error('no version manifest, and none cached: ' + e.message); }
    }
  }

  /* the shape the renderer's version list wants: id, type, date. */
  async versionList(force) {
    const m = await this.getManifest(force);
    return {
      latest: m.latest || {},
      versions: (m.versions || []).map(function (v) {
        return { id: String(v.id), type: String(v.type || 'release'), released: String(v.releaseTime || '') };
      })
    };
  }

  /* ── 2. the version json ──────────────────────────────────────────────── */

  async getVersionJson(id, force) {
    const file = this.L.versionJson(id);
    if (!force) {
      try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch (e) { /* fetch it */ }
    }
    const m = await this.getManifest();
    const row = (m.versions || []).filter(function (v) { return v.id === id; })[0];
    if (!row) throw new Error('no such Minecraft version: ' + id);
    const buf = await net.getBuffer(trusted(row.url), 8 * 1024 * 1024);
    /* the manifest carries the sha1 of the version json itself; check it */
    if (row.sha1 && net.sha1Of(buf) !== row.sha1) {
      throw new Error('sha1 mismatch on the version json for ' + id);
    }
    const j = JSON.parse(buf.toString('utf8'));
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, buf);
    return j;
  }

  /* ── 3. the plan ──────────────────────────────────────────────────────── */

  /* ── 2b. resolving inheritsFrom ───────────────────────────────────────
     A loader profile names a parent, the parent is a Mojang version (or, in
     principle, another profile), and the document everything downstream works
     from is the merge of the two.  The parent is resolved FIRST and in full,
     then the child is folded over the finished result — doing it the other
     way round would drop a grandparent's libraries, because merge() strips
     inheritsFrom from what it returns.

     THE DEPTH CAP IS NOT DECORATION.  These documents come off the network
     and a profile that inherits from itself is a legal JSON file; without the
     cap it is an infinite loop inside a launch. */
  async resolve(id, depth) {
    const d = Number(depth) || 0;
    if (d > 8) throw new Error('version inheritance is too deep or circular at ' + id);
    const child = await this.getVersionJson(id);
    const up = V.inheritsFrom(child);
    if (!up) return child;
    if (up === id) throw new Error(id + ' inherits from itself');
    const parent = await this.resolve(up, d + 1);
    const merged = V.merge(child, parent);
    if (d === 0) {
      this.log('merge ' + id + ' over ' + up + ': ' + (merged.libraries || []).length + ' libraries ('
        + (child.libraries || []).length + ' from the loader, ' + (parent.libraries || []).length + ' from the game), mainClass '
        + merged.mainClass + (parent.mainClass && parent.mainClass !== merged.mainClass ? ' (was ' + parent.mainClass + ')' : ''));
    }
    return merged;
  }

  async plan(id) {
    const vjson = await this.resolve(id, 0);

    const files = [];
    const push = function (kind, url, dest, sha1, size, extra) {
      files.push(Object.assign({ kind: kind, url: url, dest: dest, sha1: sha1 || '', size: Number(size) || 0 }, extra || {}));
    };

    /* the client jar, which for a merged profile belongs to the parent */
    const clientId = String(vjson.jar || id);
    const cd = (vjson.downloads || {}).client;
    if (!cd || !cd.url) throw new Error(id + ' has no client download');
    push('client', trusted(cd.url), this.L.versionJar(clientId), cd.sha1, cd.size);

    /* libraries and natives */
    const libs = V.librariesFor(vjson);
    /* A LOADER LIBRARY ARRIVES WITH NO DIGEST — Fabric's and Quilt's profiles
       carry a coordinate and a repository root and nothing else.  Rather than
       drop those out of the verification story, the digest is fetched from
       where maven publishes it: <artifact>.sha1 beside the artifact.  These
       are 40-byte responses and there are a few dozen of them, so they go
       through the same bounded pool as everything else. */
    const needDigest = libs.jars.filter(function (l) { return l.maven && !l.sha1 && l.url; });
    if (needDigest.length) {
      let got = 0;
      await net.pool(needDigest, 8, async function (l) {
        l.sha1 = await loaders.mavenSha1(trusted(l.url));
        if (l.sha1) got++;
      });
      this.log('plan ' + id + ': fetched ' + got + ' of ' + needDigest.length + ' published .sha1 digests for loader libraries');
      const bare = needDigest.filter(function (l) { return !l.sha1; });
      if (bare.length) this.log('plan ' + id + ': ' + bare.length + ' loader libraries publish no .sha1 (' + bare.slice(0, 3).map(function (l) { return l.name; }).join(', ') + ') — taken on presence alone');
    }
    for (const l of libs.jars) {
      if (!l.url) continue;   /* a handful of ancient entries carry no url; the jar is not fetchable and MC does not need it */
      /* legacy Forge unpacks its universal jar out of the installer, so a
         library that is already on disk is not fetched from a repository that
         has never held it */
      if (l.maven && !l.sha1 && await net.verified(this.L.library(l.path), '', 0)) continue;
      /* A LOADER LIBRARY THE REPOSITORY HAS NO CHECKSUM FOR is also allowed
         to be gone.  Forge 1.8.9 still lists tv.twitch:twitch-platform:6.5,
         which Mojang deleted from its CDN years ago along with the streaming
         feature that used it; the game runs without it and every other
         launcher skips it.  The tolerance is narrow on purpose — it applies
         only to a maven library whose repository publishes no .sha1, and only
         to a 404.  Anything with a digest, and any other failure, still stops
         the install. */
      push('library', trusted(l.url), this.L.library(l.path), l.sha1, l.size, { optional: l.maven && !l.sha1 });
    }
    for (const n of libs.natives) {
      if (!n.url) continue;
      push('native', trusted(n.url), this.L.library(n.path), n.sha1, n.size, { exclude: n.exclude });
    }

    /* the asset index, then its objects */
    let assetIndexId = '';
    let assets = [];
    const ai = vjson.assetIndex;
    if (ai && ai.url && ai.id) {
      assetIndexId = String(ai.id);
      const idxFile = this.L.assetIndexFile(assetIndexId);
      let idx = null;
      if (await net.verified(idxFile, ai.sha1, ai.size)) {
        idx = JSON.parse(await fsp.readFile(idxFile, 'utf8'));
      } else {
        const buf = await net.getBuffer(trusted(ai.url), 32 * 1024 * 1024);
        if (ai.sha1 && net.sha1Of(buf) !== ai.sha1) throw new Error('sha1 mismatch on the asset index ' + assetIndexId);
        await fsp.mkdir(path.dirname(idxFile), { recursive: true });
        await fsp.writeFile(idxFile, buf);
        idx = JSON.parse(buf.toString('utf8'));
      }
      const objs = (idx && idx.objects) || {};
      for (const name of Object.keys(objs)) {
        const o = objs[name];
        if (!o || !net.verified) continue;
        const hash = String(o.hash || '');
        if (!/^[0-9a-f]{40}$/.test(hash)) continue;
        push('asset', RESOURCES + hash.slice(0, 2) + '/' + hash, this.L.assetObject(hash), hash, o.size, { assetName: name });
        assets.push({ name: name, hash: hash, size: Number(o.size) || 0 });
      }
      /* pre-1.7 versions read their assets by name out of a virtual folder */
      this._virtual = !!(idx && (idx.virtual || idx.map_to_resources));
      this._mapToResources = !!(idx && idx.map_to_resources);
    }

    return { id: id, vjson: vjson, files: files, assetIndexId: assetIndexId, assets: assets, natives: libs.natives, clientId: clientId };
  }

  /* ── 4. the run ───────────────────────────────────────────────────────── */

  /* onProgress({phase, done, total, bytes, totalBytes, file}) — already
     coalesced by the caller in mc/index.js, so this can call it freely. */
  async install(id, opts) {
    const o = opts || {};
    const signal = o.signal || { cancelled: false };
    const report = typeof o.onProgress === 'function' ? o.onProgress : function () {};
    const started = Date.now();

    report({ phase: 'preparing', done: 0, total: 0, bytes: 0, totalBytes: 0, file: 'version manifest' });
    const p = await this.plan(id);

    /* ── verify pass: what is already here and correct? ─────────────────── */
    const total = p.files.length;
    let checked = 0;
    const missing = [];
    report({ phase: 'preparing', done: 0, total: total, bytes: 0, totalBytes: 0, file: 'checking ' + total + ' files' });
    await net.pool(p.files, 16, async function (f) {
      if (signal.cancelled) return;
      const ok = await net.verified(f.dest, f.sha1, f.size);
      if (!ok) missing.push(f);
      checked++;
      if (checked % 32 === 0 || checked === total) {
        report({ phase: 'preparing', done: checked, total: total, bytes: 0, totalBytes: 0, file: path.basename(f.dest) });
      }
    }, signal);
    if (signal.cancelled) throw new Error('cancelled');

    const totalBytes = missing.reduce(function (a, f) { return a + f.size; }, 0);
    const skipped = total - missing.length;
    this.log('install ' + id + ': ' + total + ' files in the plan, ' + skipped + ' already verified, ' + missing.length + ' to fetch (' + totalBytes + ' bytes)');

    /* ── fetch pass ─────────────────────────────────────────────────────── */
    let done = 0;
    let bytes = 0;
    report({ phase: 'downloading', done: 0, total: missing.length, bytes: 0, totalBytes: totalBytes, file: '' });
    const gone = [];
    await net.pool(missing, Math.max(8, Math.min(16, o.concurrency || 12)), async function (f) {
      if (signal.cancelled) return;
      try {
        await net.download(f.url, f.dest, {
          sha1: f.sha1, size: f.size,
          onChunk: function (n) { bytes += n; report({ phase: 'downloading', done: done, total: missing.length, bytes: bytes, totalBytes: totalBytes, file: path.basename(f.dest) }); }
        });
      } catch (e) {
        if (!(f.optional && e && e.status === 404)) throw e;
        gone.push(path.basename(f.dest));
      }
      done++;
      report({ phase: 'downloading', done: done, total: missing.length, bytes: bytes, totalBytes: totalBytes, file: path.basename(f.dest) });
    }, signal);
    if (signal.cancelled) throw new Error('cancelled');
    if (gone.length) this.log('install ' + id + ': ' + gone.length + ' library(s) are no longer on their repository and were skipped — ' + gone.slice(0, 4).join(', '));

    /* ── natives ────────────────────────────────────────────────────────── */
    const nativesDir = this.L.nativesDir(id);
    let extracted = 0;
    if (p.natives.length) {
      report({ phase: 'installing', done: 0, total: p.natives.length, bytes: bytes, totalBytes: totalBytes, file: 'unpacking natives' });
      /* a stamp file, so a second launch does not re-unpack forty DLLs.  It
         names the jars and their digests, so a changed manifest re-extracts. */
      const stamp = path.join(nativesDir, '.kestrel-natives.json');
      const want = p.natives.map(function (n) { return n.sha1 || n.path; }).sort().join(',');
      let have = '';
      try { have = JSON.parse(await fsp.readFile(stamp, 'utf8')).want || ''; } catch (e) { /* first time */ }
      if (have !== want) {
        await fsp.rm(nativesDir, { recursive: true, force: true });
        await fsp.mkdir(nativesDir, { recursive: true });
        let i = 0;
        for (const n of p.natives) {
          extracted += await extractNatives(this.L.library(n.path), nativesDir, n.exclude);
          i++;
          report({ phase: 'installing', done: i, total: p.natives.length, bytes: bytes, totalBytes: totalBytes, file: path.basename(n.path) });
        }
        await fsp.writeFile(stamp, JSON.stringify({ want: want, at: new Date().toISOString() }));
        this.log('install ' + id + ': extracted ' + extracted + ' native files from ' + p.natives.length + ' jars');
      } else {
        this.log('install ' + id + ': natives already unpacked');
      }
    }

    /* ── legacy assets ──────────────────────────────────────────────────── */
    /* 1.6 and earlier want the objects laid out under their real names.  It
       is a copy, not a link, because a junction needs a privilege this app
       does not ask for. */
    let virtualised = 0;
    if (p.assetIndexId && this._virtual) {
      const vdir = this.L.virtualDir(p.assetIndexId);
      for (const a of p.assets) {
        const dest = this.L.virtualAsset(p.assetIndexId, a.name);
        if (await net.verified(dest, a.hash, a.size)) continue;
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        await fsp.copyFile(this.L.assetObject(a.hash), dest);
        virtualised++;
      }
      if (virtualised) this.log('install ' + id + ': laid out ' + virtualised + ' legacy assets under ' + vdir);
    }

    const ms = Date.now() - started;
    const summary = {
      id: id, total: total, skipped: skipped, fetched: missing.length,
      bytes: bytes, totalBytes: totalBytes, natives: extracted, ms: ms, absent: gone,
      assetIndexId: p.assetIndexId, nativesDir: nativesDir,
      virtual: !!this._virtual, mapToResources: !!this._mapToResources
    };
    this.log('install ' + id + ': done in ' + ms + 'ms — ' + missing.length + ' fetched, ' + skipped + ' skipped, ' + bytes + ' bytes');
    report({ phase: 'ready', done: missing.length, total: missing.length, bytes: bytes, totalBytes: totalBytes, file: '' });
    return summary;
  }
}

module.exports = { Installer, MANIFEST_URL, RESOURCES };
