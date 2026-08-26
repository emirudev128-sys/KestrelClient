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
| **NeoForge** | 1.21.1 installed and merge-verified; not launched (needs Java 21) |
| **Mods** | Sodium installed through the UI, launched, `- sodium 0.2.0+build.4` in the log |
| **Dependencies** | REI planned 3 and installed 3, each hash-checked |
| **Disable** | `.jar.disabled` — next launch logged 56 mods instead of 57 |
| **Accounts** | Microsoft device-code flow, real client id, tokens never leave the main process |

## Architecture

    main.js        window, IPC, session hardening (CSP, permission denial)
    preload.js     the contextBridge - named functions only
    store.js       %APPDATA%/Kestrel - instances as folders
    msauth.js      the six-request Microsoft chain, main process only
    accounts.js    accounts.json, credential half sealed with safeStorage
    auth-config.js client id resolution + the Azure/Mojang procedure
    mc/            paths, net, unzip, version, install, java, launch, loaders, content
    ui/            the renderer - index.html, styles/, scripts/, icons/

**Security posture.** `contextIsolation`, `nodeIntegration: false`, `sandbox: true`, a CSP with no
inline script and no eval, all permissions denied, an exact-match download host allow-list, SHA
verification on every downloaded file, zip-slip guards, path containment proved rather than assumed,
and no token on a command line (the launcher refuses rather than leaking on Java 8).

## Verify it yourself

    node tools/clicktest.mjs      every control, does it respond
    node tools/audit.mjs ui       the design standard
    node tools/phase3check.mjs    download/launch security assertions (24)
    node tools/phase4check.mjs    loader merge rules (60)
    node tools/phase5check.mjs    content install
    bash  tools/scan.sh           Electronegativity + semgrep + npm audit + token containment

Stronger than any of those: run it with **Wireshark** open. It talks to Microsoft, Mojang, Modrinth
and nothing else.

## Not finished

- **Modern Forge (1.13+) and NeoForge** need the installer's processors run — a JVM per processor
  and a JDK, not a JRE. Installs return `partial: true` and `play()` refuses with
  `LOADER_INCOMPLETE` rather than crashing. Reasoning in `mc/loaders.js`, "THE FORGE PROBLEM".
- **Modpacks** are not installable. `kindOf('modpack')` throws with the reason.
- **Update checking reports but does not apply** — installing the newer version replaces the file.
- **Mojang has not approved the Azure application** for the Minecraft scopes, so the final token
  exchange will 403 until they do. Form: https://aka.ms/mce-reviewappid
- The client mod (the Lunar-style in-game tweaks) does not exist. The Tweaks and HUD screens
  configure it; something has to draw it. That is a Fabric mod, a separate Java project.

## Where things stand (last session)

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

1. **The client mod** — the Lunar-style in-game tweaks. The Tweaks and HUD screens configure it,
   but nothing draws it yet. That is a Fabric mod, a separate Java project, and it is the piece
   that makes this a *client* rather than a launcher.
2. **Modern Forge / NeoForge** — needs the installer processors run (a JVM per processor, and a
   JDK not a JRE). See "THE FORGE PROBLEM" in `mc/loaders.js`.
3. **Packaging** — electron-builder for an installer to distribute from a website.
4. **Modpack install** — `.mrpack` and CurseForge zips.

## How to work on this

Small change: build it, run `node tools/clicktest.mjs`, fix, re-test. ~15-20 min.
Anything touching the design system, a new component, or multiple window sizes: 40 min, say so up
front. Do not attach a judging pass unless asked. Always run `bash tools/scan.sh` after touching
`main.js`, `preload.js` or anything in `mc/`.
