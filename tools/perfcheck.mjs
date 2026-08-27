/* ============================================================================
   THE PERFORMANCE SET, CHECKED AGAINST THE HOST THAT SERVES IT.

     node tools/perfcheck.mjs          the table, the gating and the flag
     node tools/perfcheck.mjs live     ... and ask Modrinth what really exists

   mc/perf.js promises a new instance more frames by installing four mods
   somebody else wrote. That promise has three ways to be false, and each one
   is silent:

     the ids drift          a project id is a base62 string; one wrong
                            character installs a different mod entirely
     the gating is wrong    Sodium has no Forge build and nothing here has an
                            1.8.9 one, and a launcher that treats that as an
                            error is a launcher that fails half its library
     the flag leaks         only instances created since this existed may be
                            touched; retro-fitting four mods into somebody's
                            tuned 1.8.9 setup is the failure that loses trust

   The live pass costs four HTTP requests per case and is the only one that
   can catch the first.
   ========================================================================= */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const perf = require('../mc/perf.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = process.argv.slice(2).indexOf('live') >= 0;
let fails = 0;
const ok = (name, cond, extra) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (extra ? '   ' + extra : ''));
  if (!cond) fails++;
};

/* ── 1. the table itself ─────────────────────────────────────────────────── */
console.log('\nthe set is a written-out table, not a search');
ok('there are mods in it', perf.SET.length > 0, perf.SET.length + ' mods');
ok('every one has a project id, a title, a slug and a reason',
  perf.SET.every((m) => m.project && m.title && m.slug && m.why));
/* base62, the shape Modrinth actually mints */
const badId = perf.SET.filter((m) => !/^[A-Za-z0-9]{8}$/.test(m.project));
ok('every project id is the shape Modrinth mints', badId.length === 0,
  badId.map((m) => m.title + '=' + m.project).join(' ') || perf.SET.map((m) => m.project).join(' '));
ok('and no id is repeated', new Set(perf.SET.map((m) => m.project)).size === perf.SET.length);
ok('the renderer is first — it is most of the claim',
  perf.SET[0].slug === 'sodium', perf.SET[0].title);

/* ── 2. the gating ───────────────────────────────────────────────────────── */
console.log('\nand it only applies where a mods folder means something');
for (const l of ['fabric', 'quilt', 'neoforge', 'forge']) {
  ok('applies to ' + l, perf.canApply(l) === true);
}
for (const l of ['', 'vanilla', 'none', 'optifine', undefined, null]) {
  ok('does NOT apply to ' + (l === '' ? '(no loader)' : String(l)), perf.canApply(l) === false);
}
ok('a loader with a version after it still resolves', perf.canApply('Fabric 0.16.14') === true,
  'the record stores "Fabric" but a caller may pass more');

/* ── 3. the flag ─────────────────────────────────────────────────────────── */
console.log('\nthe flag reaches only instances created since it existed');
const store = fs.readFileSync(path.join(ROOT, 'store.js'), 'utf8');
ok('the record whitelists a perf field', /perf:\s*PERF_STATES/.test(store));
ok('and only these three values', /PERF_STATES = \['pending', 'done', 'off'\]/.test(store));
/* THE SAFETY PROPERTY. clean() runs on every update() and on seed(); a
   default there would mark instances that already exist. It has to be in
   create() and nowhere else. */
ok('the default is set in create(), NOT in clean()',
  /if \(!rec\.perf\) rec\.perf = 'pending';/.test(store)
    && !/perf:\s*(str\(r\.perf[^)]*\)\s*\|\||PERF_STATES[^\n]*\|\|\s*')/.test(store),
  'clean() also runs on update() and seed() — defaulting there marks old instances');
ok('an absent perf field stays absent through clean()',
  /perf:\s*PERF_STATES\.indexOf\(str\(r\.perf, 8\)\) >= 0 \? str\(r\.perf, 8\) : ''/.test(store),
  "absent means off, which is what leaves 39 existing instances alone");

const index = fs.readFileSync(path.join(ROOT, 'mc', 'index.js'), 'utf8');
ok('a modpack import opts out — a pack states its own mod list',
  /perf: perf\.OFF/.test(index));
ok('the launch hook runs only on a pending instance',
  /inst\.perf !== perf\.PENDING\) return null/.test(index));
ok('and clears the flag whatever happened, so it never retries forever',
  /perf\.fill\(this[\s\S]{0,200}?store\.update\(instanceId, \{ perf: perf\.DONE \}\)/.test(index));
ok('a failure there does not stop the launch',
  /could not install the performance set/.test(index));

/* ── 4. the already-installed test ───────────────────────────────────────── */
console.log('\nand it never installs a second copy of what is there');
const src = fs.readFileSync(path.join(ROOT, 'mc', 'perf.js'), 'utf8');
ok('every identifier of an installed mod is collected, not the first truthy one',
  /for \(const v of \[m && m\.project, m && m\.slug, m && m\.title, m && m\.name, m && m\.file\]\)/.test(src),
  'project || title || file means "only the first that is set"');
ok('and a hand-dropped jar is matched on its filename',
  /s\.indexOf\(slug\) === 0/.test(src), 'sodium-fabric-0.6.13.jar carries the name nowhere else');

/* ── 5. live: does any of it actually exist ──────────────────────────────── */
if (!LIVE) {
  console.log('\n  SKIP  the live pass — run `node tools/perfcheck.mjs live` to ask Modrinth');
} else {
  console.log('\nand Modrinth serves what the table claims');
  const UA = 'Kestrel/0.5.0 (+https://github.com/emirudev128-sys/KestrelClient)';
  const get = (p) => new Promise((res, rej) => {
    https.get('https://api.modrinth.com/v2' + p, { headers: { 'User-Agent': UA } }, (r) => {
      let d = '';
      r.on('data', (c) => { d += c; });
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });

  for (const m of perf.SET) {
    try {
      const p = await get('/project/' + m.project);
      ok('id ' + m.project + ' really is ' + m.title,
        String(p.title).toLowerCase().replace(/\s+/g, '') === m.title.toLowerCase().replace(/\s+/g, ''),
        'Modrinth says "' + p.title + '", slug ' + p.slug);
      ok('  and the slug matches too', p.slug === m.slug, p.slug + ' vs ' + m.slug);
    } catch (e) {
      ok('id ' + m.project + ' resolves', false, e.message);
    }
  }

  /* THE GATING, AGAINST REALITY. These pairs are taken from a real library:
     modern Fabric, old Fabric, NeoForge, Forge, and 1.8.9 — which must come
     back with nothing at all rather than with an error. */
  console.log('');
  const cases = [
    ['fabric', '1.21.4', 4], ['fabric', '1.16.5', 4],
    ['neoforge', '1.21.1', 4], ['forge', '1.20.1', 2], ['fabric', '1.8.9', 0]
  ];
  for (const [loader, mc, want] of cases) {
    let n = 0;
    for (const m of perf.SET) {
      const v = await get('/project/' + m.project + '/version?loaders=["' + loader + '"]&game_versions=["' + mc + '"]');
      if (Array.isArray(v) && v.length) n++;
    }
    ok(loader + ' ' + mc + ' resolves ' + n + ' of ' + perf.SET.length, n === want,
      want === 0 ? 'nothing exists this far back, and that is a skip and not an error'
        : 'expected ' + want);
  }
}

console.log('\n' + (fails ? fails + ' FAILURES' : 'all checks passed') + '\n');
process.exitCode = fails ? 1 : 0;
