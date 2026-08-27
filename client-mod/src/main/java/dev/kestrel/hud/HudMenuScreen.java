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
 * <p>A grid of cards, one per module, each with its own {@code OPTIONS} and an
 * {@code ENABLED} button. The first version of this screen was a list of rows
 * with a toggle on the right; it worked and it was not what was asked for. The
 * card is better for a reason worth stating on its own: <b>the enable and the
 * configure are two different controls</b>, and a row with one toggle has
 * nowhere to put the second one.
 *
 * <p><b>EVERY CARD SHOWS THE REAL ELEMENT, NOT AN ICON.</b> The obvious thing
 * was a little glyph per module. This draws the element itself instead, at
 * whatever colour, transparency and plate setting it currently has, using the
 * same renderer the world does — so the grid is a contact sheet of your HUD,
 * and picking a red for the coordinates shows up here before you close the
 * menu. An invented icon would have been more work and told you less.
 *
 * <p><b>TWO MODES, NOT ONE SCREEN.</b> The list and {@code EDIT HUD LAYOUT} are
 * separate screens: toggling things and dragging things want different ones,
 * and a panel in the middle of the display is exactly the wrong thing to have
 * on top of what you are positioning.
 *
 * <p><b>THE HUD STAYS DRAWN WHILE THIS IS OPEN.</b> {@code KestrelHudClient}
 * lets its render callback through for this screen specifically, so flipping a
 * module off shows you the element vanishing from the corner it was in.
 *
 * <p><b>A CARD IS A MODULE, NOT AN ELEMENT.</b> "Armor status" owns five
 * elements and the launcher's own screen switches them together; five armour
 * cards would be a second model of visibility, disagreeing with the first.
 * Where a module owns more than one element, {@link HudElementScreen} steps
 * between them.
 */
public class HudMenuScreen extends Screen {

    private static final int CARD_W = 76;
    private static final int CARD_H = 62;
    private static final int CARD_GAP = 6;
    private static final int COLS = 3;

    private static final int PANEL_W = CARD_W * COLS + CARD_GAP * (COLS - 1) + Paint.PANEL_PAD * 2;
    private static final int TITLE_H = 18;
    private static final int FOOT_H = 39;
    private static final int VALUE_W = 62;

    private final HudConfig config;
    private final Path runDir;

    /** the modules, in the order the launcher wrote their elements, each
     *  with the element names it owns */
    private final Map<String, List<String>> modules = new LinkedHashMap<>();
    private final List<String> order = new ArrayList<>();

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

        int content = gridH() + Paint.SECTION_GAP + Paint.ROW + Paint.ROW * 2;
        ph = Math.min(TITLE_H + content + Paint.PANEL_PAD * 2 + FOOT_H, this.height - 24);
        px = (this.width - PANEL_W) / 2;
        py = (this.height - ph) / 2;
        viewTop = py + TITLE_H + Paint.PANEL_PAD;
        viewH = ph - TITLE_H - FOOT_H - Paint.PANEL_PAD * 2;
        clampScroll();
    }

    private int rows() { return (order.size() + COLS - 1) / COLS; }
    private int gridH() { return rows() == 0 ? 0 : rows() * CARD_H + (rows() - 1) * CARD_GAP; }

    private int contentH() {
        /* the grid, then the two whole-HUD choices under a heading */
        return gridH() + Paint.SECTION_GAP + Paint.ROW + Paint.ROW * 2;
    }

    private void clampScroll() {
        int max = Math.max(0, contentH() - viewH);
        if (scroll > max) scroll = max;
        if (scroll < 0) scroll = 0;
    }

    /* ── geometry, computed once and read by BOTH the render pass and the
       click handler. The version of this that keeps two tables of rectangles
       in step is the version that stops being in step. ─────────────────── */
    private int cardX(int i) { return px + Paint.PANEL_PAD + (i % COLS) * (CARD_W + CARD_GAP); }
    private int cardY(int i) { return viewTop - scroll + (i / COLS) * (CARD_H + CARD_GAP); }
    private int optionsY(int cardTop) { return cardTop + 3 + 22 + 10; }
    private int enabledY(int cardTop) { return optionsY(cardTop) + 11 + 2; }
    private int appearY() { return viewTop - scroll + gridH() + Paint.SECTION_GAP; }
    private int cornersY() { return appearY() + Paint.ROW; }
    private int fontY() { return cornersY() + Paint.ROW; }
    private int editY() { return py + ph - FOOT_H + 5; }
    private int doneY() { return py + ph - FOOT_H + 22; }
    private int closeX() { return px + PANEL_W - Paint.PANEL_PAD - 11; }
    private int closeY() { return py + 4; }

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
        ctx.fill(0, 0, this.width, this.height, Paint.SCRIM);

        Ui.panel(ctx, px, py, PANEL_W, ph);
        Ui.left(ctx, this.textRenderer, "KESTREL HUD", px + Paint.PANEL_PAD, py + 6, Paint.VALUE);
        Ui.close(ctx, closeX(), closeY(), 11, Ui.hit(mouseX, mouseY, closeX(), closeY(), 11, 11));
        Ui.rule(ctx, px + 1, py + TITLE_H - 1, PANEL_W - 2);

        ctx.enableScissor(px + 1, viewTop, px + PANEL_W - 1, viewTop + viewH);
        for (int i = 0; i < order.size(); i++) {
            int cx = cardX(i), cy = cardY(i);
            if (cy + CARD_H > viewTop - CARD_H && cy < viewTop + viewH) {
                card(ctx, order.get(i), cx, cy, mouseX, mouseY);
            }
        }

        int lx = px + Paint.PANEL_PAD;
        int lw = PANEL_W - Paint.PANEL_PAD * 2;
        Ui.heading(ctx, this.textRenderer, "APPEARANCE", lx, appearY() + 3, lw);
        stepRow(ctx, "Corners", config.rounded ? "ROUNDED" : "SHARP", lx, cornersY(), lw, mouseX, mouseY);
        stepRow(ctx, "Font", config.kestrelFont ? "KESTREL" : "MINECRAFT", lx, fontY(), lw, mouseX, mouseY);
        ctx.disableScissor();

        if (scroll > 0) ctx.fill(px + 1, viewTop, px + PANEL_W - 1, viewTop + 1, Paint.DEFINE);
        if (scroll < contentH() - viewH) {
            ctx.fill(px + 1, viewTop + viewH - 1, px + PANEL_W - 1, viewTop + viewH, Paint.DEFINE);
        }

        Ui.rule(ctx, px + 1, py + ph - FOOT_H, PANEL_W - 2);
        int bx = px + Paint.PANEL_PAD;
        int bw = PANEL_W - Paint.PANEL_PAD * 2;
        Ui.button(ctx, this.textRenderer, bx, editY(), bw, 14, "EDIT HUD LAYOUT",
            Ui.hit(mouseX, mouseY, bx, editY(), bw, 14), false);
        Ui.button(ctx, this.textRenderer, bx, doneY(), bw, 14, "DONE",
            Ui.hit(mouseX, mouseY, bx, doneY(), bw, 14), true);
    }

    private void stepRow(DrawContext ctx, String label, String value, int x, int y, int w, int mx, int my) {
        if (my >= y && my < y + Paint.ROW && mx >= x && mx < x + w) Ui.rowHover(ctx, x - 2, y, w + 4, Paint.ROW);
        Ui.left(ctx, this.textRenderer, label, x, y + 3, Paint.BODY);
        int sx = x + w - VALUE_W;
        int sy = y + (Paint.ROW - 11) / 2;
        Ui.stepper(ctx, this.textRenderer, sx, sy, VALUE_W, 11, value,
            Ui.hit(mx, my, sx, sy, Ui.STEP_ARROW, 11),
            Ui.hit(mx, my, sx + VALUE_W - Ui.STEP_ARROW, sy, Ui.STEP_ARROW, 11));
    }

    private void card(DrawContext ctx, String mod, int x, int y, int mx, int my) {
        boolean on = moduleOn(mod);
        ctx.fill(x, y, x + CARD_W, y + CARD_H, Paint.RAISE);
        Ui.border(ctx, x, y, CARD_W, CARD_H, Paint.REGION);

        preview(ctx, mod, x, y + 3, CARD_W, 22);

        /* the module name, clipped rather than wrapped: "Potion effects" fits
           and anything that does not is a name the launcher should shorten,
           not a line this should break */
        String name = mod;
        while (this.textRenderer.getWidth(name) > CARD_W - 6 && name.length() > 3) {
            name = name.substring(0, name.length() - 1);
        }
        if (!name.equals(mod)) name = name.substring(0, Math.max(1, name.length() - 1)) + "…";
        Ui.centred(ctx, this.textRenderer, name, x, CARD_W, y + 3 + 22 + 1,
            moduleDrawn(mod) ? Paint.VALUE : Paint.MUTE);

        int bx = x + 3;
        int bw = CARD_W - 6;
        int oy = optionsY(y);
        boolean overOpt = Ui.hit(mx, my, bx, oy, bw, 11);
        ctx.fill(bx, oy, bx + bw, oy + 11, overOpt ? Paint.HOVER : Paint.PANEL);
        Ui.border(ctx, bx, oy, bw, 11, Paint.DEFINE);
        Ui.centred(ctx, this.textRenderer, "OPTIONS", bx - 5, bw, oy + 2, overOpt ? Paint.VALUE : Paint.BODY);
        Ui.gear(ctx, bx + bw - 12, oy + 2, overOpt ? Paint.ACCENT : Paint.MUTE);

        /* ENABLED IS THE ACCENT, NOT GREEN. Green appears nowhere in
           Kestrel's palette, and an enabled state should read as ON rather
           than as APPROVED. */
        int ey = enabledY(y);
        boolean overEn = Ui.hit(mx, my, bx, ey, bw, 11);
        Ui.button(ctx, this.textRenderer, bx, ey, bw, 11, on ? "ENABLED" : "DISABLED", overEn, on);

        if (!moduleDrawn(mod)) {
            /* SAID PLAINLY. Nine of the eleven elements are arranged, carried
               and toggled but not yet drawn in the world. The toggle really
               does work — it reaches the config and the launcher — so the
               card says what will not happen rather than pretending. */
            Ui.centred(ctx, this.textRenderer, "not drawn yet", x, CARD_W, y + 3 + 9, Paint.FAINT);
        }
    }

    /* THE CARD'S PICTURE IS THE ELEMENT ITSELF, drawn by the same code the
       world uses and scaled down to fit. Anything wider than the card is
       shrunk rather than clipped: a coordinate readout cut off after "X 12"
       would misrepresent the width of the thing you are about to place. */
    private void preview(DrawContext ctx, String mod, int x, int y, int w, int h) {
        List<String> owned = modules.getOrDefault(mod, List.of());
        if (owned.isEmpty() || this.client == null) return;
        String name = owned.get(0);
        HudConfig.Element el = config.get(name);
        if (el == null) return;

        List<HudElements.Run> runs = HudElements.of(name, el, this.client, KestrelHudClient.face(config), true);
        if (runs == null || runs.isEmpty()) return;

        int ew = HudRenderer.width(this.textRenderer, runs);
        int eh = HudRenderer.height();
        double s = Math.min(1.0, (w - 8.0) / ew);
        double dx = x + (w - ew * s) / 2.0;
        double dy = y + (h - eh * s) / 2.0;
        HudRenderer.draw(ctx, this.textRenderer, runs, dx, dy, ew, eh, s, config.rounded, el.style);
    }

    /* ── clicking ───────────────────────────────────────────────────────── */
    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (button != 0) return super.mouseClicked(mouseX, mouseY, button);

        if (Ui.hit(mouseX, mouseY, closeX(), closeY(), 11, 11)) { close(); return true; }

        int bx = px + Paint.PANEL_PAD;
        int bw = PANEL_W - Paint.PANEL_PAD * 2;
        if (Ui.hit(mouseX, mouseY, bx, editY(), bw, 14)) {
            if (this.client != null) this.client.setScreen(new HudLayoutScreen(config, runDir, this));
            return true;
        }
        if (Ui.hit(mouseX, mouseY, bx, doneY(), bw, 14)) { close(); return true; }

        if (mouseY < viewTop || mouseY >= viewTop + viewH) return super.mouseClicked(mouseX, mouseY, button);

        for (int i = 0; i < order.size(); i++) {
            int cx = cardX(i), cy = cardY(i);
            int ibx = cx + 3, ibw = CARD_W - 6;
            if (Ui.hit(mouseX, mouseY, ibx, optionsY(cy), ibw, 11)) {
                if (this.client != null) {
                    this.client.setScreen(new HudElementScreen(config, runDir, this,
                        order.get(i), modules.get(order.get(i))));
                }
                return true;
            }
            if (Ui.hit(mouseX, mouseY, ibx, enabledY(cy), ibw, 11)) {
                flipModule(order.get(i));
                click();
                return true;
            }
        }

        int lx = px + Paint.PANEL_PAD;
        int lw = PANEL_W - Paint.PANEL_PAD * 2;
        int sx = lx + lw - VALUE_W;
        /* EITHER ARROW FLIPS IT, and so does the middle. Two values make
           "next" and "previous" the same move, and a stepper that responds
           only on nine pixels of arrow is one people think is broken. */
        if (Ui.hit(mouseX, mouseY, sx, cornersY() + (Paint.ROW - 11) / 2, VALUE_W, 11)) {
            config.rounded = !config.rounded; config.touch(); click(); return true;
        }
        if (Ui.hit(mouseX, mouseY, sx, fontY() + (Paint.ROW - 11) / 2, VALUE_W, 11)) {
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
       This is the one exit. The layout editor and the per-element screen both
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
