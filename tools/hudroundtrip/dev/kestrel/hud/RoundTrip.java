package dev.kestrel.hud;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * THE JAVA HALF OF tools/hudcheck.mjs, RUN AS A REAL PROGRAM.
 *
 * <p>Every other assertion about this contract reads the three files as TEXT
 * and checks that they say compatible things. That catches a renamed field
 * and misses everything about behaviour — a parser that reads {@code -9.6} as
 * {@code 9.6}, a writer that emits {@code 2,6} because the machine is in a
 * locale where that is a decimal point, an escape that turns a label into
 * invalid JSON. Those are the failures that would actually reach a player,
 * and none of them are visible in the source.
 *
 * <p>So this loads {@link HudConfig} — the same compiled class the mod ships —
 * points it at a document the launcher wrote, prints what it understood, does
 * to it what the in-game editor does, and writes the result back for the
 * launcher to read. hudcheck.mjs is both ends of that.
 *
 * <p><b>DELIBERATELY NEVER TOUCHES THE LOGGER.</b> {@code HudConfig} reaches
 * for {@code KestrelHudClient.LOG} on its failure paths only, and loading that
 * class would drag in Minecraft's {@code Identifier} and, behind it, the whole
 * game. Reading a valid document and calling {@code document()} executes no
 * such instruction, which is why this runs on a bare JDK with nothing on the
 * classpath but the mod's own classes. Give it a broken document and it will
 * fail to find a class rather than reporting a parse error — the harness is
 * for the happy path, and hudcheck.mjs tests the unhappy ones from the
 * launcher's side.
 */
public final class RoundTrip {

    private static String hex6(int rgb) {
        return String.format(java.util.Locale.ROOT, "#%06X", rgb & 0xFFFFFF);
    }

    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.err.println("usage: RoundTrip <instance-dir> <report-file>");
            System.exit(2);
        }
        Path dir = Paths.get(args[0]);
        Path report = Paths.get(args[1]);

        /* ── what Java made of what the launcher wrote ──────────────────── */
        HudConfig c = HudConfig.read(dir);
        StringBuilder r = new StringBuilder();
        r.append("count ").append(c.count()).append('\n');
        r.append("rev ").append(c.revision()).append('\n');
        r.append("rounded ").append(c.rounded).append('\n');
        r.append("kestrelFont ").append(c.kestrelFont).append('\n');
        for (String n : c.names()) {
            HudConfig.Element e = c.get(n);
            r.append("el\t").append(n)
             .append('\t').append(e.on)
             .append('\t').append(e.anchor)
             .append('\t').append(e.x)
             .append('\t').append(e.y)
             .append('\t').append(e.scale)
             .append('\t').append(e.compass)
             .append('\t').append(e.module)
             .append('\t').append(e.label)
             .append('\t').append(e.style.plate)
             .append('\t').append(hex6(e.style.plateRgb))
             .append('\t').append(e.style.plateAlpha)
             .append('\t').append(hex6(e.style.textRgb))
             .append('\t').append(e.style.textAlpha)
             .append('\n');
        }
        /* WRITTEN TO A FILE, NOT PRINTED. A label carries a middle dot, and
           on Windows System.out encodes to the console's codepage — which
           turned "Armor status · helmet" into a question mark and failed a
           check about data that had crossed the boundary perfectly intact.
           The file is UTF-8 because this end says so, and the reader opens it
           as UTF-8 because that end says so. No console in between. */
        Files.writeString(report, r.toString(), java.nio.charset.StandardCharsets.UTF_8);

        /* ── and then what the editor would do to it ─────────────────────
           A negative offset against a middle anchor, a non-integer scale,
           both whole-HUD style flips, and every one of the five per-element
           style fields set to something that is NOT its default — including a
           plate turned off, which has to survive as `false` rather than being
           mistaken for absent. Chosen to be mangled, not to look like a
           plausible layout. */
        String first = c.names().get(0);
        HudConfig.Element e0 = c.get(first);
        c.put(first, e0.movedTo("mr", -12.5, -9.6).scaledTo(1.75)
            .styled(e0.style.withPlate(false).withTextRgb(0xFF5555).withTextAlpha(80)
                            .withPlateRgb(0x55FF55).withPlateAlpha(35)));
        c.rounded = !c.rounded;
        c.kestrelFont = !c.kestrelFont;
        c.touch();

        Files.writeString(HudConfig.file(dir), c.document(),
            java.nio.charset.StandardCharsets.UTF_8);
    }
}
