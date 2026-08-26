# The AI-detection verdict is not a usable pass/fail gate

## What was tested

Four critics, fresh context each, all reading the neutral `docs/standard.md` (no product name, no
history, no account of our own previous mistakes). Each got two desktop screenshots and the same
question: which was made by an AI coding agent — A, B, or **neither**? "Neither" was explicitly
offered as a free answer. Each was also asked for confidence with recognition, and confidence on
pixel evidence alone.

- **Two test pairs**: our round-4 build against Linear, sides forced A and B.
- **Two control pairs**: **Modrinth against Linear — both real, shipping, human-designed products.**
  Any AI accusation in a control pair is a false positive by construction.

## Result

**Test pairs: ours won the design comparison 2/2 and was flagged as AI 2/2.**
Confidence 88% and 78%; on pixel evidence alone, 78% and 68%. Both critics recorded
`usedElimination: true`.

**Control pairs: 2/2 false positives.**

| Pair | Accused | Actually | Confidence | Pixels only |
|---|---|---|---|---|
| Modrinth as A, Linear as B | **Modrinth** | real product | 72% | 55% |
| Modrinth as B, Linear as A | **Linear** | real product | 70% | 66% |

Neither critic chose "neither". They accused **different** real products, so it is not even a
consistent positional or stylistic bias.

## What they were actually detecting

The evidence is the interesting part, because both critics were reasoning carefully and both were
wrong.

Against **Modrinth**: *"The traffic lights measure 19px diameter at a 30px pitch — exactly 1.5x
the 12px/20px macOS spec. macOS composites at 1x or 2x, never 1.5x... every hairline in A is a
soft 4-5px ramp, whereas every hairline in B is an exact 2px flat run with zero antialiasing.
A was rendered at a non-integer scale."*
That is a detection of **fractional-DPR capture**. It is a true observation about the screenshot
and says nothing about who designed the interface.

Against **Linear**: *"five relative timestamps in one activity column run through two different
formatters... 'Linear created the issue via Slack on behalf of karri · 2min ago' sits ABOVE
'karri · 4 min ago' — a comment two minutes older than the issue it is attached to... Non-monotonic;
authored row by row."*
That is a detection of **a constructed marketing mock**. Also true, also not about AI.

So the question "which of these was made by an AI" is, in practice, answered as **"which of these
frames looks constructed rather than captured."** A hand-built mock of a product that does not ship
yet will lose that test every time, no matter who designed it or how well.

## Consequences for the loop

**Keep as the win condition:** the design A/B against a fixed, real, recognisable bar. That half is
calibrated and the result has been stable — ours has now won **11 of 11** blind design comparisons
across four rounds and two side assignments.

**Drop as a pass/fail gate:** "which is AI-generated". With a measured 2/2 false-positive rate on
real products, a verdict of "yours was flagged" carries little information. Chasing it to zero is
chasing a coin that lands heads on Linear too.

**Keep and act on:** the *specific, named* tells the critics produce. Those stand on their own as
craft observations regardless of the verdict — stock Lucide silhouettes, a typographic rule broken
five ways in one view, captioned holes, encoding applied only where the rubric marks. Every one was
checkable and every one was real. That is the signal; the verdict was the noise around it.

**The replacement gate:** score the named items in `docs/standard.md` sections A, C and F as
present/absent, verified against the screenshot. A piece is won when it beats the bar on design and
carries zero present items. That is measurable, falsifiable, and does not depend on a critic's
ability to do something we have now shown critics cannot reliably do.

## Caveat

n = 2 control pairs. Small. But "neither" was free and unused, the two accusations landed on
different products, and the stated reasoning in both cases is visibly about capture artifacts and
mock construction rather than design. The mechanism is legible, not just the outcome.
