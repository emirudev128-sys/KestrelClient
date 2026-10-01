package dev.kestrel.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.components.events.ContainerEventHandler;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.ItemStack;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.inventory.DispenserMenu;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.inventory.HopperMenu;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ShulkerBoxMenu;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.inventory.ContainerInput;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * THE INVENTORY SORTER.
 *
 * <p>One key. In a chest, a shulker box, a barrel, a hopper or a dispenser it
 * sorts the container; anywhere else — your own inventory screen, or no
 * screen at all — it sorts your inventory, the hotbar left alone unless the
 * option says otherwise.
 *
 * <p><b>IT SORTS BY CLICKING, THE WAY A PLAYER WOULD.</b> An inventory lives
 * on the server, so rearranging it is a sequence of ordinary slot clicks —
 * pick up, put down — sent as ordinary click packets, each one applied to the
 * client's copy at once so the next step reads the result of the last. First
 * every partial stack is topped up from the ones after it, then the slots are
 * put in order by selection: find what belongs in this slot, swap it in.
 * Nothing is invented and nothing is sent that a hand could not send.
 *
 * <p><b>SOME SERVERS WATCH FOR FAST CLICKING.</b> A sort is dozens of clicks
 * in one tick. Singleplayer and most servers do not care; a server with strict
 * anti-cheat may. That is why it is off until switched on, and it never runs
 * with an item held on the cursor.
 */
final class Sorter {

    private Sorter() { }

    /** the key, pressed in the world rather than in a screen */
    static void tick(Minecraft c, HudConfig config) {
        Feature f = config.feature("sorter");
        boolean pressed = Behaviours.presses(c, "sorter") > 0;
        if (!pressed || f == null || !f.on || c.player == null || c.gui.screen() != null) return;
        sort(c, c.player.inventoryMenu, playerSlots(c, c.player.inventoryMenu, f.flag("hotbar")), f);
    }

    /** the key, pressed inside an inventory screen — wired from KestrelHudClient */
    static void pressedIn(Screen screen, net.minecraft.client.input.KeyEvent event, HudConfig config,
                          net.minecraft.client.KeyMapping key) {
        Minecraft c = Minecraft.getInstance();
        Feature f = config.feature("sorter");
        if (key == null || f == null || !f.on || c.player == null) return;
        if (!key.matches(event)) return;
        if (!(screen instanceof AbstractContainerScreen<?> handled) || screen instanceof CreativeModeInventoryScreen) return;
        /* A KEY TYPED INTO A SEARCH BOX IS A LETTER, NOT A COMMAND */
        if (typing(screen.getFocused())) return;

        AbstractContainerMenu h = handled.getMenu();
        List<Slot> slots = isContainer(h) ? containerSlots(c, h) : playerSlots(c, h, f.flag("hotbar"));
        sort(c, h, slots, f);
    }

    private static boolean typing(GuiEventListener e) {
        if (e == null) return false;
        if (e instanceof EditBox t) return t.isFocused();
        if (e instanceof net.minecraft.client.gui.screens.recipebook.RecipeBookComponent<?>) return true;
        if (e instanceof ContainerEventHandler p) return typing(p.getFocused());
        return false;
    }

    /** the handlers whose own slots are storage, and worth putting in order */
    private static boolean isContainer(AbstractContainerMenu h) {
        return h instanceof ChestMenu || h instanceof ShulkerBoxMenu
            || h instanceof DispenserMenu || h instanceof HopperMenu;
    }

    private static List<Slot> containerSlots(Minecraft c, AbstractContainerMenu h) {
        Inventory mine = c.player.getInventory();
        List<Slot> out = new ArrayList<>();
        for (Slot s : h.slots) if (s.container != mine) out.add(s);
        return out;
    }

    /* YOUR INVENTORY'S OWN NUMBERING, not the screen's: 9..35 are the main
       grid in every screen that shows it, and 0..8 the hotbar. Armour, the
       offhand and the crafting grid are never touched. */
    private static List<Slot> playerSlots(Minecraft c, AbstractContainerMenu h, boolean hotbar) {
        Inventory mine = c.player.getInventory();
        List<Slot> main = new ArrayList<>(), bar = new ArrayList<>();
        for (Slot s : h.slots) {
            if (s.container != mine) continue;
            int i = s.getContainerSlot();
            if (i >= 9 && i <= 35) main.add(s);
            else if (hotbar && i >= 0 && i <= 8) bar.add(s);
        }
        main.addAll(bar);
        return main;
    }

    /* THE GAME'S SLOTS AS A GRID FOR SortPlan. Every question reads the live
       slot, and every click is applied to the client's copy the moment it is
       sent, so each step sees the result of the last. */
    private static void sort(Minecraft c, AbstractContainerMenu h, List<Slot> slots, Feature f) {
        if (c.gameMode == null || slots.size() < 2) return;
        Comparator<ItemStack> order = "name".equals(f.choice("order", "type")) ? BY_NAME : BY_TYPE;
        boolean done = SortPlan.run(new SortPlan.Grid() {
            @Override public int size() { return slots.size(); }
            @Override public boolean empty(int i) { return slots.get(i).getItem().isEmpty(); }
            @Override public boolean full(int i) {
                ItemStack s = slots.get(i).getItem();
                return s.getCount() >= s.getMaxStackSize();
            }
            @Override public boolean same(int a, int b) {
                return ItemStack.isSameItemSameComponents(slots.get(a).getItem(), slots.get(b).getItem());
            }
            @Override public int compare(int a, int b) {
                return order.compare(slots.get(a).getItem(), slots.get(b).getItem());
            }
            @Override public void click(int i) {
                c.gameMode.handleContainerInput(h.containerId, slots.get(i).index, 0, ContainerInput.PICKUP, c.player);
            }
            @Override public boolean cursorEmpty() { return h.getCarried().isEmpty(); }
        });
        if (!done) KestrelHudClient.LOG.info("Kestrel HUD: sorting stopped early — a slot did not take what it was given");
    }

    /* BY TYPE: the order items are registered in, which keeps blocks with
       blocks and tools with tools, then name, then fullest first. BY NAME: as
       the item is called on screen. Both end on the count, so after the merge
       the one partial stack of anything sorts after its full ones. */
    private static final Comparator<ItemStack> BY_TYPE =
        Comparator.comparingInt((ItemStack s) -> BuiltInRegistries.ITEM.getId(s.getItem()))
            .thenComparing(s -> s.getHoverName().getString())
            .thenComparing(Comparator.comparingInt(ItemStack::getCount).reversed());

    private static final Comparator<ItemStack> BY_NAME =
        Comparator.comparing((ItemStack s) -> s.getHoverName().getString(), String.CASE_INSENSITIVE_ORDER)
            .thenComparingInt(s -> BuiltInRegistries.ITEM.getId(s.getItem()))
            .thenComparing(Comparator.comparingInt(ItemStack::getCount).reversed());
}
