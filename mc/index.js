'use strict';
/* ============================================================================
   THE GAME SERVICE.  One object the main process owns and the IPC layer calls
   into; the renderer never sees any of the pieces below it.

   IT DOES FOUR THINGS: list versions, install one, find a Java for it, run it.
   The order is fixed and each step reports what it is doing, because a launch
   that hangs on "Downloading" with no numbers is indistinguishable from a
   launch that has died.

   PROGRESS IS COALESCED HERE, once, at about twelve frames a second.  The
   installer calls its callback per chunk - thousands of times a second on a
   fast link - and every one of those crossing IPC would cost more than the
   download.

   OFFLINE MODE IS LABELLED, NOT DISGUISED.  Phase 2's auth is in demo mode:
   there is no Azure client id, so there is no real session and there cannot
   be one.  Rather than fake a token, an offline launch sends the username the
   user chose, the offline UUID that name deterministically produces, and the
   literal access token "0" that every launcher has used for offline play
   since 2011.  The game runs, singleplayer works, and Mojang's session server
   refuses the join - which is the correct outcome, not a bug.
   ========================================================================= */

const path = require('node:path');
const crypto = require('node:crypto');
const { Layout } = require('./paths');
const net = require('./net');
const { Installer } = require('./install');
const java = require('./java');
const launcher = require('./launch');
const V = require('./version');
const loaders = require('./loaders');
const { ContentStore } = require('./content');

/* the offline UUID every launcher agrees on: a version-3 (MD5) UUID over
   "OfflinePlayer:<name>", which is what the vanilla server computes too, so
   a world saved offline keeps its player data across launchers */
function offlineUuid(name) {
  const md5 = crypto.createHash('md5').update('OfflinePlayer:' + name, 'utf8').digest();
  md5[6] = (md5[6] & 0x0f) | 0x30;
  md5[8] = (md5[8] & 0x3f) | 0x80;
  const h = md5.toString('hex');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}

const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;

class Game {
  /* store is the Store from store.js - used for its root and its records;
     emit(channel, payload) puts an event on the window; log(line) is the app
     log, and the same rule applies to it as everywhere else: identifiers and
     counts, never a credential. */
  constructor(o) {
    this.store = o.store;
    this.emit = typeof o.emit === 'function' ? o.emit : function () {};
    this.log = typeof o.log === 'function' ? o.log : function () {};
    this.accounts = o.accounts || null;
    /* WHAT WE CALL OURSELVES ON THE WIRE.  main.js has the brand — it is the
       only thing that has read brand.js — so it hands the string down here
       rather than mc/ growing a second opinion about the product name.  A
       missing or empty value leaves net.js on its fallback; see the header
       there. */
    net.setUserAgent(o.userAgent);
    this.L = new Layout(o.store.root).ensure();
    this.installer = new Installer(this.L, this.log);
    this.content = new ContentStore(this.L, this.log);
    this.sessions = new Map();     /* sessionId -> Session */
    this.jobs = new Map();         /* instanceId -> {signal} */
  }

  /* ── versions ───────────────────────────────────────────────────────── */
  versions(force) { return this.installer.versionList(!!force); }

  /* ── loaders ────────────────────────────────────────────────────────── */
  /* the picker on #new asks this per loader per Minecraft version; an empty
     list is the answer "that loader has no build for that version", which is
     what greys the button out */
  async loaderVersions(loader, mc) {
    if (!loader || String(loader).toLowerCase() === 'vanilla') return [];
    return await loaders.versionsFor(loader, mc);
  }

  /* INSTALL A LOADER ONTO AN INSTANCE.  Writes the profile, remembers its id
     on the record, and carries the honest warning back if the install is
     known to be incomplete. */
  async installLoader(instanceId, loader, loaderVersion) {
    const inst = this.store.get(instanceId);
    if (!inst) throw new Error('no such instance');
    const mc = String(inst.ver || '').trim();
    if (!mc) throw new Error('that instance has no Minecraft version set');
    const r = await loaders.installLoader({
      layout: this.L, log: this.log, loader: loader, mc: mc, loaderVersion: loaderVersion
    });
    const warn = r.partial ? r.notes.join(' ') : '';
    this.store.update(instanceId, {
      loader: r.loader, lver: String(loaderVersion || ''), prof: r.id, pwarn: warn
    });
    return { id: r.id, loader: r.loader, mc: r.mc, partial: !!r.partial, notes: r.notes, mainClass: r.json.mainClass || '' };
  }

  /* WHICH VERSION JSON AN INSTANCE ACTUALLY RUNS.  `ver` is the Minecraft
     version the user picked; `prof` is the loader profile that inherits from
     it.  One place answers this so install and launch cannot disagree. */
  _target(inst, versionId) {
    const asked = String(versionId || '').trim();
    if (asked) return asked;
    const prof = String(inst.prof || '').trim();
    const loader = String(inst.loader || '').toLowerCase();
    if (prof && loader && loader !== 'vanilla' && loader !== 'none') return prof;
    return String(inst.ver || '').trim();
  }

  /* ── java ───────────────────────────────────────────────────────────── */
  javaList(force) { return java.detect(!!force); }
  async javaFor(versionId) {
    let major = 0;
    try { major = V.javaMajorFor(await this.installer.resolve(versionId, 0)); } catch (e) { major = 0; }
    const r = await java.pick(versionId, major);
    return {
      want: r.want,
      runtime: r.runtime ? { path: r.runtime.path, version: r.runtime.version, major: r.runtime.major, vendor: r.runtime.vendor, arch: r.runtime.arch } : null,
      have: (r.have || []).map(function (j) { return { path: j.path, version: j.version, major: j.major, vendor: j.vendor, arch: j.arch }; }),
      message: r.message || ''
    };
  }

  /* ── progress, coalesced ────────────────────────────────────────────── */
  _reporter(instanceId) {
    const self = this;
    let last = 0;
    let pending = null;
    let timer = null;
    const flush = function () {
      timer = null;
      if (!pending) return;
      last = Date.now();
      self.emit('game:progress', Object.assign({ instance: instanceId }, pending));
      pending = null;
    };
    return function (p) {
      pending = p;
      /* the terminal phases always go out, so the UI never sticks at 99% */
      if (p.phase === 'ready' || p.phase === 'error') { if (timer) clearTimeout(timer); flush(); return; }
      if (timer) return;
      const wait = Math.max(0, 80 - (Date.now() - last));
      timer = setTimeout(flush, wait);
    };
  }

  /* ── install only ───────────────────────────────────────────────────── */
  /* A LOADER THAT HAS BEEN CHOSEN BUT NOT YET FETCHED IS FETCHED HERE, once,
     before the file plan is built — the profile is what names the extra
     libraries, so there is no plan to build until it is on disk. */
  async install(instanceId, versionId) {
    let inst = this.store.get(instanceId);
    if (!inst) throw new Error('no such instance');
    const loader = String(inst.loader || '').toLowerCase();
    if (!versionId && loader && loader !== 'vanilla' && loader !== 'none' && !inst.prof) {
      this.emit('game:progress', { instance: instanceId, phase: 'preparing', done: 0, total: 0, bytes: 0, totalBytes: 0, file: 'installing ' + inst.loader });
      await this.installLoader(instanceId, inst.loader, inst.lver);
      inst = this.store.get(instanceId);
    }
    const id = this._target(inst, versionId);
    const signal = { cancelled: false };
    this.jobs.set(instanceId, signal);
    try {
      const s = await this.installer.install(id, { onProgress: this._reporter(instanceId), signal: signal });
      s.loader = inst.loader || '';
      s.lver = inst.lver || '';
      return s;
    } finally { this.jobs.delete(instanceId); }
  }

  cancel(instanceId) {
    const s = this.jobs.get(instanceId);
    if (!s) return false;
    s.cancelled = true;
    this.emit('game:progress', { instance: instanceId, phase: 'cancelled', done: 0, total: 0, bytes: 0, totalBytes: 0, file: '' });
    return true;
  }

  /* ── the whole pipeline ─────────────────────────────────────────────── */
  /* opts: { version, offline, username, maxMemMb } */
  async play(instanceId, opts) {
    const o = opts || {};
    const inst = this.store.get(instanceId);
    if (!inst) throw new Error('no such instance');
    if (this.runningFor(instanceId)) throw new Error('that instance is already running');

    const mcVersion = String(o.version || inst.ver || '').trim();
    if (!mcVersion) throw new Error('this instance has no Minecraft version set');
    /* A HALF-INSTALLED LOADER DOES NOT GET LAUNCHED.  Modern Forge needs its
       installer's processors run to produce the patched client jar; without
       them the classpath names a file that is not there and the JVM says so
       in a way nobody can act on.  The reason the install recorded is what
       comes back instead. */
    if (String(inst.pwarn || '').trim()) {
      const e = new Error(inst.pwarn);
      e.code = 'LOADER_INCOMPLETE';
      throw e;
    }
    const report = this._reporter(instanceId);

    /* 1. files */
    const summary = await this.install(instanceId, o.version ? mcVersion : '');
    const versionId = summary.id;

    /* 2. java.  The merged profile inherits the parent's javaVersion, and the
       fallback table is asked about the Minecraft version rather than about
       "fabric-loader-0.16.14-1.16.5", which it could not parse. */
    report({ phase: 'installing', done: summary.total, total: summary.total, bytes: summary.bytes, totalBytes: summary.totalBytes, file: 'looking for a Java runtime' });
    const vjson = await this.installer.resolve(versionId, 0);
    const jr = await java.pick(mcVersion, V.javaMajorFor(vjson));
    if (!jr.runtime) {
      report({ phase: 'error', done: 0, total: 0, bytes: 0, totalBytes: 0, file: '' });
      const e = new Error(jr.message);
      e.code = 'NO_JAVA';
      throw e;
    }
    this.log('launch ' + instanceId + ': ' + versionId + ' on ' + jr.runtime.vendor + ' ' + jr.runtime.version + ' (' + jr.runtime.path + ')');

    /* 3. the session.  Demo/offline is the only shape phase 2 can produce. */
    const session = this._session(o);

    /* 4. go */
    report({ phase: 'launching', done: 0, total: 0, bytes: summary.bytes, totalBytes: summary.totalBytes, file: jr.runtime.vendor + ' ' + jr.runtime.version });
    const gameDir = this.L.gameDir(instanceId);
    const self = this;
    /* the id is minted before the spawn so the stream callbacks, which are
       handed to launch() and can fire the instant it returns, always have a
       session to name */
    const sessId = crypto.randomUUID();
    const startedAt = Date.now();
    const sess = await launcher.launch({
      layout: this.L,
      id: versionId,
      vjson: vjson,
      instance: instanceId,
      gameDir: gameDir,
      java: jr.runtime,
      session: session,
      virtual: !!summary.virtual,
      maxMemMb: Math.max(512, Math.min(16384, Number(o.maxMemMb) || 2048)),
      launcherName: 'Kestrel',
      launcherVersion: '1.0',
      onLine: function (stream, line) {
        self.emit('game:log', { instance: instanceId, session: sessId, stream: stream, line: String(line).slice(0, 2000) });
      },
      onExit: function (code, signal) {
        self.sessions.delete(sessId);
        self.log('launch ' + instanceId + ': exited with code ' + code + (signal ? ' (' + signal + ')' : ''));
        self.emit('game:exit', { instance: instanceId, session: sessId, code: code, signal: signal || '', ms: Date.now() - startedAt });
      }
    });
    sess.id = sessId;
    this.sessions.set(sessId, sess);

    report({ phase: 'running', done: 0, total: 0, bytes: summary.bytes, totalBytes: summary.totalBytes, file: '' });
    this.emit('game:started', {
      instance: instanceId, session: sessId, version: versionId,
      pid: sess.child.pid, offline: !!session.offline, player: session.name,
      java: sess.java, argfile: !!sess.usedArgfile
    });

    return {
      session: sessId, pid: sess.child.pid, version: versionId,
      offline: !!session.offline, player: session.name,
      java: { version: jr.runtime.version, vendor: jr.runtime.vendor, major: jr.runtime.major },
      argfile: !!sess.usedArgfile,
      install: { total: summary.total, skipped: summary.skipped, fetched: summary.fetched, bytes: summary.bytes, ms: summary.ms }
    };
  }

  /* THE SESSION, and the one decision in it.  With a live account we would
     hand back its Minecraft token here; phase 2 cannot produce one, so this
     builds the offline shape and marks it offline so every layer above knows
     it is not a real session. */
  _session(o) {
    const active = this.accounts ? (this.accounts.list() || []).filter(function (a) { return a.active && !a.demo; })[0] : null;
    if (active && !o.offline) {
      /* Reserved for a live sign-in.  It is never reached today because
         phase 2 only ever produces demo accounts, and it deliberately does
         not reach into accounts.raw() from here - the token path stays in one
         place when there is one. */
      throw new Error('online launch needs a live Microsoft sign-in; this build is in demo mode, so use Play offline');
    }
    let name = String(o.username || '').trim();
    if (!NAME_RE.test(name)) {
      const s = this.store.readSettings();
      name = String(s.offlineName || '').trim();
    }
    if (!NAME_RE.test(name)) name = 'Player';
    return {
      name: name, uuid: offlineUuid(name),
      accessToken: '0',          /* not a credential: the literal offline sentinel */
      userType: 'legacy', xuid: '', clientId: '', offline: true
    };
  }

  /* ── running instances ──────────────────────────────────────────────── */
  runningFor(instanceId) {
    for (const s of this.sessions.values()) if (s.instance === instanceId) return s;
    return null;
  }
  running() {
    const out = [];
    for (const s of this.sessions.values()) {
      out.push({ session: s.id, instance: s.instance, version: s.version, pid: s.child ? s.child.pid : 0, since: s.startedAt });
    }
    return out;
  }
  kill(which) {
    const s = this.sessions.get(String(which)) || this.runningFor(String(which));
    if (!s) return false;
    this.log('launch ' + s.instance + ': killing pid ' + (s.child && s.child.pid));
    return s.kill();
  }
  killAll() { for (const s of this.sessions.values()) s.kill(); }

  /* ── content ────────────────────────────────────────────────────────
     MODS, RESOURCE PACKS AND SHADER PACKS.  Every one of these names an
     instance and a content kind out of a fixed set of three; the project id
     is matched against a pattern before it goes into a URL, the filename is
     cut down to one safe segment before it goes into a path, and install()
     takes a plan id this process minted rather than a url the renderer
     invented.  See the header of mc/content.js. */
  contentList(instanceId, kind) {
    if (!this.store.get(instanceId)) throw new Error('no such instance');
    return this.content.list(instanceId, kind);
  }
  async contentPlan(instanceId, projectId, kind) {
    const inst = this.store.get(instanceId);
    if (!inst) throw new Error('no such instance');
    return await this.content.plan(instanceId, projectId, kind, inst);
  }
  /* the same coalesced reporter the installer uses, so a mod download draws
     on the same progress bar a version download does */
  async contentInstall(instanceId, planId) {
    const inst = this.store.get(instanceId);
    if (!inst) throw new Error('no such instance');
    const r = await this.content.install(planId, this._reporter(instanceId));
    await this._syncModCount(instanceId);
    return r;
  }
  async contentSetEnabled(instanceId, kind, file, on) {
    if (!this.store.get(instanceId)) throw new Error('no such instance');
    const r = await this.content.setEnabled(instanceId, kind, file, on);
    await this._syncModCount(instanceId);
    return r;
  }
  async contentRemove(instanceId, kind, file) {
    if (!this.store.get(instanceId)) throw new Error('no such instance');
    const r = await this.content.remove(instanceId, kind, file);
    await this._syncModCount(instanceId);
    return r;
  }
  async contentUpdates(instanceId, kind) {
    const inst = this.store.get(instanceId);
    if (!inst) throw new Error('no such instance');
    return await this.content.updates(instanceId, kind, inst);
  }

  /* THE COUNT ON THE PLAY SCREEN FOLLOWS THE FOLDER.  It is written onto the
     record after every change rather than incremented beside it, because a
     number kept in two places drifts and the folder is the one that is true.
     Disabled jars are not counted: the game will not load them. */
  async _syncModCount(instanceId) {
    try {
      const c = await this.content.count(instanceId);
      this.store.update(instanceId, { mods: c.enabled });
      return c;
    } catch (e) { return null; }
  }

  /* what the Play screen needs before anything is clicked */
  async status(instanceId, versionId) {
    const inst = this.store.get(instanceId);
    const id = String(versionId || (inst && inst.ver) || '');
    const run = this.runningFor(instanceId);
    const out = { instance: instanceId, version: id, running: !!run, session: run ? run.id : '', java: null, ready: false };
    if (!id) return out;
    try { out.java = await this.javaFor(id); } catch (e) { out.java = { want: 0, runtime: null, have: [], message: String(e.message) }; }
    return out;
  }
}

module.exports = { Game, offlineUuid };
