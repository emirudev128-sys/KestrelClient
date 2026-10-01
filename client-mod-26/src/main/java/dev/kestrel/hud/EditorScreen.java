package dev.kestrel.hud;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import com.mojang.blaze3d.platform.InputConstants;
import com.mojang.blaze3d.platform.Window;
import net.minecraft.client.input.CharacterEvent;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

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
    /* the map tab, and where it is looking */
    boolean onMap;
    double mapX, mapZ;
    float mapZoom = 2f;
    boolean mapFollow = true;
    Integer pinX, pinZ;
    Waypoints.Point mapSelected;
    float mapListScroll;
    float[] mapArea;
    String element;
    String feature;
    String filter = "";
    boolean filterFocus;
    boolean fit = true;
    boolean magnet = true;
    boolean rebinding;
    boolean rebindingBeforeClick;
    /* ── THE ONE TEXT FIELD BEING TYPED INTO ─────────────────────────────
       A name, or a coordinate. Its id says which, the text is what has been
       typed so far, and the commit is what happens to it: on Enter, or when a
       click lands anywhere else. Esc drops it. One at a time, like a cursor. */
    String fieldId;
    String fieldText = "";
    boolean fieldNumeric;
    Consumer<String> fieldCommit;
    /* what the add-by-coordinates boxes hold while the menu is open */
    String newX = "", newY = "", newZ = "";

    /* THE FIELD A CLICK HAS JUST CLOSED, AND WHAT IT HELD. A click commits
       the field being typed into before it does anything else — so a click
       inside that same field used to start it again from the value it was
       drawn with, and Enter then put the old text back. A field reopened by
       the click that closed it carries on with what was typed. */
    private String closedId, closedText;

    void editField(String id, String value, boolean numeric, Consumer<String> commit) {
        commitField();
        fieldId = id;
        fieldText = id.equals(closedId) && closedText != null ? closedText : value == null ? "" : value;
        fieldNumeric = numeric;
        fieldCommit = commit;
    }

    void commitField() {
        if (fieldId == null) return;
        Consumer<String> commit = fieldCommit;
        String text = fieldText;
        fieldId = null;
        fieldCommit = null;
        if (commit != null) commit.accept(text);
    }
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

    /* ── WHERE IT WAS LEFT ────────────────────────────────────────────────
       Closing the menu and opening it again used to land on the first
       element of the Elements tab every time, whatever you had been doing.
       The tab, the selection, the scroll positions and the canvas mode are
       kept for as long as the game runs, and put back — where the element or
       feature still exists — when the menu opens. */
    private static boolean lastOnFeatures, lastOnMap;
    private static float lastMapZoom = 2f;
    private static String lastElement, lastFeature;
    private static float lastListScroll, lastInspScroll, lastRulesScroll;
    private static Boolean lastFit, lastMagnet;

    public EditorScreen(HudConfig config, Path runDir) {
        this(config, runDir, false);
    }

    /** M opens it on the map, whatever tab it was left on */
    public EditorScreen(HudConfig config, Path runDir, boolean openMap) {
        super(Component.literal("Kestrel HUD"));
        this.config = config;
        this.runDir = runDir;
        List<String> names = config.names();
        this.element = lastElement != null && names.contains(lastElement) ? lastElement
            : names.isEmpty() ? "" : names.get(0);
        List<String> ids = config.featureNames();
        this.feature = lastFeature != null && ids.contains(lastFeature) ? lastFeature
            : ids.isEmpty() ? "" : ids.get(0);
        this.onFeatures = lastOnFeatures;
        this.onMap = openMap || lastOnMap;
        this.mapZoom = lastMapZoom;
        this.listScroll = lastListScroll;
        this.inspScroll = lastInspScroll;
        this.rulesScroll = lastRulesScroll;
        if (lastFit != null) this.fit = lastFit;
        if (lastMagnet != null) this.magnet = lastMagnet;
        change("opened kestrel-hud.json · rev " + config.revision());
    }

    private void remember() {
        lastOnFeatures = onFeatures;
        lastOnMap = onMap;
        lastMapZoom = mapZoom;
        lastElement = element;
        lastFeature = feature;
        lastListScroll = listScroll;
        lastInspScroll = inspScroll;
        lastRulesScroll = rulesScroll;
        lastFit = fit;
        lastMagnet = magnet;
    }

    Font tr() {
        return this.font;
    }

    net.minecraft.client.Minecraft mc() {
        return this.minecraft;
    }

    /* ── the frame ────────────────────────────────────────────────────── */
    private void layout() {
        Window win = this.minecraft.getWindow();
        int fbW = win.getWidth(), fbH = win.getHeight();
        density = fbH >= 1600 ? 2 : 1;
        w = fbW / (float) density;
        h = fbH / (float) density;
        scale = (float) (density / (double) win.getGuiScale());
        double sx = this.minecraft.mouseHandler.xpos() * fbW / Math.max(1, win.getScreenWidth());
        double sy = this.minecraft.mouseHandler.ypos() * fbH / Math.max(1, win.getScreenHeight());
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

    /* THE BACKDROP IS ITS OWN STEP NOW. A 26.3 screen is asked for its
       background in a layer of its own, before its contents, and that layer is
       where the blur belongs: the world and the game's HUD under it, the
       menu over it. So the frame is laid out here, first, and drawn below. */
    @Override
    public void extractBackground(GuiGraphicsExtractor ctx, int mouseX, int mouseY, float delta) {
        if (this.minecraft == null) return;
        layout();
        hits.clear();
        wheels.clear();
        clip = null;
        miniSource = null;
        miniTarget = null;
        if (!onFeatures && !onMap) ElementsTab.prepare(this);

        PanelBlur.apply(ctx, panelPixels(), miniSource, miniTarget);
    }

    @Override
    public void extractRenderState(GuiGraphicsExtractor ctx, int mouseX, int mouseY, float delta) {
        if (this.minecraft == null || top == null) return;
        Type.density = density;
        ctx.pose().pushMatrix();
        ctx.pose().scale(scale, scale);
        Chrome.top(this, ctx);
        if (onMap) MapTab.draw(this, ctx);
        else if (onFeatures) FeaturesTab.draw(this, ctx);
        else ElementsTab.draw(this, ctx);
        Chrome.bottom(this, ctx);
        ctx.pose().popMatrix();
    }

    /* ── recording what can be pressed ───────────────────────────────── */
    void clipTo(GuiGraphicsExtractor ctx, float x, float y, float cw, float ch) {
        clip = new float[] { x, y, x + cw, y + ch };
        ctx.enableScissor(Math.round(x), Math.round(y), Math.round(x + cw), Math.round(y + ch));
    }

    void unclip(GuiGraphicsExtractor ctx) {
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
    /* 26.3 numbers the mouse buttons from one — left 1, middle 2, right 3 —
       and hands each press over as an event that carries its own modifiers */
    @Override
    public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
        double mouseX = event.x(), mouseY = event.y();
        int button = event.button();
        /* a right-click on the map puts a waypoint where it lands */
        if (button == InputConstants.MOUSE_BUTTON_RIGHT && onMap) {
            commitField();
            if (MapTab.rightClick(this, (float) (mouseX / scale), (float) (mouseY / scale))) return true;
        }
        if (button != InputConstants.MOUSE_BUTTON_LEFT) return super.mouseClicked(event, doubleClick);
        float x = (float) (mouseX / scale), y = (float) (mouseY / scale);
        rebindingBeforeClick = rebinding;
        rebinding = false;
        filterFocus = false;
        /* a click anywhere keeps what was typed so far; a click on another
           field then starts that one */
        closedId = fieldId;
        closedText = fieldText;
        commitField();
        try {
            for (int i = hits.size() - 1; i >= 0; i--) {
                Hit hit = hits.get(i);
                if (x < hit.x0() || y < hit.y0() || x >= hit.x1() || y >= hit.y1()) continue;
                if (hit.drag() != null) {
                    drag = hit.drag().get();
                    if (drag != null) drag.move(x, y, event.hasAltDown());
                }
                if (hit.click() != null) hit.click().run();
                return true;
            }
            return true;
        } finally {
            closedId = null;
            closedText = null;
        }
    }

    @Override
    public boolean mouseDragged(MouseButtonEvent event, double dx, double dy) {
        if (drag != null && event.button() == InputConstants.MOUSE_BUTTON_LEFT) {
            drag.move((float) (event.x() / scale), (float) (event.y() / scale), event.hasAltDown());
            return true;
        }
        return super.mouseDragged(event, dx, dy);
    }

    @Override
    public boolean mouseReleased(MouseButtonEvent event) {
        if (drag != null && event.button() == InputConstants.MOUSE_BUTTON_LEFT) {
            drag.end();
            drag = null;
            return true;
        }
        return super.mouseReleased(event);
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

    private static boolean enter(int key) {
        return key == InputConstants.KEY_RETURN || key == InputConstants.KEY_NUMPADENTER;
    }

    @Override
    public boolean keyPressed(KeyEvent event) {
        int key = event.key();
        if (rebinding) {
            if (key == InputConstants.KEY_ESCAPE) { rebinding = false; return true; }
            boolean clear = key == InputConstants.KEY_BACKSPACE || key == InputConstants.KEY_DELETE;
            String name = clear ? "" : Behaviours.nameOf(key);
            if (name == null) return true;
            FeaturesTab.setKey(this, name);
            rebinding = false;
            return true;
        }
        if (fieldId != null) {
            if (key == InputConstants.KEY_BACKSPACE) {
                if (!fieldText.isEmpty()) fieldText = fieldText.substring(0, fieldText.length() - 1);
            } else if (enter(key) || key == InputConstants.KEY_TAB) {
                commitField();
            } else if (key == InputConstants.KEY_ESCAPE) {
                fieldId = null;
                fieldCommit = null;
            }
            return true;
        }
        if (filterFocus) {
            if (key == InputConstants.KEY_BACKSPACE) {
                if (!filter.isEmpty()) filter = filter.substring(0, filter.length() - 1);
                listScroll = 0;
            } else if (key == InputConstants.KEY_ESCAPE || enter(key)) {
                filterFocus = false;
            }
            return true;
        }
        if (KestrelHudClient.isMenuKey(event)) {
            onClose();
            return true;
        }
        /* M closes the map it opened */
        net.minecraft.client.KeyMapping mapKey = Behaviours.key("worldmap");
        if (onMap && mapKey != null && mapKey.matches(event)) {
            onClose();
            return true;
        }
        return super.keyPressed(event);
    }

    @Override
    public boolean charTyped(CharacterEvent event) {
        int cp = event.codepoint();
        /* the fields take letters a char holds; anything past them is not a name */
        if (cp > 0xFFFF) return fieldId != null || filterFocus || super.charTyped(event);
        char chr = (char) cp;
        if (fieldId != null) {
            if (fieldNumeric) {
                boolean digit = chr >= '0' && chr <= '9', minus = chr == '-' && fieldText.isEmpty();
                if ((digit || minus) && fieldText.length() < 9) fieldText += chr;
            } else if (chr >= ' ' && chr != 127 && fieldText.length() < Waypoints.MAX_NAME) {
                fieldText += chr;
            }
            return true;
        }
        if (!filterFocus) return super.charTyped(event);
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
        if (this.minecraft != null) {
            this.minecraft.getSoundManager().play(
                net.minecraft.client.resources.sounds.SimpleSoundInstance.forUI(
                    net.minecraft.sounds.SoundEvents.UI_BUTTON_CLICK, 1.0f));
        }
    }

    /* ── SAVED ON THE WAY OUT, AND ONLY IF SOMETHING CHANGED ──────────────
       DONE, Escape and the menu key all come through here, so a session of
       dragging, toggling and recolouring is exactly one write — and opening
       the menu to look at it is none, because save() does nothing to a
       document nobody edited. */
    @Override
    public void onClose() {
        config.save(runDir);
        if (this.minecraft != null) this.minecraft.gui.setScreen(null);
    }

    @Override
    public void removed() {
        /* removed, not close: Esc, the menu key, Done and a screen opened over
           this one all come through here */
        commitField();
        remember();
        PanelBlur.release();
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }
}
