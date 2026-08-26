'use strict';
/* ============================================================================
   THE BRIDGE.  This is the whole of what the page can reach.

   No require, no fs, no ipcRenderer: the renderer gets functions, and every
   one of them names an operation rather than a file.  Anything the page hands
   over is re-validated in the main process before it touches disk, because a
   renderer is not a trusted caller even when it is our own.

   window.kestrel
     .available                              true, so the page can tell
     .window.minimize() .maximize() .close()
     .window.isMaximized()                   sync, boolean
     .window.onState(fn)                     fn({maximized}) on every change
     .instances.boot()                       sync {seeded, items} - boot only
     .instances.seed(records)                sync, first run only
     .instances.list()                       -> Promise<record[]>
     .instances.get(id) .create(rec) .update(id, patch)
     .instances.remove(id) .duplicate(id, name)
     .settings.get() .settings.set(patch)
     .openDataFolder()
     .auth.status()                          -> {mode:'demo'|'live', why, source,
                                                 canPersist, scope}
     .auth.begin()                           -> {flowId, userCode,
                                                 verificationUri, expiresAt, demo}
     .auth.cancel(flowId)
     .auth.onEvent(fn)                       fn({flowId, phase, ...})
     .accounts.list() .activate(id) .remove(id)  -> Promise<account[]>
     .game.versions(force)                   -> {latest, versions:[{id,type,released}]}
     .game.loaderVersions(loader, mcVersion) -> [{version, stable}] newest first,
                                                and [] means that loader has no
                                                build for that version at all
     .game.installLoader(instanceId, loader, loaderVersion)
                                             -> {id, loader, mc, partial, notes}
     .game.java(force)                       -> [{path,version,major,vendor,arch}]
     .game.javaFor(versionId)                -> {want, runtime, have, message}
     .game.status(instanceId, versionId)     -> {running, session, java, ...}
     .game.install(instanceId, versionId)    -> install summary
     .game.play(instanceId, {offline, username, version, maxMemMb})
     .game.cancel(instanceId) .game.kill(sessionOrInstanceId) .game.running()
     .game.onProgress(fn)                    fn({instance, phase, done, total,
                                                 bytes, totalBytes, file})
     .game.onLog(fn)                         fn({instance, session, stream, line})
     .game.onExit(fn)                        fn({instance, session, code, ms})
     .game.onStarted(fn)                     fn({instance, session, pid, ...})
     .content.list(id, kind)                 -> [{file, name, title, version,
                                                  size, enabled, project, sha1}]
                                                read off the real folder
     .content.plan(id, projectId, kind)      -> {id, items:[...], bytes, count,
                                                 optional, truncated} - what
                                                 WOULD be installed, deps and all
     .content.install(id, planId)            -> {installed:[...], bytes}
     .content.setEnabled(id, kind, file, on) -> renames to/from .jar.disabled
     .content.remove(id, kind, file)         -> deletes the file
     .content.updates(id, kind)              -> [{file, state, from, to}]

   WHY THERE IS NO .game.launchCommand().  The command line, the classpath,
   the argument file and the session are all main-process facts and none of
   them has a reason to be on this bridge.  play() takes an instance id and a
   couple of preferences; everything a path could be built out of is decided
   in mc/, validated against the data root, and never round-trips through the
   page.  The four event channels carry counts, log text, a pid and an exit
   code — the log lines are the child's own stdout, and an offline session
   carries the literal "0" where a live one would carry a session key, so the
   one place that could leak into them holds nothing worth leaking.

   WHAT AN ACCOUNT IS, HERE.  {id, name, uuid, skinUrl, active, expiresAt,
   demo} — a name, an identifier, a picture and a date.  There is no channel
   on this bridge that returns an access token, a refresh token or the device
   code the poll runs on, because there is no handler behind one: the whole
   chain lives in msauth.js and the credential half of a stored account is
   sealed by accounts.js and never read back out over IPC.  begin() hands
   back the USER code, which is the short thing meant to be read off this
   screen and typed on Microsoft's; the device code beside it stays in the
   main process.
   ========================================================================= */

const { contextBridge, ipcRenderer } = require('electron');

/* handlers answer {ok, value} or {ok, error}; the page sees a value or a
   rejected promise, never a protocol envelope */
function call(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args).then((r) => {
    if (r && r.ok) return r.value;
    throw new Error(r && r.error || 'the launcher could not complete that');
  });
}

/* a one-way event subscription.  The payload is round-tripped the same way an
   argument is, so the page never gets a live reference to anything on this
   side of the bridge. */
function listen(channel, fn) {
  if (typeof fn !== 'function') return;
  ipcRenderer.on(channel, (_e, payload) => fn(plain(payload) || {}));
}

/* JSON round-trip: nothing with a prototype, a function or a live reference
   crosses into the main process */
function plain(v) {
  try { return JSON.parse(JSON.stringify(v === undefined ? null : v)); }
  catch (e) { return null; }
}

contextBridge.exposeInMainWorld('kestrel', {
  available: true,

  window: {
    minimize() { ipcRenderer.send('win:minimize'); },
    maximize() { ipcRenderer.send('win:maximize'); },
    close() { ipcRenderer.send('win:close'); },
    isMaximized() { return !!ipcRenderer.sendSync('win:is-maximized'); },
    onState(fn) {
      if (typeof fn !== 'function') return;
      ipcRenderer.on('win:state', (_e, state) => fn(plain(state) || { maximized: false }));
    }
  },

  instances: {
    boot() { return ipcRenderer.sendSync('instances:boot'); },
    seed(records) { return ipcRenderer.sendSync('instances:seed', plain(records) || []); },
    list() { return call('instances:list'); },
    get(id) { return call('instances:get', String(id)); },
    create(rec) { return call('instances:create', plain(rec)); },
    update(id, patch) { return call('instances:update', String(id), plain(patch)); },
    remove(id) { return call('instances:remove', String(id)); },
    duplicate(id, name) { return call('instances:duplicate', String(id), String(name || '')); }
  },

  settings: {
    get() { return call('settings:get'); },
    set(patch) { return call('settings:set', plain(patch)); }
  },

  auth: {
    status() { return call('auth:status'); },
    begin() { return call('auth:begin'); },
    cancel(flowId) { return call('auth:cancel', String(flowId || '')); },
    onEvent(fn) {
      if (typeof fn !== 'function') return;
      ipcRenderer.on('auth:event', (_e, payload) => fn(plain(payload) || {}));
    }
  },

  accounts: {
    list() { return call('accounts:list'); },
    activate(id) { return call('accounts:activate', String(id)); },
    remove(id) { return call('accounts:remove', String(id)); }
  },

  game: {
    versions(force) { return call('game:versions', !!force); },
    loaderVersions(loader, mc) { return call('game:loader-versions', String(loader || ''), String(mc || '')); },
    installLoader(instanceId, loader, lver) { return call('game:install-loader', String(instanceId || ''), String(loader || ''), String(lver || '')); },
    java(force) { return call('game:java', !!force); },
    javaFor(versionId) { return call('game:java-for', String(versionId || '')); },
    status(instanceId, versionId) { return call('game:status', String(instanceId || ''), String(versionId || '')); },
    install(instanceId, versionId) { return call('game:install', String(instanceId || ''), String(versionId || '')); },
    play(instanceId, opts) { return call('game:play', String(instanceId || ''), plain(opts) || {}); },
    cancel(instanceId) { return call('game:cancel', String(instanceId || '')); },
    kill(which) { return call('game:kill', String(which || '')); },
    running() { return call('game:running'); },
    onProgress(fn) { listen('game:progress', fn); },
    onLog(fn) { listen('game:log', fn); },
    onExit(fn) { listen('game:exit', fn); },
    onStarted(fn) { listen('game:started', fn); }
  },

  /* ── content ────────────────────────────────────────────────────────────
     SIX CALLS AND NO URL AMONG THEM.  plan() answers with the whole required
     dependency tree — titles, versions, sizes, and which entries are already
     present — plus an opaque id; install() takes that id and nothing else, so
     the page can only ask for the files it was just shown.  list() reads the
     instance's real folder, so `file`, `size` and `enabled` are facts about
     disk rather than about a row in the table. */
  content: {
    list(instanceId, kind) { return call('content:list', String(instanceId || ''), String(kind || 'mod')); },
    plan(instanceId, projectId, kind) { return call('content:plan', String(instanceId || ''), String(projectId || ''), String(kind || 'mod')); },
    install(instanceId, planId) { return call('content:install', String(instanceId || ''), String(planId || '')); },
    setEnabled(instanceId, kind, file, on) { return call('content:enable', String(instanceId || ''), String(kind || 'mod'), String(file || ''), !!on); },
    remove(instanceId, kind, file) { return call('content:remove', String(instanceId || ''), String(kind || 'mod'), String(file || '')); },
    updates(instanceId, kind) { return call('content:updates', String(instanceId || ''), String(kind || 'mod')); }
  },

  openDataFolder() { return call('shell:open-root'); }
});
