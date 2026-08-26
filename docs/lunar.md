# What Lunar actually did well, and what it actually did wrong

## The design thesis, in one line

**Lunar removed decisions rather than organising them.** Every recurring piece of praise is about a
decision that was taken away; every recurring complaint is about commercial surface that was added
or control that was taken away. Those two are separable — which is the entire opening for this
project.

Removed decisions that earned the praise:
- **No Java path in the default flow.** Lunar bundles the correct JRE per version and picks it.
  This is the single largest contributor to "it just works", and it is a deliberate omission.
- RAM auto-detected, with a `Detect Recommended` action and a live `4.1GB / 28.5GB left to
  allocate` readout rather than a bare number field.
- No loader choice on legacy versions; no per-mod install; auto-update on new MC releases.
- The launch button states the whole current selection in one line: `LAUNCH GAME` over
  `Lunar Client 1.21 with Fabric`. You never have to look elsewhere to know what will start.
- One `ADVANCED MODE` toggle gates every expert control inside the normal settings list, with an
  `ADVANCED` badge per row — instead of a separate expert UI.

Added surface that earned the complaints: an ad slot, a store tab, promoted servers that overwrote
user-added entries, a subscription, cosmetics loading that slowed startup, and closed source.

**We take the first list and ship none of the second.** Keep the Java path control — but behind
Advanced, with auto-detect as the default path, so power users have it and nobody else meets it.

## Structure worth copying

v2 used top tabs `Home | Servers | Settings | About | Store`. **v3 deliberately moved to an icon
rail + top bar.** They abandoned tabs on purpose, which is a useful data point for our rail choice.

- Rail ~100px, active item marked by a pill bleeding off the far-left screen edge, settings gear
  pinned bottom with the version string beneath it.
- Launch button state machine: `Play` / `Install & Play` / `Downloading 43%` / `Running` / `Stop` /
  `Repair`. The button *is* the status display.
- `Ctrl/Cmd+K` global palette jumping to any page, setting, or action.
- Logs get a whole second window ("Mission Control"), opening on the second monitor by default,
  with a **privacy blur toggle for streaming**. Logs as a real destination, not a hidden panel.
- Accounts as a ~385px slide-over panel, not a page.
- First run offers `Continue as Guest` — you can see the app before committing an account.

## The privacy story, accurately

This matters because our Privacy page has to make claims we can defend.

**There was no single dated exodus event.** There were four waves of alarm (2021-2025), each set
off by someone rediscovering policy text that had been sitting there since 2019.

**The scary text was real but misread.** The April 2019 policy did permit collecting hardware
serials, "information about running processes, drivers and other executable code", screenshots of
your computer, and memory contents for manual analysis, retained indefinitely. However: that
language is anticheat boilerplate lifted near-verbatim from PunkBuster, Lunar removed the
client-side anticheat in October 2020, and the clauses were deleted from the policy in January
2021 — yet the largest wave, in May 2023, was still circulating screenshots of the old text.

**The real, material change was 13 August 2024:** the Overwolf partnership added an ad slot and
began targeted cross-contextual behavioural advertising — what the policy itself calls the "sale"
or "sharing" of personal information. The current policy collects identifiers, device info
including installed apps and fonts and battery level, navigation paths, voice-chat recordings, and
inferred behavioural profiles, shared with advertisers and data brokers.

**Substantiated:** the 2024 advertising change, the broker sharing, the behavioural profiling, and
the fact that closed source makes any of it unverifiable.
**Overblown:** "the policy permitted X" is not "the client did X". No packet capture,
decompilation, or sandbox report ever demonstrated Lunar exfiltrating arbitrary files, and the
antivirus hits were treated as false positives.

**So our Privacy page claims exactly this and nothing more:** no ad slot, no data-broker sharing,
no behavioural profiling, analytics off by default, and source you can read. We win on what we
verifiably do not do. We do not need to call Lunar spyware, and we should not.

---

## Sentiment dossier — the strongest wedge

Trustpilot sits at **1.9/5 across 100 reviews, 54% one-star**. The complaint cluster driving it is
not privacy at all: it is **RAM overrun, slow launch, and crashes**, and it is the most persistent
theme in the evidence — spanning Aug 2021 to Jul 2026 across three independent platforms.

Representative, all verifiable:
- Allocated 3 GB, using 4.5 GB. Allocated 2 GB, "takes up around 5-6 gigs". On an M1, "bypasses the
  RAM allocation and eats up to 60 gigs".
- "The game takes 10-15 minutes to even start." "Long (5+ minutes) launch times." Startup slowness
  is widely attributed to cosmetics loading — which we do not have.
- "Crashes all the time and has a memory leak." Multiple independent world-loss reports.

**So the wedge is honesty about memory and speed, and it is a UI problem as much as an engine one:**
show allocated *and actual* usage rather than just the slider value; never silently exceed the
allocation; make startup time visible instead of asking for faith. A launcher that shows its own
resource cost is making a claim its competitor cannot match.

Second cluster: ads inside navigation. "I don't want my server menu to be an ad." Lunar pins
promoted servers into the user's own server list, and one reviewer was soft-locked out of settings
by a cosmetics promo. Our rail carries navigation only.

## Two more corrections to carry

1. **"You can't add your own mods" is out of date.** True through 2023; since Jan 2024 Lunar loads
   third-party Fabric mods, and later NeoForge/Quilt/CurseForge. It is now only true for 1.7, 1.8
   and 1.12 — per Lunar's own FAQ. Do not build positioning on this.
2. **The forced v3 launcher migration (12-13 Aug 2023) predates the Badlion acquisition
   (11-12 Mar 2025) by about 19 months.** They are unrelated events, frequently conflated.

## On the "spyware" videos

The main one — "How LUNAR CLIENT Could Be SPYWARE", 3,381 views — links exactly one source: Lunar's
own published privacy policy. It is an argument from the policy text, not from packet capture or
decompilation, and the title itself hedges. The 2025 follow-up "Investigating Lunar Client's New
Policy" carries an explicit disclaimer that everything in it is a joke, and an affiliate link to a
paid cheat client. Neither is evidence of anything technical. This reinforces the earlier
conclusion: argue the commercial case, which is documented, and leave the forensic case alone.


---

## Apollo, and why having no server-facing surface is a feature

Lunar's current server-facing component is **Apollo**, an opt-in server plugin API. It includes an
**InstalledMods API**, so a server can query which Lunar mods a player has. It is documented for
operators and scoped to Lunar's own mod set — not OS-level scanning — but it is a genuine
client-to-server disclosure, and the Apollo FAQ does not document the data flow, which is a fair
transparency criticism.

Kestrel has no equivalent, because it has no server-facing surface at all. That is worth stating
plainly on the Privacy page as a thing we do not do, alongside no ad slot, no broker sharing and no
behavioural profiling.

It also settles the mod-loading question: a launcher that never talks to servers has nothing to
report, so "we do not tell servers what you are running" is a property of the architecture rather
than a promise we have to be trusted on. Pair it with the caveat that servers still run their own
anticheat — what we do not send says nothing about what a server can detect.
