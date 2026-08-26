'use strict';
/* ============================================================================
   CONTENT.  Mods, resource packs and shader packs, from Modrinth, into one
   instance's own folders.

   A MOD IS ARBITRARY JAVA CODE THAT THE GAME WILL LOAD WITH FULL PERMISSIONS.
   That single fact decides every choice in this file:

     - Two hosts, named.  api.modrinth.com for the metadata and
       cdn.modrinth.com for the bytes, exact-match, unioned into install.js's
       list the same way loaders.js's mavens are.  A version document is a
       list of URLs a machine that is not this one wrote, and a `url` field
       pointing at some other origin is not followed.

     - Every file is hashed.  Modrinth publishes sha1 and sha512 per file;
       net.download() streams the sha1 as the bytes arrive and renames into
       place only on a match, so a mismatch leaves NOTHING on disk and throws.
       There is no warn-and-continue branch, and the size is checked too.

     - The filename off the API is a string a stranger typed.  It never
       becomes a path directly: it is reduced to one path segment, restricted
       to a small character set, forced to the extension its kind allows, and
       then resolved through Layout, which proves containment.  A file lands
       in that instance's mods/ or it does not land.

     - Nothing is executed.  Installing a mod here is a download and a rename.
       No installer jar is run, no processor is spawned, no archive is opened.

   DEPENDENCIES ARE SHOWN BEFORE THEY ARE FETCHED.  plan() walks the required
   dependency graph and returns the whole list — with sizes, versions and
   which of them are already present — and hands back an opaque id.  install()
   takes that id.  The renderer therefore cannot ask for a file the main
   process did not itself resolve, and the user cannot be given a dependency
   tree they were not shown.

   MODPACKS ARE OUT OF SCOPE.  A .mrpack is a zip carrying an index that names
   other downloads plus an overrides tree to unpack over the instance — it is
   a second installer, with its own containment problem, and half of one is
   worse than none.  browse() refuses the type by name and says so.
   ========================================================================= */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('./net');
const { CONTENT_FOLDERS } = require('./paths');

/* ── the allow-list this file adds ────────────────────────────────────────
   Exact, named, and two entries long.  install.js unions it into its own. */
const CONTENT_HOSTS = ['api.modrinth.com', 'cdn.modrinth.com'];

const API = 'https://api.modrinth.com/v2';
const FILE_CAP = 512 * 1024 * 1024;   /* the largest thing on Modrinth is a fat modpack jar; this is slack */
const MAX_DEPS = 64;                  /* a dependency graph deeper than this is a bug or an attack */
const PLAN_TTL = 10 * 60 * 1000;

/* THE KINDS THIS FILE INSTALLS, and what a file of each is allowed to be
   called.  A resource pack and a shader pack are both zips; a mod is a jar.
   Nothing here writes an .exe, a .bat or a .dll under any circumstances. */
const KINDS = {
  mod: { folder: 'mods', ext: ['.jar'], noun: 'mod' },
  resourcepack: { folder: 'resourcepacks', ext: ['.zip'], noun: 'resource pack' },
  shader: { folder: 'shaderpacks', ext: ['.zip'], noun: 'shader pack' }
};
function kindOf(k) {
  const s = String(k || 'mod').toLowerCase().trim();
  if (s === 'modpack') throw new Error('modpacks are not installed by this build: a .mrpack carries its own download list and an overrides tree, and half an implementation of that is worse than none');
  if (!Object.prototype.hasOwnProperty.call(KINDS, s)) throw new Error('not a content type this build installs: ' + s.slice(0, 32));
  return s;
}

/* WHICH LOADER FACET MODRINTH IS ASKED ABOUT, per kind.  A shader pack does
   not load on Fabric, it loads on Iris; a resource pack loads on anything.
   Getting this wrong is how a filter silently returns nothing. */
const LOADER_FACET = { fabric: 'fabric', forge: 'forge', neoforge: 'neoforge', quilt: 'quilt' };
const SHADER_FACET = { fabric: 'iris', quilt: 'iris', neoforge: 'iris', forge: 'optifine' };
function facetFor(kind, loader) {
  const l = String(loader || '').toLowerCase().trim().split(/\s+/)[0];
  if (kind === 'mod') return LOADER_FACET[l] || '';
  if (kind === 'shader') return SHADER_FACET[l] || '';
  return '';   /* a resource pack has no loader */
}

/* A MODRINTH IDENTIFIER GOING INTO A URL PATH.  Project ids are base62 and
   slugs are a small set; either way this is the same instinct as paths.js's
   version pattern — match it before it is concatenated into anything. */
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{1,63}$/;
function mrId(v) {
  const s = String(v || '').trim();
  if (!ID_RE.test(s)) throw new Error('not a Modrinth id: ' + s.slice(0, 40));
  return s;
}

/* ── THE FILENAME, which is the dangerous one ─────────────────────────────
   `file_name` in a version document is whatever the project's author typed
   when they uploaded.  It is treated exactly like a library path out of a
   Mojang manifest: reduced to one segment, restricted, and then proved
   contained by Layout.

   The steps, in order, and each one is here for a specific string:
     "a/b/../../x.jar"          -> every separator splits, only the last part
                                   survives, and ".." is refused outright
     "sodium<NUL>.jar"        -> a control character becomes an underscore
     "  .hidden.jar"            -> leading dots, dashes and spaces come off
     "CON.jar"                  -> a Windows device name gets a prefix
     "mod.jar.exe"              -> the extension must be the kind's own
     "<300 chars>.jar"          -> capped, keeping the extension
   What is left is [A-Za-z0-9._+()\[\] -], which is the set that means the
   same thing to every filesystem this app runs on.                        */
function safeName(raw, kind, fallback) {
  const k = KINDS[kind];
  let s = String(raw == null ? '' : raw);
  s = s.replace(/\\/g, '/');
  s = s.split('/').pop();                       /* one segment, the last one */
  s = s.replace(/[^A-Za-z0-9._+()\[\] -]/g, '_');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^[.\-\s]+/, '');               /* no dotfiles, no leading dash */
  if (s === '..' || s === '.') s = '';
  /* a trailing dot or space is invisible on Windows and resolves to the name
     without it, which is a rename nobody asked for */
  s = s.replace(/[.\s]+$/, '');

  let base = s;
  let ext = '';
  const dot = s.lastIndexOf('.');
  if (dot > 0) { base = s.slice(0, dot); ext = s.slice(dot).toLowerCase(); }
  if (k.ext.indexOf(ext) === -1) { base = s; ext = k.ext[0]; }
  if (!base) base = String(fallback || 'file').replace(/[^A-Za-z0-9._+-]/g, '_').replace(/^[.\-]+/, '') || 'file';
  /* CON, PRN, AUX, NUL, COM1-9, LPT1-9 are devices on Windows whatever the
     extension is; a leading underscore makes the name ordinary again */
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base.split('.')[0])) base = '_' + base;
  if (base.length > 140) base = base.slice(0, 140);
  return base + ext;
}

function trusted(url) {
  const u = net.httpsOnly(url);
  if (CONTENT_HOSTS.indexOf(u.hostname) === -1) {
    throw new Error('refusing a download from an unexpected host: ' + u.hostname);
  }
  return u.href;
}

/* Modrinth's own JSON, with the same host rule applied to the request as to
   the download.  net.getJSON is https-only; this adds the exact host. */
function api(pathAndQuery) {
  return net.getJSON(trusted(API + pathAndQuery));
}

function jsonArr(v) { return encodeURIComponent(JSON.stringify(v)); }

/* ── the index ────────────────────────────────────────────────────────────
   WHAT THE FOLDER CANNOT SAY FOR ITSELF.  A jar on disk knows its name and
   its size; it does not know which Modrinth project it came from or which
   version it is, and that is what update checking needs.  So a small sidecar
   sits beside instance.json — NOT inside minecraft/, because that folder is
   the game's and anything we leave in it is something a mod might read.

   It is a cache, not a source of truth: the folder is.  A file with no entry
   is listed anyway (somebody dropped a jar in), and an entry with no file is
   dropped on the next read.                                               */
const INDEX_NAME = 'content.json';

class ContentStore {
  /* layout is a paths.Layout; log takes one string */
  constructor(layout, log) {
    this.L = layout;
    this.log = typeof log === 'function' ? log : function () {};
    this.plans = new Map();       /* planId -> {at, instance, kind, items} */
  }

  indexFile(instanceId) { return path.join(this.L.instanceDir(instanceId), INDEX_NAME); }

  readIndex(instanceId) {
    try {
      const j = JSON.parse(fs.readFileSync(this.indexFile(instanceId), 'utf8'));
      return j && typeof j.files === 'object' && j.files ? j : { files: {} };
    } catch (e) { return { files: {} }; }
  }
  writeIndex(instanceId, idx) {
    const f = this.indexFile(instanceId);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(idx, null, 2));
  }

  /* ── 1. what is actually in the folder ──────────────────────────────────
     THE FOLDER IS THE ANSWER.  Not the record's `mods` count, not the index:
     a readdir, a stat per entry, and the enabled state read off the name.  */
  async list(instanceId, kind) {
    const k = kindOf(kind);
    const dir = this.L.contentDir(instanceId, k);
    await fsp.mkdir(dir, { recursive: true });
    const idx = this.readIndex(instanceId);
    let names;
    try { names = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { return []; }
    const out = [];
    for (const e of names) {
      if (!e.isFile()) continue;
      const file = e.name;
      const dis = /\.disabled$/i.test(file);
      const bare = dis ? file.slice(0, -'.disabled'.length) : file;
      const ext = path.extname(bare).toLowerCase();
      if (KINDS[k].ext.indexOf(ext) === -1) continue;
      let st;
      try { st = await fsp.stat(path.join(dir, file)); } catch (e2) { continue; }
      const meta = idx.files[bare] || null;
      out.push({
        file: file, name: bare, enabled: !dis, size: st.size, mtime: st.mtimeMs,
        kind: k,
        title: meta && meta.title ? meta.title : prettyTitle(bare),
        author: meta && meta.author ? meta.author : '',
        project: meta ? meta.project : '', slug: meta ? meta.slug : '',
        version: meta && meta.version ? meta.version : '',
        versionId: meta ? meta.versionId : '',
        sha1: meta ? meta.sha1 : '',
        managed: !!meta
      });
    }
    out.sort(function (a, b) { return a.title.toLowerCase().localeCompare(b.title.toLowerCase()); });
    return out;
  }

  /* every kind at once, which is what the instance screen wants */
  async listAll(instanceId) {
    const out = {};
    for (const k of Object.keys(KINDS)) out[k] = await this.list(instanceId, k);
    return out;
  }

  /* the number the Play screen draws.  Enabled jars only — a .jar.disabled is
     a file the game will not load, and counting it would be a lie. */
  async count(instanceId) {
    const mods = await this.list(instanceId, 'mod');
    return { total: mods.length, enabled: mods.filter(function (m) { return m.enabled; }).length,
             bytes: mods.reduce(function (n, m) { return n + m.size; }, 0) };
  }

  /* ── 2. resolving a version ─────────────────────────────────────────────
     ONE PROJECT, ONE FILE.  Modrinth returns its version list newest first;
     a release is preferred over a beta or an alpha when both fit, because a
     launcher that quietly installs an alpha is a launcher nobody trusts. */
  async pickVersion(projectId, kind, loader, mc) {
    const k = kindOf(kind);
    const id = mrId(projectId);
    const q = [];
    const facet = facetFor(k, loader);
    if (facet) q.push('loaders=' + jsonArr([facet]));
    if (mc) q.push('game_versions=' + jsonArr([String(mc)]));
    let list = await api('/project/' + encodeURIComponent(id) + '/version' + (q.length ? '?' + q.join('&') : ''));
    if (!Array.isArray(list) || !list.length) {
      const e = new Error('Modrinth has no ' + KINDS[k].noun + ' build of that project for ' +
        (facet ? facet + ' ' : '') + (mc || 'this version'));
      e.code = 'NO_BUILD';
      throw e;
    }
    const rel = list.filter(function (v) { return v && v.version_type === 'release'; });
    return (rel[0] || list[0]);
  }

  async getVersion(versionId) {
    return api('/version/' + encodeURIComponent(mrId(versionId)));
  }
  async getProject(projectId) {
    return api('/project/' + encodeURIComponent(mrId(projectId)));
  }

  /* THE FILE INSIDE A VERSION.  `primary` is the jar; the rest are sources
     and javadoc jars that must never be installed. */
  fileOf(version, kind) {
    const files = Array.isArray(version && version.files) ? version.files : [];
    const pick = files.filter(function (f) { return f && f.primary; })[0] || files[0];
    if (!pick) throw new Error('that build has no file attached');
    const h = pick.hashes || {};
    const sha1 = String(h.sha1 || '').toLowerCase();
    /* NO DIGEST, NO INSTALL.  Modrinth computes both hashes server-side for
       every upload, so a file without one is a shape we do not understand,
       and guessing is exactly what hash verification exists to stop. */
    if (!/^[0-9a-f]{40}$/.test(sha1)) throw new Error('Modrinth published no sha1 for that file, so it will not be installed');
    const size = Number(pick.size) || 0;
    if (size <= 0 || size > FILE_CAP) throw new Error('that file has an implausible size (' + size + ')');
    return {
      url: trusted(pick.url),
      filename: safeName(pick.filename, kind, version && version.version_number),
      raw: String(pick.filename || '').slice(0, 200),
      sha1: sha1,
      sha512: String(h.sha512 || '').toLowerCase(),
      size: size
    };
  }

  /* ── 3. the plan, dependencies and all ──────────────────────────────────
     BREADTH FIRST OVER THE REQUIRED EDGES ONLY.  An optional dependency is
     reported and not walked: "Sodium suggests Indium" is information, not a
     licence to install Indium.  A version-pinned edge (`version_id`) is
     followed to that exact version; a project edge resolves like a top-level
     install does, against this instance's loader and game version.        */
  async plan(instanceId, projectId, kind, inst) {
    const k = kindOf(kind);
    const loader = String(inst && inst.loader || '');
    const mc = String(inst && inst.ver || '');
    if (!mc) throw new Error('that instance has no Minecraft version set');

    const have = await this.list(instanceId, k);
    const haveByName = {};
    const haveByProject = {};
    for (const h of have) {
      haveByName[h.name.toLowerCase()] = h;
      if (h.project) haveByProject[h.project] = h;
    }

    const items = [];
    const seen = new Set();
    const optional = [];
    const queue = [{ project: mrId(projectId), versionId: '', required: true, depth: 0 }];

    while (queue.length && items.length < MAX_DEPS) {
      const job = queue.shift();
      const key = job.versionId ? 'v:' + job.versionId : 'p:' + job.project;
      if (seen.has(key)) continue;
      seen.add(key);

      let version;
      try {
        version = job.versionId ? await this.getVersion(job.versionId)
                                : await this.pickVersion(job.project, k, loader, mc);
      } catch (e) {
        /* A DEPENDENCY THAT CANNOT BE RESOLVED IS SAID OUT LOUD.  The root
           failing is an error; a dependency failing is a line in the plan the
           user reads before they agree to any of it. */
        if (job.depth === 0) throw e;
        items.push({ project: job.project, slug: '', title: job.project, author: '',
          versionId: '', version: '', filename: '', size: 0, sha1: '', url: '',
          required: true, depth: job.depth, kind: k, present: false, error: String(e.message || e) });
        continue;
      }
      /* the same version can be reached as a project edge and as a pinned
         edge; the second arrival is a duplicate, but the FIRST one is not —
         `key` may already be this exact version id */
      const vkey = 'v:' + String(version.id);
      if (vkey !== key && seen.has(vkey)) continue;
      seen.add(vkey);

      const f = this.fileOf(version, k);
      const pid = String(version.project_id || job.project);
      let title = pid, slug = '', author = '';
      try {
        const proj = await this.getProject(pid);
        title = String(proj && proj.title || pid).slice(0, 120);
        slug = String(proj && proj.slug || '').slice(0, 80);
      } catch (e) { /* the file is what matters; the pretty name is not */ }

      const already = haveByProject[pid] || haveByName[f.filename.toLowerCase()];
      items.push({
        project: pid, slug: slug, title: title, author: author,
        versionId: String(version.id || ''), version: String(version.version_number || '').slice(0, 64),
        filename: f.filename, rawName: f.raw, size: f.size, sha1: f.sha1, url: f.url,
        required: !!job.required, depth: job.depth, kind: k,
        present: !!(already && already.sha1 && already.sha1 === f.sha1),
        replaces: already && already.name !== f.filename ? already.name : '',
        error: ''
      });

      for (const d of (Array.isArray(version.dependencies) ? version.dependencies : [])) {
        if (!d || typeof d !== 'object') continue;
        const type = String(d.dependency_type || '');
        const dp = d.project_id ? String(d.project_id) : '';
        const dv = d.version_id ? String(d.version_id) : '';
        if (type === 'required') {
          if (!dp && !dv) continue;
          queue.push({ project: dp || '', versionId: dv, required: true, depth: job.depth + 1 });
        } else if (type === 'optional' && dp) {
          optional.push(dp);
        }
      }
    }

    const id = crypto.randomUUID();
    const plan = {
      id: id, instance: instanceId, kind: k, loader: loader, mc: mc,
      items: items,
      optional: optional.slice(0, 12),
      bytes: items.reduce(function (n, i) { return n + (i.present ? 0 : i.size); }, 0),
      count: items.filter(function (i) { return !i.present && !i.error; }).length,
      truncated: queue.length > 0
    };
    this.plans.set(id, { at: Date.now(), plan: plan });
    this._sweep();
    return plan;
  }

  _sweep() {
    const now = Date.now();
    for (const [k, v] of this.plans) if (now - v.at > PLAN_TTL) this.plans.delete(k);
  }

  /* ── 4. doing it ────────────────────────────────────────────────────────
     THE RENDERER NAMES A PLAN, NOT A FILE.  It hands back the id plan() gave
     it, and everything downloaded is something this process resolved itself.
     If the id is unknown the answer is no — there is no path where a url off
     the bridge reaches net.download().                                    */
  async install(planId, onProgress) {
    const held = this.plans.get(String(planId || ''));
    if (!held) throw new Error('that install has expired; ask again and confirm the list');
    const plan = held.plan;
    const dir = this.L.contentDir(plan.instance, plan.kind);
    await fsp.mkdir(dir, { recursive: true });
    const idx = this.readIndex(plan.instance);
    const report = typeof onProgress === 'function' ? onProgress : function () {};

    const todo = plan.items.filter(function (i) { return !i.present && !i.error && i.filename; });
    const done = [];
    let bytes = 0;
    for (let n = 0; n < todo.length; n++) {
      const it = todo[n];
      report({ phase: 'installing', done: n, total: todo.length, bytes: bytes, totalBytes: plan.bytes, file: it.filename });
      /* THE FINAL PATH IS BUILT BY LAYOUT, from a name that has already been
         reduced to one safe segment.  Two checks, not one. */
      const dest = this.L.contentFile(plan.instance, plan.kind, it.filename);
      /* a mismatch throws inside net.download, deletes the .part, and stops
         the whole install — see the header */
      const got = await net.download(it.url, dest, { sha1: it.sha1, size: it.size });
      bytes += got;
      /* an update replaces the older file rather than leaving two copies of
         the same mod in a folder the game reads every jar out of */
      if (it.replaces) {
        for (const cand of [it.replaces, it.replaces + '.disabled']) {
          try { await fsp.rm(this.L.contentFile(plan.instance, plan.kind, cand), { force: true }); } catch (e) {}
        }
        delete idx.files[it.replaces];
      }
      idx.files[it.filename] = {
        project: it.project, slug: it.slug, title: it.title,
        versionId: it.versionId, version: it.version, sha1: it.sha1,
        size: it.size, kind: plan.kind, at: new Date().toISOString()
      };
      this.writeIndex(plan.instance, idx);
      this.log('content ' + plan.instance + ': installed ' + it.filename + ' (' + it.size + ' bytes, sha1 ' + it.sha1 + ')');
      done.push({ title: it.title, filename: it.filename, version: it.version, size: it.size, sha1: it.sha1, required: it.required, depth: it.depth });
    }
    this.plans.delete(plan.id);
    report({ phase: 'ready', done: todo.length, total: todo.length, bytes: bytes, totalBytes: plan.bytes, file: '' });
    return {
      instance: plan.instance, kind: plan.kind, installed: done,
      skipped: plan.items.filter(function (i) { return i.present; }).length,
      bytes: bytes
    };
  }

  /* ── 5. enable, disable, remove ─────────────────────────────────────────
     THE NAME COMES OFF THE FOLDER, NOT OFF THE BRIDGE.  The renderer's string
     is matched against a fresh listing and the entry's own name is what gets
     renamed; a filename that is not in the folder is not a filename.      */
  async _entry(instanceId, kind, file) {
    const all = await this.list(instanceId, kind);
    const want = String(file || '');
    const hit = all.filter(function (e) { return e.file === want || e.name === want; })[0];
    if (!hit) throw new Error('there is no such file in that folder');
    return hit;
  }

  async setEnabled(instanceId, kind, file, on) {
    const k = kindOf(kind);
    const e = await this._entry(instanceId, k, file);
    const want = on ? e.name : e.name + '.disabled';
    if (e.file === want) return { file: want, enabled: !!on, changed: false };
    const from = this.L.contentFile(instanceId, k, e.file);
    const to = this.L.contentFile(instanceId, k, want);
    await fsp.rename(from, to);
    this.log('content ' + instanceId + ': ' + (on ? 'enabled ' : 'disabled ') + e.name);
    return { file: want, enabled: !!on, changed: true };
  }

  /* REMOVE REALLY REMOVES.  The file goes, and so does its index entry. */
  async remove(instanceId, kind, file) {
    const k = kindOf(kind);
    const e = await this._entry(instanceId, k, file);
    await fsp.rm(this.L.contentFile(instanceId, k, e.file), { force: true });
    const idx = this.readIndex(instanceId);
    if (idx.files[e.name]) { delete idx.files[e.name]; this.writeIndex(instanceId, idx); }
    this.log('content ' + instanceId + ': removed ' + e.file);
    return { file: e.file, removed: true };
  }

  /* ── 6. updates ─────────────────────────────────────────────────────────
     ASKED FOR, NEVER POLLED.  One call per project, on a button, for one
     instance.  A file we did not install has no project to ask about, and
     that is reported rather than guessed at.                              */
  async updates(instanceId, kind, inst) {
    const k = kindOf(kind);
    const loader = String(inst && inst.loader || '');
    const mc = String(inst && inst.ver || '');
    const have = await this.list(instanceId, k);
    const out = [];
    for (const h of have) {
      if (!h.project) { out.push({ file: h.file, name: h.name, title: h.title, state: 'unmanaged' }); continue; }
      try {
        const v = await this.pickVersion(h.project, k, loader, mc);
        const f = this.fileOf(v, k);
        const newer = String(v.id) !== h.versionId && f.sha1 !== h.sha1;
        out.push({
          file: h.file, name: h.name, title: h.title, project: h.project,
          state: newer ? 'update' : 'current',
          from: h.version, to: String(v.version_number || '').slice(0, 64),
          date: String(v.date_published || '').slice(0, 10),
          size: f.size, versionId: String(v.id || '')
        });
      } catch (e) {
        out.push({ file: h.file, name: h.name, title: h.title, project: h.project,
          state: 'none', message: String(e.message || e).slice(0, 160) });
      }
    }
    return out;
  }
}

/* a filename with no index entry still deserves a readable name:
   "sodium-fabric-0.5.11+mc1.20.1.jar" -> "Sodium fabric" is worse than the
   filename, so only the extension and the version tail come off */
function prettyTitle(file) {
  let s = String(file).replace(/\.(jar|zip)$/i, '');
  s = s.replace(/[-_+]?(mc)?\d+(\.\d+)+.*$/i, '');
  s = s.replace(/[-_]+/g, ' ').trim();
  if (!s) return String(file);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = { ContentStore, CONTENT_HOSTS, KINDS, kindOf, safeName, facetFor, prettyTitle, CONTENT_FOLDERS };
