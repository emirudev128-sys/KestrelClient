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
       Right Shift opens a screen over the world, painted from the same
       values the HUD is — thin borders, generous line height, one accent —
       but softened at the corners, which the HUD is not. See R_PANEL below
       and docs/hud-menu-design.md. */

    /* ── THE PANEL IS GLASS ───────────────────────────────────────────────
       --s-pane #12151B at 43%, dialled in by eye against the blurred world
       rather than argued from a principle. This value has been wrong in both
       directions before now: it started at 95%, which is 5% of nothing, and
       was then argued all the way to fully opaque on the grounds that a
       translucent menu over a MOVING world is one you squint at.

       That argument was about the wrong world. Nothing behind this is moving
       any more, because the screen blurs it first — and over a blurred ground
       a translucent panel does not fight the text on it, it just keeps you
       looking at the game you are still standing in. Opaque made the menu a
       slab dropped on top of Minecraft.

       THE NUMBERS BELOW DO NOT READ AS A LADDER, AND THEY ARE ONE.  A card
       is 37% where the panel is 43%, which looks like the card is the fainter
       of the two and is not: the card is drawn OVER the panel, so what you
       see is the pair composited — 43% then 37% of what is left is 64%. Each
       step up the stack still lands more solid than the one under it,
       finishing at the preview well on 81%, and it is the composited figure
       that has to ascend rather than the constant. tools/hudcheck.mjs
       composites them before comparing, which is the version of that check
       that is actually about what anybody sees.

       AND THE SCRIM IS ZERO. It was 30%, and before that 55%; the blur alone
       turned out to do all of the separating, so the tint over it does
       nothing but dim the HUD elements around the panel — which are the
       things being configured. Kept as a named constant rather than deleted
       because it is the dial you would reach for if a future backdrop needed
       holding down, and a fill at zero alpha costs nothing. */
    static final int PANEL = 0x6E12151B;

    /* ── AND THE WORLD BEHIND IT IS BLURRED, NOT BLACKED OUT ──────────────
       This was a flat 55% fill, and it read as a black sheet with a window
       cut in it. The screens now call Screen.applyBlur() — which is vanilla's
       own path, gameRenderer.renderBlur() followed by a framebuffer rebind —
       and put only a LIGHT tint over the result.

       An earlier note here argued against blur on the grounds that the API
       moves between versions. That was true and it was the wrong trade: the
       method is right there on Screen in 1.21.4, vanilla's own
       renderBackground calls it, and a menu that looks right is worth
       re-checking one method call at a version bump.

       For scale: vanilla darkens its own in-game background with a gradient
       from 0xC0101010 to 0xD0101010 — around 75-80% black. This is 30%,
       because the blur is doing the separating and the HUD elements drawn
       around the panel are the things being configured and have to stay
       readable. */
    static final int SCRIM = 0x00040609;

    /* each one a step more solid than the surface under it, so a card reads
       as sitting ON the panel rather than as a patch of it */
    static final int RAISE = 0x5E1B1F25;   /* --s-raise: a control ON the panel */
    static final int HOVER = 0xA125292E;   /* --s-hover */
    static final int ACTIVE = 0x942F3339;  /* --s-active, the pressed state */
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
    static final int PANEL_PAD = 10;       /* panel edge to its content */
    static final int SECTION_GAP = 9;      /* above a section heading */

    /* ── CORNER RADII ─────────────────────────────────────────────────────
       THE MENU IS SOFTENED; THE HUD IS NOT.  Every square corner in here used
       to be an argument — Minecraft's own interface is square, so a square
       plate is the one that looks like it belongs on that screen. That
       argument still holds for a PLATE sitting in the world, which is why the
       HUD's own corners stay sharp by default and stay the player's choice.

       It does not hold for a menu. A menu is Kestrel's surface rather than
       Minecraft's, it is the largest thing on screen when it is open, and at
       350 pixels across a hard corner reads as unfinished rather than as
       native. So the panel and everything on it are rounded, and the amount
       steps down with the size of the thing: a big surface can carry a
       rounder corner than a 12px button, and giving them the same radius
       makes the small one look like a lozenge.

       Four pixels is the most that reads as a corner rather than as a bite at
       this scale. See Ui.roundRect for how they are actually drawn, which is
       the interesting half. */
    static final int R_PANEL = 4;          /* the window itself */
    static final int R_CARD = 3;           /* a card on it */
    static final int R_WELL = 2;           /* the recess inside a card */
    static final int R_CTRL = 2;           /* buttons, steppers, toggles */

    /* ── the well ─────────────────────────────────────────────────────────
       The recess a card's preview sits in. --s-well #040609, the darkest
       surface in the palette, and the reason it exists is that a preview
       floating directly on the card reads as part of the card's own text.
       Sunk into a well it reads as a picture OF something, which is what it
       is.

       NEARLY SOLID, where the panel around it is glass. This is the ground a
       HUD plate is judged against — its own transparency is the thing being
       set — and judging one translucent thing through another is judging
       neither. */
    static final int WELL = 0x75040609;
}
