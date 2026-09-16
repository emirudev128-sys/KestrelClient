package dev.kestrel.hud;

import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.util.Window;
import net.minecraft.text.Text;
import org.lwjgl.glfw.GLFW;

import java.nio.file.Path;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * THE HUD EDITOR. Right Shift opens it.
 *
 * <p>One screen where there used to be three. A top bar with two tabs, the
 * modules down the left in colour-coded groups, a picture of the screen in the
 * middle with the HUD on it, the selected element's settings on the right, and
 * the keys along the bottom. Designed and signed off in a browser mockup before
 * a line of this was written; {@link Glass} and {@link Type} carry its numbers.
 *
 * <p><b>IT DRAWS AT ITS OWN SCALE, NOT THE GUI SCALE.</b> Everything is laid
 * out in design pixels — one screen pixel at 1080p, two on a screen 1600
 * pixels tall or more — and the whole screen is scaled once into Minecraft's
 * GUI space. So the menu is the same size at GUI scale 2 and at GUI scale 4,
 * and every one-pixel hairline is one pixel.
 *
 * <p><b>IMMEDIATE MODE.</b> The render pass records every clickable rectangle
 * as it draws it, and a click walks that list backwards. Geometry exists in one
 * place — the drawing — so a click can never land on where a control used to
 * be.
 *
 * <p><b>NOTHING IN HERE MOVES.</b> Every element is drawn from
 * {@link HudElements#SAMPLE}: fixed text, so a preview never flickers or
 * changes width while it is being aligned.
 */
public class EditorScreen extends Screen {

    final HudConfig config;
    final Path runDir;

    /* ── what the player is looking at ────────────────────────────────── */
    boolean onFeatures;
    String element;
    String feature;
    String filter = "";
    boolean filterFocus;
    boolean fit = true;
    boolean magnet = true;
    boolean rebinding;
    boolean rebindingBeforeClick;
    float listScroll;
    float inspScroll;
    float rulesScroll;
    final List<String[]> changes = new ArrayList<>();

    /* ── this frame ───────────────────────────────────────────────────── */
    int density = 1;
    float scale = 1f;
    float w;
    float h;
    float mx = -1f;
    float my = -1f;
    float[] top, left, canvas, insp, bottom;
    int[] miniSource;
    int[] miniTarget;
    Drag drag;

    private final List<Hit> hits = new ArrayList<>();
    private final List<Wheel> wheels = new ArrayList<>();
    private float[] clip;

    private static final DateTimeFormatter HMS = DateTimeFormatter.ofPattern("HH:mm:ss");

    record Hit(float x0, float y0, float x1, float y1, Runnable click, Supplier<Drag> drag) { }

    record Wheel(float x0, float y0, float x1, float y1, Consumer<Float> by) { }

    /** a press that follows the mouse until it is released */
    interface Drag {
        void move(float x, float y, boolean alt);

        default void end() { }
    }

    public EditorScreen(HudConfig config, Path runDir) {
        super(Text.literal("Kestrel HUD"));
        this.config = config;
        this.runDir = runDir;
        List<String> names = config.names();
        this.element = names.isEmpty() ? "" : names.get(0);
        List<String> ids = config.featureNames();
        this.feature = ids.isEmpty() ? "" : ids.get(0);
        change("opened kestrel-hud.json · rev " + config.revision());
    }

    TextRenderer tr() {
        return this.textRenderer;
    }

    net.minecraft.client.MinecraftClient mc() {
        return this.client;
    }

    /* ── the frame ────────────────────────────────────────────────────── */
    private void layout() {
        Window win = this.client.getWindow();
        int fbW = win.getFramebufferWidth(), fbH = win.getFramebufferHeight();
        density = fbH >= 1600 ? 2 : 1;
        w = fbW / (float) density;
        h = fbH / (float) density;
        scale = (float) (density / win.getScaleFactor());
        double sx = this.client.mouse.getX() * fbW / Math.max(1, win.getWidth());
        double sy = this.client.mouse.getY() * fbH / Math.max(1, win.getHeight());
        mx = (float) (sx / density);
        my = (float) (sy / density);

        float colTop = Glass.MARGIN + Glass.TOP + Glass.GUTTER;
        float colBottom = h - Glass.MARGIN - Glass.BOTTOM - Glass.GUTTER;
        float colH = colBottom - colTop;
        top = new float[] { Glass.MARGIN, Glass.MARGIN, w - 2 * Glass.MARGIN, Glass.TOP };
        left = new float[] { Glass.MARGIN, colTop, Glass.LEFT_W, colH };
        insp = new float[] { w - Glass.MARGIN - Glass.RIGHT_W, colTop, Glass.RIGHT_W, colH };
        canvas = new float[] { Glass.MARGIN + Glass.LEFT_W + Glass.GUTTER, colTop,
            w - 2 * Glass.MARGIN - Glass.LEFT_W - Glass.RIGHT_W - 2 * Glass.GUTTER, colH };
        bottom = new float[] { Glass.MARGIN, h - Glass.MARGIN - Glass.BOTTOM, w - 2 * Glass.MARGIN, Glass.BOTTOM };
    }

    private int[][] panelPixels() {
        float[][] all = { top, left, canvas, insp, bottom };
        int[][] out = new int[all.length][];
        for (int i = 0; i < all.length; i++) {
            float[] r = all[i];
            out[i] = new int[] { Math.round(r[0] * density), Math.round(r[1] * density),
                Math.round((r[0] + r[2]) * density), Math.round((r[1] + r[3]) * density) };
        }
        return out;
    }

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        if (this.client == null) return;
        /* whatever was queued before this screen goes out first, or it would
           land on top of the menu after the blur */
        ctx.draw();
        layout();
        hits.clear();
        wheels.clear();
        clip = null;
        miniSource = null;
        miniTarget = null;
        if (!onFeatures) ElementsTab.prepare(this);

        PanelBlur.apply(this.client, panelPixels(), miniSource, miniTarget);

        Type.density = density;
        ctx.getMatrices().push();
        ctx.getMatrices().scale(scale, scale, 1f);
        Chrome.top(this, ctx);
        if (onFeatures) FeaturesTab.draw(this, ctx);
        else ElementsTab.draw(this, ctx);
        Chrome.bottom(this, ctx);
        ctx.getMatrices().pop();
    }

    /* ── recording what can be pressed ───────────────────────────────── */
    void clipTo(DrawContext ctx, float x, float y, float cw, float ch) {
        clip = new float[] { x, y, x + cw, y + ch };
        ctx.enableScissor(Math.round(x), Math.round(y), Math.round(x + cw), Math.round(y + ch));
    }

    void unclip(DrawContext ctx) {
        clip = null;
        ctx.disableScissor();
    }

    void onClick(float x, float y, float cw, float ch, Runnable r) {
        record(x, y, cw, ch, r, null);
    }

    void onDrag(float x, float y, float cw, float ch, Supplier<Drag> d) {
        record(x, y, cw, ch, null, d);
    }

    void onWheel(float x, float y, float cw, float ch, Consumer<Float> by) {
        wheels.add(new Wheel(x, y, x + cw, y + ch, by));
    }

    private void record(float x, float y, float cw, float ch, Runnable r, Supplier<Drag> d) {
        float x0 = x, y0 = y, x1 = x + cw, y1 = y + ch;
        if (clip != null) {
            x0 = Math.max(x0, clip[0]); y0 = Math.max(y0, clip[1]);
            x1 = Math.min(x1, clip[2]); y1 = Math.min(y1, clip[3]);
            if (x1 <= x0 || y1 <= y0) return;
        }
        hits.add(new Hit(x0, y0, x1, y1, r, d));
    }

    /** is the mouse over this, and not over something clipped away */
    boolean over(float x, float y, float cw, float ch) {
        if (drag != null) return false;
        if (mx < x || my < y || mx >= x + cw || my >= y + ch) return false;
        return clip == null || (mx >= clip[0] && my >= clip[1] && mx < clip[2] && my < clip[3]);
    }

    /* ── input ────────────────────────────────────────────────────────── */
    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (button != 0) return super.mouseClicked(mouseX, mouseY, button);
        float x = (float) (mouseX / scale), y = (float) (mouseY / scale);
        rebindingBeforeClick = rebinding;
        rebinding = false;
        filterFocus = false;
        for (int i = hits.size() - 1; i >= 0; i--) {
            Hit hit = hits.get(i);
            if (x < hit.x0() || y < hit.y0() || x >= hit.x1() || y >= hit.y1()) continue;
            if (hit.drag() != null) {
                drag = hit.drag().get();
                if (drag != null) drag.move(x, y, hasAltDown());
            }
            if (hit.click() != null) hit.click().run();
            return true;
        }
        return true;
    }

    @Override
    public boolean mouseDragged(double mouseX, double mouseY, int button, double dx, double dy) {
        if (drag != null && button == 0) {
            drag.move((float) (mouseX / scale), (float) (mouseY / scale), hasAltDown());
            return true;
        }
        return super.mouseDragged(mouseX, mouseY, button, dx, dy);
    }

    @Override
    public boolean mouseReleased(double mouseX, double mouseY, int button) {
        if (drag != null && button == 0) {
            drag.end();
            drag = null;
            return true;
        }
        return super.mouseReleased(mouseX, mouseY, button);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontal, double vertical) {
        float x = (float) (mouseX / scale), y = (float) (mouseY / scale);
        for (int i = wheels.size() - 1; i >= 0; i--) {
            Wheel wh = wheels.get(i);
            if (x < wh.x0() || y < wh.y0() || x >= wh.x1() || y >= wh.y1()) continue;
            wh.by().accept((float) (-vertical * Glass.ROW * 1.5f));
            return true;
        }
        return super.mouseScrolled(mouseX, mouseY, horizontal, vertical);
    }

    @Override
    public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
        if (rebinding) {
            if (keyCode == GLFW.GLFW_KEY_ESCAPE) { rebinding = false; return true; }
            boolean clear = keyCode == GLFW.GLFW_KEY_BACKSPACE || keyCode == GLFW.GLFW_KEY_DELETE;
            String name = clear ? "" : Behaviours.nameOf(keyCode);
            if (name == null) return true;
            FeaturesTab.setKey(this, name);
            rebinding = false;
            return true;
        }
        if (filterFocus) {
            if (keyCode == GLFW.GLFW_KEY_BACKSPACE) {
                if (!filter.isEmpty()) filter = filter.substring(0, filter.length() - 1);
                listScroll = 0;
            } else if (keyCode == GLFW.GLFW_KEY_ESCAPE || keyCode == GLFW.GLFW_KEY_ENTER || keyCode == GLFW.GLFW_KEY_KP_ENTER) {
                filterFocus = false;
            }
            return true;
        }
        if (KestrelHudClient.isMenuKey(keyCode, scanCode)) {
            close();
            return true;
        }
        return super.keyPressed(keyCode, scanCode, modifiers);
    }

    @Override
    public boolean charTyped(char chr, int modifiers) {
        if (!filterFocus) return super.charTyped(chr, modifiers);
        if (chr >= ' ' && chr != 127 && filter.length() < 24) {
            filter += chr;
            listScroll = 0;
        }
        return true;
    }

    /* ── bookkeeping ─────────────────────────────────────────────────── */
    void change(String text) {
        changes.add(new String[] { LocalTime.now().format(HMS), text });
        if (changes.size() > 40) changes.remove(0);
    }

    void click() {
        if (this.client != null) {
            this.client.getSoundManager().play(
                net.minecraft.client.sound.PositionedSoundInstance.master(
                    net.minecraft.sound.SoundEvents.UI_BUTTON_CLICK, 1.0f));
        }
    }

    /* ── SAVED ON THE WAY OUT, AND ONLY IF SOMETHING CHANGED ──────────────
       DONE, Escape and the menu key all come through here, so a session of
       dragging, toggling and recolouring is exactly one write — and opening
       the menu to look at it is none, because save() does nothing to a
       document nobody edited. */
    @Override
    public void close() {
        config.save(runDir);
        if (this.client != null) this.client.setScreen(null);
    }

    @Override
    public void removed() {
        PanelBlur.release();
    }

    @Override
    public boolean shouldPause() {
        return false;
    }
}
