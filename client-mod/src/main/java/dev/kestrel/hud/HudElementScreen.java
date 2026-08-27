package dev.kestrel.hud;

import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * ONE ELEMENT'S OPTIONS — what {@code OPTIONS} on a card opens.
 *
 * <p>This is the screen the whole per-element style exists for: make the
 * coordinates bigger without touching anything else, take the box off the fps
 * counter, put the ping in red, make the plate behind it half as solid.
 *
 * <p><b>THE PREVIEW IS THE POINT.</b> It sits at the top, it is the real
 * element drawn by the real renderer from FIXED sample text, and it changes
 * as you drag a slider. Colour and transparency are choices nobody can make
 * from a number — the question is always "does that look right", and the only
 * honest answer is to show it.
 *
 * <p>It sits in a WELL, the same recess the menu cards use, rather than
 * letting the world through. Showing the live world behind it was the first
 * design and it argued for itself well — a plate at 30% does look different
 * over snow than over stone — but a transparent hole cut in an otherwise
 * opaque panel reads as a mistake, and the world behind it is blurred now
 * anyway, so what showed through was a smear rather than terrain. The well is
 * the darkest surface in the palette, which is the honest hard case for
 * white-on-dark anyway.
 *
 * <p><b>A MODULE MAY OWN MORE THAN ONE ELEMENT.</b> "Armor status" owns five.
 * Rather than five cards on the menu — which would have made visibility look
 * per-element when it is not — this screen steps between them with
 * {@code < HELMET >} and edits one at a time. For the other six modules there
 * is exactly one element and the stepper is not drawn at all.
 *
 * <p><b>SCALE IS A SLIDER HERE AND A WHEEL IN THE LAYOUT EDITOR.</b> Both
 * write the same field. The wheel is right when the element is under your
 * cursor and you are judging it against its neighbours; the slider is right
 * when you are looking at one thing and want 1.75 exactly. Offering only one
 * of them would have made the other job clumsy.
 */
public class HudElementScreen extends Screen {

    private static final int HEAD = 0;
    private static final int PICK = 1;
    private static final int SCALE = 2;
    private static final int ANCHOR = 3;
    private static final int PLATE = 4;
    private static final int PLATE_RGB = 5;
    private static final int PLATE_A = 6;
    private static final int TEXT_RGB = 7;
    private static final int TEXT_A = 8;
    /* ONE ROW KIND FOR EVERY PER-ELEMENT SWITCH. There used to be a COMPASS
       constant here and a case in three switch statements to go with it —
       which was fine for one option on one element and would have been eleven
       constants and thirty-three cases by the time the other nine elements
       had theirs. An OPT row carries the option's KEY and reads everything
       else — its label, whether it is a switch or a stepper, what values it
       steps through — out of the document. Add an option in mc/hud.js and it
       appears here with no Java changing. */
    private static final int OPT = 9;

    private static final class Row {
        final int kind;
        final String label;
        final int h;
        /** OPT rows only: which option in el.opts this row edits */
        final String key;
        Row(int kind, String label, int h) { this(kind, label, h, null); }
        Row(int kind, String label, int h, String key) {
            this.kind = kind; this.label = label; this.h = h; this.key = key;
        }
    }

    /* WIDER THAN IT NEEDS TO BE FOR THE ROWS, and sized for the swatch grid:
       seven squares of 11 with 2 between them is 89 across, and a colour row
       that wraps to a second line for want of six pixels looks like an
       accident. The rest of the width goes to the label column, which is what
       stops "Show the compass" colliding with its own control. */
    private static final int PANEL_W = 252;
    private static final int TITLE_H = 22;
    private static final int PREVIEW_H = 38;
    private static final int FOOT_H = 26;
    private static final int VALUE_W = 84;

    private final HudConfig config;
    private final Path runDir;
    private final Screen parent;
    private final String module;
    private final List<String> owned;
    private final List<Row> rows = new ArrayList<>();

    private int which;            /* index into owned */
    private int px, py, ph;
    private int viewTop, viewH;
    private int scroll;
    private int dragging = -1;    /* the row kind of the slider being dragged */

    public HudElementScreen(HudConfig config, Path runDir, Screen parent,
                            String module, List<String> owned) {
        super(Text.literal("Kestrel HUD options"));
        this.config = config;
        this.runDir = runDir;
        this.parent = parent;
        this.module = module;
        this.owned = owned == null ? List.of() : owned;
    }

    private String name() {
        return owned.isEmpty() ? null : owned.get(Math.max(0, Math.min(which, owned.size() - 1)));
    }

    private HudConfig.Element element() {
        String n = name();
        return n == null ? null : config.get(n);
    }

    @Override
    protected void init() {
        rows.clear();
        /* only where it means something: one element means nothing to step */
        if (owned.size() > 1) rows.add(new Row(PICK, "Element", Paint.ROW));
        rows.add(new Row(HEAD, "SIZE AND PLACE", Paint.ROW + Paint.SECTION_GAP));
        rows.add(new Row(SCALE, "Size", Paint.ROW));
        rows.add(new Row(ANCHOR, "Anchor", Paint.ROW));
        rows.add(new Row(HEAD, "BACKGROUND", Paint.ROW + Paint.SECTION_GAP));
        rows.add(new Row(PLATE, "Show the box", Paint.ROW));
        rows.add(new Row(PLATE_RGB, "Box colour", Paint.ROW - 3 + Ui.swatchesH()));
        rows.add(new Row(PLATE_A, "Box opacity", Paint.ROW));
        rows.add(new Row(HEAD, "TEXT", Paint.ROW + Paint.SECTION_GAP));
        rows.add(new Row(TEXT_RGB, "Text colour", Paint.ROW - 3 + Ui.swatchesH()));
        rows.add(new Row(TEXT_A, "Text opacity", Paint.ROW));

        /* ── THIS ELEMENT'S OWN SWITCHES ──────────────────────────────────
           Whatever the launcher declared for it, in the order the document
           lists them, labelled from the document's own spec. An option with
           no spec gets no row: better an option nobody can see than a row
           with no name on it. */
        HudConfig.Element el = element();
        if (el != null && !el.opts.isEmpty()) {
            boolean headed = false;
            for (String key : el.optKeys()) {
                HudConfig.OptSpec sp = config.spec(key);
                if (sp == null || sp.label.isEmpty()) continue;
                if (!headed) {
                    rows.add(new Row(HEAD, "THIS ELEMENT", Paint.ROW + Paint.SECTION_GAP));
                    headed = true;
                }
                rows.add(new Row(OPT, sp.label, Paint.ROW, key));
            }
        }

        int content = 0;
        for (Row r : rows) content += r.h;
        ph = Math.min(TITLE_H + PREVIEW_H + content + Paint.PANEL_PAD * 2 + FOOT_H, this.height - 20);
        px = (this.width - PANEL_W) / 2;
        py = (this.height - ph) / 2;
        viewTop = py + TITLE_H + PREVIEW_H + Paint.PANEL_PAD;
        viewH = ph - TITLE_H - PREVIEW_H - FOOT_H - Paint.PANEL_PAD * 2;
        clampScroll();
    }

    private int contentH() {
        int c = 0;
        for (Row r : rows) c += r.h;
        return c;
    }

    private void clampScroll() {
        int max = Math.max(0, contentH() - viewH);
        if (scroll > max) scroll = max;
        if (scroll < 0) scroll = 0;
    }

    private int backY() { return py + ph - FOOT_H + 6; }
    private int closeX() { return px + PANEL_W - Paint.PANEL_PAD - 11; }
    private int closeY() { return py + 6; }

    /* ── scale <-> slider ─────────────────────────────────────────────────
       The track is 0..100 like every other slider on this screen; scale runs
       0.25..4. Mapped LINEARLY rather than logarithmically, deliberately: a
       log track puts 1.0 at the two-thirds mark and makes the useful range —
       roughly 0.75 to 2 — a third of the travel. Linear gives that range half
       the track, and the top end nobody uses gets the rest. */
    private static int scaleToSlider(double s) {
        return (int) Math.round((s - 0.25) / (4.0 - 0.25) * 100.0);
    }

    private static double sliderToScale(int v) {
        double s = 0.25 + (4.0 - 0.25) * (v / 100.0);
        return Math.round(s * 20.0) / 20.0;   /* to the nearest 0.05 */
    }

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        applyBlur();
        ctx.fill(0, 0, this.width, this.height, Paint.SCRIM);
        HudConfig.Element el = element();

        Ui.panel(ctx, px, py, PANEL_W, ph);
        String title = el == null ? module : el.display(name());
        Ui.left(ctx, this.textRenderer, title.toUpperCase(java.util.Locale.ROOT),
            px + Paint.PANEL_PAD, py + 7, Paint.VALUE);
        boolean overBack = Ui.hit(mouseX, mouseY, closeX(), closeY(), 11, 11);
        Ui.close(ctx, closeX(), closeY(), 11, overBack);
        Ui.rule(ctx, px + 1, py + TITLE_H - 1, PANEL_W - 2);

        int pvY = py + TITLE_H;
        /* square: this strip spans the panel and butts against the title
           rule above and the rows below, so it has no free corners to round */
        ctx.fill(px + 1, pvY, px + PANEL_W - 1, pvY + PREVIEW_H, Paint.WELL);
        if (el != null) previewOf(ctx, el, px + 1, pvY, PANEL_W - 2, PREVIEW_H);
        Ui.rule(ctx, px + 1, pvY + PREVIEW_H - 1, PANEL_W - 2);

        int lx = px + Paint.PANEL_PAD;
        int lw = PANEL_W - Paint.PANEL_PAD * 2;

        ctx.enableScissor(px + 1, viewTop, px + PANEL_W - 1, viewTop + viewH);
        int y = viewTop - scroll;
        for (Row r : rows) {
            if (y + r.h > viewTop - r.h && y < viewTop + viewH) drawRow(ctx, r, el, lx, y, lw, mouseX, mouseY);
            y += r.h;
        }
        ctx.disableScissor();

        if (scroll > 0) ctx.fill(px + 1, viewTop, px + PANEL_W - 1, viewTop + 1, Paint.DEFINE);
        if (scroll < contentH() - viewH) {
            ctx.fill(px + 1, viewTop + viewH - 1, px + PANEL_W - 1, viewTop + viewH, Paint.DEFINE);
        }

        Ui.rule(ctx, px + 1, py + ph - FOOT_H, PANEL_W - 2);
        Ui.button(ctx, this.textRenderer, lx, backY(), lw, 14, "BACK",
            Ui.hit(mouseX, mouseY, lx, backY(), lw, 14), true);
    }

    private void previewOf(DrawContext ctx, HudConfig.Element el, int x, int y, int w, int h) {
        if (this.client == null) return;
        List<List<HudElements.Run>> rows =
            HudElements.of(name(), el, this.client, KestrelHudClient.face(config), HudElements.SAMPLE);
        if (rows == null || rows.isEmpty()) return;
        int ew = HudRenderer.width(this.textRenderer, rows);
        int eh = HudRenderer.height(rows);
        /* shown at its OWN scale where it fits, so "bigger" looks bigger
           here; shrunk only when it would run off the strip — and a tall
           element (potion effects, a keystroke grid) is bounded by the strip's
           HEIGHT too, or it would spill over the rows below */
        double s = Math.min(el.scale, Math.min((w - 12.0) / ew, (h - 6.0) / eh));
        HudRenderer.draw(ctx, this.textRenderer, rows,
            x + (w - ew * s) / 2.0, y + (h - eh * s) / 2.0, ew, eh, s, config.rounded, el.style);
    }

    private void drawRow(DrawContext ctx, Row r, HudConfig.Element el, int x, int y, int w, int mx, int my) {
        if (r.kind == HEAD) {
            Ui.heading(ctx, this.textRenderer, r.label, x, y + Paint.SECTION_GAP + 3, w);
            return;
        }
        if (el == null) return;

        boolean over = my >= y && my < y + Paint.ROW && mx >= x && mx < x + w;
        if (over && r.kind != PLATE_RGB && r.kind != TEXT_RGB) Ui.rowHover(ctx, x - 2, y, w + 4, Paint.ROW);
        Ui.left(ctx, this.textRenderer, r.label, x, y + 3, Paint.BODY);

        int rightX = x + w;
        int sx = rightX - VALUE_W;
        int sy = y + (Paint.ROW - 11) / 2;
        int slY = y + (Paint.ROW - Ui.SLIDER_H) / 2;

        switch (r.kind) {
            case PICK:
                Ui.stepper(ctx, this.textRenderer, sx, sy, VALUE_W, 11,
                    shortName(el, name()),
                    Ui.hit(mx, my, sx, sy, Ui.STEP_ARROW, 11),
                    Ui.hit(mx, my, sx + VALUE_W - Ui.STEP_ARROW, sy, Ui.STEP_ARROW, 11));
                break;
            case SCALE:
                Ui.slider(ctx, this.textRenderer, sx, slY, VALUE_W, scaleToSlider(el.scale),
                    Ui.overSlider(mx, my, sx, slY, VALUE_W),
                    "x" + String.format(java.util.Locale.ROOT, "%.2f", el.scale));
                break;
            case ANCHOR:
                Ui.stepper(ctx, this.textRenderer, sx, sy, VALUE_W, 11,
                    el.anchor.toUpperCase(java.util.Locale.ROOT),
                    Ui.hit(mx, my, sx, sy, Ui.STEP_ARROW, 11),
                    Ui.hit(mx, my, sx + VALUE_W - Ui.STEP_ARROW, sy, Ui.STEP_ARROW, 11));
                break;
            case PLATE:
                Ui.check(ctx, rightX - Ui.BOX, y + (Paint.ROW - Ui.BOX) / 2, el.style.plate,
                    Ui.hit(mx, my, rightX - Ui.BOX, y + (Paint.ROW - Ui.BOX) / 2, Ui.BOX, Ui.BOX));
                break;
            case PLATE_RGB:
                Ui.swatches(ctx, x, y + Paint.ROW - 3, el.style.plateRgb, mx, my);
                break;
            case PLATE_A:
                Ui.slider(ctx, this.textRenderer, sx, slY, VALUE_W, el.style.plateAlpha,
                    Ui.overSlider(mx, my, sx, slY, VALUE_W));
                break;
            case TEXT_RGB:
                Ui.swatches(ctx, x, y + Paint.ROW - 3, el.style.textRgb, mx, my);
                break;
            case TEXT_A:
                Ui.slider(ctx, this.textRenderer, sx, slY, VALUE_W, el.style.textAlpha,
                    Ui.overSlider(mx, my, sx, slY, VALUE_W));
                break;
            case OPT: {
                HudConfig.OptSpec sp = config.spec(r.key);
                if (sp == null) break;
                if (sp.isEnum()) {
                    Ui.stepper(ctx, this.textRenderer, sx, sy, VALUE_W, 11,
                        el.choice(r.key, sp.vals.get(0)).toUpperCase(java.util.Locale.ROOT),
                        Ui.hit(mx, my, sx, sy, Ui.STEP_ARROW, 11),
                        Ui.hit(mx, my, sx + VALUE_W - Ui.STEP_ARROW, sy, Ui.STEP_ARROW, 11));
                } else {
                    Ui.check(ctx, rightX - Ui.BOX, y + (Paint.ROW - Ui.BOX) / 2, el.flag(r.key),
                        Ui.hit(mx, my, rightX - Ui.BOX, y + (Paint.ROW - Ui.BOX) / 2, Ui.BOX, Ui.BOX));
                }
                break;
            }
            default:
                break;
        }
    }

    /* "Armor status · helmet" is the label; the stepper has 56 pixels. The
       part after the separator is the part that differs between the five, so
       that is the part shown — and where there is no separator the whole
       label is already the distinguishing bit. */
    private static String shortName(HudConfig.Element el, String name) {
        String s = el.display(name);
        int dot = s.lastIndexOf('·');
        return (dot >= 0 ? s.substring(dot + 1).trim() : s).toUpperCase(java.util.Locale.ROOT);
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (button != 0) return super.mouseClicked(mouseX, mouseY, button);

        int lx = px + Paint.PANEL_PAD;
        int lw = PANEL_W - Paint.PANEL_PAD * 2;
        if (Ui.hit(mouseX, mouseY, closeX(), closeY(), 11, 11)) { close(); return true; }
        if (Ui.hit(mouseX, mouseY, lx, backY(), lw, 14)) { close(); return true; }
        if (mouseY < viewTop || mouseY >= viewTop + viewH) return super.mouseClicked(mouseX, mouseY, button);

        String n = name();
        HudConfig.Element el = element();
        if (n == null || el == null) return super.mouseClicked(mouseX, mouseY, button);

        int rightX = lx + lw;
        int sx = rightX - VALUE_W;
        int y = viewTop - scroll;

        for (Row r : rows) {
            int sy = y + (Paint.ROW - 11) / 2;
            int slY = y + (Paint.ROW - Ui.SLIDER_H) / 2;
            switch (r.kind) {
                case PICK:
                    if (Ui.hit(mouseX, mouseY, sx, sy, VALUE_W, 11)) {
                        /* left half steps back, right half forward — with more
                           than two values the direction has to mean something */
                        boolean back = mouseX < sx + VALUE_W / 2.0;
                        which = (which + (back ? owned.size() - 1 : 1)) % owned.size();
                        click();
                        return true;
                    }
                    break;
                case SCALE:
                    if (Ui.overSlider(mouseX, mouseY, sx, slY, VALUE_W)) {
                        dragging = SCALE;
                        config.put(n, el.scaledTo(sliderToScale(Ui.sliderValue(mouseX, sx, VALUE_W))));
                        return true;
                    }
                    break;
                case ANCHOR:
                    if (Ui.hit(mouseX, mouseY, sx, sy, VALUE_W, 11)) {
                        boolean back = mouseX < sx + VALUE_W / 2.0;
                        config.put(n, el.movedTo(nextAnchor(el.anchor, back), el.x, el.y));
                        click();
                        return true;
                    }
                    break;
                case PLATE:
                    if (Ui.hit(mouseX, mouseY, rightX - Ui.BOX, y + (Paint.ROW - Ui.BOX) / 2, Ui.BOX, Ui.BOX)) {
                        config.put(n, el.styled(el.style.withPlate(!el.style.plate)));
                        click();
                        return true;
                    }
                    break;
                case PLATE_RGB: {
                    int rgb = Ui.swatchAt(mouseX, mouseY, lx, y + Paint.ROW - 3);
                    if (rgb >= 0) { config.put(n, el.styled(el.style.withPlateRgb(rgb))); click(); return true; }
                    break;
                }
                case PLATE_A:
                    if (Ui.overSlider(mouseX, mouseY, sx, slY, VALUE_W)) {
                        dragging = PLATE_A;
                        config.put(n, el.styled(el.style.withPlateAlpha(Ui.sliderValue(mouseX, sx, VALUE_W))));
                        return true;
                    }
                    break;
                case TEXT_RGB: {
                    int rgb = Ui.swatchAt(mouseX, mouseY, lx, y + Paint.ROW - 3);
                    if (rgb >= 0) { config.put(n, el.styled(el.style.withTextRgb(rgb))); click(); return true; }
                    break;
                }
                case TEXT_A:
                    if (Ui.overSlider(mouseX, mouseY, sx, slY, VALUE_W)) {
                        dragging = TEXT_A;
                        config.put(n, el.styled(el.style.withTextAlpha(Ui.sliderValue(mouseX, sx, VALUE_W))));
                        return true;
                    }
                    break;
                case OPT: {
                    HudConfig.OptSpec sp = config.spec(r.key);
                    if (sp == null) break;
                    if (sp.isEnum()) {
                        if (Ui.hit(mouseX, mouseY, sx, sy, VALUE_W, 11)) {
                            boolean back = mouseX < sx + VALUE_W / 2.0;
                            String cur = el.choice(r.key, sp.vals.get(0));
                            int at = Math.max(0, sp.vals.indexOf(cur));
                            int nxt = (at + (back ? sp.vals.size() - 1 : 1)) % sp.vals.size();
                            /* written back as the RAW TOKEN, quotes and all,
                               because that is how the document holds it */
                            config.put(n, el.withOpt(r.key, '"' + sp.vals.get(nxt) + '"'));
                            click();
                            return true;
                        }
                    } else if (Ui.hit(mouseX, mouseY, rightX - Ui.BOX,
                                      y + (Paint.ROW - Ui.BOX) / 2, Ui.BOX, Ui.BOX)) {
                        config.put(n, el.withOpt(r.key, el.flag(r.key) ? "false" : "true"));
                        click();
                        return true;
                    }
                    break;
                }
                default:
                    break;
            }
            y += r.h;
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    /* A SLIDER YOU CANNOT DRAG IS A ROW OF BUTTONS. The press picked which
       one; every move until the release goes to that one, wherever the
       pointer has wandered to vertically — otherwise the value stops changing
       the moment you drift a few pixels off a 9px track. */
    @Override
    public boolean mouseDragged(double mouseX, double mouseY, int button, double dx, double dy) {
        if (dragging < 0 || button != 0) return super.mouseDragged(mouseX, mouseY, button, dx, dy);
        String n = name();
        HudConfig.Element el = element();
        if (n == null || el == null) return true;

        int sx = px + Paint.PANEL_PAD + (PANEL_W - Paint.PANEL_PAD * 2) - VALUE_W;
        int v = Ui.sliderValue(mouseX, sx, VALUE_W);
        if (dragging == SCALE) config.put(n, el.scaledTo(sliderToScale(v)));
        else if (dragging == PLATE_A) config.put(n, el.styled(el.style.withPlateAlpha(v)));
        else if (dragging == TEXT_A) config.put(n, el.styled(el.style.withTextAlpha(v)));
        return true;
    }

    @Override
    public boolean mouseReleased(double mouseX, double mouseY, int button) {
        if (dragging >= 0 && button == 0) { dragging = -1; return true; }
        return super.mouseReleased(mouseX, mouseY, button);
    }

    private static String nextAnchor(String a, boolean back) {
        String[] all = { "tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br" };
        int at = 0;
        for (int i = 0; i < all.length; i++) if (all[i].equals(a)) { at = i; break; }
        return all[(at + (back ? all.length - 1 : 1)) % all.length];
    }

    private void click() {
        if (this.client != null) {
            this.client.getSoundManager().play(
                net.minecraft.client.sound.PositionedSoundInstance.master(
                    net.minecraft.sound.SoundEvents.UI_BUTTON_CLICK, 1.0f));
        }
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontal, double vertical) {
        if (contentH() > viewH) {
            scroll -= (int) (vertical * Paint.ROW);
            clampScroll();
            return true;
        }
        return super.mouseScrolled(mouseX, mouseY, horizontal, vertical);
    }

    /* BACK TO THE MENU, NOT OUT TO THE WORLD — the menu is where the single
       save happens, and routing through it keeps a whole sitting to one write. */
    @Override
    public void close() {
        if (this.client != null) this.client.setScreen(parent);
    }

    @Override
    public boolean shouldPause() {
        return false;
    }
}
