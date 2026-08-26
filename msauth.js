'use strict';
/* ============================================================================
   THE SIGN-IN CHAIN.  Six requests, all of them from this process.

     1  devicecode      Microsoft issues a short user code and a device code
     2  token           poll until the person has entered the user code
     3  XBL             Microsoft token  ->  Xbox Live token + user hash
     4  XSTS            Xbox Live token  ->  a token for Minecraft's service
     5  login_with_xbox XSTS + hash      ->  a Minecraft token
     6  profile         the Minecraft token -> uuid, name, skin

   TWO RULES SHAPE THIS FILE.

   NO TOKEN LEAVES THIS PROCESS.  Not to the renderer, not to a log line, not
   into the message of a thrown Error.  Every failure here is raised as an
   AuthError carrying a stable code and a sentence written by hand; response
   bodies are read for the two or three fields that are needed and are never
   forwarded, stringified or printed.  The app has a Logs screen with a copy
   button on it, so a token that reaches a log is a token that gets pasted
   into a chat window.  The user code IS shown - it is meant to be read off
   the screen and typed on Microsoft's page - but the device code beside it
   is a bearer credential and stays here.

   WITHOUT A CLIENT ID IT DOES NOT PRETEND.  demoFlow() below runs the same
   state machine - code, waiting, cancel, expiry, done - against a local stub
   that makes no network request at all, and every account it produces is
   marked demo:true so the UI can say so on the row and in the panel.  The
   moment auth-config.js resolves a real client id, liveFlow() runs instead
   and nothing else in the app changes.
   ========================================================================= */

const crypto = require('node:crypto');
const { SCOPE } = require('./auth-config');

const AUTHORITY = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const EP = {
  devicecode: AUTHORITY + '/devicecode',
  token: AUTHORITY + '/token',
  xbl: 'https://user.auth.xboxlive.com/user/authenticate',
  xsts: 'https://xsts.auth.xboxlive.com/xsts/authorize',
  mc: 'https://api.minecraftservices.com/authentication/login_with_xbox',
  profile: 'https://api.minecraftservices.com/minecraft/profile'
};
/* https only, every one of them, checked rather than assumed */
Object.keys(EP).forEach(function (k) {
  if (!/^https:\/\//.test(EP[k])) throw new Error('endpoint ' + k + ' is not https');
});

const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
const NET_TIMEOUT = 20000;

/* ── errors ───────────────────────────────────────────────────────────────
   code is an identifier, message is prose.  Neither is ever built out of a
   response body, so neither can carry a token.                             */
class AuthError extends Error {
  constructor(code, message) { super(message); this.name = 'AuthError'; this.code = code; }
}

/* the documented XSTS refusals, as sentences rather than numbers */
const XERR = {
  2148916227: ['xerr-banned', 'This Microsoft account has been banned from Xbox Live, so it cannot be used to sign in to Minecraft.'],
  2148916233: ['xerr-no-xbox-account', 'This Microsoft account has no Xbox profile yet. Sign in once at xbox.com, create the profile, then come back and try again.'],
  2148916235: ['xerr-country', 'Xbox Live is not available in this account’s country or region, so Minecraft cannot sign it in.'],
  2148916236: ['xerr-adult-verification', 'This account needs adult verification before Xbox Live will issue it a token. Complete it on the Xbox site and try again.'],
  2148916237: ['xerr-adult-verification', 'This account needs adult verification before Xbox Live will issue it a token. Complete it on the Xbox site and try again.'],
  2148916238: ['xerr-child', 'This is a child account. It must be added to a Microsoft family with an adult on it before it can sign in to Minecraft.']
};

/* ── http ─────────────────────────────────────────────────────────────────
   One place that talks to the network, so there is one place to check that
   nothing is being logged and nothing is going out over plain http.        */
async function send(url, init) {
  if (!/^https:\/\//.test(url)) throw new AuthError('not-https', 'refusing to send a sign-in request over anything but https');
  const ac = new AbortController();
  const t = setTimeout(function () { ac.abort(); }, NET_TIMEOUT);
  let res;
  try {
    res = await fetch(url, Object.assign({ signal: ac.signal, redirect: 'follow' }, init));
  } catch (e) {
    /* e.message here is "fetch failed" or an abort - a transport fact, and
       never anything we sent.  It is still not forwarded. */
    throw new AuthError('network', 'could not reach the sign-in service. Check the connection and try again.');
  } finally { clearTimeout(t); }
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  return { status: res.status, ok: res.ok, data: data && typeof data === 'object' ? data : {} };
}

function form(url, params) {
  /* the device code and the refresh token go in the BODY.  Nothing that is
     a credential is ever put in a URL or a query string. */
  return send(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams(params).toString()
  });
}

function json(url, body, headers) {
  return send(url, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json', 'Accept': 'application/json' }, headers || {}),
    body: JSON.stringify(body)
  });
}

/* ── steps 3 to 6, shared by first sign-in and by every renewal ────────── */

async function xboxToMinecraft(msAccessToken) {
  /* 3. Xbox Live */
  const xbl = await json(EP.xbl, {
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: 'd=' + msAccessToken },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT'
  });
  if (!xbl.ok || !xbl.data.Token) {
    throw new AuthError('xbl-' + xbl.status, 'Xbox Live would not accept the Microsoft sign-in (HTTP ' + xbl.status + ').');
  }
  const xblToken = xbl.data.Token;
  const uhs = xbl.data.DisplayClaims && xbl.data.DisplayClaims.xui && xbl.data.DisplayClaims.xui[0]
    ? xbl.data.DisplayClaims.xui[0].uhs : '';
  if (!uhs) throw new AuthError('xbl-no-uhs', 'Xbox Live returned a token with no user hash on it, so the chain cannot continue.');

  /* 4. XSTS */
  const xsts = await json(EP.xsts, {
    Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
    RelyingParty: 'rp://api.minecraftservices.com/',
    TokenType: 'JWT'
  });
  if (!xsts.ok) {
    const n = Number(xsts.data.XErr);
    if (XERR[n]) throw new AuthError(XERR[n][0], XERR[n][1]);
    throw new AuthError('xsts-' + xsts.status, 'Xbox Live refused to issue a Minecraft token (HTTP ' + xsts.status +
      (Number.isFinite(n) ? ', XErr ' + n : '') + ').');
  }
  const xstsToken = xsts.data.Token;
  const xstsUhs = xsts.data.DisplayClaims && xsts.data.DisplayClaims.xui && xsts.data.DisplayClaims.xui[0]
    ? xsts.data.DisplayClaims.xui[0].uhs : uhs;
  if (!xstsToken) throw new AuthError('xsts-empty', 'Xbox Live returned no Minecraft token, so the chain cannot continue.');

  /* 5. Minecraft */
  const mc = await json(EP.mc, { identityToken: 'XBL3.0 x=' + xstsUhs + ';' + xstsToken });
  if (!mc.ok || !mc.data.access_token) {
    throw new AuthError('mc-' + mc.status, 'Minecraft’s service would not exchange the Xbox token (HTTP ' + mc.status +
      '). If the client id is new, this is usually Mojang not having approved it yet.');
  }
  const mcToken = mc.data.access_token;
  const expiresAt = Date.now() + (Number(mc.data.expires_in) > 0 ? Number(mc.data.expires_in) : 86400) * 1000;

  /* 6. the profile.  404 here has exactly one meaning worth saying out loud. */
  const prof = await send(EP.profile, { headers: { Authorization: 'Bearer ' + mcToken, Accept: 'application/json' } });
  if (prof.status === 404) {
    throw new AuthError('no-minecraft', 'That Microsoft account does not own Minecraft: Java Edition. Xbox Live signed it in, but there is no Minecraft profile on it to play with.');
  }
  if (!prof.ok || !prof.data.id) {
    throw new AuthError('profile-' + prof.status, 'Signed in, but the Minecraft profile could not be read (HTTP ' + prof.status + ').');
  }
  const skins = Array.isArray(prof.data.skins) ? prof.data.skins : [];
  const active = skins.filter(function (s) { return s && s.state === 'ACTIVE'; })[0] || skins[0] || null;

  return {
    uuid: dashUuid(String(prof.data.id)),
    name: String(prof.data.name || ''),
    skinUrl: active && typeof active.url === 'string' && /^https:\/\//.test(active.url) ? active.url : '',
    mcToken: mcToken,
    expiresAt: expiresAt
  };
}

function dashUuid(hex) {
  const h = hex.replace(/-/g, '').toLowerCase();
  if (h.length !== 32) return hex;
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}

/* ── the demo stub ────────────────────────────────────────────────────────
   Same alphabet Microsoft uses for a user code: uppercase, no 0/O and no
   1/I, because a device code is meant to be read off one screen and typed
   on another.  Nothing here touches the network.

   Two knobs, so the unhappy paths are reachable without a client id:
     KESTREL_DEMO_APPROVE=never|<seconds>   default 10
     KESTREL_DEMO_EXPIRES=<seconds>         default 900 (the real 15 minutes)
   ...so `KESTREL_DEMO_APPROVE=never KESTREL_DEMO_EXPIRES=20 npm start` walks
   the expiry path in twenty seconds.                                       */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/* all zeroes on purpose: no real Minecraft profile has this identifier, so a
   demo row cannot be mistaken for one even by something reading the file */
const DEMO_UUID = '00000000-0000-0000-0000-000000000000';

function demoCode() {
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    if (i === 3) out += '–';
  }
  return out;
}
function envSeconds(key, dflt) {
  const raw = String(process.env[key] || '').trim().toLowerCase();
  if (raw === 'never') return Infinity;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

/* ── a flow ───────────────────────────────────────────────────────────────
   One live handshake.  The renderer holds only the opaque id below; the
   device code, the refresh token and every access token stay on this object
   and are dropped when it finishes.                                        */
class Flow {
  constructor(auth, demo) {
    this.auth = auth;
    this.demo = demo;
    this.id = crypto.randomUUID();
    this.cancelled = false;
    this.done = false;
    this.userCode = '';
    this.verificationUri = 'https://microsoft.com/link';
    this.expiresAt = 0;
    this.interval = 5;
    this.deviceCode = '';        /* never leaves this object */
  }
  /* what the renderer is allowed to know about a handshake in progress */
  handle() {
    return {
      flowId: this.id,
      userCode: this.userCode,
      verificationUri: this.verificationUri,
      expiresAt: this.expiresAt,
      demo: this.demo
    };
  }
  cancel() { this.cancelled = true; }
  sleep(ms) {
    const self = this;
    return new Promise(function (r) {
      const t = setTimeout(r, ms);
      if (t.unref) t.unref();
      self._t = t;
    });
  }
}

class Auth {
  /* emit(payload) is how a flow speaks to the window; log(line) is the app
     log, and every line handed to it is a status code or an identifier. */
  constructor(opts) {
    this.config = opts.config;
    this.accounts = opts.accounts;
    this.emit = typeof opts.emit === 'function' ? opts.emit : function () {};
    this.log = typeof opts.log === 'function' ? opts.log : function () {};
    this.flows = new Map();
    this.timer = null;
  }

  status() {
    return {
      mode: this.config.live ? 'live' : 'demo',
      why: this.config.why,
      source: this.config.live ? this.config.source : '',
      canPersist: this.accounts.canPersist,
      scope: SCOPE
    };
  }

  /* returns as soon as there is a code to put on screen; the rest of the
     handshake runs on and reports itself through emit() */
  async begin() {
    const flow = new Flow(this, !this.config.live);
    if (flow.demo) {
      flow.userCode = demoCode();
      flow.interval = 5;
      const secs = envSeconds('KESTREL_DEMO_EXPIRES', 900);
      flow.expiresAt = Date.now() + (secs === Infinity ? 900 : secs) * 1000;
    } else {
      const r = await form(EP.devicecode, { client_id: this.config.clientId, scope: SCOPE });
      if (!r.ok || !r.data.device_code || !r.data.user_code) {
        this.log('auth: devicecode refused, HTTP ' + r.status + (r.data.error ? ' (' + String(r.data.error).slice(0, 40) + ')' : ''));
        throw new AuthError('devicecode-' + r.status, 'Microsoft would not issue a sign-in code (HTTP ' + r.status +
          '). Check that the client id is registered for public client flows.');
      }
      flow.deviceCode = String(r.data.device_code);
      flow.userCode = String(r.data.user_code);
      if (typeof r.data.verification_uri === 'string' && /^https:\/\//.test(r.data.verification_uri)) {
        flow.verificationUri = r.data.verification_uri;
      }
      flow.interval = Math.max(1, Number(r.data.interval) || 5);
      flow.expiresAt = Date.now() + (Number(r.data.expires_in) || 900) * 1000;
    }
    this.flows.set(flow.id, flow);
    this.log('auth: ' + (flow.demo ? 'demo ' : '') + 'device code issued, waiting for the user');
    const self = this;
    this.run(flow).catch(function (e) { self.fail(flow, e); });
    return flow.handle();
  }

  cancel(flowId) {
    const flow = this.flows.get(String(flowId || ''));
    if (!flow) return false;
    flow.cancel();
    this.flows.delete(flow.id);
    this.log('auth: sign-in cancelled by the user');
    return true;
  }

  fail(flow, e) {
    if (flow.cancelled || flow.done) return;
    flow.done = true;
    this.flows.delete(flow.id);
    const code = e && e.code ? e.code : 'unknown';
    const message = e instanceof AuthError ? e.message : 'The sign-in did not complete. Nothing was changed on this PC.';
    this.log('auth: sign-in failed (' + code + ')');
    this.emit({ flowId: flow.id, phase: 'error', code: code, message: message });
  }

  async run(flow) {
    const tokens = flow.demo ? await this.runDemo(flow) : await this.runLive(flow);
    if (!tokens || flow.cancelled) return;

    const account = this.accounts.upsert(tokens);
    flow.done = true;
    this.flows.delete(flow.id);
    this.log('auth: signed in' + (flow.demo ? ' (demo)' : '') + ', profile ' + account.uuid);
    this.emit({
      flowId: flow.id, phase: 'done', account: account,
      canPersist: this.accounts.canPersist, demo: flow.demo
    });
    this.schedule();
  }

  expired(flow) {
    flow.done = true;
    this.flows.delete(flow.id);
    this.log('auth: device code expired unused');
    this.emit({ flowId: flow.id, phase: 'expired' });
  }

  async runDemo(flow) {
    const approveIn = envSeconds('KESTREL_DEMO_APPROVE', 10) * 1000;
    const started = Date.now();
    for (;;) {
      await flow.sleep(flow.interval * 1000);
      if (flow.cancelled) return null;
      if (Date.now() >= flow.expiresAt) { this.expired(flow); return null; }
      if (Date.now() - started >= approveIn) break;
      this.emit({ flowId: flow.id, phase: 'pending' });
    }
    return {
      demo: true,
      uuid: DEMO_UUID,
      name: 'Demo profile',
      skinUrl: '',
      mcToken: '',
      refreshToken: '',
      expiresAt: Date.now() + 3600 * 1000
    };
  }

  async runLive(flow) {
    let wait = flow.interval;
    for (;;) {
      await flow.sleep(wait * 1000);
      if (flow.cancelled) return null;
      if (Date.now() >= flow.expiresAt) { this.expired(flow); return null; }

      const r = await form(EP.token, {
        grant_type: DEVICE_GRANT,
        client_id: this.config.clientId,
        device_code: flow.deviceCode
      });
      if (flow.cancelled) return null;

      if (r.ok && r.data.access_token) {
        const chain = await xboxToMinecraft(r.data.access_token);
        if (flow.cancelled) return null;
        chain.refreshToken = String(r.data.refresh_token || '');
        chain.demo = false;
        return chain;
      }

      const err = String(r.data.error || '');
      if (err === 'authorization_pending') { this.emit({ flowId: flow.id, phase: 'pending' }); continue; }
      if (err === 'slow_down') {
        /* the spec's own remedy: add five seconds and keep the new interval */
        wait += 5;
        this.log('auth: slow_down, polling every ' + wait + 's');
        this.emit({ flowId: flow.id, phase: 'pending' });
        continue;
      }
      if (err === 'expired_token') { this.expired(flow); return null; }
      if (err === 'authorization_declined') {
        throw new AuthError('declined', 'The sign-in was declined on Microsoft’s page, so nothing was added here.');
      }
      if (err === 'bad_verification_code') {
        throw new AuthError('bad-verification-code', 'Microsoft no longer recognises this sign-in code. Ask for a new one.');
      }
      this.log('auth: token endpoint refused, HTTP ' + r.status + (err ? ' (' + err.slice(0, 40) + ')' : ''));
      throw new AuthError('token-' + r.status, 'Microsoft refused the sign-in (HTTP ' + r.status + (err ? ', ' + err : '') + ').');
    }
  }

  /* ── renewal ────────────────────────────────────────────────────────────
     Steps 3 to 6 again, with no one looking at the screen.  A demo account
     has nothing to renew, and says so rather than inventing a request.     */
  async refresh(id) {
    const rec = this.accounts.raw(id);
    if (!rec) return null;
    if (rec.demo) { this.accounts.touch(id, Date.now() + 3600 * 1000); return this.accounts.publicOf(id); }
    if (!this.config.live) throw new AuthError('no-client-id', 'There is no Azure client id configured, so this session cannot be renewed.');
    if (!rec.refreshToken) throw new AuthError('no-refresh-token', 'There is no stored refresh token for this account, so it has to be signed in again.');

    const r = await form(EP.token, {
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
      refresh_token: rec.refreshToken,
      scope: SCOPE
    });
    if (!r.ok || !r.data.access_token) {
      const err = String(r.data.error || '');
      this.log('auth: refresh refused for ' + id + ', HTTP ' + r.status + (err ? ' (' + err.slice(0, 40) + ')' : ''));
      throw new AuthError('refresh-' + r.status, 'This account’s session could not be renewed (HTTP ' + r.status + '). Sign in again.');
    }
    const chain = await xboxToMinecraft(r.data.access_token);
    chain.refreshToken = String(r.data.refresh_token || rec.refreshToken);
    chain.demo = false;
    const account = this.accounts.upsert(chain, id);
    this.log('auth: renewed the session for ' + account.id);
    return account;
  }

  /* PROACTIVELY, not on the way to a launch.  A minute's tick is cheap and
     a renewal that starts ten minutes early never makes anybody wait. */
  schedule() {
    if (this.timer) return;
    const self = this;
    this.timer = setInterval(function () { self.sweep(); }, 60 * 1000);
    if (this.timer.unref) this.timer.unref();
    this.sweep();
  }

  async sweep() {
    const soon = Date.now() + 10 * 60 * 1000;
    const due = this.accounts.list().filter(function (a) { return !a.demo && a.expiresAt && a.expiresAt < soon; });
    for (const a of due) {
      try {
        const next = await this.refresh(a.id);
        if (next) this.emit({ phase: 'renewed', account: next });
      } catch (e) {
        this.log('auth: renewal failed for ' + a.id + ' (' + (e && e.code ? e.code : 'unknown') + ')');
        this.emit({ phase: 'stale', id: a.id, message: e instanceof AuthError ? e.message : 'This account needs signing in again.' });
      }
    }
  }
}

module.exports = { Auth, AuthError, EP, DEMO_UUID };
