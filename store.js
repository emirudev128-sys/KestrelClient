'use strict';
/* ============================================================================
   THE STORE.  Instances are folders, not markup.

     <root>/settings.json                 app settings + window bounds
     <root>/instances/<slug>/instance.json   one record per instance

   <root> is %APPDATA%/<BRAND.name>, and the name comes from
   ui/scripts/brand.js so a rename stays one edit.

   NOTHING FROM THE RENDERER IS TRUSTED.  Every record crossing the bridge is
   rebuilt field by field from a whitelist, every id is matched against a slug
   pattern before it is allowed near a path, and the resolved path is checked
   to be inside the instances directory even after that.  A renderer cannot
   name a file, only an instance.
   ========================================================================= */

const fs = require('node:fs');
const path = require('node:path');

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ART_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const HRS = { lo: 1, mid: 1, hi: 1 };

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}
function str(v, max) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max || 64);
}
function int(v, lo, hi) {
  var n = parseInt(v, 10);
  if (!isFinite(n)) n = 0;
  return Math.max(lo, Math.min(hi, n));
}
function num(v, dflt) {
  var n = Number(v);
  return isFinite(n) ? n : dflt;
}

/* A record, rebuilt from scratch. Anything not listed here does not survive. */
function clean(raw, id) {
  var r = raw && typeof raw === 'object' ? raw : {};
  var pt = r.playtime && typeof r.playtime === 'object' ? r.playtime : {};
  var art = str(r.art, 32).toLowerCase();
  var image = str(r.image, 1000000);
  if (!/^(data:image\/|https?:)/.test(image)) image = '';
  return {
    id: id,
    name: str(r.name, 80).trim(),
    art: ART_RE.test(art) ? art : '',
    mono: str(r.mono, 4),
    ver: str(r.ver, 32),
    loader: str(r.loader, 32),
    lver: str(r.lver, 32),
    /* PHASE 4.  `prof` is the version-json id that is actually launched: for
       a vanilla instance it is empty and `ver` is used, for a modded one it
       is the loader profile ("fabric-loader-0.16.14-1.16.5") that merge()
       folds over `ver`.  It is written by the main process after an install,
       never by the renderer, and it still goes through the same version-id
       pattern in paths.js before it becomes a folder name.
       `pwarn` is non-empty when the loader install is known to be incomplete
       — modern Forge's processors have not been run yet — so Play can refuse
       with the reason rather than with a stack trace.  It is cleared when
       they do run.
       `pjar` is the FILE NAME, not the path, of the installer that produced
       the profile: modern Forge's processors run after the vanilla install
       rather than during installLoader (they patch the client jar, so it has
       to exist first), and this is how a later run finds the installer they
       came out of.  A name and not a path on purpose — it always lives in
       cache/loaders, and a record that stored absolute paths would carry this
       machine's user folder around inside it. */
    prof: str(r.prof, 64),
    pwarn: str(r.pwarn, 400),
    pjar: str(r.pjar, 160),
    author: str(r.author, 64),
    mods: int(r.mods, 0, 100000),
    size: str(r.size, 32) || '327 MB',
    when: str(r.when, 32) || 'Never',
    group: str(r.group, 48),
    image: image,
    current: !!r.current,
    playtime: {
      hrs: HRS[str(pt.hrs, 8)] ? str(pt.hrs, 8) : 'lo',
      h: str(pt.h, 8) || '0h',
      m: str(pt.m, 8) || '00m'
    },
    pos: num(r.pos, 0),
    created: str(r.created, 32) || new Date().toISOString(),
    updated: new Date().toISOString()
  };
}

class Store {
  constructor(root) {
    this.root = root;
    this.dir = path.join(root, 'instances');
    this.settingsFile = path.join(root, 'settings.json');
    fs.mkdirSync(this.dir, { recursive: true });
  }

  /* ── paths, the only place a renderer value becomes one ─────────────── */
  folderOf(id) {
    if (typeof id !== 'string' || !SLUG_RE.test(id)) throw new Error('bad instance id');
    var p = path.resolve(this.dir, id);
    var base = path.resolve(this.dir) + path.sep;
    if (p !== path.resolve(this.dir, id) || !(p + path.sep).startsWith(base)) throw new Error('path escapes data root');
    return p;
  }
  fileOf(id) { return path.join(this.folderOf(id), 'instance.json'); }

  /* ── settings ────────────────────────────────────────────────────────── */
  readSettings() {
    try { return JSON.parse(fs.readFileSync(this.settingsFile, 'utf8')) || {}; }
    catch (e) { return {}; }
  }
  writeSettings(patch) {
    var now = this.readSettings();
    var next = Object.assign({}, now, patch && typeof patch === 'object' ? JSON.parse(JSON.stringify(patch)) : {});
    fs.mkdirSync(this.root, { recursive: true });
    fs.writeFileSync(this.settingsFile, JSON.stringify(next, null, 2));
    return next;
  }

  /* ── instances ───────────────────────────────────────────────────────── */
  list() {
    var out = [];
    var names;
    try { names = fs.readdirSync(this.dir, { withFileTypes: true }); } catch (e) { return out; }
    for (var i = 0; i < names.length; i++) {
      var e = names[i];
      if (!e.isDirectory() || !SLUG_RE.test(e.name)) continue;
      var rec = this.get(e.name);
      if (rec) out.push(rec);
    }
    out.sort(function (a, b) { return a.pos - b.pos || a.name.localeCompare(b.name); });
    return out;
  }

  get(id) {
    try { return clean(JSON.parse(fs.readFileSync(this.fileOf(id), 'utf8')), id); }
    catch (e) { return null; }
  }

  has(id) {
    try { return fs.existsSync(this.fileOf(id)); } catch (e) { return false; }
  }

  /* a free slug for a name, so two "Crystal PvP"s get two folders */
  freeId(name) {
    var base = slugify(name) || 'instance';
    if (!this.has(base)) return base;
    for (var n = 2; n < 1000; n++) {
      if (!this.has(base + '-' + n)) return base + '-' + n;
    }
    return base + '-' + Date.now();
  }

  create(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    if (!String(r.name || '').trim()) throw new Error('an instance needs a name');
    var id = this.freeId(r.name);
    var rec = clean(r, id);
    if (rec.pos === 0) rec.pos = this.nextPos();
    fs.mkdirSync(this.folderOf(id), { recursive: true });
    fs.writeFileSync(this.fileOf(id), JSON.stringify(rec, null, 2));
    return rec;
  }

  /* new instances land under the current one, which is where the UI puts
     them: pos is a float so an insert never has to renumber the list */
  nextPos() {
    var all = this.list();
    if (!all.length) return 0;
    var cur = all.filter(function (x) { return x.current; })[0];
    var i = cur ? all.indexOf(cur) : -1;
    var before = i >= 0 ? all[i].pos : all[0].pos - 1;
    var after = all[i + 1] ? all[i + 1].pos : before + 1;
    return (before + after) / 2;
  }

  update(id, patch) {
    var now = this.get(id);
    if (!now) throw new Error('no such instance');
    var merged = Object.assign({}, now, patch && typeof patch === 'object' ? patch : {}, { id: id, created: now.created });
    var rec = clean(merged, id);
    fs.writeFileSync(this.fileOf(id), JSON.stringify(rec, null, 2));
    return rec;
  }

  remove(id) {
    var folder = this.folderOf(id);
    try { fs.rmSync(folder, { recursive: true, force: true }); } catch (e) { return false; }
    return true;
  }

  duplicate(id, name) {
    var src = this.get(id);
    if (!src) throw new Error('no such instance');
    var copy = Object.assign({}, src, {
      name: String(name || src.name + ' copy'),
      current: false, when: 'Never', pos: undefined,
      playtime: { hrs: 'lo', h: '0h', m: '00m' },
      created: undefined
    });
    return this.create(copy);
  }

  /* FIRST RUN.  The UI ships with a library in its markup; that fixture is
     what the store is born holding, so the app opens looking the way the
     prototype did and every row after that is a real folder. */
  seed(records) {
    var out = [];
    if (!Array.isArray(records)) return out;
    for (var i = 0; i < Math.min(records.length, 500); i++) {
      try {
        var r = Object.assign({}, records[i], { pos: i });
        out.push(this.create(r));
      } catch (e) { /* one bad fixture row must not stop the seed */ }
    }
    this.writeSettings({ seeded: true, seededAt: new Date().toISOString() });
    return out;
  }
}

module.exports = { Store, slugify, SLUG_RE };
