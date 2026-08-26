'use strict';
/* ============================================================================
   BUILDING THE COMMAND, AND KEEPING THE TOKEN OFF IT.

   THE PROBLEM.  Minecraft takes the session token as `--accessToken <jwt>`.
   On Windows a command line is not private: every process on the desktop can
   read every other process's command line out of the PEB, and
   `Get-CimInstance Win32_Process | select CommandLine` prints them all with
   no privilege at all.  A launcher that passes the token that way has handed
   the user's Minecraft session to any program that cares to look, including
   ones the user installed on purpose.

   THE FIX, for Java 9 and up: the JDK's @argfile.  `java @C:\...\args.txt`
   makes the command line three words long and puts everything else in a file
   we own.  The file is written with mode 0600 before anything is spawned, and
   it is deleted as soon as the child has started - the JVM has already read
   it by then, so the window in which it exists on disk is a few milliseconds
   and it is readable only by this OS user for those milliseconds.

   THE HONEST PART, for Java 8: @argfile does not exist before JDK 9.  There
   is no file, environment or stdin channel that a 1.8.9 client will read a
   token from - the argument vector is the only door.  So this build REFUSES
   to put a real token on a Java 8 command line and says why.  An offline
   session has no token to leak (the value is the literal "0"), so offline
   launches of 1.8.9 and 1.12.2 go ahead normally, which is what makes the
   pipeline testable on a machine with only Java 8 on it.

   Everything else here is placeholder substitution.  Both argument forms are
   handled: the modern `arguments: { game: [...], jvm: [...] }` with its rules
   blocks, and the pre-1.13 `minecraftArguments` string.
   ========================================================================= */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const V = require('./version');
const { inside } = require('./paths');

const IS_WIN = process.platform === 'win32';
const SEP = IS_WIN ? ';' : ':';

/* ── placeholder substitution ─────────────────────────────────────────────
   ${x} only, and only for keys we put in the map.  An unknown placeholder is
   left alone rather than replaced with "undefined", which is how a launcher
   ends up with a game directory literally called undefined.               */
function fill(s, map) {
  return String(s).replace(/\$\{([A-Za-z0-9_]+)\}/g, function (whole, k) {
    return Object.prototype.hasOwnProperty.call(map, k) ? String(map[k]) : whole;
  });
}

/* the modern arguments array: strings, or {rules, value} objects */
function flatten(list, features, map) {
  const out = [];
  for (const a of (list || [])) {
    if (typeof a === 'string') { out.push(fill(a, map)); continue; }
    if (!a || typeof a !== 'object') continue;
    if (!V.allowed(a.rules, features)) continue;
    const v = Array.isArray(a.value) ? a.value : [a.value];
    for (const one of v) if (typeof one === 'string') out.push(fill(one, map));
  }
  return out;
}

/* JDK @argfile quoting.  Inside double quotes the parser treats backslash as
   an escape, so a Windows path has to have its separators doubled or the JVM
   sees C:UsersyouAppData.  Every argument is quoted rather than only the
   ones with spaces in them: one rule, no edge to get wrong. */
function argfileLine(a) {
  return '"' + String(a).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/* ── the plan ─────────────────────────────────────────────────────────────
   Pure: takes a version json and a session, returns the argument vector.  No
   spawning, no disk, so it can be unit-checked and printed.               */
function buildArgs(o) {
  const vjson = o.vjson;
  const L = o.layout;
  const id = o.id;

  const libs = V.librariesFor(vjson);
  const cp = [];
  for (const l of libs.jars) cp.push(L.library(l.path));
  /* THE CLIENT JAR GOES LAST, and for a merged loader profile it is the
     PARENT's jar — `jar` in the version format means exactly that.  Last is
     not arbitrary either: a loader ships its own build of ASM or Guava and
     expects to shadow the game's copy, so every loader library is ahead of
     the client on the classpath.  merge() puts the child's libraries first
     for the same reason. */
  cp.push(L.versionJar(String(vjson.jar || id)));

  const assetsRoot = L.assets;
  const assetIndexId = (vjson.assetIndex && vjson.assetIndex.id) || vjson.assets || 'legacy';
  /* pre-1.7 reads assets by name out of the virtual folder */
  const gameAssets = o.virtual ? L.virtualDir(assetIndexId) : assetsRoot;

  const map = {
    natives_directory: L.nativesDir(id),
    launcher_name: o.launcherName || 'Kestrel',
    launcher_version: o.launcherVersion || '1.0',
    classpath: cp.join(SEP),
    classpath_separator: SEP,
    library_directory: L.libraries,
    version_name: id,
    version_type: String(vjson.type || 'release'),
    game_directory: o.gameDir,
    assets_root: assetsRoot,
    game_assets: gameAssets,
    assets_index_name: assetIndexId,
    auth_player_name: o.session.name,
    auth_uuid: o.session.uuid,
    auth_access_token: o.session.accessToken,
    auth_session: 'token:' + o.session.accessToken + ':' + o.session.uuid,
    auth_xuid: o.session.xuid || '',
    clientid: o.session.clientId || '',
    user_type: o.session.userType || 'msa',
    user_properties: '{}',
    resolution_width: String(o.width || 854),
    resolution_height: String(o.height || 480),
    quickPlayPath: '', quickPlaySingleplayer: '', quickPlayMultiplayer: '', quickPlayRealms: ''
  };

  const features = { is_demo_user: false, has_custom_resolution: !!o.width, has_quick_plays_support: false };

  const jvm = [];
  /* heap and the flags every launcher sets.  G1 is the default from 9 on but
     saying it costs nothing and 8 needs to be told. */
  jvm.push('-Xmx' + (o.maxMemMb || 2048) + 'M', '-Xms' + Math.min(512, o.maxMemMb || 2048) + 'M');
  if (IS_WIN) jvm.push('-Dos.name=Windows 10', '-Dos.version=10.0');
  jvm.push('-Djava.net.preferIPv4Stack=true');
  jvm.push('-Dminecraft.launcher.brand=' + (o.launcherName || 'Kestrel'));
  jvm.push('-Dminecraft.launcher.version=' + (o.launcherVersion || '1.0'));

  const fromJson = (vjson.arguments && Array.isArray(vjson.arguments.jvm))
    ? flatten(vjson.arguments.jvm, features, map) : [];
  jvm.push(...fromJson);
  /* THE PRE-1.13 DEFAULT, and why it is a check rather than an else.  A
     legacy manifest states no jvm arguments at all because every launcher of
     that era hard-coded -cp and -Djava.library.path.  A modern one states
     both.  The interesting case is the one merging creates: Fabric's profile
     is the modern form and it carries jvm arguments, so a Fabric-on-1.12.2
     merge produces an `arguments.jvm` list that has Fabric's flags in it and
     no -cp — which under an if/else would launch a JVM with an empty
     classpath.  So the two are tested for by name and supplied if missing. */
  if (!fromJson.some(function (a) { return a === '-cp' || a === '-classpath' || a === '--class-path'; })) {
    jvm.push('-cp', map.classpath);
  }
  if (!fromJson.some(function (a) { return String(a).indexOf('-Djava.library.path=') === 0; })) {
    jvm.push('-Djava.library.path=' + map.natives_directory);
  }

  const main = String(vjson.mainClass || 'net.minecraft.client.main.Main');

  let game;
  if (vjson.arguments && Array.isArray(vjson.arguments.game)) {
    game = flatten(vjson.arguments.game, features, map);
  } else if (typeof vjson.minecraftArguments === 'string') {
    game = vjson.minecraftArguments.split(/\s+/).filter(Boolean).map(function (a) { return fill(a, map); });
  } else {
    game = [];
  }
  if (o.width) game.push('--width', String(o.width), '--height', String(o.height));

  return { jvm: jvm, main: main, game: game, classpath: cp, map: map };
}

/* does any argument in the vector carry the access token? */
function tokenIsOnTheLine(args, token) {
  if (!token || token === '0') return false;
  return args.some(function (a) { return String(a).indexOf(token) >= 0; });
}

/* ── the running process ──────────────────────────────────────────────── */
class Session {
  constructor(o) {
    this.id = crypto.randomUUID();
    this.instance = o.instance;
    this.version = o.version;
    this.child = null;
    this.startedAt = 0;
    this.exitCode = null;
    this.killed = false;
  }
  kill() {
    if (!this.child || this.exitCode !== null) return false;
    this.killed = true;
    if (IS_WIN) {
      /* the JVM spawns nothing here, but taskkill /T is still the right tool:
         SIGTERM on Windows is emulated and a wedged JVM can ignore it. */
      try { spawn('taskkill', ['/pid', String(this.child.pid), '/T', '/F'], { windowsHide: true }); return true; }
      catch (e) { /* fall through to the portable path */ }
    }
    try { this.child.kill('SIGTERM'); } catch (e) { return false; }
    const c = this.child;
    setTimeout(function () { try { c.kill('SIGKILL'); } catch (e) { /* already gone */ } }, 4000);
    return true;
  }
}

/* launch(opts) -> Session, already spawned.
   opts.onLine(stream, text)  every line of stdout/stderr
   opts.onExit(code, signal)  once                                          */
async function launch(o) {
  const L = o.layout;
  const built = buildArgs(o);
  const javaExe = o.java.path;
  const javaMajor = Number(o.java.major) || 0;
  const gameDir = o.gameDir;

  await fsp.mkdir(gameDir, { recursive: true });
  /* the natives folder has to exist even when the version has no natives, or
     -Djava.library.path points at nothing and 1.8 falls over */
  await fsp.mkdir(L.nativesDir(o.id), { recursive: true });

  const full = built.jvm.concat([built.main], built.game);
  const token = o.session.accessToken;
  const useArgfile = javaMajor >= 9;
  const leaks = tokenIsOnTheLine(full, token);

  if (!useArgfile && leaks) {
    /* THE REFUSAL.  Java 8 has no @argfile, and there is no other channel a
       1.8-era client reads a token from.  Rather than put a live session on a
       command line every process on the box can read, this stops. */
    const e = new Error(
      'Refusing to launch: Java ' + (o.java.version || javaMajor) + ' has no @argfile support, so the session token '
      + 'would have to go on the command line where any process on this machine can read it. '
      + 'Launch offline, or install a Java 9+ runtime for this version.');
    e.code = 'TOKEN_WOULD_LEAK';
    throw e;
  }

  let argfile = null;
  let argv;
  if (useArgfile) {
    /* the argfile lives in the natives folder, which is already inside the
       data root and already validated */
    argfile = inside(L.nativesDir(o.id), '.launch-' + crypto.randomBytes(8).toString('hex') + '.args');
    const body = full.map(argfileLine).join('\n') + '\n';
    /* 0600 before a byte is in it: the file is created with the mode, not
       chmod-ed after, so there is no instant at which it is world-readable */
    await fsp.writeFile(argfile, body, { mode: 0o600, flag: 'wx' });
    argv = ['@' + argfile];
  } else {
    argv = full;
  }

  const child = spawn(javaExe, argv, {
    cwd: gameDir,
    windowsHide: true,
    /* the child gets the parent's environment minus anything of ours that
       looks like a credential; Minecraft reads none of them */
    env: Object.assign({}, process.env, { KESTREL_MSA_CLIENT_ID: undefined }),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const sess = new Session({ instance: o.instance, version: o.id });
  sess.child = child;
  sess.startedAt = Date.now();
  sess.usedArgfile = !!argfile;
  sess.java = { path: javaExe, version: o.java.version, major: javaMajor, vendor: o.java.vendor };

  /* DELETE IT NOW.  The JVM reads its argfile during startup, before main();
     by the time spawn() has returned a pid the read is either done or about
     to be, so a short delay and an unlink closes the window.  A failure to
     delete is reported, not swallowed - a leftover argfile is exactly the
     thing this whole mechanism exists to avoid. */
  if (argfile) {
    setTimeout(function () {
      fsp.rm(argfile, { force: true }).catch(function (err) {
        if (o.onLine) o.onLine('launcher', 'could not remove the argument file: ' + err.message);
      });
    }, 1500);
  }

  const feed = function (stream, chunkStream) {
    let buf = '';
    chunkStream.setEncoding('utf8');
    chunkStream.on('data', function (d) {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        if (o.onLine) o.onLine(stream, line);
      }
      if (buf.length > 8192) { if (o.onLine) o.onLine(stream, buf); buf = ''; }
    });
    chunkStream.on('end', function () { if (buf && o.onLine) o.onLine(stream, buf); });
  };
  feed('out', child.stdout);
  feed('err', child.stderr);

  child.on('error', function (err) {
    if (o.onLine) o.onLine('launcher', 'could not start Java: ' + err.message);
    sess.exitCode = -1;
    if (o.onExit) o.onExit(-1, null);
  });
  child.on('close', function (code, signal) {
    sess.exitCode = code === null ? -1 : code;
    if (argfile) fsp.rm(argfile, { force: true }).catch(function () {});
    if (o.onExit) o.onExit(sess.exitCode, signal);
  });

  return sess;
}

module.exports = { buildArgs, launch, Session, argfileLine, fill, SEP };
