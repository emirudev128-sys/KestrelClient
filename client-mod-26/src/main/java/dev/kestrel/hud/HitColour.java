package dev.kestrel.hud;

import net.minecraft.client.Minecraft;
import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.renderer.texture.DynamicTexture;

/**
 * THE COLOUR SOMETHING FLASHES WHEN IT IS HIT.
 *
 * <p><b>IT IS A TEXTURE, NOT A TINT IN CODE.</b> Minecraft keeps a 16×16
 * "overlay" texture that every entity is drawn with. Its top eight rows are
 * the hurt flash — #FF0000 at alpha 0xB2 — and the entity shader mixes that
 * in by one minus its alpha, 30%. The bottom eight are the white flash a
 * creeper or TNT gives before it goes, which this never touches.
 *
 * <p>So a hit colour is eight rows of pixels, repainted and uploaded again.
 * No mixin: the texture is reachable through the renderer, and its one private
 * field is opened by the access widener.
 *
 * <p><b>ONLY WHEN SOMETHING CHANGED.</b> The upload happens on the client
 * tick, outside any frame, and only when the colour asked for differs from
 * the one already there — turning the feature off puts vanilla's back.
 */
final class HitColour {

    private HitColour() { }

    /** vanilla's hurt row, to the byte */
    static final int VANILLA = 0xB2FF0000;

    private static int applied = VANILLA;

    static void tick(Minecraft c, HudConfig config) {
        if (c == null || c.gameRenderer == null) return;
        int want = wanted(config.feature("hitcolour"));
        if (want == applied) return;

        DynamicTexture texture = c.gameRenderer.overlayTexture().texture;
        NativeImage image = texture == null ? null : texture.getPixels();
        if (image == null) return;
        for (int y = 0; y < 8; y++) {
            for (int x = 0; x < 16; x++) image.setPixel(x, y, want);
        }
        texture.upload();
        applied = want;
    }

    /* STRENGTH IS HOW MUCH OF THE COLOUR SHOWS, so the texture's alpha is its
       complement — the shader keeps `alpha` of the entity and adds the rest in
       colour. Floored, which is what makes 30% land on vanilla's 0xB2 exactly
       rather than one step off it. */
    static int wanted(Feature f) {
        if (f == null || !f.on) return VANILLA;
        int rgb = f.colour("colour", 0xFF0000) & 0xFFFFFF;
        double strength = Math.max(0.0, Math.min(100.0, f.number("strength", 30.0)));
        int alpha = (int) (255.0 * (1.0 - strength / 100.0));
        return (alpha << 24) | rgb;
    }
}
