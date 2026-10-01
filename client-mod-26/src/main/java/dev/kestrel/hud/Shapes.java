package dev.kestrel.hud;

import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.renderpearl.api.pipeline.RenderPipeline;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.navigation.ScreenRectangle;
import net.minecraft.client.gui.render.TextureSetup;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.renderer.state.gui.GuiElementRenderState;
import org.joml.Matrix3x2f;
import org.joml.Vector2f;

/**
 * SHAPES WITH SMOOTH EDGES, FOR THE MAPS AND THE COLOUR PICKER.
 *
 * <p>Everything else in the HUD is rectangles, drawn on the GUI's pixel grid —
 * so an arrow built from fills is an arrow built from GUI pixels, three screen
 * pixels square each at scale 3, and looks it. These go to the GPU as
 * triangles instead, in the GUI's own colour pipeline, so their edges are as
 * fine as the screen: a triangle is a triangle, a dot is round, and a colour
 * wheel blends from white to every hue.
 *
 * <p><b>26.3: A SHAPE IS AN ELEMENT OF THE FRAME'S RENDER STATE.</b> The GUI no
 * longer draws as it is called; each frame is extracted into a list of
 * elements first and drawn afterwards. So a shape is a {@link Mesh} — its
 * triangles, the transform and clip in force when it was asked for — handed
 * to the frame's render state beside the rectangles and the text. The GUI
 * pipeline draws quads, so a triangle is sent as a quad with its last corner
 * repeated, and turned to face the screen in case anything culls its back.
 */
final class Shapes {

    private Shapes() { }

    /* ── one shape, as the render state keeps it ─────────────────────── */

    private static final class Mesh implements GuiElementRenderState {
        private final Matrix3x2f pose;
        private final ScreenRectangle scissor, bounds;
        private final float[] xy;     /* three corners a triangle, x then y */
        private final int[] colour;   /* one colour a corner */
        private final int corners;

        Mesh(Matrix3x2f pose, ScreenRectangle scissor, ScreenRectangle bounds, float[] xy, int[] colour, int corners) {
            this.pose = pose;
            this.scissor = scissor;
            this.bounds = bounds;
            this.xy = xy;
            this.colour = colour;
            this.corners = corners;
        }

        @Override
        public void buildVertices(VertexConsumer v) {
            for (int t = 0; t + 2 < corners; t += 3) {
                float x0 = xy[t * 2], y0 = xy[t * 2 + 1], x1 = xy[t * 2 + 2], y1 = xy[t * 2 + 3], x2 = xy[t * 2 + 4], y2 = xy[t * 2 + 5];
                int c0 = colour[t], c1 = colour[t + 1], c2 = colour[t + 2];
                /* counter-clockwise as seen on screen, y down */
                float cross = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
                if (cross > 0f) {
                    float tx = x1, ty = y1;
                    int tc = c1;
                    x1 = x2; y1 = y2; c1 = c2;
                    x2 = tx; y2 = ty; c2 = tc;
                }
                v.addVertexWith2DPose(pose, x0, y0).setColor(c0);
                v.addVertexWith2DPose(pose, x1, y1).setColor(c1);
                v.addVertexWith2DPose(pose, x2, y2).setColor(c2);
                v.addVertexWith2DPose(pose, x2, y2).setColor(c2);
            }
        }

        @Override
        public RenderPipeline pipeline() {
            return RenderPipelines.GUI;
        }

        @Override
        public TextureSetup textureSetup() {
            return TextureSetup.noTexture();
        }

        @Override
        public ScreenRectangle scissorArea() {
            return scissor;
        }

        @Override
        public ScreenRectangle bounds() {
            return bounds;
        }
    }

    /* ── building one ─────────────────────────────────────────────────── */

    /** triangles collected for one shape, then handed to the frame together */
    private static final class Builder {
        float[] xy = new float[64 * 6];
        int[] colour = new int[64 * 3];
        int corners = 0;

        void tri(float x0, float y0, int c0, float x1, float y1, int c1, float x2, float y2, int c2) {
            if ((corners + 3) * 2 > xy.length) {
                xy = java.util.Arrays.copyOf(xy, xy.length * 2);
                colour = java.util.Arrays.copyOf(colour, colour.length * 2);
            }
            int i = corners * 2;
            xy[i] = x0; xy[i + 1] = y0; xy[i + 2] = x1; xy[i + 3] = y1; xy[i + 4] = x2; xy[i + 5] = y2;
            colour[corners] = c0;
            colour[corners + 1] = c1;
            colour[corners + 2] = c2;
            corners += 3;
        }

        /* to the frame, with the transform and clip in force now, and bounds
           that cover every corner on screen — what the GUI uses to know what
           the shape is over */
        void submit(GuiGraphicsExtractor ctx) {
            if (corners == 0) return;
            Matrix3x2f pose = new Matrix3x2f(ctx.pose());
            float minX = Float.MAX_VALUE, minY = Float.MAX_VALUE, maxX = -Float.MAX_VALUE, maxY = -Float.MAX_VALUE;
            Vector2f p = new Vector2f();
            for (int i = 0; i < corners; i++) {
                pose.transformPosition(xy[i * 2], xy[i * 2 + 1], p);
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            }
            int x0 = (int) Math.floor(minX), y0 = (int) Math.floor(minY);
            ScreenRectangle box = new ScreenRectangle(x0, y0, Math.max(1, (int) Math.ceil(maxX) - x0), Math.max(1, (int) Math.ceil(maxY) - y0));
            ScreenRectangle scissor = ctx.scissorStack.peek();
            if (scissor != null) {
                box = scissor.intersection(box);
                if (box == null) return;
            }
            ctx.guiRenderState.addGuiElement(new Mesh(pose, scissor, box,
                java.util.Arrays.copyOf(xy, corners * 2), java.util.Arrays.copyOf(colour, corners), corners));
        }
    }

    /* THE PLAYER: a navigation arrow — a point, two feet, a notch between
       them — pointing up at 0 degrees and turned clockwise by `degrees`. A
       darker copy a little larger sits under it, so it reads on snow and on
       deep water alike without an outline drawn round it. */
    static void arrow(GuiGraphicsExtractor ctx, float cx, float cy, float size, float degrees, int fill, int edge) {
        double a = Math.toRadians(degrees);
        float cos = (float) Math.cos(a), sin = (float) Math.sin(a);
        Builder b = new Builder();
        arrowShape(b, cx, cy, size * 1.32f, cos, sin, edge);
        arrowShape(b, cx, cy, size, cos, sin, fill);
        b.submit(ctx);
    }

    private static void arrowShape(Builder b, float cx, float cy, float s, float cos, float sin, int argb) {
        float[][] p = { { 0f, -s }, { 0.74f * s, 0.8f * s }, { 0f, 0.36f * s }, { -0.74f * s, 0.8f * s } };
        float[] x = new float[4], y = new float[4];
        for (int i = 0; i < 4; i++) {
            x[i] = cx + p[i][0] * cos - p[i][1] * sin;
            y[i] = cy + p[i][0] * sin + p[i][1] * cos;
        }
        /* point, right foot, notch — and point, notch, left foot */
        b.tri(x[0], y[0], argb, x[1], y[1], argb, x[2], y[2], argb);
        b.tri(x[0], y[0], argb, x[2], y[2], argb, x[3], y[3], argb);
    }

    /** a folder's triangle: pointing right while it is shut, down while it is open */
    static void chevron(GuiGraphicsExtractor ctx, float cx, float cy, float size, boolean open, int argb) {
        Builder b = new Builder();
        if (open) b.tri(cx - size, cy - size * 0.55f, argb, cx + size, cy - size * 0.55f, argb, cx, cy + size * 0.65f, argb);
        else b.tri(cx - size * 0.55f, cy - size, argb, cx - size * 0.55f, cy + size, argb, cx + size * 0.65f, cy, argb);
        b.submit(ctx);
    }

    /** a round dot with a soft dark rim */
    static void dot(GuiGraphicsExtractor ctx, float cx, float cy, float r, int fill, int rim) {
        Builder b = new Builder();
        disc(b, cx, cy, r + 1f, rim);
        disc(b, cx, cy, r, fill);
        b.submit(ctx);
    }

    private static void disc(Builder b, float cx, float cy, float r, int argb) {
        int n = 16;
        for (int i = 0; i < n; i++) {
            double a0 = Math.PI * 2 * i / n, a1 = Math.PI * 2 * (i + 1) / n;
            float x0 = cx + (float) Math.cos(a0) * r, y0 = cy + (float) Math.sin(a0) * r;
            float x1 = cx + (float) Math.cos(a1) * r, y1 = cy + (float) Math.sin(a1) * r;
            b.tri(cx, cy, argb, x0, y0, argb, x1, y1, argb);
        }
    }

    /* THE COLOUR WHEEL: hue around it, saturation out from the white centre,
       at the brightness the slider under it sets. Forty-eight slices, each
       blending between its two edge hues, so the ring reads as continuous. */
    static void wheel(GuiGraphicsExtractor ctx, float cx, float cy, float r, float value) {
        int centre = hsv(0f, 0f, value);
        Builder b = new Builder();
        int n = 48;
        for (int i = 0; i < n; i++) {
            double a0 = Math.PI * 2 * i / n, a1 = Math.PI * 2 * (i + 1) / n;
            float x0 = cx + (float) Math.cos(a0) * r, y0 = cy + (float) Math.sin(a0) * r;
            float x1 = cx + (float) Math.cos(a1) * r, y1 = cy + (float) Math.sin(a1) * r;
            int c0 = hsv((float) (i / (double) n), 1f, value);
            int c1 = hsv((float) ((i + 1) / (double) n), 1f, value);
            b.tri(cx, cy, centre, x0, y0, c0, x1, y1, c1);
        }
        b.submit(ctx);
    }

    /* ── colour arithmetic, without AWT ───────────────────────────────── */

    /** hue 0..1 around the circle from red, saturation and value 0..1, to opaque ARGB */
    static int hsv(float h, float s, float v) {
        h = h - (float) Math.floor(h);
        int i = (int) (h * 6f);
        float f = h * 6f - i;
        float p = v * (1f - s), q = v * (1f - f * s), t = v * (1f - (1f - f) * s);
        float r, g, b;
        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            default: r = v; g = p; b = q; break;
        }
        return 0xFF000000 | (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
    }

    /** { hue, saturation, value }, each 0..1 */
    static float[] toHsv(int rgb) {
        float r = ((rgb >> 16) & 255) / 255f, g = ((rgb >> 8) & 255) / 255f, b = (rgb & 255) / 255f;
        float max = Math.max(r, Math.max(g, b)), min = Math.min(r, Math.min(g, b)), d = max - min;
        float h;
        if (d == 0f) h = 0f;
        else if (max == r) h = ((g - b) / d) / 6f;
        else if (max == g) h = ((b - r) / d + 2f) / 6f;
        else h = ((r - g) / d + 4f) / 6f;
        if (h < 0f) h += 1f;
        return new float[] { h, max == 0f ? 0f : d / max, max };
    }
}
