package dev.kestrel.hud;

import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.VertexConsumer;
import org.joml.Matrix4f;

/**
 * SHAPES WITH SMOOTH EDGES, FOR THE MAPS AND THE COLOUR PICKER.
 *
 * <p>Everything else in the HUD is rectangles, which {@code DrawContext.fill}
 * draws on the GUI's pixel grid — so an arrow built from fills is an arrow
 * built from GUI pixels, three screen pixels square each at scale 3, and looks
 * it. These go to the GPU as triangles instead, in the GUI's own colour layer,
 * so their edges are as fine as the screen: a triangle is a triangle, a dot is
 * round, and a colour wheel blends from white to every hue.
 *
 * <p>A triangle is sent as a quad with its last corner repeated, because the
 * GUI layer draws quads — and turned to face the screen, because that layer
 * culls the back of anything.
 */
final class Shapes {

    private Shapes() { }

    /* ONE TRIANGLE, WOUND THE WAY THE GUI LAYER DRAWS. That layer culls back
       faces, so a triangle whose corners run the other way round is simply not
       drawn. Rather than trust every caller's order, each one is put
       counter-clockwise as seen on screen — y down — before it is sent. */
    private static void tri(VertexConsumer v, Matrix4f m,
                            float x0, float y0, int c0, float x1, float y1, int c1, float x2, float y2, int c2) {
        float cross = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
        if (cross > 0f) {
            float tx = x1, ty = y1;
            int tc = c1;
            x1 = x2; y1 = y2; c1 = c2;
            x2 = tx; y2 = ty; c2 = tc;
        }
        v.vertex(m, x0, y0, 0f).color(c0);
        v.vertex(m, x1, y1, 0f).color(c1);
        v.vertex(m, x2, y2, 0f).color(c2);
        v.vertex(m, x2, y2, 0f).color(c2);
    }

    /* THE PLAYER: a navigation arrow — a point, two feet, a notch between
       them — pointing up at 0 degrees and turned clockwise by `degrees`. A
       darker copy a little larger sits under it, so it reads on snow and on
       deep water alike without an outline drawn round it. */
    static void arrow(DrawContext ctx, float cx, float cy, float size, float degrees, int fill, int edge) {
        Matrix4f m = ctx.getMatrices().peek().getPositionMatrix();
        double a = Math.toRadians(degrees);
        float cos = (float) Math.cos(a), sin = (float) Math.sin(a);
        ctx.draw(vcp -> {
            VertexConsumer v = vcp.getBuffer(RenderLayer.getGui());
            arrowShape(v, m, cx, cy, size * 1.32f, cos, sin, edge);
            arrowShape(v, m, cx, cy, size, cos, sin, fill);
        });
    }

    private static void arrowShape(VertexConsumer v, Matrix4f m, float cx, float cy, float s, float cos, float sin, int argb) {
        float[][] p = { { 0f, -s }, { 0.74f * s, 0.8f * s }, { 0f, 0.36f * s }, { -0.74f * s, 0.8f * s } };
        float[] x = new float[4], y = new float[4];
        for (int i = 0; i < 4; i++) {
            x[i] = cx + p[i][0] * cos - p[i][1] * sin;
            y[i] = cy + p[i][0] * sin + p[i][1] * cos;
        }
        /* point, right foot, notch — and point, notch, left foot */
        tri(v, m, x[0], y[0], argb, x[1], y[1], argb, x[2], y[2], argb);
        tri(v, m, x[0], y[0], argb, x[2], y[2], argb, x[3], y[3], argb);
    }

    /** a folder's triangle: pointing right while it is shut, down while it is open */
    static void chevron(DrawContext ctx, float cx, float cy, float size, boolean open, int argb) {
        Matrix4f m = ctx.getMatrices().peek().getPositionMatrix();
        ctx.draw(vcp -> {
            VertexConsumer v = vcp.getBuffer(RenderLayer.getGui());
            if (open) tri(v, m, cx - size, cy - size * 0.55f, argb, cx + size, cy - size * 0.55f, argb, cx, cy + size * 0.65f, argb);
            else tri(v, m, cx - size * 0.55f, cy - size, argb, cx - size * 0.55f, cy + size, argb, cx + size * 0.65f, cy, argb);
        });
    }

    /** a round dot with a soft dark rim */
    static void dot(DrawContext ctx, float cx, float cy, float r, int fill, int rim) {
        Matrix4f m = ctx.getMatrices().peek().getPositionMatrix();
        ctx.draw(vcp -> {
            VertexConsumer v = vcp.getBuffer(RenderLayer.getGui());
            disc(v, m, cx, cy, r + 1f, rim);
            disc(v, m, cx, cy, r, fill);
        });
    }

    private static void disc(VertexConsumer v, Matrix4f m, float cx, float cy, float r, int argb) {
        int n = 16;
        for (int i = 0; i < n; i++) {
            double a0 = Math.PI * 2 * i / n, a1 = Math.PI * 2 * (i + 1) / n;
            float x0 = cx + (float) Math.cos(a0) * r, y0 = cy + (float) Math.sin(a0) * r;
            float x1 = cx + (float) Math.cos(a1) * r, y1 = cy + (float) Math.sin(a1) * r;
            tri(v, m, cx, cy, argb, x0, y0, argb, x1, y1, argb);
        }
    }

    /* THE COLOUR WHEEL: hue around it, saturation out from the white centre,
       at the brightness the slider under it sets. Forty-eight slices, each
       blending between its two edge hues, so the ring reads as continuous. */
    static void wheel(DrawContext ctx, float cx, float cy, float r, float value) {
        Matrix4f m = ctx.getMatrices().peek().getPositionMatrix();
        int centre = hsv(0f, 0f, value);
        ctx.draw(vcp -> {
            VertexConsumer v = vcp.getBuffer(RenderLayer.getGui());
            int n = 48;
            for (int i = 0; i < n; i++) {
                double a0 = Math.PI * 2 * i / n, a1 = Math.PI * 2 * (i + 1) / n;
                float x0 = cx + (float) Math.cos(a0) * r, y0 = cy + (float) Math.sin(a0) * r;
                float x1 = cx + (float) Math.cos(a1) * r, y1 = cy + (float) Math.sin(a1) * r;
                int c0 = hsv((float) (i / (double) n), 1f, value);
                int c1 = hsv((float) ((i + 1) / (double) n), 1f, value);
                tri(v, m, cx, cy, centre, x0, y0, c0, x1, y1, c1);
            }
        });
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
