/* ============================================================================
   THE HUD CONTRACT, ASSERTED ACROSS THREE LANGUAGES.

     node tools/hudcheck.mjs

   The HUD exists in three places that cannot see each other:

     ui/index.html                      the screen a player arranges it on
     mc/hud.js                          what the launcher writes to disk
     client-mod/.../HudConfig.java      what the game reads back

   Nothing links them at build time — one is markup, one is CommonJS, one is
   Java compiled by a different toolchain against Minecraft. So a twelfth
   element added to the screen would simply never be drawn, silently, and the
   first person to notice would be a player wondering why a toggle does
   nothing. These are the checks that notice instead.

   THE FIRST DRAFT OF mc/hud.js GOT THIS WRONG and these checks are why the
   shape is what it is: it carried {on, x, y} while the screen models an
   ANCHOR and a SCALE per element and groups visibility by MODULE. Dropping
   the anchor puts a bottom-right element in the top-left while still looking
   like a position.
   ========================================================================= */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const hud = require('../mc/hud.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (name, cond, extra) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (extra ? '   ' + extra : ''));
  if (!cond) fails++;
};

const html = fs.readFileSync(path.join(ROOT, 'ui', 'index.html'), 'utf8');
const appjs = fs.readFileSync(path.join(ROOT, 'ui', 'scripts', 'app.js'), 'utf8');

/* ── 1. the screen and the launcher name the same elements ─────────────── */
console.log('\nthe screen and the launcher agree on what an element is');
const inUi = [...new Set([...html.matchAll(/data-el="([a-z0-9-]+)"/g)].map((m) => m[1]))].sort();
const inJs = [...hud.ELEMENTS].sort();
console.log('   screen: ' + inUi.join(' '));
ok('every element on the HUD screen is one the launcher will write',
  inUi.every((n) => inJs.indexOf(n) >= 0),
  inUi.filter((n) => inJs.indexOf(n) < 0).join(' ') || inUi.length + ' elements');
ok('and the launcher writes nothing the screen cannot arrange',
  inJs.every((n) => inUi.indexOf(n) >= 0), inJs.filter((n) => inUi.indexOf(n) < 0).join(' '));

/* ── 2. and the same element-to-module grouping ────────────────────────── */
console.log('\nand on which module owns each element');
const pairs = [...html.matchAll(/data-el="([a-z0-9-]+)"\s+data-mod="([^"]+)"/g)];
ok('the markup pairs every element with a module', pairs.length === inUi.length,
  pairs.length + ' pairs for ' + inUi.length + ' elements');
const wrong = pairs.filter(([, el, mod]) => hud.ELEMENT_MODULE[el] !== mod);
ok('and the launcher agrees with every pairing', wrong.length === 0,
  wrong.map(([, el, mod]) => el + ': markup says ' + mod + ', hud.js says ' + hud.ELEMENT_MODULE[el]).join(' | '));
const modules = [...new Set(Object.values(hud.ELEMENT_MODULE))];
console.log('   ' + modules.length + ' modules for ' + inJs.length + ' elements'
  + ' (Armor status owns ' + Object.keys(hud.ELEMENT_MODULE).filter((k) => hud.ELEMENT_MODULE[k] === 'Armor status').length + ')');

/* ── 3. the nine anchors ───────────────────────────────────────────────── */
console.log('\nand on what an anchor is');
const uiAnchors = (() => {
  const m = appjs.match(/ANCHOR_NAME\s*=\s*\{([\s\S]*?)\}/);
  if (!m) return [];
  return [...new Set([...m[1].matchAll(/\b([tmb][lcr])\s*:/g)].map((x) => x[1]))].sort();
})();
console.log('   screen: ' + uiAnchors.join(' '));
ok('the screen offers nine anchors', uiAnchors.length === 9, String(uiAnchors.length));
ok('and the launcher accepts exactly those',
  uiAnchors.join(' ') === [...hud.ANCHORS].sort().join(' '), hud.ANCHORS.join(' '));
/* every element in the markup ships an anchor the launcher will accept */
const uiEls = [...html.matchAll(/data-el="([a-z0-9-]+)"[^>]*data-a="([a-z]+)"/g)];
ok('every element in the markup has an anchor the launcher accepts',
  uiEls.length > 0 && uiEls.every(([, , a]) => hud.ANCHORS.indexOf(a) >= 0),
  uiEls.length + ' elements checked');

/* ── 4. the mod only defaults to elements that exist ───────────────────── */
console.log('\nthe mod defaults to elements the launcher knows about');
const javaFile = path.join(ROOT, 'client-mod', 'src', 'main', 'java', 'dev', 'kestrel', 'hud', 'HudConfig.java');
if (!fs.existsSync(javaFile)) {
  ok('HudConfig.java is where the contract says it is', false, javaFile);
} else {
  const java = fs.readFileSync(javaFile, 'utf8');
  const defaults = [...java.matchAll(/m\.put\("([a-z0-9-]+)"/g)].map((m) => m[1]);
  console.log('   mod defaults: ' + (defaults.join(' ') || '(none)'));
  ok('the mod has defaults at all', defaults.length > 0);
  ok('and every one is an element the screen arranges',
    defaults.every((d) => inUi.indexOf(d) >= 0), defaults.filter((d) => inUi.indexOf(d) < 0).join(' '));
  ok('the mod reads the filename the launcher writes', java.indexOf(hud.FILE) >= 0, hud.FILE);
  /* the four keys the launcher emits are the four the parser looks for */
  for (const key of ['on', 'anchor', 'x', 'y', 'scale']) {
    ok('the parser looks for "' + key + '"', java.indexOf('"' + key + '"') >= 0);
  }
  ok('the mod clamps scale to the same range as the launcher',
    java.indexOf('0.25') >= 0 && java.indexOf('4.0') >= 0,
    hud.SCALE_MIN + '..' + hud.SCALE_MAX);
}

/* ── 4b. EVERY element reaches the game, not just the stored ones ───────
   The bug this exists for: build() walked `settings.hud.elements` and wrote
   what it found there, so nine elements added to the launcher never reached
   the game at all — the settings on disk predated them and nothing filled the
   gap. The user tested a build described as drawing twenty elements; it drew
   eleven, and the log said "saved revision 20 (11 element(s))".

   The features block had it right from the start — featuresOf() iterates the
   DECLARATION and defaults what is absent. That inconsistency is what gave it
   away, and it is what this asserts for both. */
console.log('');
console.log('every declared element reaches the document, stored or not');
const sparse = hud.build({ elements: { fps: { a: 'tl', x: 1, y: 1, s: 1 } }, modules: {} });
ok('a settings object holding ONE element still writes them all',
  sparse.count === hud.ELEMENTS.length,
  sparse.count + ' of ' + hud.ELEMENTS.length);
ok('and the ones it did not hold come from the stock layout',
  sparse.doc.elements.coords.anchor === hud.ELEMENT_STOCK.coords.a
    && sparse.doc.elements.coords.y === hud.ELEMENT_STOCK.coords.y,
  'not 0,0 — everything would pile into the top-left corner');
ok('a stored element still wins over the stock one',
  sparse.doc.elements.fps.y === 1, String(sparse.doc.elements.fps.y));
ok('empty settings write the whole stock layout',
  hud.build({}).count === hud.ELEMENTS.length);
ok('and features already worked this way — that is how the bug showed',
  Object.keys(hud.build({}).doc.features).length === hud.FEATURE_NAMES.length);

/* THE STOCK TABLE IS A SECOND COPY OF THE MARKUP, so it gets the same
   treatment every other duplicated table here gets. */
console.log('');
console.log('and the stock layout agrees with the markup it mirrors');
const mk = {};
for (const m of html.matchAll(/data-el="([a-z0-9-]+)"[^>]*?data-a="([a-z]+)"[^>]*?data-x="(-?[0-9.]+)"[^>]*?data-y="(-?[0-9.]+)"[^>]*?data-s="([0-9.]+)"/g)) {
  mk[m[1]] = { a: m[2], x: Number(m[3]), y: Number(m[4]), s: Number(m[5]) };
}
ok('the markup positions every element hud.js knows',
  hud.ELEMENTS.every((e) => mk[e]), hud.ELEMENTS.filter((e) => !mk[e]).join(' '));
const drift = hud.ELEMENTS.filter((e) => {
  const a = mk[e], b = hud.ELEMENT_STOCK[e];
  return !a || !b || a.a !== b.a || a.x !== b.x || a.y !== b.y || a.s !== b.s;
});
ok('and every stock position matches it exactly', drift.length === 0,
  drift.map((e) => e + ': markup ' + JSON.stringify(mk[e]) + ' vs hud.js ' + JSON.stringify(hud.ELEMENT_STOCK[e])).join(' | ')
    || hud.ELEMENTS.length + ' positions');

/* ── 5. what the page sends is validated, not passed through ───────────── */
console.log('\nwhat the page sends is validated, not passed through');
const built = hud.build({
  elements: {
    fps: { a: 'tl', x: 2.6, y: 4.2, s: 1 },
    coords: { a: 'nonsense', x: -50, y: 9999, s: 99 },
    boots: { a: 'br', x: 1, y: 1, s: 1 },
    evil: { a: 'tl', x: 0, y: 0, s: 1 },
    '../../escape': { a: 'tl', x: 0, y: 0, s: 1 },
    potion: 'not an object'
  },
  modules: { 'Armor status': false }
});
ok('an unknown element name is dropped', !('evil' in built.doc.elements));
ok('a name that looks like a path is dropped', !('../../escape' in built.doc.elements));
/* NOT "dropped" any more, and the change is the point: every declared
   element is written whatever the settings hold, so garbage where an
   element's geometry should be falls back to the stock position rather than
   removing the element from the game. It is still COUNTED as dropped, which
   is what puts it in the log. */
ok('a non-object falls back to the stock position rather than vanishing',
  built.doc.elements.potion
    && built.doc.elements.potion.anchor === hud.ELEMENT_STOCK.potion.a
    && built.doc.elements.potion.y === hud.ELEMENT_STOCK.potion.y,
  JSON.stringify(built.doc.elements.potion && built.doc.elements.potion.anchor));
ok('the drop count is reported rather than swallowed', built.dropped === 3, String(built.dropped));
ok('an anchor that is not one of the nine falls back to tl',
  built.doc.elements.coords.anchor === 'tl', built.doc.elements.coords.anchor);
/* A NEGATIVE POSITION IS A POSITION, and this used to clamp it to zero.
   Against a centre or middle anchor the offset runs both ways from the middle
   of the screen — `top: calc(50% + Y%)` on the screen's own side — so -9.6
   means "9.6% above centre". The stock layout in the markup has one, so the
   old clamp was silently moving the helmet icon to the vertical centre on
   every launch. Nobody saw it because the mod does not draw armour yet. */
ok('a negative position survives, because centre anchors need one',
  built.doc.elements.coords.x === -50, String(built.doc.elements.coords.x));
ok('a position past the screen clamps to 100', built.doc.elements.coords.y === 100);
ok('and past a screen the other way clamps to -100',
  hud.build({ elements: { fps: { a: 'mc', x: -500, y: 0, s: 1 } } }).doc.elements.fps.x === -100);
/* the markup's own negative offset, end to end */
const stockNeg = [...html.matchAll(/data-el="([a-z0-9-]+)"[^>]*data-y="(-[\d.]+)"/g)];
ok('the stock layout in the markup does use a negative offset',
  stockNeg.length > 0, stockNeg.map(([, el, y]) => el + ' at ' + y).join(', ') || 'none found');
if (stockNeg.length) {
  const [, negEl, negY] = stockNeg[0];
  ok('and the launcher writes it through unchanged',
    hud.build({ elements: { [negEl]: { a: 'mr', x: 0, y: Number(negY), s: 1 } } })
       .doc.elements[negEl].y === Number(negY), negEl + ' -> ' + negY);
}
ok('a runaway scale clamps to the maximum', built.doc.elements.coords.scale === hud.SCALE_MAX,
  String(built.doc.elements.coords.scale));
ok('a module switched off turns its element off',
  built.doc.elements.boots.on === false, 'boots is owned by Armor status');
ok('a module nobody has an opinion about counts as on',
  built.doc.elements.fps.on === true);
ok('the document carries a version', built.doc.version === hud.VERSION, 'v' + hud.VERSION);


/* the whole-HUD style choices */
console.log('');
console.log('the two style choices default to what the game already looks like');
const plain = hud.build({ elements: { fps: { a: 'tl', x: 1, y: 1, s: 1 } } });
ok('corners default to sharp', plain.doc.style.corners === 'sharp', plain.doc.style.corners);
ok('the font defaults to Minecraft', plain.doc.style.font === 'minecraft', plain.doc.style.font);
const chosen = hud.build({ style: { corners: 'rounded', font: 'kestrel' }, elements: {} });
ok('rounded can be asked for', chosen.doc.style.corners === 'rounded');
ok('and so can the Kestrel face', chosen.doc.style.font === 'kestrel');
const junk = hud.build({ style: { corners: 'triangle', font: 'comic' }, elements: {} });
ok('a corner shape that does not exist falls back to sharp', junk.doc.style.corners === 'sharp', junk.doc.style.corners);
ok('a font that does not exist falls back to Minecraft', junk.doc.style.font === 'minecraft', junk.doc.style.font);

console.log('');
console.log('an option belongs to the elements that declare it and to no others');
const comp = hud.build({ elements: {
  coords: { a: 'tl', x: 1, y: 1, s: 1, opts: { compass: true } },
  fps: { a: 'tl', x: 1, y: 1, s: 1, opts: { compass: true } } } });
ok('coords carries it', comp.doc.elements.coords.opts.compass === true);
ok('fps has no opts at all, even when asked',
  comp.doc.elements.fps.opts === undefined, 'fps declares none');
ok('and a switch is a strict boolean',
  hud.build({ elements: { coords: { a: 'tl', x: 0, y: 0, s: 1, opts: { compass: 'yes' } } } })
     .doc.elements.coords.opts.compass === false);
/* THE MIGRATION. compass sat at the top level before version 5, and a config
   written then must not lose the setting when it is read now. */
ok('a pre-v5 top-level compass is folded into opts',
  hud.build({ elements: { coords: { a: 'tl', x: 0, y: 0, s: 1, compass: true } } })
     .doc.elements.coords.opts.compass === true,
  'a config written before v5 keeps its setting');
ok('and is no longer written at the top level',
  hud.build({ elements: { coords: { a: 'tl', x: 0, y: 0, s: 1, compass: true } } })
     .doc.elements.coords.compass === undefined, 'one place, not two');

console.log('');
console.log('and an enum option is checked against its own values');
const wear = (v) => hud.build({ elements: { helmet: { a: 'mr', x: 0, y: 0, s: 1, opts: { wear: v } } } })
  .doc.elements.helmet.opts.wear;
ok('a declared value is kept', wear('percent') === 'percent');
ok('and one that is not falls back to the default', wear('rainbow') === 'number', wear('rainbow'));
/* the durability bar is gone — the user wanted the number, the way advanced
   tooltips show it — so a document that still says "bar" reads as the number */
ok('a stored "bar" from before becomes the number', wear('bar') === 'number', wear('bar'));
ok('an option the element does not declare is dropped',
  hud.build({ elements: { helmet: { a: 'mr', x: 0, y: 0, s: 1, opts: { compass: true } } } })
     .doc.elements.helmet.opts.compass === undefined);

console.log('');
console.log('every option is named once, at the top of the document');
const spec = hud.build({ elements: {} }).doc.optSpec;
/* BOTH KINDS, because features share the one spec table with elements —
   that sharing is what lets the menu resolve a label the same way whichever
   sort of row it is drawing. */
const declared = new Set();
for (const el of Object.keys(hud.ELEMENT_OPTS)) {
  for (const k of Object.keys(hud.ELEMENT_OPTS[el])) declared.add(k);
}
for (const f of hud.FEATURE_NAMES) {
  for (const k of Object.keys(hud.FEATURES[f].opts)) declared.add(k);
}
ok('the spec names every option any element declares',
  [...declared].every((k) => spec[k] && spec[k].label),
  [...declared].filter((k) => !(spec[k] && spec[k].label)).join(' ') || declared.size + ' options');
ok('every enum in the spec carries its values',
  Object.keys(spec).every((k) => {
    const anyEnum = Object.values(hud.ELEMENT_OPTS).some((e) => e[k] && e[k].type === 'enum');
    return anyEnum ? Array.isArray(spec[k].vals) && spec[k].vals.length > 0 : true;
  }));
/* the whole point of one table: `wear` is on five armour elements and must
   mean the same thing on all five */
ok('an option shared by several elements or features is declared once',
  Object.keys(spec).length === declared.size,
  Object.keys(spec).length + ' entries for ' + declared.size + ' distinct options');
/* THE INVARIANT ONE GLOBAL TABLE RESTS ON. optSpec() dedupes by name and
   keeps the first, so an option name used with two different types — or two
   different labels — on two elements silently gets one of them everywhere.
   That is exactly what happened when `unit` was a switch on ping and an enum
   on memory: the menu would have drawn a checkbox for a three-value choice. */
const byName = {};
let collide = [];
for (const el of Object.keys(hud.ELEMENT_OPTS)) {
  for (const [k, o] of Object.entries(hud.ELEMENT_OPTS[el])) {
    const sig = o.type + '|' + o.label + '|' + (o.vals || []).join(',');
    if (byName[k] && byName[k].sig !== sig) collide.push(k + ' (' + byName[k].el + ' vs ' + el + ')');
    else byName[k] = { sig, el };
  }
}
ok('no option name means two different things on two elements',
  collide.length === 0, collide.join('; ') || Object.keys(byName).length + ' distinct names');

ok('and every default a declaration states is one of its own values',
  Object.values(hud.ELEMENT_OPTS).every((e) => Object.values(e).every((o) =>
    o.type === 'bool' ? typeof o.def === 'boolean' : o.vals.indexOf(o.def) >= 0)));

if (fs.existsSync(javaFile)) {
  const styleJava = fs.readFileSync(javaFile, 'utf8');
  console.log('');
  console.log('the mod reads the same style words the launcher writes');
  /* A JAVA STRING LITERAL ESCAPES ITS OWN QUOTES, so a key the parser looks
     for appears in the source as either "word" or \"word\" depending on
     whether it was written as a bare literal or inside one. Matching only the
     first form reported optSpec missing from a file that reads it. */
  for (const w of ['style', 'corners', 'rounded', 'font', 'kestrel', 'opts', 'optSpec']) {
    ok('HudConfig looks for the word ' + w,
      styleJava.indexOf('"' + w + '"') >= 0 || styleJava.indexOf('\\"' + w + '\\"') >= 0);
  }
}

/* ── 6. the words the in-game menu shows are the launcher's ────────────── */
console.log('');
console.log('the menu has no vocabulary of its own');
const named = hud.build({ elements: {
  fps: { a: 'tl', x: 1, y: 1, s: 1 },
  helmet: { a: 'mr', x: 1, y: 1, s: 1 }
} });
ok('every element carries the module a toggle switches',
  Object.keys(named.doc.elements).every((k) => typeof named.doc.elements[k].module === 'string'
    && named.doc.elements[k].module.length > 0));
ok('and a label for a list to print', named.doc.elements.fps.label === 'FPS',
  named.doc.elements.fps.label);
ok('the five that share a module get a second word',
  named.doc.elements.helmet.label === 'Armor status \u00b7 helmet',
  named.doc.elements.helmet.label);
/* the sub-labels are the markup's, so the menu cannot drift from the screen */
const subs = [...html.matchAll(/data-el="([a-z0-9-]+)"[^>]*data-sub="([^"]+)"/g)];
ok('the markup names a sub-label for every element that needs one',
  subs.length === Object.keys(hud.ELEMENT_SUB).length,
  subs.length + ' in the markup, ' + Object.keys(hud.ELEMENT_SUB).length + ' in hud.js');
const badSub = subs.filter(([, el, sub]) => hud.ELEMENT_SUB[el] !== sub);
ok('and the launcher agrees with every one of them', badSub.length === 0,
  badSub.map(([, el, sub]) => el + ': markup says ' + sub).join(' | '));

/* ── 6b. per-element style, which is why version 4 exists ──────────────── */
console.log('');
console.log('colour and the plate belong to the element, not to the whole HUD');
const plain2 = hud.build({ elements: { fps: { a: 'tl', x: 1, y: 1, s: 1 } } }).doc.elements.fps;
ok('an element nobody styled gets a plate', plain2.plate === true);
ok('at exactly the colour the mod always painted', plain2.plateColour === hud.PLATE_COLOUR,
  plain2.plateColour + ' @ ' + plain2.plateAlpha + '%');
ok('and the ink the mod always used', plain2.textColour === hud.TEXT_COLOUR
  && plain2.textAlpha === hud.TEXT_ALPHA);
ok('every style key is written, never omitted for equalling a default',
  hud.STYLE_KEYS.every((k) => Object.prototype.hasOwnProperty.call(plain2, k)),
  hud.STYLE_KEYS.filter((k) => !(k in plain2)).join(' '));

const wild = hud.build({ elements: { fps: { a: 'tl', x: 1, y: 1, s: 1,
  plate: false, plateColour: '#aabbcc', plateAlpha: 250,
  textColour: 'red', textAlpha: -5 } } }).doc.elements.fps;
ok('a plate can be switched off', wild.plate === false);
ok('a lower-case hex is normalised, not stored twice over',
  wild.plateColour === '#AABBCC', wild.plateColour);
ok('an alpha past 100 clamps', wild.plateAlpha === 100, String(wild.plateAlpha));
ok('and below 0 clamps', wild.textAlpha === 0, String(wild.textAlpha));
ok('a colour that is not a colour falls back rather than being guessed at',
  wild.textColour === hud.TEXT_COLOUR, wild.textColour);
ok('and only ELEMENTS carry colour — the document style stays the two choices',
  Object.keys(hud.build({ elements: {} }).doc.style).sort().join(' ') === 'corners font');

/* the Java side has to agree about every one of those */
const cfgJava0 = fs.readFileSync(javaFile, 'utf8');
const hudJs = fs.readFileSync(path.join(ROOT, 'mc', 'hud.js'), 'utf8');
for (const k of hud.STYLE_KEYS) {
  ok('HudConfig reads and writes "' + k + '"', cfgJava0.indexOf('\\"' + k + '\\"') >= 0
    || cfgJava0.indexOf('"' + k + '"') >= 0);
}
ok('the mod defaults the plate to ON when the field is absent',
  /hasFalse\(body, "plate"\)/.test(cfgJava0),
  'absent must mean "how it already looked", not "off"');
ok('and refuses a colour it cannot parse instead of guessing',
  /hexOf/.test(cfgJava0));

/* ── 6c. and the launcher screen no longer destroys what it does not model ─ */
console.log('');
console.log('the launcher HUD screen loads what it saves, and merges what it does not own');
ok('it reads the stored settings at startup',
  /function loadHud\(\)/.test(appjs) && /loadHud\(\);/.test(appjs),
  'ST was built from the markup and never from disk');
ok('the save merges over what is already stored',
  /host\.settings\.get\(\)[\s\S]{0,400}?Object\.assign\(\{\}, prevEls\[k\], ST\[k\]\)/.test(appjs),
  'store.js merges at the top level only, so hud was swapped wholesale');
ok('and it says which four fields it is entitled to overwrite',
  /HUD_OWNS\s*=\s*\{\s*a:\s*1,\s*x:\s*1,\s*y:\s*1,\s*s:\s*1\s*\}/.test(appjs));
ok('the module switches are loaded too, not left on the fixture',
  /MODG\[k\]\.on = mods\[k\]/.test(appjs));

/* ── 6d. features: the second noun ─────────────────────────────────────── */
console.log('');
console.log('a feature is not an element, and the contract says so');
const fdoc = hud.build({ elements: {}, features: { zoom: { on: true, opts: { amount: '8x' } } } }).doc;
ok('every declared feature is written, on or off', 
  hud.FEATURE_NAMES.every((f) => fdoc.features[f]),
  hud.FEATURE_NAMES.length + ' features');
ok('a feature has no anchor, no scale and no colour',
  hud.FEATURE_NAMES.every((f) => {
    const v = fdoc.features[f];
    return v.anchor === undefined && v.scale === undefined && v.plateColour === undefined;
  }), 'that is the whole reason it is not an element');
ok('it carries its own label and description', 
  fdoc.features.zoom.label === 'Zoom' && fdoc.features.zoom.desc.length > 0,
  'the mod has no vocabulary of its own, features included');
ok('and its options went through the same validation elements use',
  fdoc.features.zoom.opts.amount === '8x'
    && hud.build({ features: { zoom: { opts: { amount: 'nope' } } } }).doc.features.zoom.opts.amount === '4x');

/* A KEY IS A NAME, AND A NAME IS CHECKED. This ends up in a keybinding
   registration, so a value that is not a key name is a value that must not
   reach it. */
const key = (v) => hud.build({ features: { zoom: { key: v } } }).doc.features.zoom.key;
ok('a GLFW key name is kept', key('KEY_LEFT_ALT') === 'KEY_LEFT_ALT');
ok('anything that is not one falls back to the default', key('rm -rf /') === 'KEY_C', key('rm -rf /'));
ok('and an empty key means deliberately unbound', key('') === '', 'not "use the default"');

ok('features come home through fromDoc too',
  hud.fromDoc(fdoc).hud.features.zoom.opts.amount === '8x');

/* the option-name rule has to hold ACROSS both kinds, because they share one
   spec table */
const featOpt = new Set();
for (const f of hud.FEATURE_NAMES) for (const k of Object.keys(hud.FEATURES[f].opts)) featOpt.add(k);
const elemOpt = new Set();
for (const e of Object.keys(hud.ELEMENT_OPTS)) for (const k of Object.keys(hud.ELEMENT_OPTS[e])) elemOpt.add(k);
const shared = [...featOpt].filter((k) => elemOpt.has(k));
ok('no option name is used by both a feature and an element',
  shared.length === 0, shared.join(' ') || featOpt.size + ' feature options, ' + elemOpt.size + ' element options');
ok('and every feature option is named in the spec',
  [...featOpt].every((k) => fdoc.optSpec[k] && fdoc.optSpec[k].label));

/* ── 7. two writers, and neither erases the other ──────────────────────── */
console.log('');
console.log('the document says who wrote it, which is what stops a clobber');
ok('a launcher write is stamped', built.doc.by === 'launcher', String(built.doc.by));
ok('and carries a revision past the one it read',
  hud.build({ elements: {} }, 41).doc.rev === 42);
ok('an unreadable revision restarts at 1 rather than becoming NaN',
  hud.build({ elements: {} }, 'banana').doc.rev === 1);

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-hud-'));
try {
  const gameWrote = {
    version: hud.VERSION, rev: 12, by: 'game',
    style: { corners: 'rounded', font: 'kestrel' },
    elements: {
      fps: { on: true, module: 'FPS', label: 'FPS', anchor: 'br', x: 4, y: 4, scale: 2 },
      helmet: { on: false, module: 'Armor status', label: 'x', anchor: 'mr', x: 1, y: -9.6, scale: 1 }
    }
  };
  fs.mkdirSync(path.join(scratch, 'config'), { recursive: true });
  const cfgFile = path.join(scratch, 'config', hud.FILE);
  fs.writeFileSync(cfgFile, JSON.stringify(gameWrote, null, 2));

  /* the launcher had its own idea of the layout, including an element the
     game's copy of the mod never saw */
  const had = { elements: { cps: { a: 'tl', x: 9, y: 9, s: 1 } }, modules: {} };
  const first = await hud.sync(scratch, had);
  ok('a game-written document is taken back', first.imported === true);
  ok('and the drag reaches the launcher\'s settings',
    first.settings.elements.fps.a === 'br' && first.settings.elements.fps.s === 2,
    JSON.stringify(first.settings.elements.fps));
  ok('a negative offset survives the return leg',
    first.settings.elements.helmet.y === -9.6, String(first.settings.elements.helmet.y));
  ok('an element the mod never saw is merged, not deleted',
    first.settings.elements.cps !== undefined);
  ok('a module comes back off its elements',
    first.settings.modules['Armor status'] === false && first.settings.modules.FPS === true,
    JSON.stringify(first.settings.modules));
  ok('the style comes back too', first.settings.style.corners === 'rounded');
  ok('and the file is re-stamped as the launcher\'s',
    (await hud.read(scratch)).by === 'launcher');

  const second = await hud.sync(scratch, first.settings);
  ok('THE SAME EDIT IS NEVER IMPORTED TWICE', second.imported === false,
    'the second launch found by:launcher and left settings alone');
  ok('and the revision still counts up', second.built.doc.rev > first.built.doc.rev,
    first.built.doc.rev + ' -> ' + second.built.doc.rev);

  /* a document nobody stamped is not one to trust */
  fs.writeFileSync(cfgFile, JSON.stringify({ ...gameWrote, by: 'somebody-else' }, null, 2));
  ok('an unknown writer is not treated as the game',
    (await hud.sync(scratch, had)).imported === false);
  fs.writeFileSync(cfgFile, '{ not json');
  ok('and neither is a broken file', (await hud.sync(scratch, had)).imported === false);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}

/* ── 8. the editor half of the mod ─────────────────────────────────────── */
console.log('');
console.log('the mod can write the document back, and says so when it does');
const modDir = path.join(ROOT, 'client-mod', 'src', 'main', 'java', 'dev', 'kestrel', 'hud');
const src = (n) => {
  const f = path.join(modDir, n);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
};
const cfgJava = src('HudConfig.java');
const clientJava = src('KestrelHudClient.java');

/* ── the second noun, in the mod ──────────────────────────────────────── */
console.log('');
console.log('and the mod treats a feature as its own kind of thing');
const featJava = src('Feature.java');
const behJava = src('Behaviours.java');
const overJava = src('Overlays.java');
ok('the mod has a Feature type distinct from Element', featJava !== null);
ok('and reads features off the document', /featuresOf\(text\)/.test(cfgJava0));
ok('and writes them back whole, label and all',
  /\\"features\\": \{/.test(cfgJava0) && /f\.label/.test(cfgJava0),
  'dropping the label would leave the next launcher reading a nameless feature');
if (behJava) {
  ok('the behaviours undo themselves when switched off',
    /unzoom/.test(behJava) && /fovBefore/.test(behJava),
    'a mod that changes a setting then stops running has broken the game');
  ok('and a key is resolved by NAME, not by code',
    /fromTranslationKey/.test(behJava), 'a code does not survive a keyboard layout');
}
if (overJava) {
  ok('the world overlays subtract the camera position',
    /cam\.x/.test(overJava) && /cam\.z/.test(overJava),
    'the world matrix is camera-relative; absolute coordinates draw nothing visible');
  ok('and give every line a normal',
    /normal\(pose/.test(overJava), 'a zero normal is silently dropped by the shader');
  ok('chunk borders take their height from the world, not from 0..256',
    /getBottomY\(\)/.test(overJava) && /getHeight\(\)/.test(overJava));
}
ok('and none of it needed a mixin',
  !fs.existsSync(path.join(ROOT, 'client-mod', 'src', 'main', 'resources', 'kestrel-hud.mixins.json')),
  'a mixin is a build-time weave that breaks differently on every version');


if (cfgJava) {
  ok('the mod stamps its writes as the game\'s', /"by":\s*\\"game/.test(cfgJava)
    || cfgJava.indexOf('\\"by\\": \\"game\\"') >= 0, 'so the launcher can tell them apart');
  ok('and writes the version the launcher reads',
    new RegExp('VERSION\\s*=\\s*' + hud.VERSION + '\\b').test(cfgJava), 'v' + hud.VERSION);
  ok('it emits the module and label back rather than dropping them',
    cfgJava.indexOf('\\"module\\"') >= 0 && cfgJava.indexOf('\\"label\\"') >= 0);
  ok('numbers are written in the root locale, not the machine\'s',
    cfgJava.indexOf('Locale.ROOT') >= 0, 'a comma decimal point is not JSON');
  ok('the file is moved into place rather than written over',
    cfgJava.indexOf('ATOMIC_MOVE') >= 0 || cfgJava.indexOf('REPLACE_EXISTING') >= 0);
  ok('and nothing is written when nothing changed',
    /if\s*\(\s*!\s*dirty\s*\)/.test(cfgJava), 'or every launch would import a "change"');
  ok('the mod clamps a negative offset to -100, as the launcher does',
    cfgJava.indexOf('-100.0') >= 0);
  ok('while the HUD plate itself stays square by default',
    /rounded \? "rounded" : "sharp"/.test(cfgJava0) || /corners.*sharp/.test(hudJs),
    'sharp is what looks native in the world; the player can round it');
}
if (clientJava) {
  ok('Right Shift is what opens it',
    clientJava.indexOf('GLFW_KEY_RIGHT_SHIFT') >= 0);
  ok('through the ordinary keybinding API, so it is reboundable',
    clientJava.indexOf('KeyBindingHelper') >= 0);
  ok('and what it opens is the one editor screen',
    clientJava.indexOf('new EditorScreen(') >= 0);
  ok('the live HUD steps aside under every screen, the editor included',
    /if \(client\.currentScreen != null\) return;/.test(clientJava),
    'the editor draws the whole HUD on its canvas; a live copy between the panels is two of everything');
}

/* ── 8b. ONE SCREEN, AT ITS OWN SCALE, BLURRING ONLY ITS PANELS ──────────
   The menu was redesigned in a browser mockup and signed off there before it
   was ported: hairlines, square corners, three panels, on/off as a square.
   These hold the port to that — and to the three things a mockup cannot show,
   which are how Minecraft rasterises a font, where its baseline is, and how
   its blur is applied. */
console.log('');
console.log('the editor is one screen, at its own scale, blurring only its panels');
const editorJava = src('EditorScreen.java');
const elementsTabJava = src('ElementsTab.java');
const featuresTabJava = src('FeaturesTab.java');
const chromeJava = src('Chrome.java');
const glassJava = src('Glass.java');
const typeJava = src('Type.java');
const blurJava = src('PanelBlur.java');
const menuFiles = [['EditorScreen', editorJava], ['ElementsTab', elementsTabJava], ['FeaturesTab', featuresTabJava],
  ['Chrome', chromeJava], ['Glass', glassJava], ['Type', typeJava], ['PanelBlur', blurJava]];
ok('the editor and its parts exist', menuFiles.every(([, j]) => j !== null),
  menuFiles.filter(([, j]) => j === null).map(([f]) => f).join(', ') || 'all seven');
ok('and the three screens it replaced are gone, not left beside it',
  ['HudMenuScreen.java', 'HudElementScreen.java', 'HudLayoutScreen.java', 'Ui.java'].every((f) => src(f) === null),
  'a second menu that still compiles is a menu somebody opens by accident');

if (editorJava) {
  ok('it lays out in design pixels from the framebuffer, not from the GUI scale',
    /getFramebufferHeight\(\)/.test(editorJava) && /density = fbH >= 1600 \? 2 : 1/.test(editorJava)
      && /scale\(scale, scale, 1f\)/.test(editorJava),
    'so GUI scale 2 and GUI scale 4 give the same menu');
  ok('it blurs only its panels', /PanelBlur\.apply\(/.test(editorJava)
    && !/applyBlur\(\)/.test(editorJava) && !/renderBackground\(/.test(editorJava),
    'the world between the panels stays sharp');
  ok('and saves once, on the way out', /public void close\(\)\s*\{\s*config\.save\(runDir\);/.test(editorJava));
  ok('the key that opens it also closes it', /isMenuKey\(keyCode, scanCode\)/.test(editorJava));
}
if (blurJava) {
  ok('the panel blur is vanilla\'s own blur, copied around rather than rewritten',
    /gameRenderer\.renderBlur\(\)/.test(blurJava) && /_glBlitFrameBuffer/.test(blurJava));
  ok('and turns the scissor test off before blitting', /RenderSystem\.disableScissor\(\)/.test(blurJava),
    'a blit honours the scissor test, and a stale rectangle copies a fraction of the frame');
  ok('the canvas gets the unblurred world, scaled smoothly',
    /blit\(sharp\.fbo, main\.fbo,\s*miniSource/.test(blurJava) && /miniTarget\[1\], true\);/.test(blurJava));
}

if (glassJava) {
  const pctOf = (name) => {
    const m = new RegExp('int ' + name + ' = argb\\(0x[0-9A-Fa-f]{6}, (\\d+)\\)').exec(glassJava);
    return m ? Number(m[1]) / 100 : null;
  };
  const over = (under, top) => under + top * (1 - under);
  const pc = (v) => Math.round(v * 100) + '%';
  const panel = pctOf('PANEL'), raise = pctOf('RAISE'), hoverA = pctOf('HOVER'), well = pctOf('WELL');
  /* A WIDE RANGE on purpose: the exact figure is a judgement made by eye in
     game, and a check that pins it is a check edited every time somebody
     looks properly. What is worth asserting is that it is glass. */
  ok('the panel is glass — the world shows through it', panel !== null && panel >= 0.25 && panel <= 0.75,
    panel === null ? 'not found' : pc(panel));
  /* composited, not raw: a row at 37% over a 43% panel reads as 64% */
  const vRow = over(panel, raise), vHover = over(panel, hoverA), vWell = over(vRow, well);
  ok('a row, composited over the panel, is more solid than the panel', vRow > panel,
    'panel ' + pc(panel) + ' -> row ' + pc(vRow));
  ok('a hovered row is more solid than a resting one', vHover > vRow, 'row ' + pc(vRow) + ' -> hover ' + pc(vHover));
  ok('and a well on a row is the most solid surface', vWell > vHover, 'well ' + pc(vWell));

  /* ── HAIRLINES AND SQUARE CORNERS, BY THE PLAYER'S CHOICE ────────────────
     The previous menu asserted the opposite: no outline on anything, every
     corner rounded. That was right for that menu, and it was reversed on
     purpose, from a mockup with both on the table. */
  ok('every panel carries a one-pixel edge',
    /static void panel\([^)]*\)\s*\{\s*box\(ctx, x, y, w, h, PANEL, LINE\);/.test(glassJava));
  const menuSource = menuFiles.map(([, j]) => (j || '').replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');
  ok('and nothing in the menu is rounded', !/roundRect|\bARC\b|R_PANEL|R_CARD/.test(menuSource));
  ok('on/off is a ten-pixel square, amber or dim, with no word beside it',
    /static void dot\(DrawContext ctx, float cx, float cy, boolean on, boolean hover\)/.test(glassJava)
      && /fill\(ctx, Math\.round\(cx\) - 5, Math\.round\(cy\) - 5, 10, 10, c\)/.test(glassJava));
}

if (typeJava) {
  ok('text is centred on its capitals, from each font\'s own cap height',
    /ARCHIVO_CAP = 0\.686f/.test(typeJava) && /AZERET_CAP = 0\.698f/.test(typeJava)
      && /cy - 7f \+ r\.cap\(\) \* r\.size\(\) \/ 2f/.test(typeJava),
    'a TrueType baseline sits 7 font pixels below where it is drawn');
  /* A DEFINITION PER ROLE AND PER DENSITY. Glyph textures are sampled
     nearest-neighbour, so a face scaled to a size it was not rasterised at
     breaks up; every role must exist at its own size, at both densities. */
  const fontDir = path.join(ROOT, 'client-mod', 'src', 'main', 'resources', 'assets', 'kestrel-hud', 'font');
  const roles = [...new Map([...typeJava.matchAll(/new Role\("([a-z0-9_]+)", (\d+),/g)].map((m) => [m[1], Number(m[2])])).entries()];
  const bad = [];
  for (const [id, size] of roles) {
    for (const [suffix, oversample] of [['', 1], ['_2x', 2]]) {
      const f = path.join(fontDir, 'menu', id + suffix + '.json');
      if (!fs.existsSync(f)) { bad.push(id + suffix + ' is missing'); continue; }
      const p = JSON.parse(fs.readFileSync(f, 'utf8')).providers[0];
      if (p.size !== size || p.oversample !== oversample) bad.push(id + suffix + ' is ' + p.size + ' at ' + p.oversample + 'x');
      if (!fs.existsSync(path.join(fontDir, String(p.file).replace(/^kestrel-hud:/, '')))) bad.push(id + suffix + ' names a missing ' + p.file);
    }
  }
  ok('every text role has a font definition at its size, at both densities', roles.length > 0 && bad.length === 0,
    bad.length ? bad.join(' | ') : roles.length + ' roles, ' + roles.length * 2 + ' definitions');
  /* A VARIABLE FONT RENDERS AT ITS DEFAULT INSTANCE, which for these is Thin —
     how the HUD font once came out hairline-thin. Every face must be static. */
  const faces = fs.readdirSync(fontDir).filter((f) => f.endsWith('.ttf'));
  const variable = faces.filter((f) => {
    const b = fs.readFileSync(path.join(fontDir, f));
    const tables = b.readUInt16BE(4);
    for (let i = 0; i < tables; i++) if (b.toString('latin1', 12 + i * 16, 16 + i * 16) === 'fvar') return true;
    return false;
  });
  ok('and every bundled face is a static instance', variable.length === 0,
    variable.length ? variable.join(', ') : faces.length + ' static faces');
  /* ── A CAXTON TWIN FOR EVERY DEFINITION ──────────────────────────────────
     With Caxton installed, `caxton_providers` is used in place of
     `providers`; without it, vanilla ignores the key. Caxton sizes a face so
     its ascender is 7 * scale_factor and keeps vanilla's baseline, so the twin
     is the same size exactly when scale_factor = size * ascender / 7000. */
  const ascender = { archivo: 878, 'azeret-mono': 937 };
  const twinFaces = path.join(ROOT, 'client-mod', 'src', 'main', 'resources', 'assets', 'kestrel-hud', 'textures', 'font');
  const definitions = fs.readdirSync(path.join(fontDir, 'menu')).map((f) => path.join(fontDir, 'menu', f))
    .concat([path.join(fontDir, 'kestrel.json')]);
  const twinBad = [];
  for (const f of definitions) {
    const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
    const p = doc.providers[0], c = doc.caxton_providers && doc.caxton_providers[0];
    const name = path.basename(f);
    if (!c || c.type !== 'caxton' || !c.regular) { twinBad.push(name + ' has no Caxton twin'); continue; }
    const face = String(p.file).replace(/^kestrel-hud:/, '');
    if (c.regular.file !== p.file) twinBad.push(name + ' twins a different face');
    const want = p.size * ascender[face.startsWith('archivo') ? 'archivo' : 'azeret-mono'] / 7000;
    if (Math.abs(c.regular.scale_factor - want) > 0.0001) twinBad.push(name + ' scale ' + c.regular.scale_factor + ', want ' + want.toFixed(4));
    if (JSON.stringify(c.regular.shift || [0, 0]) !== JSON.stringify(p.shift || [0, 0])) twinBad.push(name + ' shifts differently');
    if (!fs.existsSync(path.join(twinFaces, face))) twinBad.push(name + ': textures/font/' + face + ' is missing');
  }
  ok('every font has a Caxton twin at the same pixel size, its face where Caxton looks', twinBad.length === 0,
    twinBad.length ? twinBad.join(' | ') : definitions.length + ' definitions');
  const licences = path.join(ROOT, 'client-mod', 'src', 'main', 'resources', 'licenses');
  ok('with a licence shipped for each family', ['archivo-OFL.txt', 'azeret-mono-OFL.txt'].every((f) => fs.existsSync(path.join(licences, f))));
}

if (elementsTabJava) {
  ok('the canvas keeps the layout editor\'s magnet — insets, five pixels, Alt to free it',
    /2\.6 : 4\.2/.test(elementsTabJava) && /dist = 5\.0/.test(elementsTabJava) && !!editorJava && /hasAltDown\(\)/.test(editorJava));
  ok('and re-chooses the anchor from where an element lands',
    /HudRenderer\.anchorAt\(/.test(elementsTabJava) && /HudRenderer\.offsetOf\(/.test(elementsTabJava));
  ok('the list switches a module, not an element',
    /for \(String n : m\.elements\(\)\)[\s\S]{0,160}switchedTo\(next\)/.test(elementsTabJava));
}
if (behJava) {
  ok('every feature that reads a key gets a binding at start, so its first key can be set from the menu',
    /KEYED\.contains\(id\)/.test(behJava) && /GLFW_KEY_UNKNOWN : codeOf\(f\.key\)/.test(behJava),
    'and only those: a Controls entry that does nothing is worse than none');
  ok('and a key set in the menu is written to options.txt as well',
    /static void rebind\([\s\S]{0,500}options\.write\(\)/.test(behJava),
    'or Minecraft loads the key it remembers over it at the next launch');
}

/* ── 8c. the menu holds still ────────────────────────────────────────────
   A live value creeping back into a preview looks like nothing in a diff,
   and a moving preview is impossible to align against. */
console.log('');
console.log('nothing in a menu moves');
const elementsJava = src('HudElements.java');
if (elementsJava) {
  ok('there are two render modes, LIVE and SAMPLE',
    /int LIVE = 0/.test(elementsJava) && /int SAMPLE = 1/.test(elementsJava));
  /* the live reads must sit AFTER the sample early-return, or a menu asking
     for SAMPLE would still tick a counter on its way past */
  const sampleAt = elementsJava.indexOf('if (mode == SAMPLE) return sample(');
  const fpsAt = elementsJava.indexOf('client.getCurrentFps()');
  const posAt = elementsJava.indexOf('client.player.getX()');
  ok('SAMPLE returns before anything is read from the game',
    sampleAt > 0 && fpsAt > sampleAt && posAt > sampleAt,
    'sample@' + sampleAt + ' fps@' + fpsAt + ' pos@' + posAt);
  ok('and every element has a sample, not just the drawn ones',
    /default:\s*return armour\(name, el, null, face, true\);/.test(elementsJava));
  /* ── ICONS, NOT WORDS — AND THE PLAYER'S OWN ─────────────────────────────
     Armour and totems show the item itself, drawn by the game's item
     renderer, so a resource pack that repaints diamond armour repaints the
     HUD too. Nothing here ships a texture that could disagree with it. */
  ok('armour and totems show the item itself, live and in samples',
    /ItemStack gear = sampleGear\(name\);\s*List<Run> r = row\(Run\.item\(gear\)\);/.test(elementsJava)
      && /List<Run> r = row\(Run\.item\(st\)\);/.test(elementsJava)
      && (elementsJava.match(/Run\.item\(new ItemStack\(net\.minecraft\.item\.Items\.TOTEM_OF_UNDYING\)\)/g) || []).length === 2);
  ok('keystrokes draw a mouse, not LMB and RMB',
    /Run\.mouse\(lmb, rmb\)/.test(elementsJava) && elementsJava.indexOf('"LMB"') < 0 && elementsJava.indexOf('"RMB"') < 0);
  ok('and the spacebar as a key, not the word SPACE',
    /Run\.space\(sp\)/.test(elementsJava) && elementsJava.indexOf('"SPACE"') < 0);
  ok('with W and the mouse centred over A S D, not pushed to the left edge',
    /row\(Run\.centre\(\), new Run\(face, "W"/.test(elementsJava) && /row\(Run\.centre\(\), Run\.mouse\(lmb, rmb\)\)/.test(elementsJava));
  /* durability reads the way advanced tooltips show it — left / max — and
     the bar the user did not want is gone rather than kept as an option */
  ok('durability is a count like advanced tooltips, and the bar is gone',
    /el\.choice\("wear", "number"\)/.test(elementsJava)
      && /new Run\(face, Integer\.toString\(left\), role\)/.test(elementsJava)
      && !/Run\.bar\(|\bfill\b/.test(elementsJava.replace(/\/\*[\s\S]*?\*\//g, '')));
  ok('potion effects can show the effect\'s icon instead of its name',
    /boolean icons = el\.flag\("icons"\)/.test(elementsJava) && /Run\.effect\(type\)/.test(elementsJava)
      && !!(hud.ELEMENT_OPTS.potion && hud.ELEMENT_OPTS.potion.icons && hud.ELEMENT_OPTS.potion.icons.type === 'bool'),
    'declared in mc/hud.js, read by the mod');
  const memAt = elementsJava.indexOf('private static List<Run> memorySample(');
  ok('the memory sample is fixed numbers, not the live heap',
    memAt > 0 && /case "memory":[\s\S]{0,400}memorySample\(el, face\)/.test(elementsJava)
      && elementsJava.slice(memAt, memAt + 500).indexOf('Runtime') < 0,
    'it read the runtime and moved every frame the menu was open');
  ok('and the potion sample honours "Show time left"', /boolean times = el\.flag\("duration"\)/.test(elementsJava));
}
const rendererJava = src('HudRenderer.java');
if (rendererJava) {
  ok('an icon is drawn by the game\'s item renderer, so resource packs apply',
    /ctx\.drawItem\(r\.item,/.test(rendererJava));
  const resources = path.join(ROOT, 'client-mod', 'src', 'main', 'resources');
  const pngs = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.png$/i.test(e.name)) pngs.push(path.relative(resources, p)); } };
  walk(resources);
  ok('and the mod ships no textures of its own to disagree with a pack', pngs.length === 0, pngs.join(', ') || 'no .png in resources');
  /* the same fix the menu needed: centred on the capitals, not the line box */
  ok('HUD text is centred on its capitals in every row, for both faces',
    /rh \/ 2f - capMiddle\(r\.text\)/.test(rendererJava) && /VANILLA_CAP_MIDDLE = 3\.5f/.test(rendererJava)
      && /KESTREL_CAP_MIDDLE = 8f - 0\.698f \* 9f \/ 2f/.test(rendererJava),
    'three pixels over the text and five under it, before');
  ok('and a row is as tall as its tallest run',
    /static int rowHeight\(/.test(rendererJava) && /h \+= rowHeight\(r\)/.test(rendererJava));
}

ok('the editor asks for SAMPLE, never LIVE',
  !!elementsTabJava && elementsTabJava.indexOf('HudElements.SAMPLE') >= 0
    && menuFiles.every(([, j]) => !j || j.indexOf('HudElements.LIVE') < 0));
if (clientJava) {
  ok('and only the world HUD asks for LIVE',
    clientJava.indexOf('HudElements.LIVE') >= 0 && clientJava.indexOf('HudElements.SAMPLE') < 0);
}

/* ── NO SHADOW, ANYWHERE ────────────────────────────────────────────────
   Minecraft's drawText takes a boolean for it and vanilla passes true almost
   everywhere: a hard black offset copy of every glyph. The plate is this
   HUD's answer to the problem the shadow solves, and the menu's type is set
   flat. Asserted because it is a one-character regression, made once already. */
const shadowed = [...['HudRenderer.java', 'Type.java'].map((f) => [f, src(f)])]
  .filter(([, j]) => j)
  .flatMap(([f, j]) => [...j.matchAll(/drawText\([^;]*?\);/gs)]
    .filter((m) => !/,\s*false\s*\)/.test(m[0]))
    .map((m) => f + ': ' + m[0].replace(/\s+/g, ' ').slice(0, 70)));
ok('nothing draws text with a shadow', shadowed.length === 0,
  shadowed.length ? shadowed.join(' | ') : 'every drawText passes false');

/* ── 9. and the two languages, actually run against each other ──────────
   Everything above reads source. This runs the COMPILED mod against a
   document the launcher just wrote, and reads back what it wrote — which is
   the only way to catch a locale-formatted number, a broken escape or a
   parser that loses a sign. Skipped, loudly, when there is nothing built to
   run: a check that quietly does not happen is worse than one that fails. */
console.log('');
console.log('and the two languages, run against each other');
const classes = path.join(ROOT, 'client-mod', 'build', 'classes', 'java', 'main');
const harness = path.join(ROOT, 'tools', 'hudroundtrip', 'dev', 'kestrel', 'hud', 'RoundTrip.java');
const jdk = findJdk();
if (!fs.existsSync(classes)) {
  console.log('  SKIP  no compiled mod classes — build client-mod first');
} else if (!jdk) {
  console.log('  SKIP  no JDK found (set JAVA_HOME) — the source checks above still ran');
} else if (!fs.existsSync(harness)) {
  console.log('  SKIP  tools/hudroundtrip is missing');
} else {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-rt-'));
  try {
    const out = path.join(dir, 'out');
    fs.mkdirSync(out, { recursive: true });
    const inst = path.join(dir, 'inst');
    fs.mkdirSync(path.join(inst, 'config'), { recursive: true });

    /* deliberately awkward values: a negative offset, a fractional scale, a
       label with a non-ASCII character in it, an element switched off */
    const start = hud.build({
      elements: {
        fps: { a: 'tl', x: 2.6, y: 4.2, s: 1 },
        helmet: { a: 'mr', x: 2.6, y: -9.6, s: 1.25 },
        coords: { a: 'bl', x: 2.6, y: 17, s: 1 },
        ping: { a: 'tr', x: 2.6, y: 4.2, s: 0.75 }
      },
      modules: { Ping: false }
    }, 41);
    fs.writeFileSync(path.join(inst, 'config', hud.FILE), JSON.stringify(start.doc, null, 2));

    run(jdk.javac, ['-encoding', 'UTF-8', '-cp', classes, '-d', out, harness]);
    /* the harness reports through a UTF-8 FILE rather than stdout: a label
       carries a middle dot, and on Windows System.out encodes to the
       console's codepage, which mangles it into a failure about data that
       crossed the boundary perfectly intact */
    const reportFile = path.join(dir, 'report.txt');
    run(jdk.java, ['-cp', classes + path.delimiter + out,
      'dev.kestrel.hud.RoundTrip', inst, reportFile]);
    const said = fs.readFileSync(reportFile, 'utf8');

    const read = Object.fromEntries(said.split(/\r?\n/)
      .filter((l) => l.startsWith('el\t'))
      .map((l) => { const c = l.split('\t'); return [c[1], c]; }));
    ok('the mod read every element the launcher wrote',
      Object.keys(read).length === start.count, Object.keys(read).length + ' of ' + start.count);
    ok('including the negative offset', read.helmet && Number(read.helmet[5]) === -9.6,
      read.helmet ? read.helmet[5] : 'helmet missing');
    ok('the fractional scale', read.helmet && Number(read.helmet[6]) === 1.25);
    ok('the element that is switched off', read.ping && read.ping[2] === 'false');
    ok('and the label, non-ASCII character and all',
      read.helmet && read.helmet[9] === hud.labelOf('helmet'),
      read.helmet ? read.helmet[9] : '');
    /* columns 10..14 are the per-element style, and the defaults have to
       arrive as the exact bytes the old hard-coded constants were */
    ok('an unstyled element defaults to a plate',
      read.helmet && read.helmet[10] === 'true');
    ok('at the colour the plate constant always was',
      read.helmet && read.helmet[11] === hud.PLATE_COLOUR,
      read.helmet ? read.helmet[11] : '');
    ok('and the alpha it always had',
      read.helmet && Number(read.helmet[12]) === hud.PLATE_ALPHA,
      read.helmet ? read.helmet[12] : '');
    ok('with the text colour unchanged too',
      read.helmet && read.helmet[13] === hud.TEXT_COLOUR
        && Number(read.helmet[14]) === hud.TEXT_ALPHA);

    const back = await hud.read(inst);
    ok('what the mod wrote is valid JSON the launcher can parse', back.doc !== null);
    ok('and it is stamped as the game\'s work', back.by === 'game', String(back.by));
    ok('with the revision moved on', back.rev === start.doc.rev + 1,
      start.doc.rev + ' -> ' + back.rev);
    const fromGame = hud.fromDoc(back.doc);
    ok('the edit the mod made survives the trip home',
      fromGame.hud.elements.fps.a === 'mr' && fromGame.hud.elements.fps.x === -12.5
      && fromGame.hud.elements.fps.s === 1.75,
      JSON.stringify(fromGame.hud.elements.fps));
    ok('and so do the two style flips',
      fromGame.hud.style.corners === 'rounded' && fromGame.hud.style.font === 'kestrel',
      JSON.stringify(fromGame.hud.style));
    /* THE WHOLE POINT OF VERSION 4: a colour picked in game reaches the
       launcher's settings, which is what stops the next launch painting over
       it in the old greys */
    const styled = fromGame.hud.elements.fps;
    ok('a plate switched OFF in game comes back off, not absent',
      styled.plate === false, JSON.stringify(styled.plate));
    ok('the text colour picked in game survives',
      styled.textColour === '#FF5555', String(styled.textColour));
    ok('and its transparency', styled.textAlpha === 80, String(styled.textAlpha));
    ok('so does the box colour', styled.plateColour === '#55FF55', String(styled.plateColour));
    ok('and the box transparency', styled.plateAlpha === 35, String(styled.plateAlpha));
    /* THE OPTIONS, BOTH KINDS. The mod stores them as raw JSON tokens and
       never learns what any of them mean, so this is the assertion that the
       round trip is genuinely type-blind: a switch comes home a boolean and
       an enum comes home one of its own declared values. */
    ok('a switch flipped in game comes home a boolean',
      fromGame.hud.elements.coords && fromGame.hud.elements.coords.opts.compass === true,
      JSON.stringify(fromGame.hud.elements.coords && fromGame.hud.elements.coords.opts));
    ok('and an enum stepped in game comes home as one of its own values',
      fromGame.hud.elements.helmet && fromGame.hud.elements.helmet.opts.wear === 'percent',
      JSON.stringify(fromGame.hud.elements.helmet && fromGame.hud.elements.helmet.opts));
    ok('nothing was dropped on the way back', fromGame.dropped === 0);
  } catch (e) {
    ok('the round trip runs', false, e.message.split('\n')[0]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log('\n' + (fails ? fails + ' FAILURES' : 'all checks passed') + '\n');
process.exitCode = fails ? 1 : 0;

/* ── finding a JDK, which is not on PATH on this machine ────────────────
   JAVA_HOME first because it is the answer somebody set deliberately, then
   PATH, then the place Adoptium installs to on Windows. Returns null rather
   than guessing, so the stage above skips out loud. */
function findJdk() {
  const exe = process.platform === 'win32' ? '.exe' : '';
  const from = (home) => {
    if (!home) return null;
    const javac = path.join(home, 'bin', 'javac' + exe);
    const java = path.join(home, 'bin', 'java' + exe);
    return fs.existsSync(javac) && fs.existsSync(java) ? { javac, java } : null;
  };
  const found = from(process.env.JAVA_HOME);
  if (found) return found;
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const p = execFileSync(which, ['javac'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/)[0].trim();
    if (p && fs.existsSync(p)) {
      return { javac: p, java: path.join(path.dirname(p), 'java' + exe) };
    }
  } catch (e) { /* not on PATH, which is the normal case here */ }
  if (process.platform === 'win32') {
    const base = 'C:\\Program Files\\Eclipse Adoptium';
    try {
      for (const d of fs.readdirSync(base)) {
        const hit = from(path.join(base, d));
        /* the mod is built against 21 and nothing older will compile it */
        if (hit && /jdk-(2[1-9]|[3-9]\d)/.test(d)) return hit;
      }
    } catch (e) { /* no Adoptium, and that is not an error */ }
  }
  return null;
}

function run(bin, args) {
  return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
