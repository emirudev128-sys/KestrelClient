'use strict';
/* ============================================================================
   WHERE THE SIGN-IN LIVES.  <root>/accounts.json, and the half of it that is
   a credential is encrypted with Electron's safeStorage - DPAPI on Windows,
   the Keychain on macOS, libsecret where there is one.  It is scoped to the
   logged-in OS user, so another account on the same PC gets a blob it cannot
   read even with the file in front of it.

   THERE IS NO PLAINTEXT FALLBACK.  If safeStorage.isEncryptionAvailable() is
   false the launcher does not quietly write the refresh token to disk in the
   clear - it keeps the session in memory for as long as the app is running,
   writes nothing, and says on screen that the sign-in will not be remembered.
   A silent downgrade is the worst of the three outcomes: the user believes
   the thing is encrypted and it is not.

   THE FILE HAS TWO HALVES, and only one of them is secret:

     { id, name, uuid, skinUrl, active, expiresAt, demo,   <- readable, and
       sealed: "<base64>" }                                <- the credential

   sealed decrypts to { refreshToken, mcToken }.  publicOf() returns the top
   half and nothing else, and it is the ONLY thing this module hands out; the
   IPC layer has no way to ask for the bottom half because no method returns
   it.  raw() exists for msauth.js, in the same process, and is not exposed.

   SIGN-OUT DELETES.  It drops the record, zeroes the in-memory copy and
   rewrites the file without it; the last account out removes the file.
   ========================================================================= */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FILE = 'accounts.json';
const VERSION = 1;

function str(v, max) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max || 128);
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class AccountStore {
  /* safe is electron's safeStorage, passed in so this file can be required
     and reasoned about without an Electron app around it */
  constructor(root, safe, log) {
    this.root = root;
    this.file = path.join(root, FILE);
    this.safe = safe;
    this.log = typeof log === 'function' ? log : function () {};
    this.records = [];
    this.load();
  }

  get canPersist() {
    try { return !!(this.safe && this.safe.isEncryptionAvailable()); }
    catch (e) { return false; }
  }

  /* ── the only shape the renderer ever sees ──────────────────────────── */
  publicOf(id) {
    const r = typeof id === 'string' ? this.records.filter(function (x) { return x.id === id; })[0] : id;
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      uuid: r.uuid,
      skinUrl: r.skinUrl,
      active: !!r.active,
      expiresAt: r.expiresAt,
      /* the one field beyond the six: a demo row has to be able to say so
         on screen, and the alternative is the UI guessing from the uuid */
      demo: !!r.demo
    };
  }
  list() { const self = this; return this.records.map(function (r) { return self.publicOf(r); }); }

  /* main-process only.  Nothing reachable over IPC calls this. */
  raw(id) { return this.records.filter(function (r) { return r.id === id; })[0] || null; }

  /* ── disk ───────────────────────────────────────────────────────────── */
  load() {
    let file;
    try { file = JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch (e) { this.records = []; return; }
    if (!file || file.version !== VERSION || !Array.isArray(file.accounts)) { this.records = []; return; }

    const out = [];
    let unreadable = 0;
    for (const a of file.accounts) {
      let secret = { refreshToken: '', mcToken: '' };
      if (a && a.sealed) {
        if (!this.canPersist) { unreadable++; continue; }
        try { secret = JSON.parse(this.safe.decryptString(Buffer.from(String(a.sealed), 'base64'))) || secret; }
        catch (e) { unreadable++; continue; }   /* another OS user's blob, or a moved file */
      }
      out.push({
        id: str(a.id, 64),
        name: str(a.name, 64),
        uuid: UUID_RE.test(str(a.uuid, 36)) ? str(a.uuid, 36) : '',
        skinUrl: /^https:\/\//.test(str(a.skinUrl, 512)) ? str(a.skinUrl, 512) : '',
        active: !!a.active,
        expiresAt: Number(a.expiresAt) || 0,
        demo: !!a.demo,
        refreshToken: str(secret.refreshToken, 4096),
        mcToken: str(secret.mcToken, 4096)
      });
    }
    this.records = out.filter(function (r) { return r.id && r.uuid; });
    /* a count, an identifier and nothing else - the same rule as everywhere */
    if (unreadable) this.log('accounts: ' + unreadable + ' stored sign-in(s) could not be decrypted on this machine and were dropped');
    if (this.records.length && !this.records.some(function (r) { return r.active; })) this.records[0].active = true;
  }

  save() {
    if (!this.records.length) {
      try { fs.rmSync(this.file, { force: true }); } catch (e) { /* nothing to remove */ }
      return true;
    }
    if (!this.canPersist) {
      this.log('accounts: OS encryption unavailable, nothing written to disk');
      return false;
    }
    const self = this;
    const file = {
      version: VERSION,
      /* stated in the file itself, so a person reading it knows which half
         is which without having to read this source */
      _note: 'sealed is { refreshToken, mcToken } encrypted with the OS keystore for this user only. Nothing in the clear here is a credential.',
      accounts: this.records.map(function (r) {
        const pub = self.publicOf(r);
        pub.sealed = self.safe.encryptString(JSON.stringify({ refreshToken: r.refreshToken, mcToken: r.mcToken })).toString('base64');
        return pub;
      })
    };
    try {
      fs.mkdirSync(this.root, { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(file, null, 2), { mode: 0o600 });
      return true;
    } catch (e) {
      this.log('accounts: could not write ' + FILE + ' (' + (e && e.code ? e.code : 'error') + ')');
      return false;
    }
  }

  /* ── mutation ───────────────────────────────────────────────────────── */

  /* one record per Minecraft profile: signing the same account in twice is a
     renewal of the row that is already there, not a second row */
  upsert(tokens, forceId) {
    const uuid = str(tokens.uuid, 36);
    let rec = forceId ? this.raw(forceId) : this.records.filter(function (r) { return r.uuid === uuid; })[0];
    if (!rec) {
      rec = { id: crypto.randomUUID(), active: this.records.length === 0 };
      this.records.push(rec);
    }
    rec.name = str(tokens.name, 64) || rec.name || 'Unknown';
    rec.uuid = uuid || rec.uuid;
    rec.skinUrl = /^https:\/\//.test(str(tokens.skinUrl, 512)) ? str(tokens.skinUrl, 512) : '';
    rec.expiresAt = Number(tokens.expiresAt) || 0;
    rec.demo = !!tokens.demo;
    rec.refreshToken = str(tokens.refreshToken, 4096);
    rec.mcToken = str(tokens.mcToken, 4096);
    if (!this.records.some(function (r) { return r.active; })) rec.active = true;
    this.save();
    return this.publicOf(rec);
  }

  touch(id, expiresAt) {
    const r = this.raw(id);
    if (!r) return null;
    r.expiresAt = Number(expiresAt) || r.expiresAt;
    this.save();
    return this.publicOf(r);
  }

  activate(id) {
    if (!this.raw(id)) throw new Error('no such account');
    this.records.forEach(function (r) { r.active = r.id === id; });
    this.save();
    return this.list();
  }

  /* SIGNING OUT IS A DELETE.  The row goes, the secret in memory is
     overwritten before the reference is dropped, and the file is rewritten
     without it - or removed outright if that was the last one. */
  remove(id) {
    const i = this.records.findIndex(function (r) { return r.id === id; });
    if (i < 0) return this.list();
    const gone = this.records[i];
    gone.refreshToken = '';
    gone.mcToken = '';
    const wasActive = gone.active;
    this.records.splice(i, 1);
    if (wasActive && this.records.length) this.records[0].active = true;
    this.save();
    this.log('accounts: signed out ' + id + ', its stored credential is deleted');
    return this.list();
  }
}

module.exports = { AccountStore, FILE };
