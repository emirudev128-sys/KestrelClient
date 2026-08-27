package dev.kestrel.hud;

import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * THE MENU. Right Shift opens it.
 *
 * <p>A landscape panel over a blurred world, holding a grid of cards — one per
 * module, each with its own {@code OPTIONS} and {@code ENABLED}.
 *
 * <p><b>THE PANEL IS WIDE, NOT SQUARE.</b> The first build was 256 across and
 * about as tall, which read as a dialog box rather than as a screen. Screens
 * are landscape because monitors are: the grid gets four columns instead of
 * three, the two appearance controls sit side by side instead of stacked, and
 * the footer buttons share a row. Width is taken from what the window
 * actually has rather than fixed, so it stays landscape at GUI scale 4 on a
 * small window instead of running off both edges.
 *
 * <p><b>THE WORLD BEHIND IT IS BLURRED, AND NOTHING ELSE.</b>
 * {@link #applyBlur()} is vanilla's own path and vanilla's own
 * {@code renderBackground} calls it. The tint that used to go over the blur is
 * now zero: vanilla darkens its in-game screens with a 75-80% gradient, this
 * went to 30%, and dialling it against the real thing put it at nothing at
 * all. The blur does the separating on its own, and every percent of tint was
 * costing legibility on the HUD elements drawn around the panel — which are
 * the things being configured.
 *
 * <p><b>NOTHING IN HERE MOVES.</b> Every preview is
 * {@link HudElements#SAMPLE} — fixed text. A card with a live fps counter in
 * it flickers the entire time the menu is open and changes width as the number
 * crosses 100, which is motion at the edge of your eye while you are trying to
 * read a menu.
 *
 * <p><b>EVERY CARD SHOWS THE REAL ELEMENT, NOT AN ICON.</b> The obvious thing
 * was a small glyph per module. Drawing the element itself — through the same
 * renderer the world uses, at whatever colour, transparency and plate setting
 * it currently has — makes the grid a contact sheet of your own HUD, so a
 * colour picked in the options screen shows up here the moment you come back.
 *
 * <p><b>A CARD IS A MODULE, NOT AN ELEMENT.</b> "Armor status" owns five
 * elements and the launcher's own screen switches them together; five armour
 * cards would be a second model of visibility, disagreeing with the first.
 * Where a module owns more than one element, {@link HudElementScreen} steps
 * between them.
 */
public class HudMenuScreen extends Screen {

    /* ── the card ─────────────────────────────────────────────────────────
       Wider than it is tall, and laid out as three bands: a sunken well with
       the element in it, the module's name, then the two controls. The well
       is the part that makes it read as a card rather than as a box of text —
       a preview floating on the card's own surface looks like more of the
       card's own writing. */
    private static final int CARD_W = 84;
    private static final int CARD_H = 74;
    private static final int CARD_GAP = 9;
    private static final int WELL_H = 26;
    private static final int BTN_H = 12;
    private static final int MAX_COLS = 4;
    private static final int MIN_COLS = 2;

    private static final int TITLE_H = 22;
    private static final int FOOT_H = 26;
    private static final int STEP_W = 66;

    private final HudConfig config;
    private final Path runDir;

    private final Map<String, List<String>> modules = new LinkedHashMap<>();
    private final List<String> order = new ArrayList<>();

    private int cols = MAX_COLS;
    private int panelW;
    private int px, py, ph;
    private int viewTop, viewH;
    private int scroll;

    public HudMenuScreen(HudConfig config, Path runDir) {
        super(Text.literal("Kestrel HUD"));
        this.config = config;
        this.runDir = runDir;
    }

    @Override
    protected void init() {
        modules.clear();
        order.clear();
        for (String name : config.names()) {
            HudConfig.Element el = config.get(name);
            if (el == null) continue;
            String mod = el.module.isEmpty() ? el.display(name) : el.module;
            if (!modules.containsKey(mod)) { modules.put(mod, new ArrayList<>()); order.add(mod); }
            modules.get(mod).add(name);
        }

        /* AS MANY COLUMNS AS THE WINDOW HOLDS, between two and four. Fixed at
           four, the panel is 374 wide and overflows a small window at GUI
           scale 4; fixed at two it is a column of cards on a monitor with room
           for a screen. */
        int room = this.width - 48;
        int fit = (room - Paint.PANEL_PAD * 2 + CARD_GAP) / (CARD_W + CARD_GAP);
        cols = Math.max(MIN_COLS, Math.min(MAX_COLS, Math.min(fit, Math.max(1, order.size()))));
        panelW = cols * CARD_W + (cols - 1) * CARD_GAP + Paint.PANEL_PAD * 2;

        ph = Math.min(TITLE_H + contentH() + Paint.PANEL_PAD * 2 + FOOT_H, this.height - 20);
        px = (this.width - panelW) / 2;
        py = (this.height - ph) / 2;
        viewTop = py + TITLE_H + Paint.PANEL_PAD;
        viewH = ph - TITLE_H - FOOT_H - Paint.PANEL_PAD * 2;
        clampScroll();
    }

    private int rows() { return (order.size() + cols - 1) / cols; }
    private int gridH() { return rows() == 0 ? 0 : rows() * CARD_H + (rows() - 1) * CARD_GAP; }

    /** the grid, then a headed row holding both appearance steppers */
    private int contentH() { return gridH() + Paint.SECTION_GAP + Paint.ROW + Paint.ROW; }

    private void clampScroll() {
        int max = Math.max(0, contentH() - viewH);
        if (scroll > max) scroll = max;
        if (scroll < 0) scroll = 0;
    }

    /* ── geometry, computed once and read by BOTH the render pass and the
       click handler. The version of this that keeps two tables of rectangles
       in step is the version that stops being in step. ─────────────────── */
    private int cardX(int i) { return px + Paint.PANEL_PAD + (i % cols) * (CARD_W + CARD_GAP); }
    private int cardY(int i) { return viewTop - scroll + (i / cols) * (CARD_H + CARD_GAP); }
    private int optionsY(int top) { return top + WELL_H + 14; }
    private int enabledY(int top) { return optionsY(top) + BTN_H + 3; }
    private int appearY() { return viewTop - scroll + gridH() + Paint.SECTION_GAP; }
    private int stepY() { return appearY() + Paint.ROW; }
    private int closeX() { return px + panelW - Paint.PANEL_PAD - 11; }
    private int closeY() { return py + 6; }
    private int footY() { return py + ph - FOOT_H + 6; }
    private int doneW() { return 68; }
    private int doneX() { return px + panelW - Paint.PANEL_PAD - doneW(); }
    private int editX() { return px + Paint.PANEL_PAD; }
    private int editW() { return panelW - Paint.PANEL_PAD * 2 - doneW() - 6; }

    private boolean moduleOn(String mod) {
        for (String n : modules.getOrDefault(mod, List.of())) {
            HudConfig.Element el = config.get(n);
            if (el != null && el.on) return true;
        }
        return false;
    }

    private boolean moduleDrawn(String mod) {
        for (String n : modules.getOrDefault(mod, List.of())) if (HudElements.drawn(n)) return true;
        return false;
    }

    private void flipModule(String mod) {
        boolean next = !moduleOn(mod);
        for (String n : modules.getOrDefault(mod, List.of())) {
            HudConfig.Element el = config.get(n);
            if (el != null) config.put(n, el.switchedTo(next));
        }
    }

    /* ── drawing ────────────────────────────────────────────────────────── */
    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        applyBlur();
        ctx.fill(0, 0, this.width, this.height, Paint.SCRIM);

        Ui.panel(ctx, px, py, panelW, ph);
        Ui.left(ctx, this.textRenderer, "KESTREL HUD", px + Paint.PANEL_PAD, py + 7, Paint.VALUE);
        /* the count, set behind the title: it says the panel is a list of
           things without competing with the name of the screen */
        int titleEnd = px + Paint.PANEL_PAD + this.textRenderer.getWidth("KESTREL HUD") + 7;
        Ui.left(ctx, this.textRenderer, order.size() + " modules", titleEnd, py + 7, Paint.MUTE);
        Ui.close(ctx, closeX(), closeY(), 11, Ui.hit(mouseX, mouseY, closeX(), closeY(), 11, 11));
        Ui.rule(ctx, px + 1, py + TITLE_H - 1, panelW - 2);

        ctx.enableScissor(px + 1, viewTop, px + panelW - 1, viewTop + viewH);
        for (int i = 0; i < order.size(); i++) {
            int cy = cardY(i);
            if (cy + CARD_H > viewTop - CARD_H && cy < viewTop + viewH) {
                card(ctx, order.get(i), cardX(i), cy, mouseX, mouseY);
            }
        }
        appearance(ctx, mouseX, mouseY);
        ctx.disableScissor();

        if (scroll > 0) ctx.fill(px + 1, viewTop, px + panelW - 1, viewTop + 1, Paint.DEFINE);
        if (scroll < contentH() - viewH) {
            ctx.fill(px + 1, viewTop + viewH - 1, px + panelW - 1, viewTop + viewH, Paint.DEFINE);
        }

        Ui.rule(ctx, px + 1, py + ph - FOOT_H, panelW - 2);
        Ui.button(ctx, this.textRenderer, editX(), footY(), editW(), 14, "EDIT HUD LAYOUT",
            Ui.hit(mouseX, mouseY, editX(), footY(), editW(), 14), false);
        Ui.button(ctx, this.textRenderer, doneX(), footY(), doneW(), 14, "DONE",
            Ui.hit(mouseX, mouseY, doneX(), footY(), doneW(), 14), true);
    }

    /* THE TWO WHOLE-HUD CHOICES, side by side rather than one per row. They
       are the same kind of control with the same kind of value, and a wide
       panel that stacks two short rows down the left has wasted the width it
       asked for. */
    private void appearance(DrawContext ctx, int mx, int my) {
        int lx = px + Paint.PANEL_PAD;
        int lw = panelW - Paint.PANEL_PAD * 2;
        Ui.heading(ctx, this.textRenderer, "APPEARANCE", lx, appearY() + 4, lw);

        int half = lw / 2;
        stepper(ctx, "Corners", config.rounded ? "ROUNDED" : "SHARP", lx, stepY(), half - 6, mx, my);
        stepper(ctx, "Font", config.kestrelFont ? "KESTREL" : "MINECRAFT", lx + half + 6, stepY(), half - 6, mx, my);
    }

    private void stepper(DrawContext ctx, String label, String value, int x, int y, int w, int mx, int my) {
        Ui.left(ctx, this.textRenderer, label, x, y + 3, Paint.BODY);
        int sx = x + w - STEP_W;
        int sy = y + (Paint.ROW - 11) / 2;
        Ui.stepper(ctx, this.textRenderer, sx, sy, STEP_W, 11, value,
            Ui.hit(mx, my, sx, sy, Ui.STEP_ARROW, 11),
            Ui.hit(mx, my, sx + STEP_W - Ui.STEP_ARROW, sy, Ui.STEP_ARROW, 11));
    }

    private void card(DrawContext ctx, String mod, int x, int y, int mx, int my) {
        boolean on = moduleOn(mod);
        boolean drawn = moduleDrawn(mod);
        boolean overCard = Ui.hit(mx, my, x, y, CARD_W, CARD_H);

        /* HOVER IS THE FILL, and now it is the only thing. The card used to
           brighten its outline as well, which meant the hover state was
           carried twice and the resting state had a line round it for no
           reason. */
        Ui.surface(ctx, x, y, CARD_W, CARD_H, Paint.R_CARD,
            overCard ? Paint.HOVER : Paint.RAISE);

        /* THE WELL FOLLOWS THE CARD'S TOP CORNERS AND SQUARES OFF AT THE
           BOTTOM, because that is where it meets the card's own surface
           rather than its edge. Rounding all four would leave four slivers of
           card showing under it and read as a floating tile. */
        int wy = y + 1, wx = x + 1, ww = CARD_W - 2, wh = WELL_H - 1;
        Ui.roundRect(ctx, wx, wy, ww, wh + Paint.R_WELL, Paint.R_WELL, Paint.WELL);
        ctx.fill(wx, wy + wh, wx + ww, wy + wh + Paint.R_WELL, Paint.WELL);
        preview(ctx, mod, wx, wy, ww, wh);

        /* AN ELEMENT THAT IS OFF IS SHOWN FAINT, not hidden. The card is how
           you find the thing again to switch it back on. */
        if (!on) ctx.fill(wx, wy, wx + ww, wy + wh, 0xAA12151B);

        String name = clip(mod, CARD_W - 8);
        Ui.centred(ctx, this.textRenderer, name, x, CARD_W, y + WELL_H + 3, on ? Paint.VALUE : Paint.MUTE);
        if (!drawn) {
            Ui.centred(ctx, this.textRenderer, "not drawn yet", x, CARD_W, y + WELL_H + 3, Paint.FAINT);
        }

        int bx = x + 4;
        int bw = CARD_W - 8;
        int oy = optionsY(y);
        boolean overOpt = Ui.hit(mx, my, bx, oy, bw, BTN_H);
        Ui.surface(ctx, bx, oy, bw, BTN_H, Paint.R_CTRL, overOpt ? Paint.ACTIVE : Paint.PANEL);
        Ui.centred(ctx, this.textRenderer, "OPTIONS", bx - 6, bw, oy + 2, overOpt ? Paint.VALUE : Paint.BODY);
        Ui.gear(ctx, bx + bw - 13, oy + 2, overOpt ? Paint.ACCENT : Paint.MUTE,
            overOpt ? Paint.ACTIVE : Paint.PANEL);

        /* ENABLED IS THE ACCENT, NOT GREEN. Green appears nowhere in
           Kestrel's palette, and an enabled state should read as ON rather
           than as APPROVED. */
        int ey = enabledY(y);
        Ui.button(ctx, this.textRenderer, bx, ey, bw, BTN_H, on ? "ENABLED" : "DISABLED",
            Ui.hit(mx, my, bx, ey, bw, BTN_H), on);
    }

    /** cut to fit with an ellipsis rather than wrapped: a name that does not
     *  fit on a card is one the launcher should shorten, not a line this
     *  should break */
    private String clip(String s, int w) {
        if (this.textRenderer.getWidth(s) <= w) return s;
        String cut = s;
        while (cut.length() > 1 && this.textRenderer.getWidth(cut + "…") > w) {
            cut = cut.substring(0, cut.length() - 1);
        }
        return cut + "…";
    }

    /* THE CARD'S PICTURE IS THE ELEMENT ITSELF, drawn by the code the world
       uses, from FIXED sample text. Shrunk to fit rather than clipped: a
       coordinate readout cut off after "X 118" would misrepresent the width of
       the thing you are about to place. */
    private void preview(DrawContext ctx, String mod, int x, int y, int w, int h) {
        List<String> owned = modules.getOrDefault(mod, List.of());
        if (owned.isEmpty() || this.client == null) return;
        String name = owned.get(0);
        HudConfig.Element el = config.get(name);
        if (el == null) return;

        List<List<HudElements.Run>> rows = HudElements.of(name, el, this.client,
            KestrelHudClient.face(config), HudElements.SAMPLE);
        if (rows == null || rows.isEmpty()) return;

        int ew = HudRenderer.width(this.textRenderer, rows);
        int eh = HudRenderer.height(rows);
        double s = Math.min(1.0, (w - 8.0) / ew);
        HudRenderer.draw(ctx, this.textRenderer, rows,
            x + (w - ew * s) / 2.0, y + (h - eh * s) / 2.0, ew, eh, s, config.rounded, el.style);
    }

    /* ── clicking ───────────────────────────────────────────────────────── */
    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (button != 0) return super.mouseClicked(mouseX, mouseY, button);

        if (Ui.hit(mouseX, mouseY, closeX(), closeY(), 11, 11)) { close(); return true; }
        if (Ui.hit(mouseX, mouseY, editX(), footY(), editW(), 14)) {
            if (this.client != null) this.client.setScreen(new HudLayoutScreen(config, runDir, this));
            return true;
        }
        if (Ui.hit(mouseX, mouseY, doneX(), footY(), doneW(), 14)) { close(); return true; }
        if (mouseY < viewTop || mouseY >= viewTop + viewH) return super.mouseClicked(mouseX, mouseY, button);

        for (int i = 0; i < order.size(); i++) {
            int cy = cardY(i);
            int bx = cardX(i) + 4;
            int bw = CARD_W - 8;
            if (Ui.hit(mouseX, mouseY, bx, optionsY(cy), bw, BTN_H)) {
                if (this.client != null) {
                    this.client.setScreen(new HudElementScreen(config, runDir, this,
                        order.get(i), modules.get(order.get(i))));
                }
                return true;
            }
            if (Ui.hit(mouseX, mouseY, bx, enabledY(cy), bw, BTN_H)) {
                flipModule(order.get(i));
                click();
                return true;
            }
        }

        int lx = px + Paint.PANEL_PAD;
        int lw = panelW - Paint.PANEL_PAD * 2;
        int half = lw / 2;
        int sy = stepY() + (Paint.ROW - 11) / 2;
        /* EITHER ARROW FLIPS IT, and so does the middle. Two values make
           "next" and "previous" the same move, and a stepper that responds
           only on nine pixels of arrow is one people think is broken. */
        if (Ui.hit(mouseX, mouseY, lx + half - 6 - STEP_W, sy, STEP_W, 11)) {
            config.rounded = !config.rounded; config.touch(); click(); return true;
        }
        if (Ui.hit(mouseX, mouseY, lx + lw - STEP_W, sy, STEP_W, 11)) {
            config.kestrelFont = !config.kestrelFont; config.touch(); click(); return true;
        }
        return super.mouseClicked(mouseX, mouseY, button);
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

    /* ── SAVED ON THE WAY OUT, AND ONLY IF SOMETHING CHANGED ──────────────
       This is the one exit. The layout editor and the options screen both
       hand back here rather than to the world, so a session of dragging,
       toggling and recolouring produces exactly one write — and opening the
       menu to look at it produces none, because HudConfig.save() is a no-op
       on a document nobody edited. A launcher that saw a game-written file
       after every glance would import a "change" on every launch. */
    @Override
    public void close() {
        config.save(runDir);
        if (this.client != null) this.client.setScreen(null);
    }

    @Override
    public boolean shouldPause() {
        return false;
    }
}
