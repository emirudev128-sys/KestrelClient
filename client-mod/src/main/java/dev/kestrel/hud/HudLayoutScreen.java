package dev.kestrel.hud;

import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;
import org.lwjgl.glfw.GLFW;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * THE LAYOUT EDITOR — the HUD alone on screen, and you move it.
 *
 * <p>Reached from {@link HudMenuScreen}, and it hands back there rather than
 * to the world, so the whole session still saves once at the end.
 *
 * <p><b>THE PANEL IS GONE ON PURPOSE.</b> The layout editor is its own mode
 * rather than a tab, and the reason becomes obvious the first time you try to
 * drag something to the middle of the screen with a dialog sitting there.
 * Nothing here but the HUD, a thin bar at the bottom, and the world behind it.
 *
 * <p><b>THE MAGNET.</b> Asked for by name, and what it snaps to is in
 * priority order the thing that survives longest:
 *
 * <ol>
 *   <li><b>The nine anchors</b> — flush to an edge, on a centre line, or at
 *       the stock inset the launcher's own default layout uses. These are
 *       what the config actually stores, so landing ON one means the element
 *       is still in the corner on somebody else's monitor rather than at a
 *       pixel count that happened to look right on this one.</li>
 *   <li><b>The edges of other elements</b> — left edges, right edges, centres,
 *       and the two positions that sit an element directly beside or beneath
 *       another with one gap between, so a stack lines up.</li>
 *   <li><b>Screen centre lines</b>, for the same reason as the first.</li>
 * </ol>
 *
 * <p>Five pixels of pull, and <b>Alt suppresses it</b> — a magnet you cannot
 * switch off is a magnet that fights you, and the one place you always need
 * it off is the one place snapping is strongest, next to something else.
 *
 * <p><b>NOTHING STACKS ITSELF HERE.</b> The live HUD pushes a colliding
 * element clear of its neighbour; this screen does not, and the difference is
 * deliberate. Automatic stacking rescues a layout nobody is watching. While
 * you are dragging, an element that jumps out from under the cursor is an
 * element you cannot place.
 */
public class HudLayoutScreen extends Screen {

    /** how close an edge has to come before the magnet takes it, in the
     *  screen's own scaled pixels — so it feels the same at every GUI scale */
    private static final double SNAP = 5.0;

    /** the inset the launcher's stock layout uses: 2.6% across, 4.2% down.
     *  Snapping to it is what lets a hand-placed element land exactly where
     *  the defaults would have put it. */
    private static final double INSET_X = 2.6;
    private static final double INSET_Y = 4.2;

    private static final int BAR_H = 24;

    private final HudConfig config;
    private final Path runDir;
    private final Screen parent;

    /** one element as it is on screen this frame */
    private static final class Placed {
        final String name;
        final HudConfig.Element el;
        final List<HudElements.Run> runs;
        final int w, h;                 /* unscaled */
        final HudRenderer.Box box;      /* on screen, scaled */
        Placed(String name, HudConfig.Element el, List<HudElements.Run> runs, int w, int h, HudRenderer.Box box) {
            this.name = name; this.el = el; this.runs = runs; this.w = w; this.h = h; this.box = box;
        }
    }

    private final List<Placed> placed = new ArrayList<>();

    private String selected;
    private String dragging;
    private double grabX, grabY;
    /** where the magnet caught this frame, or NaN — drawn as a guide line */
    private double guideX = Double.NaN, guideY = Double.NaN;

    public HudLayoutScreen(HudConfig config, Path runDir, Screen parent) {
        super(Text.literal("Kestrel HUD layout"));
        this.config = config;
        this.runDir = runDir;
        this.parent = parent;
    }

    /* ── what is on screen, rebuilt every frame ───────────────────────────
       Rebuilt rather than cached because the elements MOVE, and because their
       widths change under them — an fps counter is a pixel wider at 100 than
       at 99. A cached box would be last frame's rectangle, and hit-testing a
       drag against it is how an element slips out from under the cursor. */
    private void measure() {
        placed.clear();
        if (this.client == null) return;
        HudElements.Face face = KestrelHudClient.face(config);

        for (String name : config.names()) {
            HudConfig.Element el = config.get(name);
            if (el == null || !el.on) continue;
            /* placeholder: true — an element this mod cannot draw yet still
               has a place in the layout, and being unable to position it
               until the Java lands would be the worse half of the gap */
            List<HudElements.Run> runs = HudElements.of(name, el, this.client, face, true);
            if (runs == null || runs.isEmpty()) continue;
            int w = HudRenderer.width(this.textRenderer, runs);
            int h = HudRenderer.height();
            placed.add(new Placed(name, el, runs, w, h,
                HudRenderer.box(el, w, h, this.width, this.height)));
        }
    }

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        measure();

        /* NO SCRIM. The menu dims the world because it has replaced it as the
           thing you are looking at; here the world is the background you are
           arranging a HUD against, and dimming it would hide exactly the
           contrast problem the plates exist to solve. */
        for (Placed p : placed) {
            HudRenderer.draw(ctx, this.textRenderer, p.runs, p.box.x, p.box.y, p.w, p.h,
                p.el.scale, config.rounded, p.el.style);
        }

        for (Placed p : placed) {
            boolean isSel = p.name.equals(selected);
            boolean over = p.box.holds(mouseX, mouseY);
            if (isSel) {
                ctx.fill((int) p.box.x, (int) p.box.y,
                    (int) (p.box.x + p.box.w), (int) (p.box.y + p.box.h), Paint.GRABBED);
                HudRenderer.outline(ctx, p.box, Paint.SELECT);
            } else if (over && dragging == null) {
                HudRenderer.outline(ctx, p.box, Paint.DEFINE);
            }
        }

        /* the guides, over the elements and under the bar: they explain the
           position the drag has just been pulled to, so they have to be
           visible against the element they are aligning */
        if (!Double.isNaN(guideX)) {
            int gx = (int) Math.round(guideX);
            ctx.fill(gx, 0, gx + 1, this.height - BAR_H, Paint.GUIDE);
        }
        if (!Double.isNaN(guideY)) {
            int gy = (int) Math.round(guideY);
            ctx.fill(0, gy, this.width, gy + 1, Paint.GUIDE);
        }

        bar(ctx, mouseX, mouseY);
    }

    /* ── the bar ──────────────────────────────────────────────────────────
       Two lines: what is selected and where it is, then what the controls
       are. The readout is the part that matters — an editor that moves things
       without ever saying WHERE it moved them to leaves you unable to line
       two elements up by their numbers, which is the one thing the launcher's
       screen can do that dragging cannot. */
    private void bar(DrawContext ctx, int mouseX, int mouseY) {
        int top = this.height - BAR_H;
        ctx.fill(0, top, this.width, this.height, Paint.PANEL);
        ctx.fill(0, top, this.width, top + 1, Paint.REGION);

        int doneW = 44;
        int doneX = this.width - doneW - 6;
        int doneY = top + (BAR_H - 14) / 2;
        Ui.button(ctx, this.textRenderer, doneX, doneY, doneW, 14, "DONE",
            Ui.hit(mouseX, mouseY, doneX, doneY, doneW, 14), true);

        ctx.enableScissor(0, top, doneX - 6, this.height);
        HudConfig.Element sel = selected == null ? null : config.get(selected);
        if (sel == null) {
            Ui.left(ctx, this.textRenderer, "Drag an element to move it", 6, top + 3, Paint.BODY);
        } else {
            Ui.left(ctx, this.textRenderer, sel.display(selected), 6, top + 3, Paint.VALUE);
            String where = sel.anchor.toUpperCase(java.util.Locale.ROOT)
                + "   " + pct(sel.x) + " / " + pct(sel.y)
                + "   x" + String.format(java.util.Locale.ROOT, "%.2f", sel.scale);
            Ui.left(ctx, this.textRenderer, where,
                6 + this.textRenderer.getWidth(sel.display(selected)) + 8, top + 3, Paint.MUTE);
        }
        Ui.left(ctx, this.textRenderer,
            "Wheel scales  ·  Arrows nudge  ·  Alt frees the magnet  ·  Esc goes back",
            6, top + 13, Paint.FAINT);
        ctx.disableScissor();
    }

    private static String pct(double v) {
        return String.format(java.util.Locale.ROOT, "%.1f", v) + "%";
    }

    /* ── picking one up ──────────────────────────────────────────────────
       Backwards through the list, so the element drawn LAST — the one on top
       where two overlap — is the one that comes up. Picking the first match
       would hand you the element underneath, which is the one you can see
       least of. */
    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (button != 0) return super.mouseClicked(mouseX, mouseY, button);

        int doneW = 44;
        int doneX = this.width - doneW - 6;
        int doneY = this.height - BAR_H + (BAR_H - 14) / 2;
        if (Ui.hit(mouseX, mouseY, doneX, doneY, doneW, 14)) { close(); return true; }
        if (mouseY >= this.height - BAR_H) return true;

        measure();
        for (int i = placed.size() - 1; i >= 0; i--) {
            Placed p = placed.get(i);
            if (p.box.holds(mouseX, mouseY)) {
                selected = p.name;
                dragging = p.name;
                grabX = mouseX - p.box.x;
                grabY = mouseY - p.box.y;
                return true;
            }
        }
        selected = null;
        return true;
    }

    @Override
    public boolean mouseDragged(double mouseX, double mouseY, int button, double dx, double dy) {
        if (dragging == null || button != 0) return super.mouseDragged(mouseX, mouseY, button, dx, dy);
        Placed p = find(dragging);
        if (p == null) return true;

        double wantX = mouseX - grabX;
        double wantY = mouseY - grabY;

        guideX = Double.NaN;
        guideY = Double.NaN;
        if (!hasAltDown()) {
            double[] sx = pull(wantX, p.box.w, true, p.name);
            double[] sy = pull(wantY, p.box.h, false, p.name);
            if (!Double.isNaN(sx[0])) { wantX = sx[0]; guideX = sx[1]; }
            if (!Double.isNaN(sy[0])) { wantY = sy[0]; guideY = sy[1]; }
        }
        commit(p, wantX, wantY);
        return true;
    }

    @Override
    public boolean mouseReleased(double mouseX, double mouseY, int button) {
        if (dragging != null && button == 0) {
            dragging = null;
            guideX = Double.NaN;
            guideY = Double.NaN;
            return true;
        }
        return super.mouseReleased(mouseX, mouseY, button);
    }

    /* ── THE MAGNET ───────────────────────────────────────────────────────
       One axis at a time, because they are independent: an element can be
       flush to the left edge and lined up with the bottom of something else
       at once, and treating the pair as a single 2D distance would lose
       whichever of the two was further away.

       Each candidate carries TWO numbers — where the box's leading edge
       lands, and where to draw the line that explains it. They differ
       whenever the snap is to the box's far edge: aligning two right-hand
       edges puts the box's LEFT edge somewhere with nothing at it, and a
       guide drawn there would point at empty screen. */
    private double[] pull(double want, double size, boolean horizontal, String self) {
        int screen = horizontal ? this.width : this.height;
        double inset = screen * (horizontal ? INSET_X : INSET_Y) / 100.0;

        double best = Double.NaN, bestGuide = Double.NaN, bestDist = SNAP;

        /* 1. the anchors: flush, inset, and the centre line */
        double[][] anchors = {
            { 0, 0 },
            { screen - size, screen - 1 },
            { (screen - size) / 2.0, screen / 2.0 },
            { inset, inset },
            { screen - size - inset, screen - inset }
        };
        for (double[] c : anchors) {
            double d = Math.abs(want - c[0]);
            if (d < bestDist) { bestDist = d; best = c[0]; bestGuide = c[1]; }
        }

        /* 2. the other elements */
        for (Placed o : placed) {
            if (o.name.equals(self)) continue;
            double lo = horizontal ? o.box.x : o.box.y;
            double len = horizontal ? o.box.w : o.box.h;
            double hi = lo + len;
            double mid = lo + len / 2.0;
            double[][] cands = {
                { lo, lo },                                   /* leading edges align */
                { hi - size, hi },                            /* trailing edges align */
                { hi + Paint.STACK_GAP, hi },                 /* sits after it */
                { lo - size - Paint.STACK_GAP, lo },          /* sits before it */
                { mid - size / 2.0, mid }                     /* centres align */
            };
            for (double[] c : cands) {
                double d = Math.abs(want - c[0]);
                if (d < bestDist) { bestDist = d; best = c[0]; bestGuide = c[1]; }
            }
        }
        return new double[] { best, bestGuide };
    }

    /* ── pixels back into the contract ───────────────────────────────────
       The anchor is re-chosen from where the element ENDED UP, not kept from
       where it started: drag the fps counter from the top-left to the bottom
       right and it should become a bottom-right element, or it will drift on
       the next monitor. HudRenderer owns both directions of that map. */
    private void commit(Placed p, double px, double py) {
        HudRenderer.Box b = HudRenderer.onScreen(
            new HudRenderer.Box(px, py, p.box.w, p.box.h), this.width, this.height - BAR_H);
        String anchor = HudRenderer.anchorAt(b.cx(), b.cy(), this.width, this.height);
        double[] off = HudRenderer.offsetOf(anchor, b.x, b.y, b.w, b.h, this.width, this.height);
        config.put(p.name, p.el.movedTo(anchor, off[0], off[1]));
    }

    private Placed find(String name) {
        for (Placed p : placed) if (p.name.equals(name)) return p;
        return null;
    }

    /* ── the keyboard ─────────────────────────────────────────────────────
       Arrows nudge by a pixel, or five with Shift held. In pixels rather than
       in percent because a pixel is what you can see, and the percentage is
       derived from it by the same route a drag uses — so a nudge and a drag
       cannot disagree about what a position means. */
    @Override
    public boolean keyPressed(int key, int scan, int mods) {
        if (key == GLFW.GLFW_KEY_ESCAPE) { close(); return true; }
        if (selected == null) return super.keyPressed(key, scan, mods);

        measure();
        Placed p = find(selected);
        if (p == null) return super.keyPressed(key, scan, mods);

        double step = hasShiftDown() ? 5 : 1;
        double dx = 0, dy = 0;
        if (key == GLFW.GLFW_KEY_LEFT) dx = -step;
        else if (key == GLFW.GLFW_KEY_RIGHT) dx = step;
        else if (key == GLFW.GLFW_KEY_UP) dy = -step;
        else if (key == GLFW.GLFW_KEY_DOWN) dy = step;
        else if (key == GLFW.GLFW_KEY_R) {
            /* back to the size the launcher previews, which is the one number
               a wheel makes it easy to lose and hard to find again */
            config.put(p.name, p.el.scaledTo(1.0));
            return true;
        } else {
            return super.keyPressed(key, scan, mods);
        }

        commit(p, p.box.x + dx, p.box.y + dy);
        return true;
    }

    /* The wheel scales the selected element. A tenth per notch: enough to see,
       small enough that the range from a quarter to four takes a deliberate
       spin rather than a flick. */
    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontal, double vertical) {
        if (selected == null) return super.mouseScrolled(mouseX, mouseY, horizontal, vertical);
        HudConfig.Element el = config.get(selected);
        if (el == null) return super.mouseScrolled(mouseX, mouseY, horizontal, vertical);
        config.put(selected, el.scaledTo(el.scale + vertical * 0.1));
        return true;
    }

    /* BACK TO THE MENU, NOT OUT TO THE WORLD. The menu is where the save
       happens, and routing through it keeps a session of dragging to one
       write rather than one per visit. */
    @Override
    public void close() {
        if (this.client != null) this.client.setScreen(parent);
    }

    @Override
    public boolean shouldPause() {
        return false;
    }
}
