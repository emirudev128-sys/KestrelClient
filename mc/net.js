'use strict';
/* ============================================================================
   THE WIRE.  Node 24 has fetch and web streams, so there is no HTTP client
   dependency here and no place to accidentally turn TLS off — the only knob
   that could do that is rejectUnauthorized, and it is not written anywhere in
   this project.  https is required by parse, not by prefix match, for the same
   reason main.js parses before it calls openExternal.

   EVERY BYTE IS HASHED ON THE WAY IN.  A download is written to a .part file
   with a SHA-1 running over the stream, and it is renamed into place only if
   the digest matches what the manifest said.  A mismatch deletes the part file
   and throws; there is no "warn and carry on" branch, because a library that
   is not the library the manifest describes is exactly the thing hash
   verification exists to stop.

   RESUME IS AT FILE GRANULARITY, deliberately.  Mojang's objects are small
   (the largest single file in a 1.8.9 install is the 10 MB client jar) and
   they are content-addressed, so a byte-range resume of a half-written object
   buys nothing a re-fetch does not, and it risks stitching two different
   bodies together.  What "resumable" means here is that an install that dies
   half way leaves every completed file verified on disk, and the next run
   skips all of them — which is the property that actually matters.
   ========================================================================= */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');

const UA = 'Kestrel/1.0 (+https://github.com/kestrel-launcher)';
const JSON_CAP = 32 * 1024 * 1024;   /* the 1.21 asset index is ~400 KB; this is slack, not a target */

function httpsOnly(url) {
  let u;
  try { u = new URL(String(url)); } catch (e) { throw new Error('not a url'); }
  if (u.protocol !== 'https:') throw new Error('refusing a non-https url: ' + u.protocol);
  return u;
}

async function withRetry(label, fn, tries) {
  const n = tries || 4;
  let last;
  for (let i = 0; i < n; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      /* a hash mismatch is not a flaky network — retrying it is how you turn
         a hard failure into a slow hard failure */
      if (e && e.fatal) throw e;
      if (i < n - 1) await new Promise(function (r) { setTimeout(r, 250 * Math.pow(2, i)); });
    }
  }
  const out = new Error(label + ': ' + String(last && last.message || last));
  if (last && last.status) out.status = last.status;
  throw out;
}

async function getBuffer(url, cap) {
  const u = httpsOnly(url);
  return withRetry('GET ' + u.pathname, async function () {
    const res = await fetch(u.href, { headers: { 'user-agent': UA, accept: '*/*' }, redirect: 'follow' });
    if (!res.ok) {
      const err = new Error('HTTP ' + res.status);
      err.status = res.status;
      /* A 4xx IS AN ANSWER.  "Fabric has nothing for 1.8.9" comes back as a
         400 and retrying it four times with backoff turns a fact into a
         two-second stall; only 5xx and transport errors are worth a retry.
         The status is carried on the error so a caller can tell "the service
         said no" apart from "the service was not reachable", which is the
         difference between greying a button out and keeping the fallback. */
      if (res.status >= 400 && res.status < 500) err.fatal = true;
      throw err;
    }
    const len = Number(res.headers.get('content-length') || 0);
    if (len && len > (cap || JSON_CAP)) throw new Error('response too large (' + len + ')');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > (cap || JSON_CAP)) throw new Error('response too large');
    return buf;
  });
}

async function getJSON(url) {
  const buf = await getBuffer(url, JSON_CAP);
  return JSON.parse(buf.toString('utf8'));
}

function sha1Of(buf) { return crypto.createHash('sha1').update(buf).digest('hex'); }

/* hash a file that is already there.  Streamed, so a 300 MB jar does not
   become a 300 MB Buffer. */
async function fileSha1(file) {
  return new Promise(function (resolve, reject) {
    const h = crypto.createHash('sha1');
    const s = fs.createReadStream(file);
    s.on('error', reject);
    s.on('data', function (d) { h.update(d); });
    s.on('end', function () { resolve(h.digest('hex')); });
  });
}

/* IS THIS FILE ALREADY THE RIGHT FILE?  size first because it is a stat and
   rules out most of the wrong answers for free, then the digest.  With no
   expected digest (a handful of old libraries have no sha1 in the manifest)
   presence plus the stated size is all there is to check, and that is said
   out loud rather than pretended otherwise. */
async function verified(file, sha1, size) {
  let st;
  try { st = await fsp.stat(file); } catch (e) { return false; }
  if (!st.isFile()) return false;
  if (size && st.size !== size) return false;
  if (!sha1) return st.size > 0;
  try { return (await fileSha1(file)) === sha1; } catch (e) { return false; }
}

/* DOWNLOAD, VERIFY, THEN PUBLISH.  The bytes land in <file>.part, the digest
   is computed as they stream past, and only a match renames it into place —
   so an interrupted run can never leave a truncated file that a later run
   would happily treat as present. */
async function download(url, file, opts) {
  const o = opts || {};
  const u = httpsOnly(url);
  const part = file + '.part';
  await fsp.mkdir(path.dirname(file), { recursive: true });

  return withRetry('download ' + path.basename(file), async function () {
    const res = await fetch(u.href, { headers: { 'user-agent': UA, accept: '*/*' }, redirect: 'follow' });
    if (!res.ok) {
      const e = new Error('HTTP ' + res.status + ' for ' + u.pathname);
      e.status = res.status;
      if (res.status >= 400 && res.status < 500) e.fatal = true;   /* see getBuffer */
      throw e;
    }
    if (!res.body) throw new Error('empty body');

    const h = crypto.createHash('sha1');
    let seen = 0;
    const src = Readable.fromWeb(res.body);
    src.on('data', function (chunk) {
      h.update(chunk);
      seen += chunk.length;
      if (o.onChunk) o.onChunk(chunk.length);
    });
    try {
      await pipeline(src, fs.createWriteStream(part));
    } catch (e) {
      /* the bytes counted so far never arrived; give them back so the total
         does not drift upwards across retries */
      if (o.onChunk && seen) o.onChunk(-seen);
      await fsp.rm(part, { force: true });
      throw e;
    }

    const got = h.digest('hex');
    if (o.sha1 && got !== o.sha1) {
      await fsp.rm(part, { force: true });
      if (o.onChunk && seen) o.onChunk(-seen);
      /* HARD FAILURE.  Not a warning, not a retry — the server handed back
         something other than the file the manifest describes. */
      const err = new Error('sha1 mismatch for ' + path.basename(file) + ': expected ' + o.sha1 + ', got ' + got);
      err.fatal = true;
      throw err;
    }
    if (o.size && seen !== o.size) {
      await fsp.rm(part, { force: true });
      if (o.onChunk && seen) o.onChunk(-seen);
      throw new Error('short read for ' + path.basename(file) + ': ' + seen + ' of ' + o.size);
    }
    await fsp.rename(part, file);
    return seen;
  });
}

/* BOUNDED CONCURRENCY, and bounded is the point: Mojang's CDN will happily
   accept two hundred sockets and the box will happily run out of handles.
   Workers pull from a shared cursor, so a slow file does not stall a lane. */
async function pool(items, limit, worker, signal) {
  const n = Math.max(1, Math.min(32, limit || 8));
  let next = 0;
  let failed = null;
  const lanes = [];
  for (let i = 0; i < n; i++) {
    lanes.push((async function () {
      for (;;) {
        if (failed) return;
        if (signal && signal.cancelled) return;
        const idx = next++;
        if (idx >= items.length) return;
        try { await worker(items[idx], idx); }
        catch (e) { if (!failed) failed = e; return; }
      }
    })());
  }
  await Promise.all(lanes);
  if (failed) throw failed;
}

module.exports = { getJSON, getBuffer, download, verified, fileSha1, sha1Of, pool, httpsOnly, UA };
