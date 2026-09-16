/* The session a launch uses, run as one command:  node tools/sessioncheck.mjs

   No network, no real account, nothing spawned.  A signed-in account is faked
   into an AccountStore that cannot persist, renewal is stubbed, and the temp
   folders are removed at the end.  What it holds the launch path to:

     - Play with a real account active gets that account's token, as msa
     - Play offline, a demo account, or no account at all is offline
     - a token close to expiry is renewed before it is handed out
     - a renewal that fails stops the launch rather than going offline
     - the token is in the argument vector once, as --accessToken's value;
       Java 8 refuses to carry it; no game output line repeats it
     - the Play button asks for the active account; Play offline does not   */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { AccountStore } = require('../accounts.js');
const { Auth, AuthError } = require('../msauth.js');
const { Store } = require('../store.js');
const { Game } = require('../mc/index.js');
const { Layout } = require('../mc/paths.js');
const launcher = require('../mc/launch.js');
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

let fails = 0;
const ok = (name, cond, extra) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (extra ? '   ' + extra : ''));
  if (!cond) fails++;
};
const rejects = async (p) => { try { await p; return null; } catch (e) { return e; } };

const temps = [];
const temp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-' + tag + '-')); temps.push(d); return d; };
const quiet = () => {};
/* safeStorage with no OS keystore: the store keeps records in memory and
   writes nothing, which is exactly what a check wants */
const NO_KEYSTORE = { isEncryptionAvailable: () => false };

const TOKEN = 'fake-minecraft-token-for-sessioncheck-7f3a';
const CLIENT = 'client-id-that-must-not-travel';
const UUID = '5b1c7e2a-3d4f-4a6b-9c8d-1e2f3a4b5c6d';
const HOUR = 3600 * 1000;

/* ── 1. msauth.js: launchSession() ─────────────────────────────────────── */
console.log('\nlaunchSession: a real account');
const accounts = new AccountStore(temp('acc'), NO_KEYSTORE, quiet);
const live = accounts.upsert({ uuid: UUID, name: 'CheckPlayer', mcToken: TOKEN, refreshToken: 'r1', expiresAt: Date.now() + 20 * HOUR, demo: false });
const auth = new Auth({ config: { live: true, clientId: CLIENT }, accounts: accounts, log: quiet });
let renewals = 0;
const renewOk = async (id) => {
  renewals++;
  return accounts.upsert({ uuid: UUID, name: 'CheckPlayer', mcToken: TOKEN + '-renewed', refreshToken: 'r2', expiresAt: Date.now() + 24 * HOUR, demo: false }, id);
};
auth.refresh = renewOk;

const s1 = await auth.launchSession();
ok('the active account gives its own token', !!s1 && s1.accessToken === TOKEN);
ok('...as an msa session, not an offline one', !!s1 && s1.userType === 'msa' && s1.offline === false);
ok('...under its own name and uuid', !!s1 && s1.name === 'CheckPlayer' && s1.uuid === UUID);
ok('...and the Azure client id is not on it', !!s1 && s1.clientId === '' && JSON.stringify(s1).indexOf(CLIENT) < 0);
ok('a token with hours left is not renewed', renewals === 0);

console.log('\nlaunchSession: renewal');
accounts.touch(live.id, Date.now() + 30 * 60 * 1000);
const s2 = await auth.launchSession();
ok('a token with 30 minutes left is renewed first', renewals === 1 && !!s2 && s2.accessToken === TOKEN + '-renewed');
accounts.touch(live.id, Date.now() + 60 * 1000);
auth.refresh = async () => { throw new AuthError('refresh-400', 'This account’s session could not be renewed (HTTP 400). Sign in again.'); };
const e1 = await rejects(auth.launchSession());
ok('a renewal that fails throws, and keeps its code', !!e1 && e1.code === 'refresh-400', e1 && e1.code);

console.log('\nlaunchSession: nothing to play online with');
const demoAccounts = new AccountStore(temp('demo'), NO_KEYSTORE, quiet);
demoAccounts.upsert({ uuid: '00000000-0000-3000-8000-000000000001', name: 'Demo', mcToken: '', refreshToken: '', expiresAt: Date.now() + HOUR, demo: true });
demoAccounts.upsert({ uuid: UUID, name: 'CheckPlayer', mcToken: TOKEN, refreshToken: 'r1', expiresAt: Date.now() + 20 * HOUR, demo: false });
const demoAuth = new Auth({ config: { live: false }, accounts: demoAccounts, log: quiet });
const noSession = (a) => a.launchSession().catch((e) => e);
ok('a demo account active: no session, even with a real one in the list', (await noSession(demoAuth)) === null);
ok('no accounts at all: no session', (await noSession(new Auth({ config: { live: false }, accounts: new AccountStore(temp('none'), NO_KEYSTORE, quiet), log: quiet }))) === null);

/* ── 2. mc/index.js: _session() ────────────────────────────────────────── */
console.log('\nGame._session');
auth.refresh = renewOk;
accounts.touch(live.id, Date.now() + 20 * HOUR);
const store = new Store(temp('store'));
const game = new Game({ store: store, auth: auth, emit: quiet, log: quiet });

const g1 = await game._session({});
ok('Play with a real account launches online with its token', g1.offline === false && g1.accessToken === s2.accessToken && g1.userType === 'msa');
const g2 = await game._session({ offline: true, username: 'KestrelTest' });
ok('Play offline is offline even with a real account active', g2.offline === true && g2.accessToken === '0' && g2.userType === 'legacy');
ok('...under the offline profile name it was given', g2.name === 'KestrelTest');
const g3 = await new Game({ store: store, auth: demoAuth, emit: quiet, log: quiet })._session({}).catch((e) => ({ error: e.code }));
ok('Play with only a demo account falls back to offline', g3.offline === true && g3.accessToken === '0', g3.error);
const g4 = await new Game({ store: store, emit: quiet, log: quiet })._session({});
ok('a Game with no auth at all is offline', g4.offline === true && g4.accessToken === '0');

const failing = new Auth({ config: { live: true, clientId: CLIENT }, accounts: accounts, log: quiet });
failing.refresh = async () => { throw new AuthError('refresh-400', 'This account’s session could not be renewed (HTTP 400). Sign in again.'); };
accounts.touch(live.id, Date.now() + 60 * 1000);
const e2 = await rejects(new Game({ store: store, auth: failing, emit: quiet, log: quiet })._session({}));
ok('a session that cannot be renewed stops the launch', !!e2 && e2.code === 'refresh-400');
ok('...says Play offline still works', !!e2 && /Play offline still works\.$/.test(e2.message), e2 && e2.message);
ok('...and its message carries no token', !!e2 && e2.message.indexOf(TOKEN) < 0);
accounts.touch(live.id, Date.now() + 20 * HOUR);

/* ── 3. mc/launch.js: where the token goes ─────────────────────────────── */
console.log('\nthe argument vector');
const L = new Layout(temp('layout')).ensure();
const vjson = {
  id: '1.21.4', mainClass: 'net.minecraft.client.main.Main', type: 'release', assetIndex: { id: '19' }, libraries: [],
  arguments: {
    game: ['--username', '${auth_player_name}', '--uuid', '${auth_uuid}', '--accessToken', '${auth_access_token}',
      '--clientId', '${clientid}', '--xuid', '${auth_xuid}', '--userType', '${user_type}'],
    jvm: []
  }
};
const online = await game._session({});
const built = launcher.buildArgs({ vjson: vjson, layout: L, id: '1.21.4', gameDir: L.gameDir('check'), session: online });
const full = built.jvm.concat([built.main], built.game);
const after = (flag) => full[full.indexOf(flag) + 1];
ok('the token is in the vector exactly once', full.filter((a) => String(a).indexOf(online.accessToken) >= 0).length === 1);
ok('...as the value of --accessToken', after('--accessToken') === online.accessToken);
ok('--userType is msa and --uuid is the profile', after('--userType') === 'msa' && after('--uuid') === UUID);
ok('--clientId is empty, not the Azure client id', after('--clientId') === '' && full.join(' ').indexOf(CLIENT) < 0);

const e3 = await rejects(launcher.launch({
  vjson: vjson, layout: L, id: '1.21.4', instance: 'check', gameDir: L.gameDir('check'), session: online,
  java: { path: 'never-run-java', major: 8, version: '1.8.0_442' }
}));
ok('Java 8 refuses to put a real token on a command line', !!e3 && e3.code === 'TOKEN_WOULD_LEAK', e3 && e3.code);
ok('...and the refusal does not repeat the token', !!e3 && e3.message.indexOf(online.accessToken) < 0);

console.log('\ngame output');
ok('a line that echoes the token has it masked', launcher.redact('args [--accessToken, ' + TOKEN + ']', TOKEN) === 'args [--accessToken, [session token]]');
ok('the offline sentinel "0" masks nothing', launcher.redact('Loaded 10 mods', '0') === 'Loaded 10 mods');
const launchSrc = fs.readFileSync(new URL('../mc/launch.js', import.meta.url), 'utf8');
ok('every stdout/stderr line goes through redact()',
  (launchSrc.match(/o\.onLine\(stream,/g) || []).length === 1 && /o\.onLine\(stream, redact\(text, token\)\)/.test(launchSrc));

/* ── 4. ui/scripts/app.js: what the buttons ask for ────────────────────── */
console.log('\nthe Play buttons');
const app = fs.readFileSync(new URL('../ui/scripts/app.js', import.meta.url), 'utf8');
ok('no launch hard-codes offline', !/game\.play\([^)]*\{\s*offline:\s*true\s*\}\s*\)/.test(app));
ok('Play asks for the active account', /if \(live\) startReal\(false, from\)/.test(app));
ok('Play offline asks for offline', /'launch-offline'[\s\S]{0,160}startReal\(true\)/.test(app));

const start = app.indexOf('function launchOpts(offline) {');
const end = start < 0 ? -1 : app.indexOf('\n  }\n', start);
ok('launchOpts() is there to test', start >= 0 && end > start);
if (start >= 0 && end > start) {
  const src = app.slice(start, end + 4);
  const opts = (offline, who) => new Function('accList', 'accRead', src + '\nreturn launchOpts;')(
    { querySelector: () => (who ? {} : null) }, () => who)(offline);
  const ms = { demo: false, offline: false, name: 'CheckPlayer' };
  const off = { demo: false, offline: true, name: 'Alex_2' };
  const demo = { demo: true, offline: false, name: 'Demo' };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  ok('Microsoft account + Play          -> online', same(opts(false, ms), { offline: false }), JSON.stringify(opts(false, ms)));
  ok('Microsoft account + Play offline  -> offline, no name', same(opts(true, ms), { offline: true }), JSON.stringify(opts(true, ms)));
  ok('offline profile + Play            -> offline, its own name', same(opts(false, off), { offline: true, username: 'Alex_2' }), JSON.stringify(opts(false, off)));
  ok('demo profile + Play               -> offline', same(opts(false, demo), { offline: true }), JSON.stringify(opts(false, demo)));
  ok('no account + Play                 -> offline', same(opts(false, null), { offline: true }), JSON.stringify(opts(false, null)));
}

for (const d of temps) fs.rmSync(d, { recursive: true, force: true });
console.log('\n' + (fails ? fails + ' FAILED' : 'all passed'));
process.exit(fails ? 1 : 0);
