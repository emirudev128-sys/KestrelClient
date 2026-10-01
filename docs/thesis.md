# What a launcher should take away, and what it should never add

The conclusions of the research done before the shell was designed: what players praise in the
clients they used, what they complain about, and what that means for this one. It names no other
product, because none of it depends on one — these are rules for Kestrel.

## The design thesis, in one line

**Remove decisions rather than organise them.** Every recurring piece of praise for a game client
is about a decision that was taken away; every recurring complaint is about commercial surface
that was added, or control that was taken away. Those two are separable — which is the entire
opening for this project.

Removed decisions that earn the praise:
- **No Java path in the default flow.** The launcher picks the correct runtime for the version.
  This is the single largest contributor to "it just works", and it is a deliberate omission.
- RAM auto-detected, with a recommend action and a live readout of what is left to allocate,
  rather than a bare number field.
- The launch button states the whole current selection in one line — version, loader, instance.
  You never have to look elsewhere to know what will start.
- One `Advanced` toggle gates every expert control inside the normal settings list, with a badge
  per row — instead of a separate expert UI.

Added surface that earns the complaints, wherever it appears: an ad slot, a store tab, promoted
servers that overwrite the player's own entries, a subscription, cosmetics whose loading slows
startup, and closed source.

**We take the first list and ship none of the second.** Keep the Java path control — but behind
Advanced, with auto-detect as the default path, so power users have it and nobody else meets it.

## Structure worth having

- An icon rail and a top bar rather than top tabs. The rail carries navigation and nothing else;
  settings sit pinned at its foot with the version string beneath.
- The launch button as a state machine: `Play` / `Install & Play` / `Downloading 43%` / `Running` /
  `Stop` / `Repair`. The button *is* the status display.
- A `Ctrl/Cmd+K` palette that jumps to any page, setting or action.
- Logs as a real destination, not a hidden panel — with a redact toggle for anyone streaming.
- Accounts as a slide-over panel, not a page.
- A first run that lets you see the app before committing an account.

## The privacy page: claims we can defend

**Claim exactly this and nothing more:** no ad slot, no data-broker sharing, no behavioural
profiling, analytics off by default, and source you can read. We win on what we verifiably do not
do.

Two rules for the copy:

- **"A policy permitted X" is not "a client did X".** Alarm about game clients is usually an
  argument from policy text, not from packet capture or decompilation. Do not repeat it, and never
  call another product spyware — it is not supportable and it is not needed.
- **Argue the commercial case, which anybody can check, and leave the forensic one alone.** An ad
  slot, a store and a subscription are visible to everyone who opens an app. Their absence here is
  just as visible.

## The strongest wedge: honesty about memory and speed

The most persistent complaints about game clients are not about privacy at all. They are **memory
use past the allocation, slow launches, and crashes** — year after year, on every platform where
players leave reviews.

It is a UI problem as much as an engine one: show allocated *and actual* usage rather than just
the slider value; never silently exceed the allocation; make startup time visible instead of
asking for faith. A launcher that shows its own resource cost is making a claim others cannot
match.

The second cluster is ads inside navigation — a server list or a settings route that doubles as a
promotion. Our rail carries navigation only, and a player's server list holds only what they put
there.

## No server-facing surface

Some clients ship a server plugin API through which a server can ask which of the client's mods a
player has installed. Documented and opt-in or not, that is a client-to-server disclosure.

Kestrel has no equivalent, because the launcher has no server-facing surface at all. That is worth
stating plainly on the Privacy page as a thing we do not do, alongside no ad slot, no broker
sharing and no behavioural profiling.

It also settles the mod-loading question: a launcher that never reports to servers has nothing to
report, so "we do not tell servers what you are running" is a property of the architecture rather
than a promise we have to be trusted on. Pair it with the caveat that servers still run their own
anticheat — what we do not send says nothing about what a server can detect.
