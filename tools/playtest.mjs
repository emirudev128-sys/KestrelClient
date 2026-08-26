/* End-to-end proof for phase 3, with no Electron around it.
     node tools/playtest.mjs 1.8.9 [seconds]
   Installs the version into the real data root, finds a Java, launches it
   offline, streams the log, then kills it and prints the numbers. */
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
const require = createRequire(import.meta.url);
const { Store } = require('../store.js');
const { Game } = require('../mc/index.js');

const id = process.argv[2] || '1.8.9';
const runFor = Number(process.argv[3] || 25);
const root = path.join(process.env.APPDATA || os.homedir(), 'Kestrel');
const store = new Store(root);
const INST = 'phase3-test';
if (!store.has(INST)) {
  // create() slugifies the name; force the folder by writing the record directly
  const rec = store.create({ name: 'Phase3 Test', ver: id });
  console.log('created instance', rec.id);
}
const instId = store.list().filter((r) => r.name === 'Phase3 Test')[0].id;
store.update(instId, { ver: id });

let lastLine = '';
const game = new Game({
  store,
  log: (l) => console.log('[app] ' + l),
  emit: (ch, p) => {
    if (ch === 'game:progress') {
      const pct = p.totalBytes ? Math.round((p.bytes / p.totalBytes) * 100) : (p.total ? Math.round((p.done / p.total) * 100) : 0);
      const s = `[${p.phase}] ${p.done}/${p.total} files  ${(p.bytes / 1e6).toFixed(1)}/${(p.totalBytes / 1e6).toFixed(1)} MB  ${pct}%  ${p.file}`;
      if (s !== lastLine) { process.stdout.write('\r' + s.padEnd(110)); lastLine = s; }
    } else if (ch === 'game:log') {
      console.log('\n[mc/' + p.stream + '] ' + p.line);
    } else if (ch === 'game:exit') {
      console.log('\n[exit] code=' + p.code + ' signal=' + p.signal + ' after ' + p.ms + 'ms');
    } else if (ch === 'game:started') {
      console.log('\n[started] pid=' + p.pid + ' offline=' + p.offline + ' player=' + p.player + ' argfile=' + p.argfile + ' java=' + p.java.version);
    }
  }
});

console.log('data root:', root);
const t0 = Date.now();
const javas = await game.javaList(true);
console.log('\njava runtimes found:');
for (const j of javas) console.log('  ' + String(j.major).padStart(3) + '  ' + j.version.padEnd(12) + ' ' + j.vendor.padEnd(28) + ' ' + j.arch.padEnd(6) + ' ' + j.path);
console.log('\njava for ' + id + ':', JSON.stringify(await game.javaFor(id), null, 0).slice(0, 300));

const r = await game.play(instId, { offline: true, username: 'KestrelTest', maxMemMb: 2048 });
console.log('\nlaunch result:', JSON.stringify(r, null, 2));
console.log('wall clock to running: ' + (Date.now() - t0) + 'ms');

setTimeout(() => {
  console.log('\n--- killing ---');
  console.log('kill() returned', game.kill(r.session));
  setTimeout(() => { console.log('running now:', game.running().length); process.exit(0); }, 4000);
}, runFor * 1000);
