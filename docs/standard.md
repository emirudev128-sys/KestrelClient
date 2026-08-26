# Desktop UI standard

A checkable standard for judging desktop application design. Every item can be verified against a
screenshot or a grep. Sourced from a Reddit-mined ranking of 3.2M posts, a ~100-item catalogue of
generated-UI tells, published brand and design systems, and library ground-truth documentation.

## A. Hard fails

1. Any gradient — `bg-gradient-to-*`, a 135deg hero or button gradient, `bg-clip-text` gradient
   text. Repetition across unrelated elements is the real signal.
2. Any emoji — nav, labels, headings, buttons, empty states. Sparkles worst of all.
3. Indigo/violet accents: #6366F1 #4f46e5 #7c3aed #8B5CF6 #A855F7 #A78BFA.
4. Untouched shadcn: `--radius: 0.625rem`; `oklch(0.97 0 0)` appearing as --secondary AND --muted
   AND --accent; `oklch(0.922 0 0)` as both --border and --input; `ring-1 ring-foreground/10`.
5. Neon glow — a 0-offset, high-blur, saturated box-shadow.
6. Tailwind default shadows applied blanket to cards: pure black, 0 x-offset, 0.1 alpha.
7. A single border-radius on everything regardless of element size.
8. Centred hero + subtitle + two buttons, or a card grid of exactly three.
9. A centred max-width content column inside an application window.
10. Icon-in-a-rounded-square chips: `h-12 w-12 rounded-lg bg-primary/10` with a stroke icon inside.
11. Coloured left or top border stripes on cards.
12. A row of three or four identical stat tiles with round vanity numbers.
13. A pill or eyebrow badge floating above a heading.
14. Marketing copy: seamless, effortless, empower, harness, unlock, elevate, supercharge,
    all-in-one. Title Case On Every Heading. Em-dashes as connectors.
15. Lucide or Heroicons shipped unmodified — especially Sparkles, Zap, ArrowRight, Rocket, Shield,
    CheckCircle — at one nominal size and one stroke with no size-specific variants.
16. Warm cream (#faf8f4-#f5f1ea) with a serif display and a sage or terracotta accent.

## B. Craft bar

- A radius ladder tied to element scale, not one radius. Nested radius = outer minus padding.
- Tonal elevation with a real surface ladder and **two distinct border strengths for two distinct
  jobs**. Shadows only for things that genuinely float.
- A five-step text ramp with a role per step: ink / body / metadata / disabled / lowest.
- Type with a decision in it. Not Inter or Geist at 400/600. Tracking scales with size — negative
  at display sizes, positive at 11-12px labels. Tabular numerals where digits align.
- A non-linear spacing scale: dense where controls live, coarse at section boundaries.
- One oversized moment per view. At 25% zoom, if every region carries equal weight, fail.
  Measured generated UI sits near a 1.33:1 density ratio across a whole page.
- One accent used as punctuation and for one primary action, not as fill. A second accent must sit
  more than 20 degrees OKLCH from the first.
- One state ramp derived from the surface ladder, not per-component hover alphas.
- Motion durations tied to travel distance; `prefers-reduced-motion` honoured.
- Optical correction: triangles aligned by centroid not bounding box, circles ~112.8% of an
  equal-width square, icons aligned to x-height.

## C. Distinctive-brand collisions to avoid

Values below are from shipping stylesheets. Any three of C1-C8 together read as Anthropic's Claude
even under a different logo.

C1. A terracotta/clay accent near #D97757 (hue ~15, sat ~63%, light ~60%), or #C96442, #C6613F,
    #C46849, #CC785C.
C2. A warm cream ground: #FAF9F5, #F9F9F7, #F5F4ED, #F0EEE6.
C3. Neutrals tinted yellow-green (hue 45-60) at low saturation — no true grey in the system.
C4. Ink at #141413.
C5. Warm-charcoal dark mode #1F1E1D-#262624 with cream #F9F9F7 text.
C6. A serif for one voice and a sans for another inside one surface.
C7. Flat unbubbled blocks alternating with filled bubbles.
C8. A 12-ray irregular starburst with slender tapered points (~3.2:1 tip to notch), or an `A\`
    monogram whose backslash repeats the A's right leg at ~21.6 degrees.
C9. A 16-24px-radius input pinned to the bottom with a hairline ring and a very faint wide shadow.
C10. 12px as the default corner radius on cards, buttons and inputs.
C11. Serif display paired with humanist sans — Styrene, Tiempos, Copernicus, or Lora + Poppins.
C12. Chalky desaturated earth accents: sage, dusty blue, olive, oat, clay, kraft.

Not a collision, do not over-correct: 1px hairlines carrying layout instead of shadows is general
high-craft practice. What reads as a collision is a *warm* hairline over cream with a clay accent.

## D. It must not read as a web page in a window

- Panes fill and resize with the window. No scrolling marketing page, no dead margins.
- Lists are rows and tables, not grids of shadowed cards.
- Pointer-sized targets, 28-36px rows. 44-48px is a touch guideline and costs half the list.
- Integrated window chrome, keyboard shortcuts as first-class, a command palette.
- Real UI as its own imagery, never illustrated abstractions of the product.
- Empty, loading, in-progress, error and offline states designed rather than bolted on.

## E. Copy

Sentence case. Domain verbs. Errors say what broke and what to do. Buttons say what will happen.

## F. Composition

- **A default screen shows one ordinary moment, not a catalogue of states.** Real software shows
  one failure at a time. A frame carrying several mutually unlikely states at once was composed to
  demonstrate coverage rather than observed.
- **Data should look like one person's real history** — lopsided, mostly repetitive, some things
  heavily used and some abandoned — not a matrix built so every possible value appears once.
- **No single typographic treatment used as the default for every label.** A tracked all-caps
  micro-label belongs to one or two roles, not to whatever needs a heading.
- **Only data the product would actually hold.** Numbers imported from an adjacent genre to fill a
  panel read as invented.
- **No fact stated twice in one view.**
- **A rule written down must be applied without exception.** A face, a colour or a treatment chosen
  by pattern-match rather than by rule shows up as inconsistency within a single column or phrase.
- **A chart has an axis and a scale, or it is decoration.**
- **Secondary actions are not outlined twins of the primary.**
- **Semantically different panels get different shapes**, not one row template repeated.
- **Where a list's underlying values have a wide range, the visual texture should reflect it.**
  A uniform grey field over data that is not uniform is a missed encoding.
- **Real software has values it does not know yet** — not computed, not refreshed, never recorded.
  A frame in which every slot is filled and every figure reconciles exactly is unusual.
  Equally, gaps that are each individually captioned and explained read as staged.
