'use strict';
/* ============================================================================
   THE HUD CONFIG, WRITTEN FOR THE CLIENT MOD.

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
   element. The mod should not have to know what a module is: it is a
   renderer, the launcher is the thing with the settings screen, and every
   concept that stays on this side is one that cannot drift out of step
   across a process and a language boundary.

   ── THE PAGE DOES NOT SHAPE THIS DOCUMENT ─────────────────────────────────
   The renderer hands over a settings object; this validates it into a file.
   Names are checked against a list, anchors against the nine, positions and
   scales are clamped, and anything unrecognised is dropped rather than
   passed through — because what arrives from the page ends up in a file that
   a mod parses with a hand-rolled parser, and "the renderer would not send
   that" is not something this side gets to assume.
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
  held: 'Armor status'
};
const ELEMENTS = Object.keys(ELEMENT_MODULE);

/* the nine the screen offers, and nothing else is an anchor */
const ANCHORS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];

/* A scale under a quarter is invisible and over four is a full-screen
   number; neither is a layout, so the range is stated rather than trusted. */
const SCALE_MIN = 0.25;
const SCALE_MAX = 4;

const FILE = 'kestrel-hud.json';

function clampPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : (n > 100 ? 100 : Math.round(n * 100) / 100);
}

function clampScale(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n < SCALE_MIN ? SCALE_MIN : (n > SCALE_MAX ? SCALE_MAX : Math.round(n * 100) / 100);
}

/* ── the settings object -> the document ──────────────────────────────────
   `hud.elements` is what the HUD screen arranged: {a, x, y, s} per element.
   `hud.modules` is what the Tweaks screen switched on: {"FPS": true, ...}.
   A module nobody has an opinion about counts as on — a fresh install should
   draw its HUD, not hide it until somebody finds the switch. */
function build(hud) {
  const h = (hud && typeof hud === 'object') ? hud : {};
  const src = (h.elements && typeof h.elements === 'object') ? h.elements : {};
  const mods = (h.modules && typeof h.modules === 'object') ? h.modules : {};

  const elements = {};
  let dropped = 0;

  for (const name of Object.keys(src)) {
    if (!Object.prototype.hasOwnProperty.call(ELEMENT_MODULE, name)) { dropped++; continue; }
    const e = src[name];
    if (!e || typeof e !== 'object') { dropped++; continue; }

    const anchor = ANCHORS.indexOf(String(e.a)) >= 0 ? String(e.a) : 'tl';
    const mod = ELEMENT_MODULE[name];
    const on = Object.prototype.hasOwnProperty.call(mods, mod) ? mods[mod] === true : true;

    elements[name] = {
      on: on,
      anchor: anchor,
      x: clampPercent(e.x),
      y: clampPercent(e.y),
      scale: clampScale(e.s)
    };
  }

  const on = Object.keys(elements).filter(function (k) { return elements[k].on; }).length;
  return { doc: { version: 1, elements: elements }, dropped: dropped, count: Object.keys(elements).length, on: on };
}

/* Writes the file into an instance's game directory. gameDir comes from
   Layout so it is already proved to sit inside the data root; the filename is
   still joined through inside() rather than concatenated, because that is the
   rule everywhere else here and an exception would be one more thing to
   remember. */
async function write(gameDir, hud, log) {
  const say = typeof log === 'function' ? log : function () {};
  const built = build(hud);
  const dir = inside(gameDir, 'config');
  const file = inside(dir, FILE);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(file, JSON.stringify(built.doc, null, 2));
  say('hud: wrote config/' + FILE + ' — ' + built.count + ' element(s), ' + built.on + ' on'
    + (built.dropped ? ', ' + built.dropped + ' unrecognised name(s) dropped' : ''));
  return built;
}

module.exports = { write, build, ELEMENTS, ELEMENT_MODULE, ANCHORS, FILE, SCALE_MIN, SCALE_MAX };
