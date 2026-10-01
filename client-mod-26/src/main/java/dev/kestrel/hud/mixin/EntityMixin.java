package dev.kestrel.hud.mixin;

import dev.kestrel.hud.Freelook;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * THE MOUSE TURNS THE FREELOOK CAMERA, NOT THE PLAYER.
 *
 * <p>Minecraft hands every mouse movement to the player's {@code turn}. While
 * {@link Freelook#active()} is on, and only for the player this client
 * controls, the movement goes to the camera instead and the player's rotation
 * is left exactly as it was — which is the whole feature: you keep walking and
 * aiming where you were.
 *
 * <p>An inject that cancels, not an overwrite, so any other mod listening on
 * the same method still runs in every case this one does not claim.
 */
@Mixin(Entity.class)
abstract class EntityMixin {

    @Inject(method = "turn", at = @At("HEAD"), cancellable = true)
    private void kestrelHud$freelookLook(double cursorDeltaX, double cursorDeltaY, CallbackInfo ci) {
        if (!Freelook.active()) return;
        if ((Object) this != Minecraft.getInstance().player) return;
        Freelook.look(cursorDeltaX, cursorDeltaY);
        ci.cancel();
    }
}
