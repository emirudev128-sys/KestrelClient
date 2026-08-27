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
ok('a non-object is dropped', !('potion' in built.doc.elements));
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
console.log('compass belongs to coords and to nothing else');
const comp = hud.build({ elements: { coords: { a: 'tl', x: 1, y: 1, s: 1, compass: true },
                                     fps: { a: 'tl', x: 1, y: 1, s: 1, compass: true } } });
ok('coords carries it', comp.doc.elements.coords.compass === true);
ok('fps does not, even when asked', comp.doc.elements.fps.compass === undefined);
ok('and it is a strict boolean',
  hud.build({ elements: { coords: { a: 'tl', x: 0, y: 0, s: 1, compass: 'yes' } } })
     .doc.elements.coords.compass === false);

if (fs.existsSync(javaFile)) {
  const styleJava = fs.readFileSync(javaFile, 'utf8');
  console.log('');
  console.log('the mod reads the same style words the launcher writes');
  for (const w of ['style', 'corners', 'rounded', 'font', 'kestrel', 'compass']) {
    ok('HudConfig looks for the word ' + w, styleJava.indexOf('"' + w + '"') >= 0);
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
const menuJava = src('HudMenuScreen.java');
const layoutJava = src('HudLayoutScreen.java');
const clientJava = src('KestrelHudClient.java');

ok('HudMenuScreen exists', menuJava !== null);
ok('HudLayoutScreen exists', layoutJava !== null);
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
}
if (clientJava) {
  ok('Right Shift is what opens it',
    clientJava.indexOf('GLFW_KEY_RIGHT_SHIFT') >= 0);
  ok('through the ordinary keybinding API, so it is reboundable',
    clientJava.indexOf('KeyBindingHelper') >= 0);
  ok('and the HUD stays drawn behind the menu',
    clientJava.indexOf('instanceof HudMenuScreen') >= 0);
}
if (layoutJava) {
  ok('the magnet can be switched off', layoutJava.indexOf('hasAltDown') >= 0);
  ok('and it snaps to the anchors the config stores',
    layoutJava.indexOf('INSET_X') >= 0 && layoutJava.indexOf('SNAP') >= 0);
}
if (menuJava) {
  ok('the menu toggles a module, not an element',
    menuJava.indexOf('flipModule') >= 0);
  ok('and says which rows the mod cannot draw yet',
    menuJava.indexOf('not drawn yet') >= 0);
}

/* ── 8b. the menu holds still, and the world behind it is blurred ────────
   Both of these were reported by eye and both are the kind of thing that
   regresses silently — a live value creeping back into a preview looks like
   nothing in a diff, and a dropped applyBlur() call just makes the menu
   quietly worse. */
console.log('');
console.log('nothing in a menu moves, and the world behind one is blurred');
const elemJava = src('HudElementScreen.java');
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
    /default:/.test(elementsJava) && /shortLabel\(el, name\)/.test(elementsJava));
}

for (const [file, java] of [['HudMenuScreen', menuJava], ['HudElementScreen', elemJava],
                            ['HudLayoutScreen', layoutJava]]) {
  if (!java) continue;
  ok(file + ' asks for SAMPLE, never LIVE',
    java.indexOf('HudElements.SAMPLE') >= 0 && java.indexOf('HudElements.LIVE') < 0);
}
if (clientJava) {
  ok('and only the world HUD asks for LIVE',
    clientJava.indexOf('HudElements.LIVE') >= 0 && clientJava.indexOf('HudElements.SAMPLE') < 0);
}

if (menuJava) ok('the menu blurs the world behind it', /applyBlur\(\)/.test(menuJava));
if (elemJava) ok('and so does the options screen', /applyBlur\(\)/.test(elemJava));
if (layoutJava) {
  /* the layout editor deliberately does NOT: you are positioning a HUD
     against the world, and blurring what you are positioning it against
     defeats the screen */
  ok('but the layout editor leaves the world alone', !/applyBlur\(\)/.test(layoutJava),
    'you are arranging a HUD against that world');
}

const paintJava = src('Paint.java');
if (paintJava) {
  const alphaOf = (name) => {
    const m = new RegExp('int ' + name + ' = 0x([0-9A-Fa-f]{2})').exec(paintJava);
    return m ? parseInt(m[1], 16) : null;
  };
  const panel = alphaOf('PANEL');
  /* THE PANEL IS GLASS, and this has been wrong in both directions — 95%,
     which is 5% of nothing, then fully opaque, which made the menu a slab
     dropped on Minecraft. The range is what the intent actually is: enough
     transparency to see the blurred world through it, enough body to carry
     text. Asserted as a range rather than a number so tuning it does not mean
     editing a check to match. */
  ok('the panel is glass — you can see the blurred world through it',
    panel !== null && panel >= 0x70 && panel <= 0xC0,
    panel === null ? 'not found' : '0x' + panel.toString(16) + ' (want 0x70..0xC0)');

  /* AND THE STACK GOES UP. A card at the panel's own alpha vanishes into it
     and the grid reads as one sheet; each layer has to be more solid than the
     surface under it or depth stops reading as depth. */
  const raise = alphaOf('RAISE'), hover = alphaOf('HOVER'),
        active = alphaOf('ACTIVE'), well = alphaOf('WELL');
  ok('a card is more solid than the panel it sits on',
    raise !== null && panel !== null && raise > panel,
    'panel 0x' + (panel || 0).toString(16) + ' -> card 0x' + (raise || 0).toString(16));
  ok('and hover and pressed are more solid again',
    hover > raise && active > hover,
    [raise, hover, active].map((v) => '0x' + (v || 0).toString(16)).join(' -> '));
  ok('the preview well is the most solid of all',
    well !== null && well > active,
    'a plate\'s own transparency cannot be judged through a second one');

  const scrim = alphaOf('SCRIM');
  /* vanilla darkens its own in-game background from 0xC0 to 0xD0; the point
     of blurring is to need far less than that */
  ok('and the tint over the blur is lighter than vanilla darkening',
    scrim !== null && scrim < 0xC0,
    scrim === null ? 'not found' : '0x' + scrim.toString(16) + ' vs vanilla 0xC0-0xD0');
}

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
