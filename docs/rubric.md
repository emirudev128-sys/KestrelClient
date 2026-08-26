# Kestrel — build rubric

The critic checks against this. Every item is checkable from a screenshot or a grep.
Sourced from a Reddit-mined ranking of 3.2M posts (JCarterJohnson/vibecoded-design-tells),
a ~100-item tell catalog (claudiusararu/unslop-ui-skill), and library ground-truth docs.

## A. Hard fails — any one of these loses the round

1. Any gradient. Especially `bg-gradient-to-*`, `linear-gradient(135deg` on a hero or button,
   and `bg-clip-text` gradient text. Repetition across unrelated elements is the real tell.
2. Any emoji, anywhere — nav, labels, headings, buttons, empty states. Sparkles (✨) worst of all.
3. The AI-purple family: #6366F1 #4f46e5 #7c3aed #8B5CF6 #A855F7 #A78BFA, or any indigo/violet accent.
4. shadcn defaults: `--radius: 0.625rem` (10px); `oklch(0.97 0 0)` appearing as --secondary AND
   --muted AND --accent; `oklch(0.922 0 0)` as both --border and --input; `ring-1 ring-foreground/10`.
5. Neon glow — a 0-offset, high-blur, saturated box-shadow: `0 0 40px rgba(139,92,246,.5)`.
6. Tailwind default shadows on cards: pure black, 0 x-offset, 0.1 alpha, applied blanket.
7. A single border-radius applied to everything regardless of element size.
8. Centered hero + subtitle + two buttons (one filled, one outlined), or a card grid of exactly 3.
9. `max-w-7xl mx-auto` — a centered content column inside an application window.
10. Icon-in-a-rounded-square chip: `h-12 w-12 rounded-lg bg-primary/10` with a stroke icon inside.
11. Coloured left/top border stripe on cards (`border-left: 4px solid <accent>`).
12. A row of 3-4 identical stat tiles with round vanity numbers.
13. Pill/eyebrow badge floating above a heading.
14. Marketing copy: seamless, effortless, empower, harness, unlock, elevate, supercharge,
    "transform your", "all-in-one". Title Case On Every Heading. Em-dashes as connectors.
15. Lucide/Heroicons shipped unmodified — especially Sparkles, Zap, ArrowRight, Rocket, Shield,
    CheckCircle, all at 24px/2px stroke with no size-specific variants.
16. Cream (#faf8f4-#f5f1ea) + serif display + sage/terracotta. The "tasteful" escape hatch that
    became its own default, and it collides with Claude's look. See section C.

## B. Craft bar — the critic asks whether ours reaches these

- **Radius ladder, not a radius.** Distinct values tied to element scale (chip / input / panel /
  modal / pill). Nested radius = outer − padding.
- **Tonal elevation, no card shadows.** A surface ladder with real lightness steps (~8% apart) and
  two distinct border strengths for two distinct jobs. Shadows only for things that genuinely float.
- **Five-step text ramp** with a role for each step: ink / body / metadata / disabled / lowest.
  Body text never drops into the failing-contrast grey band on dark.
- **Type with a decision in it.** Not Inter or Geist at 400/600 with nothing between. Tracking
  scales with size — negative at display sizes, positive at 11-12px labels. Numerals tabular.
- **Non-linear spacing scale.** Dense where controls live, coarse at section boundaries.
- **One oversized moment per view.** Squint at 25%: if every region carries equal weight, fail.
  (Measured AI slop sits at a 1.33:1 density ratio across a whole page.)
- **Accent as punctuation, not fill.** One committed accent, used for state and one primary action.
  Any second accent must be >20° OKLCH hue from the first or it is one colour wearing two names.
- **One state ramp** derived from the surface ladder — not per-component hover alphas.
- **Motion tied to travel distance.** A duration ladder (~80/120/180/280ms), two easings, and
  `prefers-reduced-motion` honoured. Card hover changes border/background, not transform.
- **Optical correction.** Play triangle aligned by centroid, not bounding box (we have a Play
  button — this one is visible). Circles ~112.8% of an equal-width square. Icons aligned to
  x-height, not box.

## C. Must not read as Claude

Values below are from Anthropic's shipping stylesheets and a live DOM read, not estimates.
Any three of C1-C8 together read as Claude to a designer even under a different logo;
C1 + C2 + C5 + C6 is effectively a fingerprint.

C1. **Clay accent.** #D97757 (hue ~15deg, sat ~63%, light ~60%), or its neighbours #C96442,
    #C6613F, #C46849, or the legacy #CC785C. Any terracotta/coral primary action colour.
C2. **Warm cream ground.** #FAF9F5, #F9F9F7, #F5F4ED, #F0EEE6. Never our page background.
C3. **Yellow-green tinted neutrals.** Claude's greys all sit at hue 45-60 at low saturation --
    there is no true grey in their system. Our neutrals must not carry a warm hue.
C4. **Ink at #141413** rather than black or a cool near-black.
C5. **Warm-charcoal dark mode** #1F1E1D-#262624 with cream #F9F9F7 text. Ours is cool, and our
    text is not cream.
C6. Serif for one voice, sans for another, inside one surface.
C7. Flat unbubbled blocks alternating with filled bubbles.
C8. **A 12-ray irregular starburst mark.** Measured off the official path: exactly 12 rays, tip
    angles spaced 15.0-40.4deg against a 30deg ideal, tip-to-notch ratio ~3.24:1, 165 points and
    almost entirely straight segments -- a polygon, not a spline. No starburst, no asterisk, no
    radial mark of any ray count.
C8b. **Anthropic's corporate mark is separate and also banned:** an `A\` monogram whose backslash
     repeats the A's right leg at 21.58deg from vertical, and a wordmark that substitutes a
     backslash for the letter I. No slash-through-a-letter wordmark tricks.
C9. A large 16-24px-radius input pinned to the bottom with a hairline ring plus a very faint
    wide shadow (0 .25rem 1.25rem at 3.5% black).
C10. 12px as the default corner radius on cards, buttons and inputs.
C11. Serif display paired with humanist sans -- Styrene, Tiempos, Copernicus, or the documented
     substitute pair Lora + Poppins.
C12. Chalky desaturated earth accents: sage, dusty blue, olive, oat, clay, kraft.
C13. A resizable right-hand canvas pane with a composer pinned under a left column.
C14. Non-round variable weights (330/430/530) with optical sizing that drops in dark mode.

**Not a Claude tell, do not over-correct:** 1px hairlines carrying the layout instead of shadows.
Linear does this too and it is general high-craft practice. What makes it read as Claude is a
*warm* hairline over cream with a clay accent -- the combination, not the technique.

**Where the two avoid-lists agree:** cream + serif + earth-tone accent is simultaneously Claude's
signature and the rising "tasteful AI" default. Steer cold and neutral and both problems go away.

## D. Desktop-app bar — the launcher must not read as a web page in a window

- Panes fill and resize with the window; no scrolling marketing page, no dead grey margins.
- Lists are rows and tables, not grids of shadowed cards. A version list is a list.
- Pointer-sized targets (28-36px rows), not 44-48px touch targets. Gate large targets on
  `@media (any-pointer: coarse)` only.
- Integrated window chrome, keyboard shortcuts as first-class, a command palette.
- Real UI as its own imagery — never illustrated abstractions of the product.
- **Unhappy paths designed first**: empty, loading, downloading, error, offline, Java missing,
  partial download failure. This is where a launcher actually lives, and it is the single most
  reliable thing generated UI omits.

## E. Copy
Sentence case. Domain verbs. "Install Fabric 0.16.9", not "Effortlessly manage your modpacks".
Errors say what broke and what to do. Buttons say exactly what happens.

---

## F. Tells found in our own round-1 work

Three independent critics judged three variants blind against Linear. **All three picked ours as
better designed. All three also correctly identified ours as the AI-generated one.** None of the
tells they cited was a colour, a radius, or a shadow — sections A-C came back essentially clean.
Every tell was compositional or editorial. These are now hard fails.

**F1. The frame is a coverage checklist, not a moment.** The most damning finding, and all three
critics reached it independently:

> "Real software shows you one failure at a time; this is a requirements list rendered, not a
> state observed."
> "Six mutually unlikely states co-occur in one screenshot... This frame was composed to prove
> the rubric was satisfied."
> "Fixture-perfect state coverage: exactly one of each possible status in a 13-row table, which
> is a demo matrix, not a person's library."

A default screen shows **one ordinary moment** — a normal Tuesday, nothing wrong, one thing
maybe mid-download. Not a Java error and a failed download and a mirror retry and an offline
toggle and an idle launch ladder at once. States are designed on their own routes, screenshotted
on their own, and never stacked onto the default view to prove they exist.
*This one was caused by our own brief telling builders to design the unhappy paths. Both things
are true: design them all, show one.*

**F2. One typographic component stamped uniformly.** The tracked all-caps micro-label appeared
30+ times in one variant as the default treatment for every non-content string, and 9 times in
another "whether the section needs a header or not". A human system reserves that for one or two
roles. **Cap: the tracked-caps treatment may appear in at most two roles in the entire app.**

**F3. Invented domain vocabulary imported from adjacent genres.** "SLOT 01 · PINNED", "LAST 30 D",
"Median FPS 312", "1% low 184", "MIRROR mojang / eu-west", "PING 42 ms" — benchmark-review and
game-server-HUD nouns filling a telemetry panel with data no launcher holds. *Median FPS 312 is
also not a real Minecraft number.* Only show data the app would actually have.

**F4. Redundancy a human kills in review.** One variant printed the same four facts twice within
60 vertical pixels, and represented the running instance four separate times — which created a
real comprehension bug, since two instances read as current and it was unclear what the primary
button would launch. **No fact appears twice in one view.**

**F5. Lucide shipped unmodified**, despite being banned in the brief — named in two of three
variants, glyph by glyph, all at one size and one stroke with no size-specific variants.

**F6. The reflex accent.** Two of three variants independently landed on Tailwind teal
(#2DD4BF / #14B8A6 / #34D7C0 / #56C9D2). As one critic put it: *"the reflex substitute the moment
indigo/violet is ruled out."* Banning purple just moved everyone to the next preset. The accent
must be an actual choice with a reason, not the next swatch along.

**F7. Tabular numerals applied by pattern-match instead of by rule.** In one variant "1.2 GB to
download" rendered mono while "Update available" next to it did not — inside the same column,
repeating ~30 times. Write the rule down, then apply it without exception.

**F8. Decorative dataviz.** Six session micro-bars "with no axis, no scale, no legend and
near-identical lengths... inserted to fill panel height". A chart earns its place by encoding
something, or it does not exist.

**F9. Filled + outlined button pair sitting adjacent** (Play / Play offline). Named in the
original tell research too. Secondary actions are not outlined twins of the primary.

**F10. The same row shape reused for semantically unrelated panels.** A right rail ran
"label-left / value-right at the same ~40px pitch three times, for three semantically unrelated
panels; a designed rail would give a settings block, a history block and a disk-usage block three
different shapes."

---

## G. Round-2 residue — what still gives it away

Round 2 fixed most of section F. Three critics, sides forced B/A/A so position bias is excluded:
**ours won 3/3 on design, and was still identified as AI-made 3/3.** The remaining tells are far
narrower and all three critics converged on the same region — the instance table and the one
state on screen.

**G1. The table has no internal structure.** The single biggest one. Twelve rows at one dead-even
32px pitch, one weight, one text colour, one rule strength between every pair, running ~60% of the
frame as a single grey texture. And the data underneath it is not flat at all:

> "PLAYTIME spans 318h 44m down to 0h 38m, an 800:1 range, and nothing in the row encodes it: no
> bar, no weight step, no dimming of the dead instances, and no grouping break between 'played
> yesterday' and 'abandoned in July' even though the LAST PLAYED column already sorts on exactly
> that. The app has a non-linear spacing scale everywhere else; the table has none."

A person's library has shape. Render the shape.

**G2. One hairline doing two jobs.** `#282C31` is pixel-identical between two table rows and at the
content/rail boundary, and the surfaces either side of that boundary are the identical `#12151B`.

> "The app's most important structural boundary — 'list of instances' versus 'inspector for the
> selected instance' — is drawn with exactly the same ink as the boundary between 'Skyblock' and
> 'Sodium sandbox'. The rail does not read as a region; it reads as the table's right margin that
> happens to have text in it."

Section B has asked for two border strengths for two jobs since round 1. We shipped one.

**G3. The one non-happy state is the least-specified element on screen.** We fixed F1 by showing a
single state instead of all of them — then under-built the one we kept.

> "A bar at ~62% and a gerund. No byte count, no transfer rate, no ETA, no file counter, no pause,
> no cancel. Compare what the rest of the screen manages: the rail specifies Temurin 21.0.5, 6 GB
> of 32 GB, 1920x1080. The one place A shows a state, it says less than any other element."

Also: "Installing" floats in an ad-hoc unheaded cell that exists for one row, in a table with five
headed columns.

**G4. The tabular rule was written down and then broken in the hero.** `142 mods - 2.4 GB on disk`
is mono end to end, including the word "mods" (measured at fixed ~15.5px advances). 340px below it,
`12 more of 23 instances` is proportional. Same construction — integer plus unit noun — two faces,
same view. Rule 1 says a *column* is mono; neither of these is in a column, and rule 2 was applied
to one and not the other.

**G5. Icons were redrawn, but only partly.** The play triangle got square joins and the person
glyph an open-arc shoulder — a real redraw pass. But `server`, `sliders-horizontal`,
`panels-top-left` and `refresh-cw` are still recognisably Lucide silhouettes at one size and one
stroke, with no size-specific variants.

**G6. Compliance reads differently from design.** The sharpest observation of the round: tracked
caps land at *exactly* two roles — the F2 cap — and a critic noted this "reads as a constraint
satisfied rather than a system designed". Hitting a limit precisely is itself a tell. The fix is
not to add a third; it is to make the two that remain look chosen.

**G7. Coverage instinct relocated, not removed.** The LOADER column hits all four possible values
(Fabric, Forge, NeoForge, None) plus three Fabric versions and two Forge majors. F1 was fixed at the
level of *states*; the same instinct survives at the level of *values*.

---

## H. Round-6 standard audit — what is still present in ours

Won the design A/B 2/2 (13/13 overall). The new gate is the item-by-item standard audit, and two
critics converged on these. All are in OUR image.

**H1. F1 regressed.** The Play frame again carries several states at once: a finished session with
`exit code 0`, an unrecorded session, an in-progress download with live throughput and Pause/Cancel,
and two out-of-date loader versions. This is the third time this instinct has come back in a new
costume. It is the hardest thing in the project.

**H2. A15 — one stroke across sizes.** The ~16px folder and monitor glyphs on "Open folder" and
"Game output" carry the same ~1.5px stroke as the ~22px sidebar glyphs, so they read visibly
heavier at small size. The set is genuinely custom now — no library silhouettes survive — but the
stroke does not scale with the glyph.

**H3. F5 — facts stated twice.** `15:34` appears in "Last session ended at 15:34" and again as the
end of `Today 14:22 → 15:34`. The top-bar page title "Play" restates the selected sidebar item
"Play" about 250px to its left.

**H4. F6 — two rule breaks.**
(a) The `Older` group dims instance name, version, loader and date but leaves the playtime hours at
full white, so the faded rows shout their numbers.
(b) The numeral treatment is still not uniform: quantities get a mono, brighter, letterspaced
treatment in "13 mods, 2.4 GB", "15:34" and "exit code 0" — three different contexts, one
treatment applied by feel.

**H5. F10 — the identifying column carries no encoding.** The six pinned instance thumbnails and
the account avatar are all the same desaturated grey blocks, so the one column that identifies
instances by sight encodes nothing. The builder flagged this itself before the critics did.

**H6. F2 — the instance list reads as a genre sampler.** Ten instances covering ranked bedwars,
practice arena, duels grind, lifesteal SMP, skyblock, sodium sandbox, all-the-mods, fabulously
optimised — one of each kind rather than one person's actual lopsided library.

**Also noted, and both cleared on intent rather than being violations:** the amber rule under the
downloading row is a progress fill with its scale printed above it, not a decorative stripe (A11);
and the one remaining hole, `17:40 → —`, is genuinely uncaptioned this time (F11 satisfied).
The narration deletion worked — zero of six gaps now carry a caption.

---

## I. Round-7 audit — A and C are clean; F is the remaining work

Won the design A/B 2/2 (15/15 overall). **Section A: zero hard fails in either image, verified by
pixel sampling. Section C: exactly one hit, and it is in the bar, not in ours.** The visual
standard is met. Everything below is section F.

**I1. A factual error — the loader column is wrong.** The biggest single hit, and a Minecraft
player would catch it in a second: `Fabric 0.16.9` is shown on **1.8.9** instances. Fabric does not
support 1.8.9 at all — it starts at 1.14. Round 7 fixed the "genre sampler" by making the loader
column repeat itself, and in flattening it, broke the truth. A loader must be one that actually
exists for that version: 1.8.9 means Forge, OptiFine or vanilla, never Fabric.
**Fix the data before anything else. A launcher that shows an impossible loader is not a launcher.**

**I2. The instinct returned a fifth time, wearing the fix for the fourth.** Round 7 was told the
instance list read as a genre sampler. It replaced the genres with a naming story — forks never
renamed, `crystal test 2`, a literal `New Instance`. A critic then found that the ten visible names
**cover every naming behaviour exactly once**: a base name, a numbered sibling, a parenthetical
`(old)`, a lowercase test fork, a numbered test fork, a version-prefixed name, an archived name, a
server name, and an untouched default. The sampler moved from genres to naming conventions.
It has now been: every failure at once, encoding where scored, captioned holes,
every capability once, every naming behaviour once.
**A real list repeats itself boringly. Several rows should be near-identical and tell you nothing.**

**I3. F10 regressed — the playtime encoding was lost.** PLAYTIME spans 0h 22m to 264h 03m, roughly
a 700x range, and is now "rendered as a uniform grey field". Rounds 3 to 6 had a magnitude ramp on
this column; round 7's dimming rework removed it. Restore it without reintroducing I4's problem.
Same column, second half: the LOADER column is the widest data column and carries ten rows of one
value in one mono grey.

**I4. F6 — three names for one object.** The nav rail says **Modules**, the hero subtitle says
**13 mods**, the status bar says **Module preset**. "The product has not decided what it calls
things." This matters more than it looks: the whole Modules-vs-Mods distinction was designed
deliberately, and the hero is quietly undoing it. Pick one word per concept and sweep every string.

**I5. F11 — it still reconciles too exactly.** The Sessions column sums to exactly 12h 34m across
seven rows with zero rounding slack, and every interval matches its own endpoints to the minute.
One uncaptioned hole is not enough on its own when everything else is perfect to the minute.

**Cleared and worth keeping:** the sentence method worked on F1 — the builder wrote *"Player opened
the launcher to play Crystal PvP again"* and cut the download strip, the exit-code line, the
out-of-date loader markers and the duplicate toolbar action. Neither critic listed F1 against us.
Stroke now scales with glyph size, measured monotonically from .0950 at 10px to .0700 at 34px.
Six of fourteen screens had been printing their own name beside the rail item that already said it;
all removed.

---

## J. Round-8 audit — one item left

Won the design A/B 2/2 (**17/17 overall**). This is the cleanest audit yet.

**Clean in ours, verified by sampling:**
- **Section A** — no hard fail of any kind. Play button flat `#E3B439` edge to edge across a 480px
  horizontal and 90px vertical scan, zero variance, hard cut to the ground with no halo.
- **Section C** — no hits. One near-miss declared and then cleared: sage `#8C9C63` and dusty blue
  `#5E7C86` do appear, but only inside 24px pixel-art instance thumbnails as depicted block
  textures, never as accents.
- **F2 — NOT PRESENT.** The boring test worked. Five near-clone `Crystal PvP N` instances share one
  version and one loader; playtimes run 264h 03m down to 0h 22m; three dead instances sit dimmed
  under `Older`. After five rounds of the sampler instinct, this is the first time a critic has
  looked at the list and found repetition rather than a survey.
- **F3, F4, F7, F8 — clean.** Tracked all-caps confined to one role; monospace reserved strictly for
  machine values; no chart; three distinct action tiers.
- **F10 — ours encodes magnitude** and the critic listed it as a hit against the *bar* instead.
- **F11 — genuine unknowns present.** `17:40 → —` for a session that never closed, a truncated
  folder path, and a Sessions total of 12h 33m against 12h 31m of listed rows, which **does not
  reconcile exactly**. The I5 fix landed: endpoints are wall-clock rounded to the minute, lengths
  are truncated elapsed seconds, so three of seven rows come out a minute under their own
  arithmetic and nothing on screen explains it.

**Still present — one item:**

**J1. F6, one exception.** Every row's name, version, loader and date step down by recency group in
three fixed luminance values (243 / 207 / 102). The playtime column then layers an *absolute*
magnitude ramp on top of that (100h+ = 243, 40-99h = 207, 5-40h = 148, under 5h lower). Two
encoding systems share one channel in one table, so a bright figure means either "recent" or
"large" and the reader cannot tell which. Pick one channel per meaning: if recency owns luminance,
magnitude needs weight alone, or its own column treatment.

**Borderline, not called:** F5 — `Crystal PvP` appears three times (pinned nav, hero title, and as
the slug in `…\instances\crystal-pvp`). The critic declined to call it: three different roles, and
the path is a distinct fact.

**Domain truth: ours passed.** 44 version/loader pairs checked, 11 were illegal — all `1.8.9 +
Fabric` — and all fixed. The frame now runs 1.8.9 on Forge 11.15.1.2318 and OptiFine HD U M5, with
no NeoForge or Quilt anywhere in the data (they exist only as buttons on `#new`, which is a picker,
not a claim). Both critics' domain-truth failures were against the reference product instead.

**Vocabulary settled:** **Mod** = a `.jar` in an instance's mods folder. **Tweak** = a built-in
client feature Kestrel draws. **Preset** = a saved set of tweak states plus the HUD layout. "Mod"
could not move — every player and every launcher calls a jar a mod — so the built-ins moved
instead. 15 user-facing strings swept; route ids stay `modules` with `#tweaks` as canonical and an
alias map, so saved deep links do not break on a rewording.

---

## K. The system judgement — placeholder content excluded

Five critics judged the existing build with fixtures declared out of scope. This is the first pass
that looked at the app **as a system** rather than at one frame, and it is the most damaging so far.
**Record: 18 design wins, 1 loss.** The loss is the first in the project.

### K1. "One shell wrapped around four interiors, not one designed system"

The chrome is not merely consistent, it is **byte-identical** — pixel-diffing the title bar, status
bar, rail Pinned block and account footer across four screens returns zero difference. That shared
shell "is doing all the work of making these look related, and it is the cheap half."

Underneath it, the same component is governed by opposite rules:

- **The instance table appears on Play and on Instances with the same columns, same left origin,
  same headers, same group labels — and two contradictory encodings.** Play decays rows by age
  (pitch 36 -> 31 -> 27, name luminance 247 -> 211 -> 105). Instances renders every row in every
  group at 31px and 211. "One author thinks age changes how a row looks, the other does not."
- Worse: Play's `Older` rows land on `#646669`, which is the **disabled step of the app's own text
  ramp**. Three launchable instances are painted as if greyed out.
- **Four vertical grids**: Instances 31px, Tweaks 32px, Play 36/31/27, Settings no repeating unit
  at all. The two list components that should share a grid are **1px apart** — "worse than a real
  difference because it reads as a bug."
- **Four selected-pill heights for one job**: 31 / 28 / 37 / 32. "Not a ladder, it is noise."
- The search field is one component at **three widths and three positions**, and only Play's carries
  the Ctrl-K chip.
- Instances' primary action has the **identical fill and radius as the search field** 380px away in
  the same strip, so the primary reads as an input.
- Settings' content stops 58-60px short of every other screen's right edge, inside a pane with a
  **3:1 gutter asymmetry** (28px left, 84.5px right).
- Two places where a row separator and a section rule sit **6px apart** without collapsing.

**Density and hierarchy, measured:** ink coverage Play 4.92%, Tweaks 4.00%, Instances 2.82%,
Settings 2.39% — Play carries 2.06x Settings. Squint ratio (24-tile max/min) Play **5.13**, Tweaks
1.62, Settings 1.42, Instances **1.38** — against the standard's fail line of ~1.33.
**Instances and Settings have no focal moment at all.** Page-title tier across the four: 43px, 21px,
16px, and absent entirely. On Settings the H1 cap height equals the H2 cap height.

**Worst screen: Tweaks.** Its category column is painted `#0A0E13` — the exact nav-rail fill — with
the rail divider as its left edge, so **the nav rail appears to be 353px wide on that screen** and
203px everywhere else.

### K2. Resize: "The layout does not respond; it stretches"

Never tested before this pass; every screenshot in eight rounds was 1280x800.

Both rails are frozen at 203.5px and 283.5px across 900, 1280, 1600 and 2560 — identical to the
half-pixel — and the centre pane absorbs all growth (412.5 -> 2072.5px, **5.0x**). Vertical chrome
is equally frozen, so at 900 fixed chrome eats **58%** of the window height and at 2560 it eats 20%.

**Breaks first at 1600**: VERSION / LOADER / LAST PLAYED / PLAYTIME are a frozen 437px block pinned
right, so INSTANCE absorbs 100% of the growth despite its longest value being 79px of ink. The
gutter between an instance name and its own data runs **73px at 900, 147px at 1280, 467px at 1600,
1427px at 2560** — with no row rules to carry the eye across.

### K3. Theme: light was never re-derived, only inverted

Layout is pixel-identical, the five-step text ramp survives inversion intact, and light's pane
separation is actually **stronger** than dark's. But:

**The accent was never re-derived for light.** `#E3B439` on the dark pane is **9.45:1**; the same
gold on the light pane is **1.91:1** — a 4.9x collapse. Measured by squint: on dark the strongest
thing in the frame is the Play button; on light it becomes the page title. **Light loses the
application's focal point.** The builder's round-4 note said light needed two accent cuts and split
`--go` from `--go-ink`; the *fill* case did not get its own light value.

### K4. The first loss — Tweaks lost to the bar

**Instances beat the bar. Tweaks lost.** The reason is a grid failure, not a style one: inside the
HUD element card, the same toggle control lands at **four different x positions in one 435px-wide
column** (1736, 1816, 1948, 1948) because each row is an inline run of controls rather than a
label/control grid. The most repeated control in the card never lands in the same place twice.

Also flagged as reading like a web page in a window: the full-width instructional strip between the
toolbar and the panes.

---

## L. Round-10 re-judgement — same five critics, same prompts

**Both A/B pairs won. The Tweaks loss is reversed. Record: 20 wins, 1 loss.**

### Fixed and confirmed by the critics

- **Chrome and controls are now genuinely one system.** "Byte-identical 256x28 search field at the
  same coordinates on all four screens", rail 203 CSS with a shared active fill, control heights a
  consistent 28. K1d, K1e, K1f closed.
- **One type ladder** — display cap heights 61-64 across all four screens. K1j closed.
- **Light no longer loses its focal point.** "The same element leads at a squint in both themes."
  The accent fill was re-derived at 16.8 degrees of hue rotation: slate went 1.90:1 -> **4.71:1**,
  cinder 1.86:1 -> 4.83:1. The round-4 `--go-ink` split collapsed back into a single accent value
  per theme, because 4.71:1 is both a legal fill and a legal mark. K3 closed.
- **The gutter is capped.** Instance name to its own data at 2560 went **1428px -> 193px** on Play
  and 1516 -> 201 on Instances, flat from 1600 up. Fixed chrome at 900 went 58.4% -> 40.5%.
- **The Tweaks category column** no longer impersonates the nav rail. K1k closed.
- **The HUD element card got its grid.** The four-x toggle is gone; Tweaks beat the bar this time.

### Still present

**L1. The window does not fill vertically. This is the biggest one and it is new information.**
> "This is a 1280x800 mock with three larger screenshots taken of it. Vertical metrics are
> byte-identical at 1280, 1600 and 2560 — same chrome heights, same hero, same table top at y358
> and bottom at y755.5, same ten rows."

The Recent list is a **fixed ten-row slice that neither fills nor scrolls**. Doubling the window
height from 800 to 1600 adds zero rows and leaves a void of **39.5% of the whole 2560x1600 window**
— "twenty-five rows of space sit empty while thirteen instances are hidden behind a link." The same
component clips at 900. All the round-10 resize work was horizontal; the vertical axis was never
touched.

**L2. Horizontal growth is capped but not spent.** From 1600 to 2560 the INSTANCE and VERSION
columns gain 0px while **87% of the +920px lands in three empty gutters** (479.5, 395.5, 209px).
The gutter is no longer absurd, but the space is still not doing anything. The one place two
columns actually touch — MODS and LAST PLAYED, 14px apart — sits in the middle of the largest void.

**L3. The row unit was claimed but not achieved.** The builder reports `--u: 32px` everywhere; the
critic measures **six row pitches carrying one job — 26 / 30 / 32 / 33 / 64 CSS** — plus five
container recipes, four of them on Modules alone, and five different top insets under one shared
header rule. "Everything inside the content pane is improvised per screen." K1c is not closed.

**L4. Settings is still the worst screen, by every measure.** Ink coverage **3.09%** of its pane
against 7.80% on Modules — a 2.5x deficit. Dead area **27.5%** of the pane in wholly empty 64x64
blocks. Squint ratio **1.49**, the only screen within 12% of the ~1.33 fail line. No page title at
all while the other three lead with a 31-32 cap-height display line. And **750-873px of empty
gutter between every label and its control**. Removing the settings index and the title did not
give the screen a subject; it took two away.

**L5. Light has no state layer of its own.** Its raised and selected surfaces were derived by
mirroring dark's token values into a range with a hard ceiling at white, and the ladder lost its
steps: the top rung shrank from 4.8 to 2.8 L*, and the selected nav chip sits 2.09 L* from its own
ground (**1.06:1** against dark's 1.32:1) — a **6.0x collapse of the primary navigation
affordance**, which vanishes entirely under blur. Separately, the instance thumbnails are
dark-biased and swing from +13.5 to **-75.3 L*** against their ground in light, taking over the
frame.
