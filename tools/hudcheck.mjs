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
import path from 'node:path';
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
ok('a negative position clamps to 0', built.doc.elements.coords.x === 0);
ok('a position past the screen clamps to 100', built.doc.elements.coords.y === 100);
ok('a runaway scale clamps to the maximum', built.doc.elements.coords.scale === hud.SCALE_MAX,
  String(built.doc.elements.coords.scale));
ok('a module switched off turns its element off',
  built.doc.elements.boots.on === false, 'boots is owned by Armor status');
ok('a module nobody has an opinion about counts as on',
  built.doc.elements.fps.on === true);
ok('the document carries a version', built.doc.version === 1);

console.log('\n' + (fails ? fails + ' FAILURES' : 'all checks passed') + '\n');
process.exitCode = fails ? 1 : 0;
