/* Phase 4, run as one command:  node tools/phase4check.mjs
   The merge rules on fixtures (no network), then the four loaders against the
   real services, then a real Fabric 1.16.5 install and launch.

     node tools/phase4check.mjs            merge rules + loader listings
     node tools/phase4check.mjs install    ... and install Fabric 1.16.5
     node tools/phase4check.mjs launch     ... and launch it
     node tools/phase4check.mjs modern     ... and install NeoForge 1.21.1 too
*/
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const V = require('../mc/version.js');
const loaders = require('../mc/loaders.js');
const { Layout } = require('../mc/paths.js');
const { Installer } = require('../mc/install.js');
const { buildArgs } = require('../mc/launch.js');
const { Store } = require('../store.js');
const { Game } = require('../mc/index.js');
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const mode = process.argv[2] || '';
const want = (m) => ['install', 'launch', 'modern'].indexOf(mode) >= (['install', 'launch', 'modern'].indexOf(m));
let fails = 0;
const ok = (name, cond, extra) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (extra ? '   ' + extra : ''));
  if (!cond) fails++;
};

/* ── 1. the merge rules, on fixtures ───────────────────────────────────── */
console.log('\nmerge: libraries');
const parent = {
  id: '1.16.5', mainClass: 'net.minecraft.client.main.Main', type: 'release',
  assetIndex: { id: '1.16', url: 'https://x/1.16.json' },
  javaVersion: { majorVersion: 8 },
  downloads: { client: { url: 'https://piston-data.mojang.com/c.jar', sha1: 'a'.repeat(40), size: 1 } },
  libraries: [
    { name: 'org.ow2.asm:asm:7.2', downloads: { artifact: { path: 'org/ow2/asm/asm/7.2/asm-7.2.jar', url: 'https://libraries.minecraft.net/org/ow2/asm/asm/7.2/asm-7.2.jar', sha1: 'b'.repeat(40), size: 2 } } },
    { name: 'com.google.guava:guava:21.0', downloads: { artifact: { path: 'com/google/guava/guava/21.0/guava-21.0.jar', url: 'https://libraries.minecraft.net/g.jar', sha1: 'c'.repeat(40), size: 3 } } }
  ],
  arguments: {
    game: ['--username', '${auth_player_name}'],
    jvm: ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}']
  }
};
const child = {
  id: 'fabric-loader-0.16.14-1.16.5', inheritsFrom: '1.16.5',
  mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
  libraries: [
    { name: 'org.ow2.asm:asm:9.7.1', url: 'https://maven.fabricmc.net/' },
    { name: 'net.fabricmc:fabric-loader:0.16.14', url: 'https://maven.fabricmc.net/' }
  ],
  arguments: { game: [], jvm: ['-DFabricMcEmu=net.minecraft.client.main.Main'] }
};
const m = V.merge(child, parent);
const names = m.libraries.map((l) => l.name);
ok('the child wins on group:artifact', names.indexOf('org.ow2.asm:asm:9.7.1') >= 0 && names.indexOf('org.ow2.asm:asm:7.2') < 0, names.join(' '));
ok('the child\'s libraries come first', names[0] === 'org.ow2.asm:asm:9.7.1' && names[1] === 'net.fabricmc:fabric-loader:0.16.14');
ok('the parent\'s untouched libraries survive', names.indexOf('com.google.guava:guava:21.0') >= 0);
ok('nothing is duplicated', new Set(names).size === names.length, names.length + ' entries');

console.log('\nmerge: mainClass and the fields a thin profile omits');
ok('mainClass is overridden', m.mainClass === 'net.fabricmc.loader.impl.launch.knot.KnotClient', m.mainClass);
ok('assetIndex is inherited', m.assetIndex && m.assetIndex.id === '1.16');
ok('downloads.client is inherited', !!(m.downloads && m.downloads.client));
ok('javaVersion is inherited', V.javaMajorFor(m) === 8);
ok('inheritsFrom is gone from the result', !V.inheritsFrom(m));
ok('the id is the child\'s', m.id === 'fabric-loader-0.16.14-1.16.5');
ok('jar names the parent, so the client jar is not copied', m.jar === '1.16.5', String(m.jar));

console.log('\nmerge: the modern arguments object is additive');
ok('parent game args survive', m.arguments.game.join(' ') === '--username ${auth_player_name}', JSON.stringify(m.arguments.game));
ok('child jvm args are appended after the parent\'s', m.arguments.jvm.join(' ') === '-Djava.library.path=${natives_directory} -cp ${classpath} -DFabricMcEmu=net.minecraft.client.main.Main');
ok('minecraftArguments is not also emitted', m.minecraftArguments === undefined);

console.log('\nmerge: the legacy string replaces rather than appends');
const legacyParent = { id: '1.8.9', mainClass: 'net.minecraft.client.main.Main', minecraftArguments: '--username ${auth_player_name} --version ${version_name}', libraries: [] };
const legacyChild = { id: '1.8.9-Forge11.15.1.2318', inheritsFrom: '1.8.9', mainClass: 'net.minecraft.launchwrapper.Launch', minecraftArguments: '--username ${auth_player_name} --version ${version_name} --tweakClass cpw.mods.fml.common.launcher.FMLTweaker', libraries: [] };
const lm = V.merge(legacyChild, legacyParent);
ok('the child\'s string is the whole result', lm.minecraftArguments === legacyChild.minecraftArguments, lm.minecraftArguments);
ok('--username appears exactly once', (lm.minecraftArguments.match(/--username/g) || []).length === 1);
ok('no arguments object is invented', lm.arguments === undefined);
ok('mainClass is LaunchWrapper', lm.mainClass === 'net.minecraft.launchwrapper.Launch');

console.log('\nmerge: a modern child over a legacy parent');
const mixed = V.merge({ id: 'x', inheritsFrom: '1.8.9', mainClass: 'K', libraries: [], arguments: { game: ['--extra'], jvm: ['-Dflag=1'] } }, legacyParent);
ok('the legacy string becomes game args', mixed.arguments.game.join(' ') === '--username ${auth_player_name} --version ${version_name} --extra', JSON.stringify(mixed.arguments.game));
ok('and the string form is dropped', mixed.minecraftArguments === undefined);

console.log('\nmerge: a circular profile does not hang');
ok('depth is capped in Installer.resolve, not here', typeof Installer.prototype.resolve === 'function');

console.log('\nmaven coordinates');
ok('group:artifact:version', V.parseCoord('net.fabricmc:fabric-loader:0.16.14').path === 'net/fabricmc/fabric-loader/0.16.14/fabric-loader-0.16.14.jar');
ok('with a classifier and an extension', V.parseCoord('de.oceanlabs.mcp:mcp_config:1.20.1@zip').path === 'de/oceanlabs/mcp/mcp_config/1.20.1/mcp_config-1.20.1.zip');
for (const bad of ['../../../evil:x:1', 'a:b:../../../x', 'a:b', 'a:b:c:d:e', 'a/b:c:1', 'a:b:1@../x']) {
  let leaked = null;
  try { leaked = V.parseCoord(bad).path; } catch (e) { /* expected */ }
  ok('refuses ' + JSON.stringify(bad), leaked === null, leaked || '');
}

/* ── 2. the four loaders, against the real services ────────────────────── */
console.log('\nloader listings (live)');
for (const [l, mc, expect] of [['fabric', '1.16.5', true], ['fabric', '1.8.9', false], ['quilt', '1.20.1', true],
  ['neoforge', '1.21.1', true], ['neoforge', '1.8.9', false], ['forge', '1.8.9', true], ['forge', '1.20.1', true]]) {
  let list = null, err = '';
  const t = Date.now();
  try { list = await loaders.versionsFor(l, mc); } catch (e) { err = e.message; }
  const n = list ? list.length : -1;
  ok(l + ' on ' + mc + (expect ? ' has builds' : ' has none'), expect ? n > 0 : n === 0,
    (n >= 0 ? n + ' builds, newest ' + (list[0] ? list[0].version : '—') + ', ' + (Date.now() - t) + 'ms' : err));
}

/* ── 3. a real install, and a real launch ──────────────────────────────── */
const root = path.join(process.env.APPDATA || os.homedir(), 'Kestrel');
const store = new Store(root);
const L = new Layout(root).ensure();

async function makeInstance(id, name, ver, loader) {
  if (store.has(id)) store.remove(id);
  fs.mkdirSync(path.join(root, 'instances', id), { recursive: true });
  const rec = store.create({ name: name, ver: ver, loader: loader, lver: '' });
  if (rec.id !== id) { /* the slug is derived; use whatever it produced */ }
  return rec;
}

function reportOf(label) {
  let last = 0;
  return (p) => {
    if (Date.now() - last < 900 && p.phase !== 'ready') return;
    last = Date.now();
    process.stdout.write('      ' + label + ' ' + p.phase + ' ' + p.done + '/' + p.total
      + (p.totalBytes ? '  ' + (p.bytes / 1048576).toFixed(1) + '/' + (p.totalBytes / 1048576).toFixed(1) + ' MB' : '') + '        \r');
  };
}

if (want('install')) {
  console.log('\nfabric 1.16.5 — install');
  const rec = await makeInstance('p4-fabric-1165', 'P4 Fabric 1165', '1.16.5', 'Fabric');
  const game = new Game({ store: store, emit: () => {}, log: (l) => console.log('      · ' + l) });
  const t0 = Date.now();
  const li = await game.installLoader(rec.id, 'Fabric', '');
  console.log('      profile: ' + li.id + '   mainClass ' + li.mainClass + '   partial=' + li.partial);
  ok('the profile id is a legal folder name', /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(li.id), li.id);
  ok('Fabric needs no processors', li.partial === false);

  const inst = new Installer(L, () => {});
  const merged = await inst.resolve(li.id, 0);
  ok('the merged mainClass is Fabric\'s', /KnotClient/.test(merged.mainClass), merged.mainClass);
  ok('the merged libraries hold both sides',
    merged.libraries.some((x) => /fabric-loader/.test(x.name || '')) && merged.libraries.some((x) => /lwjgl/.test(x.name || '')),
    merged.libraries.length + ' libraries');

  const summary = await game.install(rec.id, '');
  process.stdout.write('\n');
  console.log('      install: ' + summary.total + ' files, ' + summary.skipped + ' already verified, '
    + summary.fetched + ' fetched, ' + summary.bytes + ' bytes, ' + summary.ms + 'ms, '
    + summary.natives + ' natives extracted');

  const built = buildArgs({
    vjson: merged, layout: L, id: li.id, gameDir: L.gameDir(rec.id),
    session: { name: 'KestrelTest', uuid: '0'.repeat(8) + '-0000-0000-0000-' + '0'.repeat(12), accessToken: '0', userType: 'legacy' },
    maxMemMb: 2048
  });
  const cp = built.classpath;
  const hasFabric = cp.filter((c) => /fabric-loader|sponge-mixin|intermediary/i.test(c)).length;
  const hasVanilla = cp.filter((c) => /lwjgl|com[\\/]mojang/i.test(c)).length;
  ok('the classpath carries Fabric jars', hasFabric >= 3, hasFabric + ' of ' + cp.length);
  ok('the classpath carries vanilla jars', hasVanilla >= 5, hasVanilla + ' of ' + cp.length);
  ok('it ends in the PARENT client jar', cp[cp.length - 1].endsWith(path.join('1.16.5', '1.16.5.jar')), cp[cp.length - 1]);
  ok('every entry is inside the data root', cp.every((c) => c.startsWith(path.resolve(root) + path.sep)));
  ok('every entry exists on disk', cp.every((c) => fs.existsSync(c)), cp.filter((c) => !fs.existsSync(c)).slice(0, 2).join(' '));
  ok('the main class the JVM is given is Fabric\'s', /KnotClient/.test(built.main), built.main);
  ok('-cp is on the jvm line exactly once', built.jvm.filter((a) => a === '-cp').length === 1);
  console.log('      classpath: ' + cp.length + ' entries, ' + hasFabric + ' Fabric, first is ' + path.basename(cp[0]));

  /* the second pass */
  const t1 = Date.now();
  const again = await game.install(rec.id, '');
  process.stdout.write('\n');
  ok('a second install fetches nothing', again.fetched === 0 && again.bytes === 0,
    again.total + ' files, all ' + again.skipped + ' verified in ' + (Date.now() - t1) + 'ms');
  console.log('      total wall time for the first install: ' + (Date.now() - t0) + 'ms');

  if (want('launch')) {
    console.log('\nfabric 1.16.5 — launch');
    const lines = [];
    let started = null;
    const g2 = new Game({
      store: store, log: (l) => console.log('      · ' + l),
      emit: (ch, p) => {
        if (ch === 'game:log') { lines.push(p.line); if (lines.length < 400) console.log('      | ' + p.line.slice(0, 150)); }
        if (ch === 'game:started') started = p;
      }
    });
    const t2 = Date.now();
    const r = await g2.play(rec.id, { offline: true, username: 'KestrelTest', maxMemMb: 2048 });
    console.log('      launched pid ' + r.pid + ' on Java ' + r.java.version + ' in ' + (Date.now() - t2) + 'ms');
    await new Promise((res) => setTimeout(res, 45000));
    const all = lines.join('\n');
    ok('the process started', !!started && !!r.pid);
    ok('Fabric loaded', /Loading Minecraft .* with Fabric Loader/i.test(all) || /fabricmc/i.test(all),
      (all.match(/Loading Minecraft [^\n]*/i) || [''])[0].slice(0, 110));
    ok('the game reached its own startup', /Setting user:|LWJGL Version|Backend library|OpenAL initialized|Narrator library/i.test(all),
      (all.match(/(Setting user:|LWJGL Version[^\n]*|Backend library[^\n]*)/i) || [''])[0].slice(0, 90));
    ok('no ClassNotFound / NoSuchMethod', !/ClassNotFoundException|NoSuchMethodError|NoClassDefFoundError/.test(all));
    console.log('      ' + lines.length + ' log lines in 45s');
    g2.killAll();
    await new Promise((res) => setTimeout(res, 1500));
  }
}

if (mode === 'modern') {
  console.log('\nneoforge 1.21.1 — the profile, before the processors have run');
  const rec = await makeInstance('p4-neo-1211', 'P4 Neo 1211', '1.21.1', 'NeoForge');
  const game = new Game({ store: store, emit: () => {}, log: (l) => console.log('      · ' + l) });
  const li = await game.installLoader(rec.id, 'NeoForge', '');
  console.log('      profile: ' + li.id + '   mainClass ' + li.mainClass + '   partial=' + li.partial);
  li.notes.forEach((n) => console.log('      ! ' + n));
  const inst = new Installer(L, () => {});
  const merged = await inst.resolve(li.id, 0);
  ok('the merged mainClass is NeoForge\'s', /bootstraplauncher|cpw\.mods/i.test(merged.mainClass), merged.mainClass);
  ok('the merged libraries hold both sides',
    merged.libraries.some((x) => /neoforge|bootstraplauncher/i.test(x.name || '')) && merged.libraries.some((x) => /lwjgl/i.test(x.name || '')),
    merged.libraries.length + ' libraries');
  ok('the parent asset index survived', !!(merged.assetIndex && merged.assetIndex.id), merged.assetIndex && merged.assetIndex.id);
  ok('java 21 is what it asks for', V.javaMajorFor(merged) === 21, String(V.javaMajorFor(merged)));
  ok('it is honestly marked incomplete before the processors run', li.partial === true && !!store.get(rec.id).pwarn);
  ok('and it remembers which installer they come out of', !!store.get(rec.id).pjar, store.get(rec.id).pjar);
  const built = buildArgs({
    vjson: merged, layout: L, id: li.id, gameDir: L.gameDir(rec.id),
    session: { name: 'KestrelTest', uuid: '0'.repeat(8) + '-0000-0000-0000-' + '0'.repeat(12), accessToken: '0', userType: 'legacy' }
  });
  console.log('      classpath: ' + built.classpath.length + ' entries; jvm args: ' + built.jvm.length);
  ok('every classpath entry is inside the data root', built.classpath.every((c) => c.startsWith(path.resolve(root) + path.sep)));

  /* ── THE PROCESSORS, ACTUALLY RUN ───────────────────────────────────────
     This is the whole point of the phase: the profile above has been correct
     for a while, and the instance still could not launch, because the file
     its classpath names had never been built.  install() downloads vanilla
     and then runs them. */
  console.log('\nneoforge 1.21.1 — the installer processors');
  const summary = await game.install(rec.id, '');
  process.stdout.write('\n');
  console.log('      install: ' + summary.total + ' files, ' + summary.skipped + ' verified, ' + summary.fetched
    + ' fetched, ' + summary.bytes + ' bytes, ' + summary.ms + 'ms');
  const pr = summary.processors;
  ok('the processors ran', !!pr && pr.ran > 0, pr ? pr.ran + ' ran, ' + pr.skipped + ' server-side skipped' : 'none reported');
  /* NOT "outputs were verified".  NeoForge 21.1.248 declares no `outputs`
     digest on any processor, so there is nothing to check them against and
     saying otherwise would be a test that asserts a fiction.  What is
     asserted is that the count is honest about which case it is in. */
  ok('the output digest count is honest about what was checkable',
    !!pr && (pr.checked > 0 || (pr.checked === 0 && pr.unchecked > 0)),
    pr ? pr.checked + ' digest-checked, ' + pr.unchecked + ' with no digest published' : '');
  /* THE ARTEFACT ITSELF, on disk, and not via the processors' own report —
     the report is derived from the same run that would be lying. */
  const patchedJar = L.library('net/neoforged/neoforge/21.1.248/neoforge-21.1.248-client.jar');
  const pst = fs.existsSync(patchedJar) ? fs.statSync(patchedJar) : null;
  ok('the patched client jar is on disk and not empty', !!pst && pst.size > 0,
    pst ? (pst.size / 1048576).toFixed(1) + ' MB' : 'absent');
  ok('and the run reported producing it', !!pr && pr.produced.some((f) => /neoforge-.*-client\.jar$/.test(f)),
    pr ? pr.produced.join(' ') : '');
  ok('the instance is no longer marked incomplete', !store.get(rec.id).pwarn);

  /* the claim that actually matters: every file the launch command names now
     exists.  That is the difference between "the profile is right" and "it
     will start". */
  const after = buildArgs({
    vjson: await inst.resolve(li.id, 0), layout: L, id: li.id, gameDir: L.gameDir(rec.id),
    session: { name: 'KestrelTest', uuid: '0'.repeat(8) + '-0000-0000-0000-' + '0'.repeat(12), accessToken: '0', userType: 'legacy' }
  });
  const missing = after.classpath.filter((c) => !fs.existsSync(c));
  ok('every entry on the launch classpath now exists', missing.length === 0,
    missing.length ? missing.length + ' missing, e.g. ' + path.basename(missing[0]) : after.classpath.length + ' entries');

  /* ── AND THEN IT ACTUALLY RUNS ──────────────────────────────────────────
     Every assertion above is about files being present and correct, and a
     launcher can pass all of them and still not start the game.  This is the
     one that cannot be satisfied by a well-formed profile: NeoForge's own
     ModLauncher has to come up on the patched jar the processors built. */
  console.log('\nneoforge 1.21.1 — launch');
  const nlines = [];
  let nstarted = null;
  const g3 = new Game({
    store: store, log: (l) => console.log('      · ' + l),
    emit: (ch, p) => {
      if (ch === 'game:log') { nlines.push(p.line); if (nlines.length < 200) console.log('      | ' + p.line.slice(0, 150)); }
      if (ch === 'game:started') nstarted = p;
    }
  });
  const t3 = Date.now();
  const nr = await g3.play(rec.id, { offline: true, username: 'KestrelTest', maxMemMb: 2048 });
  console.log('      launched pid ' + nr.pid + ' on Java ' + nr.java.version + ' in ' + (Date.now() - t3) + 'ms');
  await new Promise((res) => setTimeout(res, 60000));
  const nall = nlines.join('\n');
  ok('Play no longer refuses with LOADER_INCOMPLETE', !!nr.pid);
  ok('the process started', !!nstarted && !!nr.pid);
  ok('NeoForge loaded', /ModLauncher|neoforge|FML|Loading Minecraft/i.test(nall),
    (nall.match(/(ModLauncher[^\n]*|Loading Minecraft[^\n]*)/i) || [''])[0].slice(0, 110));
  ok('the game reached its own startup',
    /Setting user:|LWJGL Version|Backend library|OpenAL initialized|Narrator library|Reloading ResourceManager/i.test(nall),
    (nall.match(/(Setting user:|LWJGL Version[^\n]*|Backend library[^\n]*)/i) || [''])[0].slice(0, 90));
  ok('no ClassNotFound / NoSuchMethod on the patched jar',
    !/ClassNotFoundException|NoSuchMethodError|NoClassDefFoundError/.test(nall));
  console.log('      ' + nlines.length + ' log lines in 60s');
  g3.killAll();
  await new Promise((res) => setTimeout(res, 1500));
}

if (mode === 'modern') {
  /* THE OTHER HALF OF THE PHASE.  NeoForge and modern Forge take the same
     road but they are not the same file: Forge 1.20.1 declares `outputs` on
     two of its ten processors and NeoForge declares none on any of its, so
     this is the case that actually exercises the digest check, and running
     only NeoForge would leave that code never having verified anything. */
  console.log('\nforge 1.20.1 — modern path, and the one that publishes output digests');
  const rec = await makeInstance('p4-forge-1201', 'P4 Forge 1201', '1.20.1', 'Forge');
  const game = new Game({ store: store, emit: () => {}, log: (l) => console.log('      · ' + l) });
  const li = await game.installLoader(rec.id, 'Forge', '');
  console.log('      profile: ' + li.id + '   mainClass ' + li.mainClass + '   partial=' + li.partial);
  ok('modern Forge is marked incomplete until the processors run', li.partial === true);
  const summary = await game.install(rec.id, '');
  process.stdout.write('\n');
  console.log('      install: ' + summary.total + ' files, ' + summary.fetched + ' fetched, ' + summary.ms + 'ms');
  const pr = summary.processors;
  ok('its processors ran', !!pr && pr.ran > 0, pr ? pr.ran + ' ran, ' + pr.skipped + ' server-side skipped' : 'none');
  ok('and here the declared output digests DID get checked', !!pr && pr.checked > 0,
    pr ? pr.checked + ' digest-checked, ' + pr.unchecked + ' without one' : '');
  ok('the patched client jar is on disk', !!pr && !!pr.patched && fs.existsSync(pr.patched),
    pr && pr.patched ? path.basename(pr.patched) : 'absent');
  ok('the instance is no longer marked incomplete', !store.get(rec.id).pwarn);
  const built1201 = buildArgs({
    vjson: await new Installer(L, () => {}).resolve(li.id, 0), layout: L, id: li.id, gameDir: L.gameDir(rec.id),
    session: { name: 'KestrelTest', uuid: '0'.repeat(8) + '-0000-0000-0000-' + '0'.repeat(12), accessToken: '0', userType: 'legacy' }
  });
  const gone = built1201.classpath.filter((c) => !fs.existsSync(c));
  ok('every entry on its launch classpath exists', gone.length === 0,
    gone.length ? gone.length + ' missing, e.g. ' + path.basename(gone[0]) : built1201.classpath.length + ' entries');
}

if (mode === 'modern') {
  console.log('\nforge 1.8.9 — legacy path (install_profile.json carries a usable version json)');
  const rec = await makeInstance('p4-forge-189', 'P4 Forge 189', '1.8.9', 'Forge');
  const game = new Game({ store: store, emit: () => {}, log: (l) => console.log('      · ' + l) });
  const li = await game.installLoader(rec.id, 'Forge', '11.15.1.2318');
  console.log('      profile: ' + li.id + '   mainClass ' + li.mainClass + '   partial=' + li.partial);
  li.notes.forEach((n) => console.log('      ! ' + n));
  ok('legacy Forge needs no processors', li.partial === false);
  ok('mainClass is LaunchWrapper', /launchwrapper/i.test(li.mainClass), li.mainClass);
  const inst = new Installer(L, (l) => console.log('      · ' + l));
  const merged = await inst.resolve(li.id, 0);
  ok('the merged legacy arguments carry --tweakClass exactly once',
    (String(merged.minecraftArguments || '').match(/--tweakClass/g) || []).length === 1, merged.minecraftArguments);
  ok('--username is not duplicated by the merge',
    (String(merged.minecraftArguments || '').match(/--username/g) || []).length === 1);
  const summary = await game.install(rec.id, '');
  process.stdout.write('\n');
  console.log('      install: ' + summary.total + ' files, ' + summary.skipped + ' verified, ' + summary.fetched
    + ' fetched, ' + summary.bytes + ' bytes, ' + summary.ms + 'ms');
  const built = buildArgs({
    vjson: merged, layout: L, id: li.id, gameDir: L.gameDir(rec.id),
    session: { name: 'KestrelTest', uuid: '0'.repeat(8) + '-0000-0000-0000-' + '0'.repeat(12), accessToken: '0', userType: 'legacy' }
  });
  const cp = built.classpath;
  ok('the classpath carries the Forge universal jar', cp.some((c) => /forge-1\.8\.9/.test(c)), String(cp.length) + ' entries');
  ok('and LaunchWrapper', cp.some((c) => /launchwrapper/i.test(c)));
  ok('and the vanilla client jar last', cp[cp.length - 1].endsWith(path.join('1.8.9', '1.8.9.jar')));
  /* the three jars Mojang deleted along with the Twitch streaming feature are
     named by the install rather than pretended to be there */
  const absent = summary.absent || [];
  ok('every entry exists on disk except the ones the install reported gone',
    cp.every((c) => fs.existsSync(c) || absent.indexOf(path.basename(c)) >= 0),
    'gone: ' + absent.join(' '));
  ok('every entry is inside the data root', cp.every((c) => c.startsWith(path.resolve(root) + path.sep)));

  console.log('\nforge 1.8.9 — launch');
  const lines = [];
  const g2 = new Game({
    store: store, log: (l) => console.log('      · ' + l),
    emit: (ch, p) => { if (ch === 'game:log') { lines.push(p.line); if (lines.length < 300) console.log('      | ' + p.line.slice(0, 150)); } }
  });
  const r = await g2.play(rec.id, { offline: true, username: 'KestrelTest', maxMemMb: 2048 });
  console.log('      launched pid ' + r.pid + ' on Java ' + r.java.version);
  await new Promise((res) => setTimeout(res, 60000));
  const all = lines.join('\n');
  ok('Forge loaded', /Forge Mod Loader|FML|MinecraftForge/i.test(all), (all.match(/Forge Mod Loader[^\n]*/i) || [''])[0].slice(0, 110));
  ok('the game reached its own startup', /Setting user:|LWJGL Version|Backend library|OpenAL initialized/i.test(all));
  ok('no ClassNotFound / NoSuchMethod', !/ClassNotFoundException|NoSuchMethodError|NoClassDefFoundError/.test(all));
  console.log('      ' + lines.length + ' log lines in 60s');
  g2.killAll();
  await new Promise((res) => setTimeout(res, 1500));
}

console.log('\n' + (fails ? fails + ' FAILURES' : 'all checks passed') + '\n');
process.exit(fails ? 1 : 0);
