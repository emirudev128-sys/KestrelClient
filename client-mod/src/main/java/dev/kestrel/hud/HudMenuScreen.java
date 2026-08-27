package dev.kestrel.hud;

import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

/**
 * THE MENU. Right Shift opens it.
 *
 * <p>Toggles what the HUD shows and sets the two choices that apply to all of
 * it, and hands off to {@link HudLayoutScreen} for anything positional.
 *
 * <p><b>TWO MODES, NOT ONE SCREEN.</b> Lunar Client separates its mod list
 * from {@code EDIT HUD LAYOUT} and is right to: toggling things and dragging
 * things want different screens, and a panel in the middle of the display is
 * exactly the wrong thing to have on top of you while you position what is
 * underneath it. So this screen keeps the enable/configure split Lunar makes
 * per card — the toggle and the layout are never the same control — and
 * expresses it as two screens rather than two buttons on a card.
 *
 * <p><b>THE HUD STAYS DRAWN WHILE THIS IS OPEN.</b> {@code KestrelHudClient}
 * lets its render callback through for this screen specifically, so flipping
 * a module off shows you the element vanishing from the corner it was in.
 * That is the whole reason to configure a HUD from inside the game rather
 * than from the launcher, where it was already possible.
 *
 * <p><b>A TOGGLE SWITCHES A MODULE, NOT AN ELEMENT.</b> "Armor status" owns
 * five elements and the launcher's own screen switches them together; a menu
 * that offered five separate armour toggles would be a second model of
 * visibility, disagreeing with the first. The module names come off the
 * config file, which is to say out of the launcher, so this screen has no
 * list of its own to fall out of date.
 *
 * <p><b>NO COLLAPSIBLE SECTIONS, THOUGH THE REFERENCE HAS THEM.</b> NoRisk
 * collapses its groups because it has four; this has two and ten rows. A
 * disclosure triangle over five rows costs a click to see what fits on screen
 * already.
 */
public class HudMenuScreen extends Screen {

    /* row kinds. An int and a switch rather than a class hierarchy: there are
       five, they have no behaviour in common worth abstracting, and the whole
       list is built and read in this one file. */
    private static final int HEAD = 0;
    private static final int MODULE = 1;
    private static final int CORNERS = 2;
    private static final int FONT = 3;
    private static final int COMPASS = 4;

    private static final class Row {
        final int kind;
        final String label;
        /** MODULE only: the module name a toggle switches */
        final String module;
        /** MODULE only: false when this mod cannot yet draw any of it */
        final boolean drawable;
        Row(int kind, String label, String module, boolean drawable) {
            this.kind = kind; this.label = label; this.module = module; this.drawable = drawable;
        }
    }

    private static final int PANEL_W = 232;
    private static final int TITLE_H = 18;
    private static final int FOOT_H = 39;
    private static final int VALUE_W = 62;   /* the stepper column */

    private final HudConfig config;
    private final Path runDir;
    private final List<Row> rows = new ArrayList<>();

    private int px, py, ph;       /* the panel */
    private int viewTop, viewH;   /* the scrolling region */
    private int scroll;

    public HudMenuScreen(HudConfig config, Path runDir) {
        super(Text.literal("Kestrel HUD"));
        this.config = config;
        this.runDir = runDir;
    }

    /* ── the list, built once from the config ─────────────────────────────
       Order is the order the launcher wrote its elements, which is the order
       its own HUD screen lists them in. Preserving it means the two screens
       read the same way round, which matters more than any sorting this side
       could invent. */
    @Override
    protected void init() {
        rows.clear();
        rows.add(new Row(HEAD, "ELEMENTS", null, true));

        LinkedHashSet<String> seen = new LinkedHashSet<>();
        for (String name : config.names()) {
            HudConfig.Element el = config.get(name);
            if (el == null) continue;
            String mod = el.module.isEmpty() ? el.display(name) : el.module;
            if (!seen.add(mod)) continue;
            rows.add(new Row(MODULE, mod, mod, moduleDrawn(mod)));
        }

        rows.add(new Row(HEAD, "APPEARANCE", null, true));
        rows.add(new Row(CORNERS, "Corners", null, true));
        rows.add(new Row(FONT, "Font", null, true));
        /* offered only where it means something: compass belongs to coords */
        if (config.get("coords") != null) {
            rows.add(new Row(COMPASS, "Compass on coordinates", null, true));
        }

        int content = 0;
        for (Row r : rows) content += rowH(r);

        ph = Math.min(TITLE_H + content + Paint.PANEL_PAD * 2 + FOOT_H, this.height - 40);
        px = (this.width - PANEL_W) / 2;
        py = (this.height - ph) / 2;
        viewTop = py + TITLE_H + Paint.PANEL_PAD;
        viewH = ph - TITLE_H - FOOT_H - Paint.PANEL_PAD * 2;
        clampScroll(content);
    }

    private int rowH(Row r) {
        return r.kind == HEAD ? Paint.ROW + Paint.SECTION_GAP : Paint.ROW;
    }

    private int contentH() {
        int c = 0;
        for (Row r : rows) c += rowH(r);
        return c;
    }

    private void clampScroll(int content) {
        int max = Math.max(0, content - viewH);
        if (scroll > max) scroll = max;
        if (scroll < 0) scroll = 0;
    }

    /** a module counts as drawn if this mod can produce a value for any of
     *  its elements — so "Armor status" is honest about all five at once */
    private boolean moduleDrawn(String mod) {
        for (String name : config.names()) {
            HudConfig.Element el = config.get(name);
            if (el != null && mod.equals(el.module) && HudElements.drawn(name)) return true;
        }
        return false;
    }

    private boolean moduleOn(String mod) {
        for (String name : config.names()) {
            HudConfig.Element el = config.get(name);
            if (el != null && mod.equals(el.module) && el.on) return true;
        }
        return false;
    }

    private void flipModule(String mod) {
        boolean next = !moduleOn(mod);
        for (String name : config.names()) {
            HudConfig.Element el = config.get(name);
            if (el != null && mod.equals(el.module)) config.put(name, el.switchedTo(next));
        }
    }

    /* ── drawing ──────────────────────────────────────────────────────────
       The scrim is a fill rather than Lunar's blur. Blur is a shader pass
       whose API has moved in every recent Minecraft version, and it would
       have to be re-checked at every version bump for a visual nicety; the
       fill works and the world stays legible behind it, which was the point.
       Deliberately light enough that the HUD elements drawn around the panel
       — the things being configured — stay readable. */
    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        ctx.fill(0, 0, this.width, this.height, Paint.SCRIM);

        Ui.panel(ctx, px, py, PANEL_W, ph);
        Ui.left(ctx, this.textRenderer, "KESTREL HUD", px + Paint.PANEL_PAD, py + 6, Paint.VALUE);
        boolean overClose = Ui.hit(mouseX, mouseY, closeX(), closeY(), 11, 11);
        Ui.close(ctx, closeX(), closeY(), 11, overClose);
        Ui.rule(ctx, px + 1, py + TITLE_H - 1, PANEL_W - 2);

        int listX = px + Paint.PANEL_PAD;
        int listW = PANEL_W - Paint.PANEL_PAD * 2;

        ctx.enableScissor(px + 1, viewTop, px + PANEL_W - 1, viewTop + viewH);
        int y = viewTop - scroll;
        for (Row r : rows) {
            int h = rowH(r);
            if (y + h > viewTop - Paint.ROW && y < viewTop + viewH) {
                drawRow(ctx, r, listX, y, listW, mouseX, mouseY);
            }
            y += h;
        }
        ctx.disableScissor();

        /* the list is longer than the panel: say so at the edge it runs past,
           rather than leaving a row sliced in half as the only clue */
        int content = contentH();
        if (scroll > 0) ctx.fill(px + 1, viewTop, px + PANEL_W - 1, viewTop + 1, Paint.DEFINE);
        if (scroll < content - viewH) ctx.fill(px + 1, viewTop + viewH - 1, px + PANEL_W - 1, viewTop + viewH, Paint.DEFINE);

        Ui.rule(ctx, px + 1, py + ph - FOOT_H, PANEL_W - 2);
        int bx = px + Paint.PANEL_PAD;
        int bw = PANEL_W - Paint.PANEL_PAD * 2;
        Ui.button(ctx, this.textRenderer, bx, editY(), bw, 14, "EDIT HUD LAYOUT",
            Ui.hit(mouseX, mouseY, bx, editY(), bw, 14), false);
        Ui.button(ctx, this.textRenderer, bx, doneY(), bw, 14, "DONE",
            Ui.hit(mouseX, mouseY, bx, doneY(), bw, 14), true);
    }

    private void drawRow(DrawContext ctx, Row r, int x, int y, int w, int mouseX, int mouseY) {
        if (r.kind == HEAD) {
            Ui.heading(ctx, this.textRenderer, r.label, x, y + Paint.SECTION_GAP + 3, w);
            return;
        }

        boolean over = mouseY >= y && mouseY < y + Paint.ROW && mouseX >= x && mouseX < x + w;
        if (over) Ui.rowHover(ctx, x - 2, y, w + 4, Paint.ROW);

        int textY = y + 3;
        int rightX = x + w;

        switch (r.kind) {
            case MODULE: {
                boolean on = moduleOn(r.module);
                Ui.left(ctx, this.textRenderer, r.label, x, textY, r.drawable ? Paint.BODY : Paint.MUTE);
                /* SAID PLAINLY, NOT HIDDEN. Nine of the eleven elements are
                   arranged by the launcher and not yet drawn by this mod. A
                   toggle that appears to work and changes nothing on screen
                   is the worse failure; the toggle does work — it reaches the
                   config and the launcher — and the row says what will not
                   happen yet. */
                if (!r.drawable) {
                    Ui.right(ctx, this.textRenderer, "not drawn yet",
                        rightX - Ui.TOGGLE_W - 6, textY, Paint.FAINT);
                }
                int tx = rightX - Ui.TOGGLE_W;
                int ty = y + (Paint.ROW - Ui.TOGGLE_H) / 2;
                Ui.toggle(ctx, this.textRenderer, tx, ty, on,
                    Ui.hit(mouseX, mouseY, tx, ty, Ui.TOGGLE_W, Ui.TOGGLE_H), true);
                break;
            }
            case CORNERS:
            case FONT: {
                Ui.left(ctx, this.textRenderer, r.label, x, textY, Paint.BODY);
                int sx = rightX - VALUE_W;
                int sy = y + (Paint.ROW - 11) / 2;
                String value = r.kind == CORNERS
                    ? (config.rounded ? "ROUNDED" : "SHARP")
                    : (config.kestrelFont ? "KESTREL" : "MINECRAFT");
                Ui.stepper(ctx, this.textRenderer, sx, sy, VALUE_W, 11, value,
                    Ui.hit(mouseX, mouseY, sx, sy, Ui.STEP_ARROW, 11),
                    Ui.hit(mouseX, mouseY, sx + VALUE_W - Ui.STEP_ARROW, sy, Ui.STEP_ARROW, 11));
                break;
            }
            case COMPASS: {
                HudConfig.Element co = config.get("coords");
                Ui.left(ctx, this.textRenderer, r.label, x, textY, Paint.BODY);
                int cx = rightX - Ui.BOX;
                int cy = y + (Paint.ROW - Ui.BOX) / 2;
                Ui.check(ctx, cx, cy, co != null && co.compass,
                    Ui.hit(mouseX, mouseY, cx, cy, Ui.BOX, Ui.BOX));
                break;
            }
            default:
                break;
        }
    }

    private int closeX() { return px + PANEL_W - Paint.PANEL_PAD - 11; }
    private int closeY() { return py + 4; }
    private int editY() { return py + ph - FOOT_H + 5; }
    private int doneY() { return py + ph - FOOT_H + 22; }

    /* ── clicking ─────────────────────────────────────────────────────────
       Walks the same list, with the same row heights and the same scroll
       offset the render pass used. Not a copy of that geometry — the same
       rowH() and the same loop — because the version of this that keeps two
       tables of rectangles in step is the version that stops being in step. */
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

        int listX = px + Paint.PANEL_PAD;
        int listW = PANEL_W - Paint.PANEL_PAD * 2;
        int rightX = listX + listW;
        int y = viewTop - scroll;

        for (Row r : rows) {
            int h = rowH(r);
            if (r.kind != HEAD && mouseY >= y && mouseY < y + h) {
                switch (r.kind) {
                    case MODULE:
                        if (Ui.hit(mouseX, mouseY, rightX - Ui.TOGGLE_W,
                                   y + (Paint.ROW - Ui.TOGGLE_H) / 2, Ui.TOGGLE_W, Ui.TOGGLE_H)) {
                            flipModule(r.module);
                            click();
                            return true;
                        }
                        break;
                    case CORNERS:
                    case FONT: {
                        int sx = rightX - VALUE_W;
                        int sy = y + (Paint.ROW - 11) / 2;
                        /* EITHER ARROW FLIPS IT, and so does the middle. Two
                           values make "next" and "previous" the same move, and
                           a stepper that only responds on nine pixels of arrow
                           is a stepper people think is broken. */
                        if (Ui.hit(mouseX, mouseY, sx, sy, VALUE_W, 11)) {
                            if (r.kind == CORNERS) config.rounded = !config.rounded;
                            else config.kestrelFont = !config.kestrelFont;
                            config.touch();
                            click();
                            return true;
                        }
                        break;
                    }
                    case COMPASS: {
                        int cx = rightX - Ui.BOX;
                        int cy = y + (Paint.ROW - Ui.BOX) / 2;
                        if (Ui.hit(mouseX, mouseY, cx, cy, Ui.BOX, Ui.BOX)) {
                            HudConfig.Element co = config.get("coords");
                            if (co != null) config.put("coords", co.withCompass(!co.compass));
                            click();
                            return true;
                        }
                        break;
                    }
                    default:
                        break;
                }
            }
            y += h;
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
        int content = contentH();
        if (content > viewH) {
            scroll -= (int) (vertical * Paint.ROW);
            clampScroll(content);
            return true;
        }
        return super.mouseScrolled(mouseX, mouseY, horizontal, vertical);
    }

    /* ── SAVED ON THE WAY OUT, AND ONLY IF SOMETHING CHANGED ──────────────
       This is the one exit. The layout editor hands back here rather than to
       the world, so a session of dragging and toggling produces exactly one
       write — and opening the menu to look at it produces none, because
       HudConfig.save() is a no-op on a document nobody edited. A launcher
       that saw a game-written file after every glance would import a "change"
       on every launch. */
    @Override
    public void close() {
        config.save(runDir);
        if (this.client != null) this.client.setScreen(null);
    }

    /* The world keeps running. Pausing would freeze the FPS counter being
       positioned, and in multiplayer a paused screen is a fiction anyway. */
    @Override
    public boolean shouldPause() {
        return false;
    }
}
