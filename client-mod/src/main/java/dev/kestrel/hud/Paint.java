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
 *
 * <p><b>THE MENU USES THE SAME NAMES AS THE HUD.</b> Right Shift opens a
 * screen that configures these plates, and it is drawn out of this same file
 * rather than a second palette beside it — a configuration screen in a
 * different grey from the thing it configures is the exact failure this class
 * exists to prevent, one level up.
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

    /* ══ THE MENU ═════════════════════════════════════════════════════════
       Right Shift opens a screen over the world. Three references were read
       before any of this was drawn — Lunar Client's mod list, Sodium's
       settings, NoRisk's Host World dialog — and NoRisk's is the one this
       follows, because its square-cornered panel with thin borders and
       generous line height is already how Kestrel's own screens look. See
       docs/hud-menu-design.md, and the screenshots it points at. */

    /* THE PANEL IS NEARLY OPAQUE where the HUD plate is not. A plate has to
       let the world through — it sits on top of the game you are playing. A
       menu has stopped the game being the thing you are looking at, and a
       translucent menu over a moving world is a menu you have to squint at.
       --s-pane #12151B at 95%. */
    static final int PANEL = 0xF212151B;
    /* --s-well #040609 at 55%: enough to push the world back without hiding
       the HUD elements drawn around the panel, which are the things being
       configured and have to stay visible. Lunar blurs instead; blur is a
       shader pass whose API has moved in every recent Minecraft version, and
       a fill that works is worth more than a blur that compiles today. */
    static final int SCRIM = 0x8C040609;

    static final int RAISE = 0xFF1B1F25;   /* --s-raise: a control ON the panel */
    static final int HOVER = 0xFF25292E;   /* --s-hover */
    static final int ACTIVE = 0xFF2F3339;  /* --s-active, the pressed state */
    static final int REGION = 0xFF2D3137;  /* --line-region: divides sections */
    static final int DEFINE = 0xFF474B51;  /* --line-define: outlines a control */
    static final int BODY = 0xFFCDCFD3;    /* --body: a row's label */
    static final int MUTE = 0xFF646669;    /* --mute: a row that cannot act */
    static final int FAINT = 0xFF484A4D;   /* --faint: a disabled outline */
    static final int ON_GO = 0xFF0A0E13;   /* --on-go: ink ON the accent */
    static final int GO_HI = 0xFFF5C64E;   /* --go-hi: the accent, hovered */

    /* ── the layout editor ────────────────────────────────────────────────
       A snap guide is the accent at low alpha: it appears for as long as a
       drag is held against a line and has to read as a hint rather than as
       part of the HUD. The selection outline is the accent at full strength,
       because exactly one thing is selected and it should be obvious which. */
    static final int GUIDE = 0x99E3B439;
    static final int SELECT = 0xFFE3B439;
    static final int GRABBED = 0x33E3B439;  /* a wash over the box being moved */

    /* ── menu metrics ─────────────────────────────────────────────────────
       Stated once here rather than as numbers inside the screens: two screens
       draw rows and both have to agree what a row is, or the layout editor's
       hint bar sits at a different rhythm from the menu above it. */
    static final int ROW = 14;             /* a row of the list */
    static final int PANEL_PAD = 8;        /* panel edge to its content */
    static final int SECTION_GAP = 7;      /* above a section heading */
}
