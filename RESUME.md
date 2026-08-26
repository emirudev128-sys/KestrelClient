# Kestrel — where the project stands

A privacy-first Minecraft launcher. Electron shell, plain HTML/CSS/JS renderer, no framework and no
build step. **It downloads and launches Minecraft, installs mod loaders, and installs mods.**

    npm start

## What works, verified end to end on this machine

| | proof |
|---|---|
| **Vanilla launch** | 1.8.9 — 770 files, 146 MB, 19.8 s to running. Second launch: 0 bytes, 0.8 s. |
| **Fabric** | 1.16.5 launched — `Loading Minecraft 1.16.5 with Fabric Loader 0.19.3` |
| **Forge (legacy)** | 1.8.9 launched — `Forge Mod Loader version 11.15.1.2318 loading` |
| **NeoForge** | 1.21.1 **launched** — processors run, patched jar built, loaded into a world on Java 21 |
| **Forge (modern)** | 1.20.1 47.4.23 installed — 6 processors run, 2 output digests verified |
| **Mods** | Sodium installed through the UI, launched, `- sodium 0.2.0+build.4` in the log |
| **Dependencies** | REI planned 3 and installed 3, each hash-checked |
| **Disable** | `.jar.disabled` — next launch logged 56 mods instead of 57 |
| **Accounts** | Microsoft device-code flow, real client id, tokens never leave the main process |
| **Client mod** | `kestrel-hud` builds and loads in 1.21.4 Fabric — `Kestrel HUD: 2 element(s) configured` |
| **HUD wiring** | The screen's layout persists and reaches the mod: 11 elements, 6 anchors, scales intact |
| **Modpacks** | Fabulously Optimized (.mrpack) planned and installed — 50 files sha1-checked, 55 overrides |
| **Packaging** | `Kestrel-0.5.0-Setup.exe`, 106 MB. The packaged app launches and runs out of its own asar. |

## Architecture

    main.js        window, IPC, session hardening (CSP, permission denial)
    preload.js     the contextBridge - named functions only
    store.js       %APPDATA%/Kestrel - instances as folders
    msauth.js      the six-request Microsoft chain, main process only
    accounts.js    accounts.json, credential half sealed with safeStorage
    auth-config.js client id resolution + the Azure/Mojang procedure
    mc/            paths, net, unzip, version, install, java, launch, loaders, content,
                   processors (Forge/NeoForge installer processors), modpack (.mrpack)
    ui/            the renderer - index.html, styles/, scripts/, icons/
    client-mod/    the Fabric mod: reads config/kestrel-hud.json, draws the HUD
    electron-builder.yml  what ships, as an allow-list, and the NSIS options
    build/         icon.ico and icon.png, generated from the mark in the icon set

**Security posture.** `contextIsolation`, `nodeIntegration: false`, `sandbox: true`, a CSP with no
inline script and no eval, all permissions denied, an exact-match download host allow-list, SHA
verification on every downloaded file, zip-slip guards, path containment proved rather than assumed,
and no token on a command line (the launcher refuses rather than leaking on Java 8).

## Verify it yourself

    node tools/clicktest.mjs      every control, does it respond
    node tools/audit.mjs ui       the design standard
    node tools/phase3check.mjs    download/launch security assertions (33)
    node tools/phase4check.mjs    loader merge rules (60)
    node tools/phase4check.mjs modern   ... and really install + launch NeoForge 1.21.1 (83)
    node tools/phase5check.mjs    content install
    node tools/hudcheck.mjs       the HUD contract across markup, JS and Java (31)
    node tools/packcheck.mjs      what the packaged build actually contains (47)
    bash  tools/scan.sh           Electronegativity + semgrep + npm audit + token containment

Stronger than any of those: run it with **Wireshark** open. It talks to Microsoft, Mojang, Modrinth
and nothing else.

## Not finished

- **Update checking reports but does not apply** — installing the newer version replaces the file.
- **Mojang has not approved the Azure application** for the Minecraft scopes, so the final token
  exchange will 403 until they do. Form: https://aka.ms/mce-reviewappid
- Only two HUD elements are DRAWN (fps, coords). The screen arranges eleven and the launcher now
  writes all eleven to the config; the mod ignores the other nine. That is the next piece and it is
  Java.
- The HUD has still not been seen on screen. It draws only in a world.
- The HUD has not been seen ON SCREEN. It draws only in a world, and nothing can drive Minecraft
  into one unattended — what is proved is that it loads, parses its config and registers its
  render callback without crashing.

## Where things stand (last session)

**Packaging is done.** `npm run icon && npm run dist` produces `dist/Kestrel-0.4.2-Setup.exe`, 106 MB,
per-user NSIS, unsigned. `electron-builder.yml` holds the whole configuration and the reasoning.
The packaged build was launched and inspected live over CDP rather than assumed: the renderer loads
from `app.asar/ui/index.html`, `brand.js` imports as an ES module from *inside* the archive (the
`readFileSync` fallback in `main.js` was never reached), 969 CSS rules resolve, and the instance
list renders from the real store. What was NOT done: the installer has not been run through a clean
install on a fresh machine, and nothing is code signed.

**`package.json` was wrong on three counts** and is fixed. It declared `"license": "ISC"` against an
all-rights-reserved LICENSE, it was still named `mc-launcher`, and it carried Playwright as a
*runtime* dependency — which would have put the whole browser automation stack inside the
installer. There are now **zero runtime dependencies**, and `packcheck` asserts it.

**The version is in two places now** — `package.json` (electron-builder reads it) and `BRAND.version`
(the UI reads it). Bump both. `packcheck` fails if they diverge, which is the only reason two
places is tolerable.

**A packaged build deliberately carries no client id** and starts in demo mode. `auth.config.json`
is excluded from `files:`, so an installer built from this repo cannot leak it. To sign in from an
installed copy, put `auth.config.json` in `%APPDATA%\Kestrel\` — `auth-config.js` looks there
first, which is what that ordering was always for.

**Modpacks install, and the Import screen is wired to it.** `mc/modpack.js` reads a `.mrpack`,
plans it, and installs it as a new instance. The picker is opened in the MAIN process — `pack.choose()`
takes no argument at all, so the renderer cannot name a file to read any more than it can name a url
to download — and `pack.install()` hands back only the plan id. Verified: Fabulously Optimized
installed end to end (50 files, 55 overrides), and a bogus plan id round-trips through IPC and comes
back refused. NOT covered by a test: the `dialog.showOpenDialog` seam itself, which needs a human to
click. CurseForge `.zip` is a different manifest and is refused by name.

**Modern Forge and NeoForge work now.** `mc/processors.js` runs the installer's processors — a JVM
per processor, in order, with the `data` block resolved for the client side. NeoForge 1.21.1 was
installed and **launched into a world**; Forge 1.20.1 installs and its declared output digests are
verified. Three things worth knowing before touching it:

- **The ordering is load-bearing.** The processors patch the vanilla client jar, so they cannot run
  in `installLoader` — that is called *before* the vanilla install, because the profile is what
  names the libraries to fetch. They run at the end of `Game.install()`. `pwarn` is cleared only if
  a processor actually ran, and `pjar` on the record is how a later session finds the installer.
- **NeoForge publishes no output digests at all** — zero across its ten processors, where Forge
  1.20.1 declares two. So for NeoForge the six JVMs exit 0 and nothing has verified they wrote
  anything. `runProcessors` therefore checks the `PATCHED` artefact exists and is non-empty
  regardless, and the log says which case it is in rather than implying verification happened.
- **`-DignoreList` had to be corrected at launch.** Modern Forge/NeoForge run through
  BootstrapLauncher, which moves everything on the classpath to the MODULE path except the
  filenames in that list. Their profiles write `${name}.jar`, guessing the launcher names the game
  jar after the version being launched. This one does not — `jar` means the client jar is the
  PARENT's, so `1.21.1.jar` went on the classpath, was not ignored, and collided with the patched
  `minecraft` module: `ResolutionException: Modules _1._21._1 and minecraft export package
  net.minecraft.data`. `mc/launch.js` appends the real basename to the list.

**The User-Agent is fixed.** It used to send `Kestrel/1.0 (+https://github.com/kestrel-launcher)` —
an organisation that does not exist, and a version the product had not been on for months. It now
sends `Kestrel/0.4.2 (+https://github.com/emirudev128-sys/KestrelClient)`, built once by
`BRAND.userAgent` in `brand.js` and handed to `mc/net.js` through `Game` at startup, so the version
cannot drift again. `BRAND.repo` still derives its repository half from the product name — the
rename-is-one-edit property survives — but the OWNER is written out, because a GitHub account is not
a product name and deriving it is what produced a plausible URL nobody could visit. `net.js` keeps a
versionless fallback for the harness scripts, which require it with no Electron and no brand.
Nine assertions in `phase3check` cover it, including the wiring, not just the pieces.

**Repo:** https://github.com/emirudev128-sys/KestrelClient — pushed, one commit, `main`.
**Licence:** all rights reserved, source-available for verification only. NOT open source.
Do not reintroduce MIT. The history was deliberately squashed so no MIT commit exists.

**Azure client id** `c71ceea0-f906-468f-bad6-962ccbf3e835` is in `auth.config.json`, which is
**gitignored**. `auth.config.example.json` ships with a placeholder. Sign-in reaches Microsoft and
Xbox Live but the final Minecraft exchange will 403 until Mojang approves the app at
https://aka.ms/mce-reviewappid — the review form was submitted with `localhost` first and should be
resubmitted with the repo URL.

**Never commit:** the real `auth.config.json`, anything under `%APPDATA%/Kestrel`, the user's
Minecraft username (fixture data says `Player`), or local paths containing the Windows username.
`shots/`, `ref/`, `variants/` and `kestrel.html` are gitignored; `docs/screenshots/` is not, and
holds the three README images.

**Demo data:** nine instances named by version and mod setup (`1.21.4 Fabric`, `1.20.1 Fabric copy`,
`1.8.9 Forge`, `All the Mods 10`, …). They are deliberately repetitive — the `1.20.1` pair is
identical but for the name. Do not make each one demonstrate a different feature; that failure mode
has been caught five times and is written up in `docs/rubric.md`.

## Sensible next steps

1. **Persist the HUD screen's layout.** Everything downstream is done: `mc/hud.js` validates and
   writes `config/kestrel-hud.json` on every launch, and the mod reads it. The renderer just never
   saves — its layout lives in `ST` as undo state and dies with the screen. Then the other nine
   elements in the mod.
2. **CurseForge packs** — `.mrpack` is done; their `.zip` export is a different manifest, needs an
   API key, and has a redistribution story worth reading before it is written.
3. **Code signing** — SmartScreen warns on every first run until the binary is signed by a
   certificate with reputation behind it. That is a purchase, not a config change.

## How to work on this

Small change: build it, run `node tools/clicktest.mjs`, fix, re-test. ~15-20 min.
Anything touching the design system, a new component, or multiple window sizes: 40 min, say so up
front. Do not attach a judging pass unless asked. Always run `bash tools/scan.sh` after touching
`main.js`, `preload.js` or anything in `mc/`.
