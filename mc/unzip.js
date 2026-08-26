'use strict';
/* ============================================================================
   A ZIP READER, in about a hundred lines, because the alternative was a
   dependency.

   WHY NOT A LIBRARY.  The brief says no new runtime dependencies if they can
   be avoided, and here they can: a native-library jar is a ZIP with two entry
   types in it — stored and deflated — and Node ships zlib.inflateRaw, which is
   the whole of the decompression side.  Pulling in adm-zip or yauzl to read
   four DLLs out of an archive would add a supply-chain edge to a launcher
   whose entire security story is "verify everything", to save this file.
   It reads the central directory rather than scanning for local headers,
   which is the correct way round: the central directory is authoritative and
   a local header can lie about its sizes.

   ZIP SLIP IS THE ONLY INTERESTING BUG IN A ZIP EXTRACTOR.  An entry name is
   an attacker-controlled string that is about to become a path — "../../../
   Windows/System32/user32.dll" is a legal ZIP entry name and every extractor
   that joins without resolving will write it.  So: names are normalised,
   absolute names and drive letters are refused outright, and after the join
   the resolved path is proved to sit under the target directory.  An entry
   that fails throws; it does not get skipped quietly, because an archive
   containing one is not an archive we should be extracting at all.
   ========================================================================= */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { inside } = require('./paths');

const EOCD_SIG = 0x06054b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const EOCD64_SIG = 0x06064b50;
const CEN_SIG = 0x02014b50;

function findEocd(buf) {
  const min = 22;
  const start = Math.max(0, buf.length - (min + 0xffff));
  for (let i = buf.length - min; i >= start; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error('not a zip file (no end-of-central-directory record)');
}

/* the entry list, read from the central directory */
function entries(buf) {
  const eocd = findEocd(buf);
  let count = buf.readUInt16LE(eocd + 10);
  let size = buf.readUInt32LE(eocd + 12);
  let offset = buf.readUInt32LE(eocd + 16);

  /* ZIP64: a jar over 4 GB, or with more than 65535 entries, parks the real
     numbers in a second record.  Native jars are never this big, but a reader
     that silently mis-parses one is worse than one that handles it. */
  if (offset === 0xffffffff || count === 0xffff || size === 0xffffffff) {
    for (let i = eocd - 20; i >= 0; i--) {
      if (buf.readUInt32LE(i) === EOCD64_LOCATOR_SIG) {
        const at = Number(buf.readBigUInt64LE(i + 8));
        if (buf.readUInt32LE(at) !== EOCD64_SIG) throw new Error('bad zip64 record');
        count = Number(buf.readBigUInt64LE(at + 32));
        size = Number(buf.readBigUInt64LE(at + 40));
        offset = Number(buf.readBigUInt64LE(at + 48));
        break;
      }
    }
  }
  if (offset + size > buf.length) throw new Error('central directory runs past the end of the file');

  const out = [];
  let p = offset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) throw new Error('bad central directory entry ' + i);
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    out.push({ name: name, method: method, csize: csize, usize: usize, local: local });
    p += 46 + nlen + elen + clen;
  }
  return out;
}

function readEntry(buf, e) {
  /* the local header's own name/extra lengths are what tell us where the data
     starts; the central directory's copies of them do not have to agree */
  if (buf.readUInt32LE(e.local) !== 0x04034b50) throw new Error('bad local header for ' + e.name);
  const nlen = buf.readUInt16LE(e.local + 26);
  const elen = buf.readUInt16LE(e.local + 28);
  const at = e.local + 30 + nlen + elen;
  const raw = buf.subarray(at, at + e.csize);
  if (e.method === 0) return Buffer.from(raw);
  if (e.method === 8) return zlib.inflateRawSync(raw);
  throw new Error('unsupported compression method ' + e.method + ' in ' + e.name);
}

/* ── the guard ────────────────────────────────────────────────────────────
   Returns the absolute destination for an entry, or throws.  Nothing else in
   this file is allowed to build a path.                                    */
function safeJoin(dir, name) {
  const clean = String(name).replace(/\\/g, '/');
  if (!clean || clean.indexOf(' ') >= 0) throw new Error('zip entry with a null byte or empty name');
  if (clean.startsWith('/') || /^[A-Za-z]:/.test(clean)) throw new Error('zip entry is an absolute path: ' + clean.slice(0, 80));
  const parts = clean.split('/').filter(function (s) { return s.length && s !== '.'; });
  if (!parts.length) throw new Error('zip entry resolves to nothing: ' + clean.slice(0, 80));
  /* ".." obviously, but also "..." and "...." and "x. " — Win32 strips
     trailing dots and spaces off a path component before it hits the
     filesystem, so a name that is only dots, or ends in one, can normalise
     into something other than what was checked.  Refuse the whole family. */
  if (parts.some(function (s) { return /^\.+$/.test(s) || /[. ]$/.test(s); })) {
    throw new Error('zip entry escapes the target directory: ' + clean.slice(0, 80));
  }
  /* belt and braces: inside() resolves and proves containment even after the
     ".." filter above, because symlinked or 8.3-shortened segments can still
     surprise a purely textual check */
  return inside(dir, ...parts);
}

/* extract a natives jar.  `exclude` is the manifest's own list of things not
   to unpack (META-INF/, and on some versions the .git and .sha1 leftovers). */
async function extractNatives(jarFile, targetDir, exclude) {
  const buf = await fsp.readFile(jarFile);
  const list = entries(buf);
  const skip = Array.isArray(exclude) ? exclude.map(String) : [];
  await fsp.mkdir(targetDir, { recursive: true });
  let n = 0;
  for (const e of list) {
    if (e.name.endsWith('/')) continue;
    if (skip.some(function (s) { return e.name.startsWith(s); })) continue;
    if (/^META-INF\//i.test(e.name)) continue;
    /* the guard runs before anything is opened, on every single entry */
    const dest = safeJoin(targetDir, e.name);
    const data = readEntry(buf, e);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.writeFile(dest, data);
    n++;
  }
  return n;
}

module.exports = { entries, readEntry, extractNatives, safeJoin };
