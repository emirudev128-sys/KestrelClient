'use strict';
/* ============================================================================
   THE MAIN PROCESS.  It owns the window, the disk and the product name; the
   renderer owns none of those and reaches them only through preload.js.

   The window is frameless because the UI draws its own titlebar (see
   .titlebar in ui/index.html), so minimise / maximise / close arrive here
   over IPC and the maximise button is told the real window state rather than
   guessing at it.

   THE NAME IS STILL ONE EDIT.  %APPDATA%/Kestrel is not typed here: brand.js
   is imported and BRAND.name is read off it, so renaming the product still
   moves the data root with it.
   ========================================================================= */

const { app, BrowserWindow, ipcMain, shell, safeStorage, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Store } = require('./store');
const { AccountStore } = require('./accounts');
const { Auth } = require('./msauth');
const authConfig = require('./auth-config');
const { Game } = require('./mc');

const UI = path.join(__dirname, 'ui', 'index.html');
const DEFAULTS = { width: 1280, height: 800 };
const MIN = { width: 940, height: 600 };

let store = null;
let win = null;
let accounts = null;
let auth = null;
let game = null;

/* brand.js is an ES module and this is not, so it is imported rather than
   required (ui/package.json declares the type).  Nothing in it touches the
   DOM until applyBrand() is called.  If the import ever fails the name is
   read out of the same file rather than restated here, because the point of
   all this is that the name lives in exactly one place. */
const BRAND_FILE = path.join(__dirname, 'ui', 'scripts', 'brand.js');
async function loadBrand() {
  try {
    const mod = await import(pathToFileURL(BRAND_FILE).href);
    if (mod && mod.BRAND && mod.BRAND.name) return mod.BRAND;
  } catch (e) {
    console.error('brand.js would not import, falling back to reading it:', e.message);
  }
  const src = require('node:fs').readFileSync(BRAND_FILE, 'utf8');
  const m = src.match(/name:\s*'([^']+)'/);
  if (!m) throw new Error('cannot read the product name out of brand.js');
  return { name: m[1] };
}

function saveBounds() {
  if (!win || win.isDestroyed() || !store) return;
  const maximized = win.isMaximized();
  const b = maximized ? win.getNormalBounds() : win.getBounds();
  store.writeSettings({ window: { x: b.x, y: b.y, width: b.width, height: b.height, maximized } });
}

/* ── browser-level hardening ──────────────────────────────────────────────
   Two things Electronegativity flags as CERTAIN, and both are real.

   1. A CSP.  The renderer builds a lot of markup from strings, and some of
      that text is authored by strangers - a Modrinth project name or
      description is attacker-controlled content rendered inside our window.
      Everything is escaped today, but a CSP is the backstop for the day one
      escape is missed: with no inline script allowed, an injected <script>
      does not run.  connect-src is an allow-list of the hosts this launcher
      genuinely talks to and nothing else, which is also the privacy claim
      made enforceable rather than promised.

   2. A permission handler.  Chromium's default is to ASK; a launcher has no
      use for a camera, a microphone, geolocation or notifications, so every
      request is denied outright rather than surfaced to the user.
   ---------------------------------------------------------------------- */
function hardenSession() {
  const ses = session.defaultSession;

  /* One string literal on purpose: assembled from an array it is applied
     correctly but static analysers cannot read it, and a policy a scanner
     cannot parse is a policy nobody can check. */
  const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.modrinth.com https://cdn.modrinth.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

  ses.webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: Object.assign({}, details.responseHeaders, {
      'Content-Security-Policy': [CSP]
    }) });
  });

  /* deny every permission, and say so rather than failing silently */
  ses.setPermissionRequestHandler((_wc, permission, cb) => {
    log('permission denied: ' + permission);
    cb(false);
  });
  ses.setPermissionCheckHandler(() => false);
}

function createWindow(brand) {
  hardenSession();
  const saved = (store.readSettings().window) || {};
  win = new BrowserWindow({
    width: saved.width || DEFAULTS.width,
    height: saved.height || DEFAULTS.height,
    x: Number.isInteger(saved.x) ? saved.x : undefined,
    y: Number.isInteger(saved.y) ? saved.y : undefined,
    minWidth: MIN.width,
    minHeight: MIN.height,
    frame: false,
    show: false,
    backgroundColor: '#101215',
    title: brand.name,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      /* middle-click otherwise asks Electron for a new window; the feature is
         not used anywhere in this app, so it is switched off rather than
         handled (Electronegativity AUXCLICK_JS_CHECK). */
      disableBlinkFeatures: 'Auxclick',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  if (saved.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadFile(UI);

  const tellState = () => {
    if (win && !win.isDestroyed()) win.webContents.send('win:state', { maximized: win.isMaximized() });
  };
  win.on('maximize', tellState);
  win.on('unmaximize', tellState);
  win.webContents.on('did-finish-load', tellState);

  /* remember where it was, without writing on every pixel of a drag */
  let t = null;
  const later = () => { clearTimeout(t); t = setTimeout(saveBounds, 400); };
  win.on('resize', later);
  win.on('move', later);
  win.on('close', () => { clearTimeout(t); saveBounds(); });
  win.on('closed', () => { win = null; });

  /* a launcher has one window and opens links in the real browser */
  /* PARSE, do not pattern-match.  A regex anchored at the scheme still admits
     shapes the OS handler may treat differently, so the URL is parsed and the
     protocol compared exactly.  https only: nothing in this app has a reason to
     hand the OS an http link, and openExternal will launch whatever handler the
     scheme is registered to. */
  const openSafely = (url) => {
    let u;
    try { u = new URL(String(url)); } catch { return; }
    if (u.protocol !== 'https:') return;
    shell.openExternal(u.href);
  };
  win.webContents.setWindowOpenHandler(({ url }) => {
    openSafely(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) { e.preventDefault(); openSafely(url); }
  });
}

/* ── the IPC surface ──────────────────────────────────────────────────────
   Every handler is wrapped so a bad argument comes back as { ok:false } and
   never as an unhandled rejection in the renderer.                        */

function ok(fn) {
  return (...args) => {
    try { return { ok: true, value: fn(...args) }; }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  };
}

/* the async twin of ok(): a handler that awaits still has to answer with an
   envelope rather than with a promise wrapped in one */
function okAsync(fn) {
  return async (...args) => {
    try { return { ok: true, value: await fn(...args) }; }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  };
}

function ownerOf(e) { return BrowserWindow.fromWebContents(e.sender); }

function wireIpc() {
  ipcMain.on('win:minimize', (e) => { const w = ownerOf(e); if (w) w.minimize(); });
  ipcMain.on('win:maximize', (e) => {
    const w = ownerOf(e); if (!w) return;
    if (w.isMaximized()) w.unmaximize(); else w.maximize();
  });
  ipcMain.on('win:close', (e) => { const w = ownerOf(e); if (w) w.close(); });
  ipcMain.on('win:is-maximized', (e) => { const w = ownerOf(e); e.returnValue = !!(w && w.isMaximized()); });

  /* BOOT IS SYNCHRONOUS, and only boot.  The library is markup that other
     code reads at load, so the rows have to be real before the first paint;
     one small JSON read is cheaper than making the whole shell async. */
  ipcMain.on('instances:boot', ok0((e) => {
    const s = store.readSettings();
    e.returnValue = { seeded: !!s.seeded, libKb: s.libKb || 0, items: store.list() };
  }));
  ipcMain.on('instances:seed', ok0((e, records) => {
    e.returnValue = store.seed(records);
  }));

  ipcMain.handle('instances:list', ok(() => store.list()));
  ipcMain.handle('instances:get', ok((_e, id) => store.get(id)));
  ipcMain.handle('instances:create', ok((_e, rec) => store.create(rec)));
  ipcMain.handle('instances:update', ok((_e, id, patch) => store.update(id, patch)));
  ipcMain.handle('instances:remove', ok((_e, id) => store.remove(id)));
  ipcMain.handle('instances:duplicate', ok((_e, id, name) => store.duplicate(id, name)));

  ipcMain.handle('settings:get', ok(() => store.readSettings()));
  ipcMain.handle('settings:set', ok((_e, patch) => store.writeSettings(patch)));

  ipcMain.handle('shell:open-root', ok(() => { shell.openPath(store.root); return store.root; }));

  /* ── sign-in ────────────────────────────────────────────────────────────
     FOUR CALLS AND ONE EVENT, and not one of them can return a token: the
     only account shape that crosses here is AccountStore.publicOf(), the
     handshake is addressed by an opaque flow id, and the device code the
     poll runs on never leaves msauth.js.                                  */
  ipcMain.handle('auth:status', ok(() => auth.status()));
  ipcMain.handle('auth:begin', okAsync(() => auth.begin()));
  ipcMain.handle('auth:cancel', ok((_e, flowId) => auth.cancel(String(flowId || ''))));

  ipcMain.handle('accounts:list', ok(() => accounts.list()));
  ipcMain.handle('accounts:activate', ok((_e, id) => accounts.activate(String(id || ''))));
  ipcMain.handle('accounts:remove', ok((_e, id) => accounts.remove(String(id || ''))));

  /* ── the game ───────────────────────────────────────────────────────────
     EIGHT CALLS AND THREE EVENTS.  Every one of them names an instance or a
     Minecraft version and nothing else: there is no channel here that takes a
     path, a url, a command line or a token, because the renderer has no
     business producing any of those.  The version id is matched against a
     pattern in mc/paths.js before it becomes a folder name, the instance id
     against the same slug rule store.js uses, and the download hosts are an
     allow list in mc/install.js.

     THE EVENTS GO ONE WAY: game:progress (file counts and byte counts),
     game:log (a line of the child's stdout or stderr) and game:exit (a
     number).  Nothing about the session crosses them.                      */
  ipcMain.handle('game:versions', okAsync((_e, force) => game.versions(!!force)));
  /* PHASE 4.  Two more calls, and the same rule holds: they name a loader out
     of a fixed set of four and a Minecraft version that mc/paths.js's pattern
     has to accept, and nothing else.  The maven hosts they reach are the
     allow-list in mc/loaders.js, unioned into mc/install.js's — a loader
     profile is still a document a machine that is not this one wrote. */
  ipcMain.handle('game:loader-versions', okAsync((_e, loader, mc) => game.loaderVersions(String(loader || ''), String(mc || ''))));
  ipcMain.handle('game:install-loader', okAsync((_e, id, loader, lver) => game.installLoader(String(id || ''), String(loader || ''), String(lver || ''))));
  ipcMain.handle('game:java', okAsync((_e, force) => game.javaList(!!force)));
  ipcMain.handle('game:java-for', okAsync((_e, id) => game.javaFor(String(id || ''))));
  ipcMain.handle('game:status', okAsync((_e, id, ver) => game.status(String(id || ''), String(ver || ''))));
  ipcMain.handle('game:install', okAsync((_e, id, ver) => game.install(String(id || ''), String(ver || ''))));
  ipcMain.handle('game:play', okAsync((_e, id, opts) => game.play(String(id || ''), opts && typeof opts === 'object' ? opts : {})));
  ipcMain.handle('game:cancel', ok((_e, id) => game.cancel(String(id || ''))));
  ipcMain.handle('game:kill', ok((_e, which) => game.kill(String(which || ''))));
  ipcMain.handle('game:running', ok(() => game.running()));

  /* ── content ────────────────────────────────────────────────────────────
     PHASE 5.  SIX CALLS, and the rule is unchanged: an instance id, a content
     kind out of {mod, resourcepack, shader}, a Modrinth project id and a
     filename that the main process itself produced.  There is NO channel here
     that takes a url — install() names a plan this process minted and cached,
     so the only download that can happen is one the user was shown first.

     THE FILENAME ON toggle/remove IS STILL NOT A PATH.  It is matched against
     a fresh readdir of that instance's own folder and the entry's own name is
     what gets renamed or deleted, on top of the pattern and the containment
     check in mc/paths.js.

     MODPACKS ARE REFUSED BY NAME rather than half-implemented — content.js
     throws a sentence saying why. */
  ipcMain.handle('content:list', okAsync((_e, id, kind) => game.contentList(String(id || ''), String(kind || 'mod'))));
  ipcMain.handle('content:plan', okAsync((_e, id, project, kind) => game.contentPlan(String(id || ''), String(project || ''), String(kind || 'mod'))));
  ipcMain.handle('content:install', okAsync((_e, id, planId) => game.contentInstall(String(id || ''), String(planId || ''))));
  ipcMain.handle('content:enable', okAsync((_e, id, kind, file, on) => game.contentSetEnabled(String(id || ''), String(kind || 'mod'), String(file || ''), !!on)));
  ipcMain.handle('content:remove', okAsync((_e, id, kind, file) => game.contentRemove(String(id || ''), String(kind || 'mod'), String(file || ''))));
  ipcMain.handle('content:updates', okAsync((_e, id, kind) => game.contentUpdates(String(id || ''), String(kind || 'mod'))));
}

/* The app log. Status codes and identifiers only — see the header of
   msauth.js for why nothing that is a credential is ever passed in here. */
function logLine(line) { console.log(line); }

function toWindow(payload) {
  if (win && !win.isDestroyed()) win.webContents.send('auth:event', payload);
}

/* the game's three event channels, named by the caller */
function toWindowOn(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/* the sync handlers answer through e.returnValue, so they need their own
   wrapper: a throw with no answer hangs the renderer */
function ok0(fn) {
  return (e, ...args) => {
    try { fn(e, ...args); }
    catch (err) { e.returnValue = null; }
    if (e.returnValue === undefined) e.returnValue = null;
  };
}

const single = app.requestSingleInstanceLock();
if (!single) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

  app.whenReady().then(async () => {
    const brand = await loadBrand();
    app.setName(brand.name);
    store = new Store(path.join(app.getPath('appData'), brand.name));
    accounts = new AccountStore(store.root, safeStorage, logLine);
    const cfg = authConfig.resolve(store.root);
    logLine('auth: ' + (cfg.live
      ? 'client id loaded from ' + cfg.source + ', scope "' + cfg.scope + '"'
      : 'DEMO MODE — ' + cfg.why + '. The sign-in screen runs against a local stub and signs nobody in.'));
    if (!accounts.canPersist) logLine('auth: OS encryption is unavailable, so a sign-in will not be remembered after this run');
    auth = new Auth({ config: cfg, accounts: accounts, emit: toWindow, log: logLine });
    auth.schedule();
    game = new Game({ store: store, accounts: accounts, emit: toWindowOn, log: logLine, userAgent: brand.userAgent });
    logLine('net: identifying as ' + (brand.userAgent || 'the fallback user-agent in mc/net.js'));
    wireIpc();
    createWindow(brand);
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(brand); });
  });

  /* A GAME THAT IS STILL RUNNING IS NOT OURS TO ORPHAN.  Closing the launcher
     takes the child with it, so a killed launcher does not leave a Minecraft
     with nothing reading its output. */
  app.on('before-quit', () => { if (game) game.killAll(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
