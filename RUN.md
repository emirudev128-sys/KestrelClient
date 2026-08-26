# Running Kestrel

## Quickest — just open it

    kestrel.html

A single self-contained file. Double-click it, or open it in any browser. Everything works:
routing, both themes, all four palettes, the HUD editor, the tweak settings, create and import,
and the Modrinth browser (live results locally; a bundled set when the page cannot reach the net).

## The real source

`ui/` is the build, split the way it should stay:

    ui/index.html          one document, screens shown and hidden by the hash router
    ui/styles/tokens.css   the entire design system - every colour, size and duration
    ui/styles/app.css      components and screens
    ui/scripts/brand.js    the product name as a value, plus the string table
    ui/scripts/app.js      routing and interaction state
    ui/icons/symbols.svg   the icon set
    ui/package.json        declares the scripts as ES modules, so main.js can import brand.js

Serve it (the scripts are ES modules, so `file://` will not work for this version):

    npx serve ui

`kestrel.html` is generated from `ui/` — if you change the source, regenerate rather than editing it.

## Screens

    #play  #instances  #instance  #mods  #new  #import  #tweaks  #hud
    #presets  #servers  #accounts  #settings  #appearance  #states

`#states` holds the unhappy paths: empty, downloading, failed, no-java, offline, running, crashed.

## Renaming the product

One edit. `ui/scripts/brand.js`:

    export const BRAND = { name: 'Kestrel', version: '0.5.0' };

The folder path, the window title, the credential key and every string derive from it. There is a
substitution test that renames the app and greps all 18 routes to prove nothing hardcodes it.

## The desktop app

    npm start

Electron, no bundler and no build step — the same `ui/` files the browser gets.

    main.js         the window (frameless, 1280x800, remembers where it was) and the IPC handlers
    preload.js      the contextBridge: window.kestrel, and nothing else
    store.js        %APPDATA%/Kestrel — instances/<slug>/instance.json, settings.json
    msauth.js       the Microsoft sign-in chain, all six requests, main process only
    accounts.js     %APPDATA%/Kestrel/accounts.json, the credential half sealed by safeStorage
    auth-config.js  the one place the Azure client id comes from
    auth.config.example.json  the placeholder it ships with; copy it to auth.config.json
                    (gitignored, and excluded from a packaged build) and put your own id in

`contextIsolation` is on and `nodeIntegration` is off, so the page has no `require`, no `fs` and
no `ipcRenderer`. Everything privileged happens in the main process, and every record and id
crossing the bridge is re-validated there before it goes near a path.

On first run the store is seeded from the library in `ui/index.html`, so the app opens holding the
23 instances the prototype shipped with — as 23 real folders. After that the markup fixture is
only ever used by the browser build.

## Signing in

`#accounts` runs the OAuth 2.0 device authorisation grant — the app shows a short code, you type it
on Microsoft's page in your own browser, and the launcher polls. No token, refresh token or device
code ever reaches the renderer: the whole chain is in `msauth.js`, and the page is handed
`{ id, name, uuid, skinUrl, active, expiresAt, demo }` and nothing else. The refresh token is
sealed with `safeStorage` (DPAPI on Windows) into `accounts.json`; if the OS has no keystore
available the launcher writes nothing rather than writing it in the clear, and says so on screen.

**Out of the box it is in demo mode**, because there is no Azure client id in `auth.config.json`.
The device-code screen runs its real states — code, waiting, cancel, expiry — against a local stub
and signs in a profile marked `Demo` that cannot launch anything. The screen says all of this in
the sign-in block. Two knobs make the unhappy paths reachable:

    KESTREL_DEMO_APPROVE=never KESTREL_DEMO_EXPIRES=20 npm start    walk the expiry path
    KESTREL_DEMO_APPROVE=3 npm start                                sign in after three seconds

To make it real, register **your own** Azure application (public client flows on, personal accounts
only, no secret), get Mojang to approve it for the Minecraft scopes, and put its id in
`auth.config.json` or `KESTREL_MSA_CLIENT_ID`. The header of `auth-config.js` is the whole
procedure. The same screen then drives the real handshake with no code change.

`ui/` still runs over plain http exactly as above. `window.kestrel` is absent there, the bridge
layer in `app.js` returns early, and the library stays the fixture in the markup — which is what
`kestrel.html` and `tools/clicktest.mjs` exercise.

## Packaging it

    npm run icon        build/icon.ico, drawn from the brand mark in ui/icons/symbols.svg
    npm run pack        dist/win-unpacked/Kestrel.exe - no installer, about a minute
    npm run dist        dist/Kestrel-0.5.0-Setup.exe
    npm run packcheck   assert what actually came out

`electron-builder.yml` is the whole configuration and it is commented. Three things in it are
decisions rather than defaults:

**What ships is an allow-list**, not everything-minus-the-scratch. A new source directory has to be
added to `files:` or it will not be in the build. That is the intended failure: a missing file is
loud and an extra one is silent, and the extra one here would be `auth.config.json`.

**The packaged build carries no Azure client id.** It is excluded deliberately, so a build straight
off this repository runs in demo mode and says so. To sign in from an installed copy, put your own
`auth.config.json` in `%APPDATA%\Kestrel\` - `auth-config.js` looks there before it looks beside
itself, for exactly this reason.

**The uninstaller does not touch `%APPDATA%\Kestrel`.** That folder is the downloaded game, the
mods and the worlds, and it is named after the product, so NSIS's "clean up application data" would
have matched it exactly. `deleteAppDataOnUninstall: false` is load-bearing.

It installs per-user and so never asks for an administrator. It is **not code signed**: SmartScreen
will warn on first run and will keep warning until the binary is signed by a certificate that has
built up reputation. That is a certificate purchase, not a configuration change.

`npm run packcheck` reads the built archive and the executable back and asserts about them - that
every file in `mc/` and `ui/` made it in, that the harness and the build history did not, that the
version in `package.json` and the one in `brand.js` agree, that the icon bytes in the `.exe` are
the ones `npm run icon` produced, and that the client id configured on this machine appears nowhere
in either the archive or the 233 MB executable, searched byte by byte rather than by filename.

## Tools

    node tools/phase3check.mjs                     zip-slip, path guard, hash failure, argfile quoting
    node tools/phase4check.mjs                     the inheritsFrom merge rules + the four loader services
    node tools/phase4check.mjs install             ... and really install Fabric on 1.16.5
    node tools/phase4check.mjs launch              ... and really launch it
    node tools/phase4check.mjs modern              ... plus NeoForge 1.21.1 and Forge 1.20.1: run the
                                                   installer processors and launch the patched jar (88)
    node tools/audit.mjs ui                        static check against the design standard
    UI_ROOT=ui node tools/shootui.mjs out play      screenshot a screen
    UI_ROOT=ui VW=2560 VH=1600 node tools/shootui.mjs big play    at another window size
