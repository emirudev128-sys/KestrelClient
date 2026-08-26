# kestrel-hud

The in-game half of Kestrel. A Fabric mod that draws the HUD the launcher's HUD screen configures.

    cd client-mod
    gradle build          # -> build/libs/kestrel-hud-<version>.jar

Needs a **JDK 21** (not a JRE) and Gradle 8. There is no wrapper checked in; use a Gradle 8.x you
already have. Loom downloads and remaps Minecraft on the first build, which takes a couple of
minutes; after that it is seconds.

## Why this is a separate project

A launcher cannot draw inside the game. It is a different process, and it exits or hides the moment
the game starts. Anything on screen while you are playing has to run inside that JVM — which means
Java, Fabric, and a build system none of the rest of Kestrel needs. That is the whole reason this
folder is not part of the Electron app, and why `electron-builder.yml`'s allow-list does not ship it.

## The contract

The launcher owns the settings. This mod owns the drawing. What crosses between them is one file:

    <instance>/minecraft/config/kestrel-hud.json

```json
{
  "version": 1,
  "elements": {
    "fps":    { "on": true, "x": 1.0, "y": 1.0 },
    "coords": { "on": true, "x": 1.0, "y": 5.0 }
  }
}
```

`x` and `y` are **percentages of the screen**, not pixels, so a HUD arranged at 1280x800 in the
launcher lands in the same visual place on a 1440p monitor rather than in the top-left eighth of it.

**This mod has no settings screen and is not getting one.** Two places to change one setting is how
they end up disagreeing, and the launcher already has the better screen for it — it can show a
preview at a real window size without the game running. This side reads and never writes.

**A missing or unreadable config is not an error.** The mod gets installed into instances the
launcher has never written a config for. Crashing the game over an absent file would be a worse
failure than the one it prevents, so absent means defaults and unparseable means defaults plus a
line in the log.

## What it does not do

**No network. No plugin channel. No packet handler.** Kestrel's claim is that it never talks to a
game server and so has nothing to disclose, and a client mod is exactly where that claim could
quietly stop being true — mods register plugin channels routinely and a HUD has no business doing
so. This one reads a file at startup and draws text. A server cannot tell it is there.

**No mixins.** It renders through Fabric API's `HudRenderCallback`. A mixin rewrites someone else's
class at load time and is the usual reason a mod breaks on a Minecraft update; nothing here needs
one yet, and the day something does, that is a decision to take deliberately.

## The typeface

The HUD draws in **Azeret Mono**, shipped inside the jar at
`assets/kestrel-hud/font/` and declared as a Minecraft TTF font provider.

**Why a font at all.** Minecraft's own is a bitmap: one weight, one size, and
digits whose width changes with their value — so a frame counter jitters
sideways while you read it. Monospace fixes that, because `240` and `111` are
the same width.

**Why this one.** It is the launcher's `--font-mono`. `ui/styles/app.css`
already states the rule — *"figure columns: mono, per the tabular rule; the
face belongs to the column"* — and a HUD is nothing but machine values. The
same rule that governs a column of numbers in the launcher governs these.

**Weight.** The jar ships a static **Bold (700)** instance, cut from the
variable font with `fontTools.varLib.instancer`. This matters more than it
sounds: the variable file's default instance is **Thin (100)**, so a TTF
provider pointed straight at it renders the lightest weight in the family —
which is what the first build did. Minecraft's own `withBold` is synthetic, a
second copy of each glyph offset by a pixel, and at 9px that reads as blur
rather than weight. A real 700 cut is sharper and smaller.

**Licence.** Azeret Mono is under the SIL Open Font License 1.1, and `OFL.txt`
travels with it inside the jar as that licence requires. Its copyright line
declares no Reserved Font Name, so instancing it is a permitted modification
and the result may still be called Azeret Mono. It is third-party and
keeps its own terms; the rest of this repository is all rights reserved. The
OFL permits bundling in this way, including in a product that is not itself
open source, and forbids selling the font on its own — which nothing here
does.

## State

Two elements — `fps` and `coords`. The launcher's HUD screen models twelve.

Verified on 1.21.4 with Fabric loader 0.19.3 and fabric-api 0.119.4: the jar builds, the loader
lists it, it reads its config (`Kestrel HUD: 2 element(s) configured`) and the game reaches its menu
with no exception. **Not verified: the pixels.** The HUD draws only inside a world, and nothing can
drive Minecraft into one unattended — so that it renders correctly is still something a person has
to look at.

## Versions

Pinned in `gradle.properties`, each read off Fabric's own maven rather than copied from a template.
Loom is pinned to the line contemporary with the Minecraft version, not the newest: loom 1.17 is
built against Gradle 9.5 and will not load under Gradle 8. Newest is not a version policy.
