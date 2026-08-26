package dev.kestrel.hud;

/**
 * THE HUD'S COLOURS, WHICH ARE THE LAUNCHER'S COLOURS.
 *
 * <p>Every value here is lifted from {@code ui/styles/tokens.css} — the Slate
 * palette Kestrel ships with. That is the point: the launcher and the thing
 * drawn inside the game are one product, and a HUD in some other grey would
 * read as a mod that happens to be installed rather than as the client's own
 * furniture.
 *
 * <p><b>WHY NOT MINECRAFT'S OWN LOOK.</b> Vanilla's debug text is white with a
 * hard shadow on nothing, which is legible over dirt and illegible over snow.
 * Every client HUD worth using solved that the same way — a translucent plate
 * behind the text — and this does too. The plate is what makes it readable
 * everywhere, not decoration.
 *
 * <p><b>ARGB, NOT RGB.</b> Minecraft's fill and text calls take the alpha in
 * the top byte, and forgetting it is how you get an invisible element and a
 * confusing half hour. The constants below carry theirs.
 */
final class Paint {

    private Paint() { }

    /* ── the plate ────────────────────────────────────────────────────────
       --s-app #0A0E13 at 72%. Dark enough to carry white text over snow,
       transparent enough that it never becomes a black box sitting on the
       world. The border is --line-region #2D3137, kept faint: at 1px a
       bright edge reads as a mistake rather than an outline. */
    static final int PLATE = 0xB80A0E13;
    static final int EDGE = 0x662D3137;

    /* ── the text ─────────────────────────────────────────────────────────
       Two tones, and the split is the whole typographic idea: the VALUE is
       what you glance at, the LABEL only says what it is. One weight of one
       bitmap font cannot express that, so colour does it instead. */
    static final int VALUE = 0xFFF1F4F7;   /* --ink  */
    static final int LABEL = 0xFF929497;   /* --meta */
    static final int ACCENT = 0xFFE3B439;  /* --go, the one warm thing */

    /* ── metrics ──────────────────────────────────────────────────────── */
    static final int PAD_X = 4;
    static final int PAD_Y = 3;
    static final int LINE = 9;             /* the vanilla font's line height */
    static final int GAP = 3;              /* between a value and its label */
    /* between two elements that would otherwise overlap. Wider than GAP: the
       gap inside a plate separates words, this one separates objects, and
       reading them as the same distance makes two plates look like one. */
    static final int STACK_GAP = 2;
}
