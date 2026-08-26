'use strict';
/* ============================================================================
   THE FORGE PROBLEM, SOLVED — the installer's processors, run.

   From 1.13 on, Forge and NeoForge do not ship a client jar.  They ship
   binary patches and a list of `processors`: jars the installer runs, in
   order, with argument vectors of their own, to produce a patched client from
   the vanilla one.  mc/loaders.js writes the profile and stops; this is the
   part that makes the profile true.

   For a client install of NeoForge 1.21.1 that is six processors: read the
   MCP mappings out of a neoform zip, download Mojang's official mappings,
   merge the two, split the vanilla jar into slim and extra, rename the slim
   half through the merged mappings, then apply the binary patch.  The last
   one writes neoforge-<version>-client.jar into libraries/, and that is the
   file the merged profile's classpath has been naming all along.

   ── WHAT THIS COSTS, SAID PLAINLY ────────────────────────────────────────
   Everything else in this project is a download that gets hashed and a path
   that gets proved.  This is different in kind: it starts a JVM and runs code
   somebody else wrote.  Three honest statements about that, none of which
   should be buried:

     1. THE JARS ARE VERIFIED, WHAT THEY DO IS NOT.  Every processor jar and
        every library on its classpath comes out of install_profile.json with
        a sha1 that is checked before it runs — see runProcessors' `fetch`
        step, which refuses on mismatch exactly like net.js does.  That proves
        we ran the bytes NeoForge published.  It does not constrain what those
        bytes then do, and it cannot: a JVM is not a sandbox.

     2. ONE PROCESSOR REACHES THE NETWORK ON ITS OWN.  DOWNLOAD_MOJMAPS
        fetches Mojang's official mappings itself.  That request does not go
        through mc/net.js, so it is not subject to the host allow-list and its
        result is not hashed by us — the profile's `outputs` block is what
        checks it, and only where the profile bothers to declare one.  The
        launcher's claim is "it talks to Microsoft, Mojang, Modrinth and
        nothing else"; this is still inside that claim, but it is the one
        connection this codebase does not itself make.

     3. THE OUTPUTS ARE CHECKED WHERE THEY ARE DECLARED.  `outputs` maps a
        path to a sha1 and both may carry placeholders.  Where a processor
        declares one it is verified after the run and a mismatch fails the
        install; where it declares none there is nothing to check against,
        and that is counted and logged rather than passed over quietly.

   A launcher that would not run these is a launcher that cannot install the
   loader most modern modpacks are built on.  A launcher that runs them and
   says nothing about it is worse.  This runs them and says this.

   ── CONTAINMENT ──────────────────────────────────────────────────────────
   Placeholders resolve to paths, the profile that supplies them came off the
   network, and a resolved path is therefore not trusted just because it was
   derived rather than typed.  Every path this file produces goes through
   Layout's `inside`/`relInside`, so a coordinate or an output that tries to
   climb out of the data root throws instead of resolving.  What the JVM does
   with a path once it has it is its business — but it will not be handed one
   that points somewhere it should not.
   ========================================================================= */

const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const net = require('./net');
const V = require('./version');
const { entries, readEntry } = require('./unzip');
const { inside } = require('./paths');

/* A processor that has not finished in this long is not going to.  The slow
   one is AutoRenamingTool over the 1.21 client jar, which is seconds on a
   warm machine; ten minutes is not a target, it is the point past which
   something is wrong and a stuck install should say so rather than hang. */
const PROC_TIMEOUT = 10 * 60 * 1000;
const MANIFEST = 'META-INF/MANIFEST.MF';

/* ── the allow-list this file adds ────────────────────────────────────────
   install_profile.libraries is a second list of URLs, written by the same
   kind of machine as the first, and it deserves the same treatment: named
   exactly, deny by default.  It is stated here rather than borrowed from
   install.js because install.js requires loaders.js which requires this
   file, and reaching back the other way would be a require cycle — so this
   module declares its own hosts, exactly as loaders.js and content.js do.

   THE CHECK IS NOT OPTIONAL AND TAKES NO INJECTED FUNCTION.  An earlier draft
   of this file took a `trusted` callback from its caller and fell back to the
   raw url when none was passed; nothing passed one, so the allow-list was not
   being applied at all.  A security check with an off switch is a security
   check that is off.                                                       */
const PROCESSOR_HOSTS = new Set([
  'maven.neoforged.net',
  'maven.minecraftforge.net',
  'libraries.minecraft.net',
  'repo1.maven.org', 'repo.maven.apache.org'
]);

function trusted(url) {
  const u = net.httpsOnly(url);
  if (!PROCESSOR_HOSTS.has(u.hostname)) {
    throw new Error('refusing to fetch an installer tool from an unexpected host: ' + u.hostname);
  }
  return u.href;
}

/* ── the three shapes a data value comes in ────────────────────────────────
   install_profile.json's `data` block maps a key to {client, server}, and the
   value for a side is one of:

     [group:artifact:version:classifier@ext]   a library, by coordinate
     /data/client.lzma                         a file inside the installer
     'literal'                                 a string, single-quoted

   The quoting is how the format distinguishes the third from the second: a
   value that is not bracketed and does not start with / is only a literal if
   it says so.  Anything else is a shape this build has not seen, and it is
   refused rather than guessed at — a mis-read placeholder becomes a path, and
   a wrong path here is a wrong file on somebody's disk.                    */
function classify(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return { kind: 'empty', value: '' };
  if (s.startsWith('[') && s.endsWith(']')) return { kind: 'coord', value: s.slice(1, -1) };
  if (s.startsWith("'") && s.endsWith("'")) return { kind: 'literal', value: s.slice(1, -1) };
  if (s.startsWith('/')) return { kind: 'entry', value: s.slice(1) };
  return { kind: 'unknown', value: s };
}

/* a maven coordinate -> the absolute path it lives at under libraries/ */
function libPath(L, coord) {
  return L.library(V.parseCoord(coord).path);
}

/* ── Main-Class, out of the jar that declares it ───────────────────────────
   A processor entry names a jar and nothing else; which class to run is in
   that jar's manifest.  Continuation lines in a manifest are a leading space
   on the next line and they are unfolded before the value is read, because a
   long package name is exactly the thing that gets wrapped.               */
function mainClassOf(buf, label) {
  const list = entries(buf);
  const e = list.filter(function (x) { return x.name === MANIFEST; })[0];
  if (!e) throw new Error(label + ' has no manifest, so there is no main class to run');
  const text = readEntry(buf, e).toString('utf8').replace(/\r\n/g, '\n').replace(/\n /g, '');
  const m = text.match(/^Main-Class:\s*(\S+)\s*$/m);
  if (!m) throw new Error(label + ' declares no Main-Class');
  return m[1];
}

/* ── spawn one, and keep what it said ──────────────────────────────────────
   Output is captured rather than inherited: a processor writing to stderr is
   not a failure (several of them log progress there), so the exit code is
   what decides, and the tail of what it said is what makes a non-zero code
   diagnosable instead of just a number. */
function runJava(exe, args, cwd) {
  return new Promise(function (resolve) {
    const child = execFile(exe, args, {
      cwd: cwd, timeout: PROC_TIMEOUT, maxBuffer: 8 * 1024 * 1024, windowsHide: true
    }, function (err, stdout, stderr) {
      resolve({
        code: err ? (typeof err.code === 'number' ? err.code : 1) : 0,
        killed: !!(err && err.killed),
        out: String(stdout || ''),
        err: String(stderr || '')
      });
    });
    child.on('error', function () { /* handled by the callback */ });
  });
}

function tail(s, n) {
  const lines = String(s || '').trim().split(/\r?\n/).filter(Boolean);
  return lines.slice(-(n || 6)).join(' | ').slice(0, 600);
}

/* ══════════════════════════════════════════════════════════════════════════
   RUN THEM.

     layout        the Layout; its root is {ROOT} and its libraries dir holds
                   every coordinate the profile names
     profile       the parsed install_profile.json
     installerBuf  the installer jar, already hash-verified by loaders.js
     installerPath where that jar is on disk ({INSTALLER})
     mcJar         the vanilla client jar ({MINECRAFT_JAR}) - it must exist,
                   which is why this runs after the vanilla install and not
                   during installLoader
     javaExe       a JVM to run them with
     side          'client'; the server-side processors are skipped

   Returns {ran, skipped, checked, unchecked, produced[]}.
   ═══════════════════════════════════════════════════════════════════════ */
async function runProcessors(o) {
  const L = o.layout;
  const log = typeof o.log === 'function' ? o.log : function () {};
  const onStep = typeof o.onStep === 'function' ? o.onStep : function () {};
  const side = String(o.side || 'client');
  const profile = o.profile || {};
  const list = Array.isArray(profile.processors) ? profile.processors : [];
  if (!list.length) return { ran: 0, skipped: 0, checked: 0, unchecked: 0, produced: [] };

  if (!o.javaExe) throw new Error('no Java runtime to run the installer processors with');
  if (!await net.verified(o.mcJar, '', 0)) {
    throw new Error('the vanilla client jar is not on disk yet, and the processors patch it');
  }

  /* ── 1. the processors' own libraries ────────────────────────────────────
     install_profile.libraries is a separate list from the version json's:
     these are the tools, not the game.  Every entry NeoForge publishes
     carries a url and a sha1, so unlike a Fabric profile there is nothing to
     go fetching digests for — and anything that turns up without one is
     refused rather than taken on trust, because this list is the classpath of
     something that is about to be executed. */
  const libs = Array.isArray(profile.libraries) ? profile.libraries : [];
  let fetched = 0;
  await net.pool(libs, 8, async function (l) {
    const a = (l.downloads || {}).artifact || {};
    if (!a.url || !a.path) return;
    const dest = L.library(String(a.path));
    if (await net.verified(dest, a.sha1, a.size)) return;
    if (!a.sha1) throw new Error('a processor library publishes no digest and will not be run: ' + String(l.name || a.path).slice(0, 80));
    await net.download(trusted(a.url), dest, { sha1: a.sha1 });
    fetched++;
  });
  if (fetched) log('processors: fetched ' + fetched + ' of ' + libs.length + ' tool libraries, each against its published sha1');

  /* ── 2. the data block, resolved for this side ──────────────────────────
     Entries that name a file inside the installer are unpacked next to it in
     the cache rather than into libraries/, because they are inputs to a build
     step and not artefacts anything launches. */
  const dataDir = inside(L.cache, 'loaders', path.basename(o.installerPath) + '.data');
  await fsp.mkdir(dataDir, { recursive: true });
  const zipEntries = entries(o.installerBuf);

  const data = {};
  for (const [key, pair] of Object.entries(profile.data || {})) {
    const c = classify(pair && pair[side]);
    if (c.kind === 'coord') { data[key] = libPath(L, c.value); continue; }
    if (c.kind === 'literal') { data[key] = c.value; continue; }
    if (c.kind === 'empty') { data[key] = ''; continue; }
    if (c.kind === 'entry') {
      const e = zipEntries.filter(function (x) { return x.name === c.value; })[0];
      if (!e) throw new Error('the installer does not contain ' + c.value.slice(0, 80));
      const out = inside(dataDir, path.basename(c.value));
      await fsp.writeFile(out, readEntry(o.installerBuf, e));
      data[key] = out;
      continue;
    }
    throw new Error('install_profile data key ' + key + ' has a value this build does not understand: ' + c.value.slice(0, 60));
  }

  /* the ones the format supplies rather than the profile */
  data.SIDE = side;
  data.ROOT = L.root;
  data.MINECRAFT_JAR = o.mcJar;
  data.INSTALLER = o.installerPath;
  data.LIBRARY_DIR = L.libraries;

  /* ── 3. one argument ────────────────────────────────────────────────────
     {KEY} is a data lookup, [coord] is a library path, and anything else is
     itself.  A {KEY} with no entry is an error and not an empty string: the
     empty string would be handed to the JVM as a path, and a tool told to
     write to "" fails in a way that reads like a bug in this launcher. */
  function arg(a) {
    const s = String(a == null ? '' : a);
    /* a coordinate is always the whole argument */
    if (s.startsWith('[') && s.endsWith(']')) return libPath(L, s.slice(1, -1));
    /* A PLACEHOLDER IS NOT ALWAYS THE WHOLE ARGUMENT.  Most are — {MC_SLIM},
       {MERGED_MAPPINGS} — but Forge writes "{ROOT}/libraries/net/.../args.txt"
       and NeoForge writes "{ROOT}/run.sh", so matching only a token that both
       starts with { and ends with } passes those through untouched and hands
       the JVM a path with a literal "{ROOT}" in it.  Every occurrence is
       substituted instead.

       A {KEY} with no entry is an error rather than an empty string: empty
       would be handed over as a path, and a tool told to write to "" fails in
       a way that reads like a bug in this launcher rather than in the
       profile that asked for it. */
    return s.replace(/\{([A-Za-z0-9_]+)\}/g, function (whole, k) {
      if (!Object.prototype.hasOwnProperty.call(data, k)) {
        throw new Error('a processor asked for {' + k + '}, which this installer never defined');
      }
      return String(data[k]);
    });
  }

  /* ── 4. run them, in order ───────────────────────────────────────────────
     How many apply to this side is counted BEFORE the loop rather than as
     `list.length - skipped` inside it: `skipped` is a running total, so using
     it would report a different denominator at every step and a progress bar
     that moves its own goalposts. */
  const applies = function (p) {
    return !(Array.isArray(p.sides) && p.sides.length && p.sides.indexOf(side) < 0);
  };
  const total = list.filter(applies).length;
  let ran = 0, skipped = 0, checked = 0, unchecked = 0;
  const produced = [];

  for (let i = 0; i < list.length; i++) {
    const p = list[i] || {};
    /* `sides` absent means both.  A server-only processor on a client install
       is not a failure, it is not our half of the profile. */
    if (!applies(p)) { skipped++; continue; }

    const jarPath = libPath(L, String(p.jar || ''));
    const jarBuf = await fsp.readFile(jarPath).catch(function () { return null; });
    if (!jarBuf) throw new Error('processor ' + (i + 1) + ' names a jar that was not fetched: ' + String(p.jar).slice(0, 80));
    const main = mainClassOf(jarBuf, String(p.jar));

    /* the jar goes on its own classpath: the profile lists the dependencies
       and takes the tool itself as understood */
    const cp = (Array.isArray(p.classpath) ? p.classpath : []).map(function (c) { return libPath(L, String(c)); });
    cp.push(jarPath);

    const args = (Array.isArray(p.args) ? p.args : []).map(arg);
    const label = String(p.jar).split(':').slice(0, 2).join(':');
    const task = (function () {
      const t = args.indexOf('--task');
      return t >= 0 && args[t + 1] ? args[t + 1] : '';
    })();

    onStep({ index: ran, total: total, label: label, task: task });
    log('processors: [' + (i + 1) + '/' + list.length + '] ' + label + (task ? ' ' + task : '') + ' — ' + main);

    const started = Date.now();
    const r = await runJava(o.javaExe, ['-cp', cp.join(path.delimiter), main].concat(args), L.root);
    const took = Date.now() - started;
    if (r.code !== 0) {
      const why = r.killed ? 'it did not finish inside ' + (PROC_TIMEOUT / 60000) + ' minutes' : 'it exited ' + r.code;
      throw new Error('the ' + label + ' processor failed: ' + why
        + (tail(r.err) ? ' — ' + tail(r.err) : '') + (tail(r.out) ? ' — ' + tail(r.out) : ''));
    }
    ran++;

    /* ── 5. what it said it would produce ────────────────────────────────── */
    const outs = p.outputs && typeof p.outputs === 'object' ? p.outputs : {};
    const keys = Object.keys(outs);
    if (!keys.length) {
      unchecked++;
      log('processors: [' + (i + 1) + '/' + list.length + '] ok in ' + took + ' ms — it declares no output digest, so there is nothing to verify it against');
      continue;
    }
    for (const rawFile of keys) {
      const file = arg(rawFile);
      const want = arg(outs[rawFile]);
      /* THE PROFILE CAME OFF THE NETWORK, so a declared output path is proved
         to sit inside the data root before it is treated as one of ours.  The
         same prefix test paths.js uses, spelled out here rather than routed
         through inside(): the input is already absolute, and inside() takes
         segments to join, so feeding it a whole path back would be asking a
         different question than the one that matters. */
      const abs = path.resolve(file);
      if (abs !== L.root && !abs.startsWith(L.root + path.sep)) {
        throw new Error('a processor declared an output outside the data root: ' + abs.slice(0, 120));
      }
      if (!want) { unchecked++; continue; }
      const got = await net.fileSha1(file).catch(function () { return ''; });
      if (got !== want) {
        throw new Error('the ' + label + ' processor produced ' + path.basename(file)
          + ' with digest ' + (got || 'nothing') + ', but its own profile says ' + want);
      }
      checked++;
      produced.push(path.relative(L.root, file).replace(/\\/g, '/'));
    }
    log('processors: [' + (i + 1) + '/' + list.length + '] ok in ' + took + ' ms, ' + keys.length + ' output(s) verified');
  }

  /* ── 6. THE ARTEFACT, CHECKED FOR REGARDLESS ────────────────────────────
     NeoForge 21.1.248 declares no `outputs` digest on any of its ten
     processors, so the loop above verified nothing — a run of six JVMs that
     all exited 0 and a `checked` count of zero.  Exit codes are not evidence
     that the file was written.

     `PATCHED` is the one data key whose value is the whole point: the patched
     client jar the merged profile's classpath names.  If the processors did
     their job it is on disk now, and if it is not then the install failed
     quietly, which is the failure mode worth catching here — the alternative
     is Play appearing to work and the JVM saying NoClassDefFound later. */
  if (data.PATCHED) {
    const patched = String(data.PATCHED);
    const st = await fsp.stat(patched).catch(function () { return null; });
    if (!st || !st.isFile() || st.size === 0) {
      throw new Error('the processors all exited cleanly but did not produce ' + path.basename(patched)
        + ', which is the patched client jar the profile launches');
    }
    const rel = path.relative(L.root, patched).replace(/\\/g, '/');
    if (produced.indexOf(rel) < 0) produced.push(rel);
    log('processors: ' + path.basename(patched) + ' is on disk, ' + (st.size / 1048576).toFixed(1) + ' MB');
  }

  log('processors: ' + ran + ' ran, ' + skipped + ' skipped as server-side, '
    + (checked
      ? checked + ' outputs digest-checked'
      : 'no output digests published to check against')
    + (checked && unchecked ? ', ' + unchecked + ' without one' : ''));
  return { ran: ran, skipped: skipped, checked: checked, unchecked: unchecked, produced: produced, patched: data.PATCHED || '' };
}

module.exports = { runProcessors, classify, mainClassOf, trusted, PROCESSOR_HOSTS, PROC_TIMEOUT };
