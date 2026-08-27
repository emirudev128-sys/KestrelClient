'use strict';
/* ============================================================================
   THE HUD CONFIG, WRITTEN FOR THE CLIENT MOD — AND NOW READ BACK FROM IT.

   Kestrel's HUD screen arranges eleven elements. The thing that draws them is
   client-mod/ — a Fabric mod inside the game's JVM, a different process that
   cannot be asked anything at runtime. So the arrangement is handed over as a
   file, written into the instance just before the game starts:

     <instance>/minecraft/config/kestrel-hud.json

   ── WHAT AN ELEMENT ACTUALLY IS ───────────────────────────────────────────
   Read the screen before designing the file. The first draft of this module
   carried {on, x, y} and would have been wrong in two ways at once: elements
   are positioned against one of NINE ANCHORS, and each has its own SCALE.
   Dropping the anchor puts a bottom-right element in the top-left and calls
   it a position; dropping the scale silently ignores a control the screen
   offers. Both would have looked like the mod was broken.

     a   the anchor: tl tc tr  ml mc mr  bl bc br
     x   percent offset from that anchor, horizontally
     y   percent offset from that anchor, vertically
     s   scale, 1 being the size the screen previews

   PERCENTAGES, NOT PIXELS, because the launcher does not know what
   resolution the game will open at, and a HUD arranged at 1280x800 has to
   land in the same visual place on a 1440p monitor.

   ── AND VISIBILITY IS PER-MODULE, NOT PER-ELEMENT ─────────────────────────
   The screen groups the eleven into seven modules: "Armor status" alone owns
   five of them (helmet, chest, legs, boots, held). A player turns off the
   MODULE, not the boot icon.

   That mapping is resolved HERE, and the file carries a plain `on` per
   element. The mod should not have to know what a module is when it DRAWS —
   it is a renderer. It does need to know when it OFFERS A TOGGLE, which is
   why `module` and `label` now travel in the document beside the geometry
   (see below) rather than becoming a second table inside the mod.

   ── THE DOCUMENT IS NOW WRITTEN FROM BOTH ENDS ────────────────────────────
   Version 3. Right Shift opens an in-game menu that can drag an element and
   flip a module, and that menu saves to the same file this module writes. So
   two writers share one document, and the old arrangement — "the launcher
   rewrites it from settings.hud on every launch" — would have thrown away
   every in-game edit at the next launch.

   THE RULE IS PROVENANCE, NOT TIMESTAMPS.  Every write stamps `by`, and
   `rev` counts up:

     by: "launcher"   this module wrote it, from settings.hud
     by: "game"       the mod wrote it, because somebody edited in-game

   On launch this module READS FIRST. If the file says `by: "game"` it is
   folded back into settings.hud — so an in-game drag reaches the HUD screen —
   and only then is the file rewritten, stamped `by: "launcher"` again. That
   second write is what makes the import idempotent: the next launch reads a
   launcher-written file and imports nothing, so a layout cannot be imported
   twice or fight itself.

   WHY `by` AND NOT "is rev newer than the one we last wrote".  settings.hud
   is ONE global object and the config file is PER INSTANCE, so revs across
   instances are not a total order. Edit in-game in instance A, launch B, then
   go back to A: A's rev would be lower than the number the launcher had moved
   on to, and a rev comparison would silently discard A's edit. `by` has no
   such hole — a game-written file is a game-written file whatever its number.
   `rev` stays because it makes the log line legible and lets the mod see its
   own write land, not because the decision rests on it.

   ── THE PAGE DOES NOT SHAPE THIS DOCUMENT ─────────────────────────────────
   The renderer hands over a settings object; this validates it into a file.
   Names are checked against a list, anchors against the nine, positions and
   scales are clamped, and anything unrecognised is dropped rather than
   passed through — because what arrives from the page ends up in a file that
   a mod parses with a hand-rolled parser, and "the renderer would not send
   that" is not something this side gets to assume.

   AND THE FILE DOES NOT SHAPE IT EITHER. What comes back off disk was written
   by a mod running inside a modded game — a JVM full of other people's code —
   so it goes through the same validation on the way IN as the page's object
   does on the way out. fromDoc() shares clampPercent, clampScale and the same
   name and anchor lists with build(); nothing is trusted for having been on
   disk.
   ========================================================================= */

const fsp = require('node:fs/promises');
const { inside } = require('./paths');

/* THE ELEVEN, AND THE MODULE EACH BELONGS TO.  This is the contract with
   ui/index.html, which declares the same pairing as data-el / data-mod on
   every element. It is written out rather than derived because the two live
   in different processes and different languages; tools/hudcheck.mjs asserts
   they still agree, so a twelfth element added to the screen fails a check
   rather than silently never being drawn. */
const ELEMENT_MODULE = {
  fps: 'FPS',
  cps: 'CPS',
  ping: 'Ping',
  keys: 'Keystrokes',
  coords: 'Coordinates',
  potion: 'Potion effects',
  helmet: 'Armor status',
  chest: 'Armor status',
  legs: 'Armor status',
  boots: 'Armor status',
  held: 'Armor status',
  /* ── THE SECOND WAVE ────────────────────────────────────────────────────
     Each one its own module, because each is a thing a player switches on or
     off by itself — unlike the five armour rows, which are one decision. */
  day: 'Day counter',
  clock: 'Clock',
  playtime: 'Playtime',
  memory: 'Memory',
  combo: 'Combo counter',
  totems: 'Totem counter',
  tnt: 'TNT countdown',
  reach: 'Reach display',
  pvp: 'PvP info'
};
const ELEMENTS = Object.keys(ELEMENT_MODULE);

/* THE FIVE THAT NEED A SECOND WORD.  "Armor status" owns five elements, so
   the module name alone cannot tell a helmet from a boot in a list. Mirrors
   data-sub in the markup, and hudcheck asserts it. */
const ELEMENT_SUB = {
  helmet: 'Helmet',
  chest: 'Chestplate',
  legs: 'Leggings',
  boots: 'Boots',
  held: 'Held item'
};

/* ── WHY THE DOCUMENT CARRIES WORDS AT ALL ────────────────────────────────
   The in-game menu has to name what it is toggling, and there were two ways
   to give it names: a label table inside the mod, or the labels travelling in
   the document. A table inside the mod is a twelfth place for the vocabulary
   to drift — add an element to the HUD screen and the menu shows a blank row
   or no row at all, in Java, three languages away from the change.

   So the launcher keeps owning every word a player reads, exactly as it owns
   the settings screen. The mod renders labels it was handed. It still has no
   vocabulary of its own; what it gained is an EDITOR for this document, not a
   second model of it. */
function labelOf(name) {
  const mod = ELEMENT_MODULE[name];
  if (!mod) return '';
  return ELEMENT_SUB[name] ? mod + ' · ' + ELEMENT_SUB[name].toLowerCase() : mod;
}

/* ── PER-ELEMENT OPTIONS ──────────────────────────────────────────────────
   Version 5. `compass` used to be a lone boolean on coords, with a comment
   saying a flag that means something on one element and nothing on the other
   ten belongs to that element. That was right, and it stopped scaling the
   moment nine more elements arrived each wanting its own switch: whether the
   armour rows show a bar or a number, which buttons the CPS counter counts,
   whether the keystroke grid includes the mouse.

   Eleven more one-off top-level fields would have been eleven more things for
   three languages to agree about. So an element carries an `opts` map, and
   what may be in it is DECLARED here — a type, a default, and the label the
   in-game menu prints. The mod builds its options rows out of this rather
   than out of a table of its own, exactly as it already takes `module` and
   `label` from here; a switch added below appears in game with no Java
   changing.

   `compass` moved in and is read from its old position on the way through, so
   a config written before this keeps its setting.

   TYPES ARE 'bool' AND 'enum' AND NOTHING ELSE. A number wants a range, a
   step, a slider and a decision about units; none of the nine needs one, and
   the day one does is the day to design it rather than to have left a hole
   open for it. */
const ELEMENT_OPTS = {
  cps: {
    buttons: { type: 'enum', vals: ['left', 'right', 'both'], def: 'left', label: 'Count' }
  },
  ping: {
    /* "Show the unit" and not 'Show "ms"', because reach declares the same
       switch and one global spec table means one name is one option — label
       included. The row sits under the element's own title, so the context
       already says which unit is meant. */
    unit: { type: 'bool', def: true, label: 'Show the unit' }
  },
  keys: {
    mouse: { type: 'bool', def: true, label: 'Show mouse buttons' },
    space: { type: 'bool', def: true, label: 'Show the spacebar' },
    cps: { type: 'bool', def: false, label: 'Put CPS on the buttons' }
  },
  coords: {
    compass: { type: 'bool', def: false, label: 'Show the compass' },
    biome: { type: 'bool', def: false, label: 'Show the biome' },
    precise: { type: 'bool', def: true, label: 'Show one decimal' }
  },
  potion: {
    duration: { type: 'bool', def: true, label: 'Show time left' },
    ambient: { type: 'bool', def: false, label: 'Include beacon effects' }
  },
  day: {
    label: { type: 'bool', def: true, label: 'Show the word "Day"' }
  },
  clock: {
    seconds: { type: 'bool', def: false, label: 'Show seconds' },
    ampm: { type: 'bool', def: false, label: '12-hour clock' }
  },
  playtime: {
    seconds: { type: 'bool', def: true, label: 'Show seconds' }
  },
  memory: {
    /* NOT `unit`, which is already a switch on ping and reach meaning "print
       the unit after the number". One global spec table means one name is one
       option, and the same name carrying a different TYPE on a different
       element is how the menu ends up drawing a checkbox for a three-value
       choice. hudcheck asserts the names cannot collide like that. */
    format: { type: 'enum', vals: ['gb', 'mb', 'percent'], def: 'gb', label: 'Show as' }
  },
  combo: {
    hide: { type: 'bool', def: true, label: 'Hide when idle' }
  },
  totems: {
    offhand: { type: 'bool', def: true, label: 'Count the offhand' }
  },
  tnt: {
    ticks: { type: 'bool', def: false, label: 'Count in ticks' }
  },
  reach: {
    unit: { type: 'bool', def: true, label: 'Show the unit' }
  },
  pvp: {
    health: { type: 'bool', def: true, label: 'Show their health' },
    distance: { type: 'bool', def: false, label: 'Show the distance' }
  },
  helmet: { wear: { type: 'enum', vals: ['bar', 'percent', 'none'], def: 'bar', label: 'Durability' } },
  chest: { wear: { type: 'enum', vals: ['bar', 'percent', 'none'], def: 'bar', label: 'Durability' } },
  legs: { wear: { type: 'enum', vals: ['bar', 'percent', 'none'], def: 'bar', label: 'Durability' } },
  boots: { wear: { type: 'enum', vals: ['bar', 'percent', 'none'], def: 'bar', label: 'Durability' } },
  held: { wear: { type: 'enum', vals: ['bar', 'percent', 'none'], def: 'bar', label: 'Durability' } }
};

/* every distinct option across every element, deduped by name */
function optSpec() {
  const out = {};
  const add = function (spec) {
    for (const key of Object.keys(spec)) {
      if (out[key]) continue;
      out[key] = spec[key].type === 'enum'
        ? { label: spec[key].label, vals: spec[key].vals.slice() }
        : { label: spec[key].label };
    }
  };
  for (const el of Object.keys(ELEMENT_OPTS)) add(ELEMENT_OPTS[el]);
  /* FEATURE OPTIONS GO IN THE SAME TABLE, so the menu resolves a label the
     same way whichever kind of row it is drawing. The name-collision rule
     covers both together, which is what makes that possible. */
  for (const f of FEATURE_NAMES) add(FEATURES[f].opts);
  return out;
}

/* Every option this element declares, defaulted, with anything it does not
   declare dropped. The same posture as everywhere else here: what arrives
   from the page — or back off disk from a mod running inside a modded game —
   is validated against a list rather than trusted. */
function optsFor(name, raw, legacy) {
  const spec = ELEMENT_OPTS[name];
  const out = {};
  if (!spec) return out;
  const src = (raw && typeof raw === 'object') ? raw : {};
  for (const key of Object.keys(spec)) {
    const s = spec[key];
    let v = src[key];
    /* compass lived at the top level before version 5 */
    if (v === undefined && legacy && Object.prototype.hasOwnProperty.call(legacy, key)) v = legacy[key];
    if (s.type === 'bool') out[key] = v === undefined ? s.def : v === true;
    else out[key] = s.vals.indexOf(String(v)) >= 0 ? String(v) : s.def;
  }
  return out;
}

/* ── WHERE AN ELEMENT SITS WHEN NOBODY HAS SAID ──────────────────────────
   Mirrors the `data-a` / `data-x` / `data-y` / `data-s` on every `.hel` in
   ui/index.html, which is the layout a fresh install opens on. hudcheck
   asserts the two agree, so moving one on the screen and forgetting this is a
   failed check rather than a silent disagreement.

   THIS EXISTS BECAUSE build() USED TO ITERATE THE STORED SETTINGS. It walked
   `settings.hud.elements` and wrote what it found there — so nine elements
   added to the launcher never reached the game at all, because the settings
   on disk predated them and nothing filled the gap. The user tested a build
   they had been told drew twenty elements and it drew eleven, and the log
   said so plainly: "saved revision 20 (11 element(s))".

   The features block had the shape right all along — featuresOf() iterates
   FEATURE_NAMES, the declaration, and defaults anything absent. That is why
   six features arrived in the same document that was missing nine elements,
   and the inconsistency is what gave the bug away. */
const ELEMENT_STOCK = {
  fps: { a: 'tl', x: 2.6, y: 4.2, s: 1 },
  cps: { a: 'tl', x: 2.6, y: 9.8, s: 1 },
  ping: { a: 'tl', x: 2.6, y: 12.4, s: 1 },
  keys: { a: 'ml', x: 3.4, y: 6, s: 1.2 },
  coords: { a: 'bl', x: 2.6, y: 17, s: 1 },
  potion: { a: 'tr', x: 2.6, y: 4.2, s: 1 },
  helmet: { a: 'mr', x: 2.6, y: -9.6, s: 1 },
  chest: { a: 'mr', x: 2.6, y: -3.4, s: 1 },
  legs: { a: 'mr', x: 2.6, y: 2.8, s: 1 },
  boots: { a: 'mr', x: 2.6, y: 9, s: 1 },
  held: { a: 'br', x: 2.6, y: 17, s: 1 },
  day: { a: 'tl', x: 2.6, y: 20, s: 1 },
  clock: { a: 'tr', x: 2.6, y: 9.8, s: 1 },
  playtime: { a: 'tr', x: 2.6, y: 12.4, s: 1 },
  memory: { a: 'bl', x: 2.6, y: 10, s: 1 },
  combo: { a: 'mc', x: 0, y: 12, s: 1 },
  totems: { a: 'br', x: 12, y: 4, s: 1 },
  tnt: { a: 'tc', x: 0, y: 12, s: 1 },
  reach: { a: 'mc', x: 0, y: 18, s: 1 },
  pvp: { a: 'ml', x: 3.4, y: 22, s: 1 }
};

/* the nine the screen offers, and nothing else is an anchor */
const ANCHORS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];

/* ── STYLE: THE TWO CHOICES THAT APPLY TO THE WHOLE HUD ───────────────────
   Corners and typeface are not per-element. A HUD with three sharp plates
   and one rounded one is not a configuration, it is a mistake, so these sit
   at the top of the document and every element obeys them.

   SHARP IS THE DEFAULT. Minecraft's own interface is square — every vanilla
   panel, tooltip and inventory slot has a hard corner — so a square plate is
   the one that looks like it belongs there. Rounded is offered because it is
   what most external clients do and some people want it.

   THE VANILLA FONT IS THE DEFAULT for the same reason: it is what the game
   already looks like, and a HUD that matches costs a new player nothing to
   read. Kestrel's own face is the deliberate choice, not the imposed one. */
const CORNERS = ['sharp', 'rounded'];
const FONTS = ['minecraft', 'kestrel'];

/* ══ FEATURES — THE SECOND NOUN ═══════════════════════════════════════════
   An ELEMENT is a plate of text at one of nine anchors with an offset, a
   scale and a style. Half of what was asked for next is not that: a toggle
   sprint has no anchor, zoom has a key and a field of view, a chunk-border
   overlay is drawn in the world in 3D rather than on the HUD plane. Forcing
   those into `elements` would put `plateAlpha` on things that cannot have
   one, and the first person to open the options screen for "Zoom" would find
   a colour picker.

   So a feature is its own thing: ON OR OFF, A KEY, AND ITS OWN OPTIONS. No
   position, no colour, no scale. It reuses the same option machinery the
   elements use — declared here with a type, a default and a label, and named
   once in the same top-level `optSpec` — so the in-game menu builds a
   feature's rows exactly the way it builds an element's.

   A KEY IS A GLFW NAME, not a code. "KEY_C" survives a keyboard layout and a
   remap where 67 does not, and it is the string Minecraft's own InputUtil
   parses. An empty key means "no binding": the feature is off unless
   something else turns it on.

   NOT EVERYTHING ASKED FOR IS HERE, and the gaps are deliberate rather than
   forgotten — see docs/hud-backlog.md. Freelook and hit colours need a MIXIN,
   which is a build-time weave into somebody else's class with its own config
   and refmap that breaks differently on every Minecraft version; adding the
   mod's first one for a HUD convenience, untested in a running game, is a bad
   trade. They are named in the backlog with that reason. */
const FEATURES = {
  sprint: {
    label: 'Toggle sprint',
    desc: 'Hold it once and stay sprinting',
    key: 'KEY_V',
    opts: {}
  },
  sneak: {
    label: 'Toggle sneak',
    desc: 'Hold it once and stay sneaking',
    key: '',
    opts: {}
  },
  zoom: {
    label: 'Zoom',
    desc: 'Narrow the field of view while held',
    key: 'KEY_C',
    opts: {
      amount: { type: 'enum', vals: ['2x', '4x', '8x'], def: '4x', label: 'How far' },
      smooth: { type: 'bool', def: true, label: 'Smooth the mouse while zoomed' }
    }
  },
  snaplook: {
    label: 'Snap look',
    desc: 'Turn a fixed amount instantly',
    key: 'KEY_LEFT_ALT',
    opts: {
      turn: { type: 'enum', vals: ['180', '90', '45'], def: '180', label: 'Degrees' }
    }
  },
  hitbox: {
    label: 'Hitboxes',
    desc: 'Outline entities in the world',
    key: '',
    opts: {
      players: { type: 'bool', def: true, label: 'Players only' }
    }
  },
  chunks: {
    label: 'Chunk borders',
    desc: 'Draw the edges of the chunk you are in',
    key: '',
    opts: {
      neighbours: { type: 'bool', def: false, label: 'Include the chunks around it' }
    }
  }
};
const FEATURE_NAMES = Object.keys(FEATURES);

/* a GLFW key name, or empty for unbound. Checked against a shape rather than
   a list: Minecraft's own InputUtil knows every name there is and this side
   has no business keeping a second copy of that list. */
const KEY_RE = /^KEY_[A-Z0-9_]{1,24}$/;

function featureFor(name, raw) {
  const spec = FEATURES[name];
  if (!spec) return null;
  const r = (raw && typeof raw === 'object') ? raw : {};
  const key = KEY_RE.test(String(r.key)) ? String(r.key) : (r.key === '' ? '' : spec.key);
  const out = { on: r.on === true, label: spec.label, desc: spec.desc, key: key };
  const o = optsFrom(spec.opts, r.opts);
  if (Object.keys(o).length) out.opts = o;
  return out;
}

/* the same validation optsFor does, against an arbitrary declaration rather
   than an element's — one implementation, two callers */
function optsFrom(spec, raw) {
  const out = {};
  if (!spec) return out;
  const src = (raw && typeof raw === 'object') ? raw : {};
  for (const key of Object.keys(spec)) {
    const sp = spec[key];
    const v = src[key];
    if (sp.type === 'bool') out[key] = v === undefined ? sp.def : v === true;
    else out[key] = sp.vals.indexOf(String(v)) >= 0 ? String(v) : sp.def;
  }
  return out;
}

/* who last wrote the document, and the only two answers there are */
const WRITERS = ['launcher', 'game'];

/* A scale under a quarter is invisible and over four is a full-screen
   number; neither is a layout, so the range is stated rather than trusted. */
const SCALE_MIN = 0.25;
const SCALE_MAX = 4;

/* ── PER-ELEMENT STYLE ────────────────────────────────────────────────────
   Version 4. Corners and font stay whole-HUD choices — three sharp plates and
   one rounded one is still a mistake — but colour and the plate itself are
   now per element, because the thing people actually want is one element
   picked out from the rest: coordinates bigger, ping in red, the fps counter
   with no box behind it at all.

   THE DEFAULTS ARE EXACTLY WHAT THE HUD ALREADY LOOKED LIKE. #0A0E13 at 72%
   is Paint.PLATE to the byte, #F1F4F7 is Paint.VALUE. An element nobody has
   styled is drawn by the same numbers as before this existed, so nothing
   moves under anyone who has not asked for it to.

   COLOURS ARE #RRGGBB AND ALPHA IS A SEPARATE 0..100. Packing them into one
   #AARRGGBB would have been fewer fields and worse: alpha is the control
   people reach for most ("make the box fainter"), it wants a slider of its
   own, and hiding it in the top two characters of a hex string makes it the
   hardest thing on the screen to change. */
const PLATE_COLOUR = '#0A0E13';   /* --s-app */
const PLATE_ALPHA = 72;
const TEXT_COLOUR = '#F1F4F7';    /* --ink */
const TEXT_ALPHA = 100;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/* Normalised to upper case so that #e3b439 and #E3B439 are one value rather
   than two that compare unequal — the mod writes one form, a hand-edited file
   may hold the other, and a round trip that changes the case of a colour
   looks like an edit nobody made. */
function colour(v, fallback) {
  const s = String(v);
  return HEX_RE.test(s) ? '#' + s.slice(1).toUpperCase() : fallback;
}

function alpha(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n < 0 ? 0 : (n > 100 ? 100 : Math.round(n));
}

const VERSION = 6;
const FILE = 'kestrel-hud.json';

/* A config file is a few hundred bytes. Anything past this is not a config
   file, and reading it into memory to find that out is the mistake. The mod
   applies the same ceiling on its side. */
const MAX_BYTES = 256 * 1024;

/* ── AND A PERCENTAGE MAY BE NEGATIVE ─────────────────────────────────────
   This clamped at zero until the in-game editor needed it not to, and that
   was a bug the whole time — not a limit. Against a CENTRE or MIDDLE anchor
   the offset runs both ways from the middle of the screen, which is exactly
   what the HUD screen's own place() does: `top: calc(50% + Y%)`. A negative Y
   is "above centre".

   The stock layout in ui/index.html has one — `helmet`, anchored `mr` at
   `data-y="-9.6"` — so every launch has been writing that element to 0 and
   dropping the helmet icon into the vertical centre of the screen, next to
   the chestplate it was meant to sit above. Nobody caught it because the mod
   does not draw armour yet, so the wrong number was never on screen.

   -100..100 is a full screen either way: past anything useful, short of the
   values that stop being positions. HudConfig.Element clamps to the same
   range on the other side. */
function clampPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < -100 ? -100 : (n > 100 ? 100 : Math.round(n * 100) / 100);
}

function clampScale(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n < SCALE_MIN ? SCALE_MIN : (n > SCALE_MAX ? SCALE_MAX : Math.round(n * 100) / 100);
}

/* Revisions count up and never wrap into something that stops comparing.
   Anything unreadable restarts at 0, which is a lost ordering and not a lost
   layout — the layout is in the elements, not in the counter. */
function clampRev(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > Number.MAX_SAFE_INTEGER - 2) return 0;
  return n;
}

/* ── the settings object -> the document ──────────────────────────────────
   `hud.elements` is what the HUD screen arranged: {a, x, y, s} per element.
   `hud.modules` is what the Tweaks screen switched on: {"FPS": true, ...}.
   A module nobody has an opinion about counts as on — a fresh install should
   draw its HUD, not hide it until somebody finds the switch. */
function build(hud, rev) {
  const h = (hud && typeof hud === 'object') ? hud : {};
  const src = (h.elements && typeof h.elements === 'object') ? h.elements : {};
  const mods = (h.modules && typeof h.modules === 'object') ? h.modules : {};

  /* the whole-HUD choices, defaulted rather than assumed present */
  const st = (h.style && typeof h.style === 'object') ? h.style : {};
  const style = {
    corners: CORNERS.indexOf(String(st.corners)) >= 0 ? String(st.corners) : 'sharp',
    font: FONTS.indexOf(String(st.font)) >= 0 ? String(st.font) : 'minecraft'
  };

  const elements = {};
  let dropped = 0;
  /* an unrecognised NAME in the settings is still worth reporting, even
     though the loop below no longer walks them */
  for (const name of Object.keys(src)) {
    if (!Object.prototype.hasOwnProperty.call(ELEMENT_MODULE, name)) dropped++;
    else if (!src[name] || typeof src[name] !== 'object') dropped++;
  }

  /* EVERY ELEMENT THIS LAUNCHER KNOWS ABOUT, not every element somebody's
     settings happen to hold. See ELEMENT_STOCK for what went wrong when this
     was the other way round. */
  for (const name of ELEMENTS) {
    const stored = src[name];
    const e = (stored && typeof stored === 'object') ? stored : ELEMENT_STOCK[name];

    const anchor = ANCHORS.indexOf(String(e.a)) >= 0 ? String(e.a) : 'tl';
    const mod = ELEMENT_MODULE[name];
    const on = Object.prototype.hasOwnProperty.call(mods, mod) ? mods[mod] === true : true;

    elements[name] = {
      on: on,
      module: mod,
      label: labelOf(name),
      anchor: anchor,
      x: clampPercent(e.x),
      y: clampPercent(e.y),
      scale: clampScale(e.s),
      /* PLATE DEFAULTS TO ON, and the test is `!== false` rather than
         `=== true`: an element written before this field existed has no
         opinion, and the answer for "no opinion" has to be the way it already
         looked, which was with a box. */
      plate: e.plate !== false,
      plateColour: colour(e.plateColour, PLATE_COLOUR),
      plateAlpha: alpha(e.plateAlpha, PLATE_ALPHA),
      textColour: colour(e.textColour, TEXT_COLOUR),
      textAlpha: alpha(e.textAlpha, TEXT_ALPHA)
    };
    /* THE ELEMENT'S OWN SWITCHES, declared in ELEMENT_OPTS and written only
       for the elements that have any. `e` is passed as the legacy source so
       a `compass` sitting at the top level of a pre-v5 document is picked up
       rather than lost. */
    const opts = optsFor(name, e.opts, e);
    if (Object.keys(opts).length) elements[name].opts = opts;
  }

  const on = Object.keys(elements).filter(function (k) { return elements[k].on; }).length;
  const doc = {
    version: VERSION,
    rev: clampRev(rev) + 1,
    by: 'launcher',
    style: style,
    /* ── WHAT EACH OPTION IS CALLED, WRITTEN ONCE ──────────────────────
       The in-game menu has to print a label beside every switch and step
       through the values of every enum, and it is not allowed a table of its
       own — that is the rule that keeps `module` and `label` travelling in
       this document rather than being duplicated in Java.

       Written at the TOP LEVEL rather than on each element, because `wear`
       means the same thing on all five armour rows and repeating its label
       and its three values five times would be five copies to keep in step.
       Keyed by option name; the names are globally distinct on purpose. */
    optSpec: optSpec(),
    elements: elements,
    /* every feature, always — an absent one would read as "this launcher does
       not know about zoom" rather than "zoom is off", and the mod would have
       no row to offer */
    features: featuresOf(h.features)
  };
  return { doc: doc, dropped: dropped, count: Object.keys(elements).length, on: on };
}

function featuresOf(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  for (const name of FEATURE_NAMES) out[name] = featureFor(name, src[name]);
  return out;
}

/* ── the document -> a settings object ────────────────────────────────────
   The other direction, used only when the file says the GAME wrote it.
   Produces the same shape the HUD screen saves — {elements:{a,x,y,s}, modules,
   style} — so the result can be handed straight to store.writeSettings and
   the screen picks it up with no translation of its own.

   A MODULE IS ON IF ITS ELEMENTS ARE. Visibility is resolved on this side and
   comes back resolved per element, so the module state has to be inferred.
   "Armor status" owns five: they were written from one switch and the menu
   flips them together, so they agree — and where they somehow do not, ANY
   element being on means the module is on. Erring towards showing something
   is the recoverable mistake; erring towards hiding it looks like the toggle
   is broken. */
function fromDoc(doc) {
  const d = (doc && typeof doc === 'object') ? doc : {};
  const src = (d.elements && typeof d.elements === 'object') ? d.elements : {};
  const st = (d.style && typeof d.style === 'object') ? d.style : {};

  const elements = {};
  const modules = {};
  let dropped = 0;

  for (const name of Object.keys(src)) {
    if (!Object.prototype.hasOwnProperty.call(ELEMENT_MODULE, name)) { dropped++; continue; }
    const e = src[name];
    if (!e || typeof e !== 'object') { dropped++; continue; }

    elements[name] = {
      a: ANCHORS.indexOf(String(e.anchor)) >= 0 ? String(e.anchor) : 'tl',
      x: clampPercent(e.x),
      y: clampPercent(e.y),
      s: clampScale(e.scale),
      /* THE STYLE COMES HOME TOO. Without these five the round trip would
         carry a dragged position back and quietly drop the colour that was
         picked in the same sitting — which reads as "the menu forgot", not as
         "that field is not supported yet". */
      plate: e.plate !== false,
      plateColour: colour(e.plateColour, PLATE_COLOUR),
      plateAlpha: alpha(e.plateAlpha, PLATE_ALPHA),
      textColour: colour(e.textColour, TEXT_COLOUR),
      textAlpha: alpha(e.textAlpha, TEXT_ALPHA)
    };
    const back = optsFor(name, e.opts, e);
    if (Object.keys(back).length) elements[name].opts = back;

    const mod = ELEMENT_MODULE[name];
    modules[mod] = (modules[mod] === true) || e.on === true;
  }

  return {
    hud: {
      elements: elements,
      features: featuresOf(d.features),
      modules: modules,
      style: {
        corners: CORNERS.indexOf(String(st.corners)) >= 0 ? String(st.corners) : 'sharp',
        font: FONTS.indexOf(String(st.font)) >= 0 ? String(st.font) : 'minecraft'
      }
    },
    dropped: dropped,
    count: Object.keys(elements).length
  };
}

/* ── reading what is on disk ──────────────────────────────────────────────
   NEVER THROWS FOR A BAD FILE, only for a bad path. An absent, oversized or
   unparseable config is the ordinary case in an instance nobody has launched
   yet, and it means "nothing to import" rather than "stop the launch". The
   caller cannot tell those cases apart from an exception and should not have
   to. */
const NOTHING = { doc: null, rev: 0, by: null };

async function read(gameDir, log) {
  const say = typeof log === 'function' ? log : function () {};
  const file = inside(inside(gameDir, 'config'), FILE);
  let text;
  try {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) return NOTHING;
    if (stat.size > MAX_BYTES) {
      say('hud: config/' + FILE + ' is implausibly large (' + stat.size + ' bytes); ignoring it');
      return NOTHING;
    }
    text = await fsp.readFile(file, 'utf8');
  } catch (e) {
    /* absent is the common case and not worth a line in the log */
    return NOTHING;
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    say('hud: config/' + FILE + ' is not valid JSON; it will be replaced');
    return NOTHING;
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return NOTHING;
  const by = WRITERS.indexOf(String(doc.by)) >= 0 ? String(doc.by) : null;
  return { doc: doc, rev: clampRev(doc.rev), by: by };
}

/* ── read back, then write: the whole launch-time exchange ────────────────
   Returns { built, imported, settings }. `settings` is non-null exactly when
   something came back from the game and the caller has a patch to persist;
   the caller decides whether it can be, because this module has no store.

   THE ORDER IS THE POINT. Import first, then write from the imported values,
   so the file the game reads next is the one the launcher has just agreed
   with — rather than the launcher's older idea of the layout landing on top
   of the edit it was in the middle of accepting. */
async function sync(gameDir, hud, log) {
  const say = typeof log === 'function' ? log : function () {};
  const found = await read(gameDir, say);

  let settings = null;
  let next = hud;

  if (found.by === 'game') {
    const back = fromDoc(found.doc);
    if (back.count > 0) {
      /* MERGED ONTO WHAT THE LAUNCHER HAD, not swapped for it. A game-written
         document holds only the elements that mod knew about, and a mod from
         an older instance may know fewer of them than the screen does.
         Replacing wholesale would delete an element from the HUD screen
         because some instance's copy of the mod predates it. */
      const before = (hud && typeof hud === 'object') ? hud : {};
      next = {
        elements: Object.assign({}, before.elements, back.hud.elements),
        modules: Object.assign({}, before.modules, back.hud.modules),
        style: back.hud.style
      };
      settings = next;
      say('hud: took back an in-game edit — revision ' + found.rev + ', '
        + back.count + ' element(s)'
        + (back.dropped ? ', ' + back.dropped + ' unrecognised name(s) dropped' : ''));
    }
  }

  const built = await write(gameDir, next, say, found.rev);
  return { built: built, imported: settings !== null, settings: settings };
}

/* Writes the file into an instance's game directory. gameDir comes from
   Layout so it is already proved to sit inside the data root; the filename is
   still joined through inside() rather than concatenated, because that is the
   rule everywhere else here and an exception would be one more thing to
   remember. */
async function write(gameDir, hud, log, rev) {
  const say = typeof log === 'function' ? log : function () {};
  const built = build(hud, rev);
  const dir = inside(gameDir, 'config');
  const file = inside(dir, FILE);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(file, JSON.stringify(built.doc, null, 2));
  say('hud: wrote config/' + FILE + ' — revision ' + built.doc.rev + ', ' + built.count
    + ' element(s), ' + built.on + ' on'
    + (built.dropped ? ', ' + built.dropped + ' unrecognised name(s) dropped' : ''));
  return built;
}

module.exports = {
  sync, read, write, build, fromDoc, labelOf,
  ELEMENTS, ELEMENT_MODULE, ELEMENT_SUB, ELEMENT_OPTS, ELEMENT_STOCK, optsFor, optSpec,
  FEATURES, FEATURE_NAMES, featureFor, featuresOf,
  ANCHORS, CORNERS, FONTS, WRITERS,
  FILE, VERSION, SCALE_MIN, SCALE_MAX, MAX_BYTES,
  PLATE_COLOUR, PLATE_ALPHA, TEXT_COLOUR, TEXT_ALPHA,
  /* the five per-element style keys, named once so the renderer and the
     checks can iterate them instead of each keeping a list */
  STYLE_KEYS: ['plate', 'plateColour', 'plateAlpha', 'textColour', 'textAlpha']
};
