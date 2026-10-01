package dev.kestrel.hud.mixin;

import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import dev.kestrel.hud.Behaviours;
import dev.kestrel.hud.Freelook;
import net.minecraft.client.Camera;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/**
 * THE CAMERA ASKS FREELOOK WHICH WAY TO FACE, AND ZOOM HOW WIDE TO SEE.
 *
 * <p>{@code Camera.alignWithEntity} reads the player's yaw and pitch twice —
 * once for an ordinary frame, once for a player riding the new minecart — and
 * turns the camera to them. Both reads are replaced, and only while
 * {@link Freelook#active()} says so; otherwise the value passes through
 * untouched.
 *
 * <p><b>ZOOM IS THE FIELD OF VIEW NOW.</b> 1.21.4 had a projection scale on
 * the game renderer to set; 26.3 does not. {@code Camera.calculateFov} is
 * where the world's field of view is decided each frame — with the speed
 * effect, the fluid and the death tilt already in it — and its answer is
 * narrowed by {@link Behaviours#fovFor}, so a 4x zoom is a quarter of the
 * view across. The hand is drawn with its own field of view, which this does
 * not touch, so it no longer has to be hidden while zoomed.
 *
 * <p><b>MODIFY THE VALUE, DO NOT REDIRECT THE CALL.</b> A redirect owns the
 * call outright and two mods redirecting the same one crash the game; this
 * form chains with anybody else adjusting the same number.
 */
@Mixin(Camera.class)
abstract class CameraMixin {

    @ModifyExpressionValue(method = "alignWithEntity",
        at = @At(value = "INVOKE", target = "Lnet/minecraft/world/entity/Entity;getViewYRot(F)F"))
    private float kestrelHud$freelookYaw(float yaw) {
        return Freelook.active() ? Freelook.yaw() : yaw;
    }

    @ModifyExpressionValue(method = "alignWithEntity",
        at = @At(value = "INVOKE", target = "Lnet/minecraft/world/entity/Entity;getViewXRot(F)F"))
    private float kestrelHud$freelookPitch(float pitch) {
        return Freelook.active() ? Freelook.pitch() : pitch;
    }

    @ModifyReturnValue(method = "calculateFov", at = @At("RETURN"))
    private float kestrelHud$zoom(float fov) {
        return Behaviours.fovFor(fov);
    }
}
