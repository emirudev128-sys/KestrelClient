/* ============================================================================
   The product name is a value, not a string.

   "Kestrel" collides with ASP.NET's web server and may have to change.  A
   rename must be one edit here, never a find-and-replace across the UI, so:

     · no component markup contains the product name.  Anywhere it appears as
       a bare label — the titlebar, About, the palette list — the element
       carries data-brand="name" and is filled at render;
     · prose that mentions the product uses a {name} placeholder and lives in
       the STRINGS table below, interpolated once;
     · the instance folder path derives from BRAND.folder, so
       ...\.kestrel\instances\ is generated, not typed;
     · the version string, the repository slug and the credential-manager key
       derive too, because all three carry the name.

   Verified by substitution: set name to something obviously different, shoot
   every screen, and read them.  That check is the deliverable.
   ========================================================================= */

export const BRAND = {
  name: 'Kestrel',
  version: '0.5.0',
  /* The instance folder carries the name too, so it derives from it.  The
     substitution test is what caught this: renaming to "Zzyzx" left
     ...\.kestrel\instances\ intact, which is a rename that is two edits
     rather than one.  Set `folder` explicitly only to keep an old path
     working through a rename. */
  get folder() { return '.' + this.slug; },
  /* the repository slug and the Windows Credential Manager entry both carry
     the name, and both are visible in the UI, so both derive from it */
  get slug() { return this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'); },
  /* THE OWNER IS THE ONE HALF THAT CANNOT DERIVE.  It is a GitHub account
     name, and an account does not rename when a product does — so it is
     written out, and only the repository half derives from the name.  The
     earlier form built the whole thing out of the name and produced
     github.com/kestrel-launcher/kestrel, which reads plausibly and does not
     exist; it went out as a User-Agent on every request for as long as it
     was wrong.  A derived value that nobody can visit is worse than a typed
     one, because it looks maintained. */
  get repo() { return 'github.com/emirudev128-sys/' + this.name.replace(/[^A-Za-z0-9]+/g, '') + 'Client'; },
  get credential() { return this.name + '/msa'; },
  /* WHAT THIS CLIENT CALLS ITSELF ON THE WIRE, in one place, because it is
     the same three values every time and they must not drift apart.  Modrinth
     asks clients to identify themselves with a contact URL that works; Mojang
     and the loader mavens see this too.  mc/net.js is handed this string at
     startup rather than keeping its own copy. */
  get userAgent() { return this.name + '/' + this.version + ' (+https://' + this.repo + ')'; }
};

/* A Windows user profile path, built rather than typed. -------------------- */
export const HOME = 'C:\\Users\\emir\\AppData\\Roaming';
export function instancePath(slug, form) {
  /* 'full'   C:\Users\...\.kestrel\instances\1-21-4-fabric  — copied, and the title
     'short'  ...\.kestrel\instances\1-21-4-fabric           — a form field
     'tail'   ...\instances\1-21-4-fabric                    — a narrow rail cell,
              where a leading AND a trailing ellipsis would be two elisions of
              one string, which reads as a rendering fault rather than a path */
  const tail = '\\instances' + (slug ? '\\' + slug : '');
  if (form === 'tail') return '\u2026' + tail;
  return (form === 'short' ? '\u2026' : HOME) + '\\' + BRAND.folder + tail;
}

/* ── the string table ──────────────────────────────────────────────────────
   Every string in the UI that mentions the product. Nothing else belongs
   here: ordinary copy stays in the markup where it can be read in context.
   {name} {version} {folder} {repo} {credential} are interpolated.
   Values may carry inline markup; they are authored here, not user input.  */

export const STRINGS = {
  'empty.text':
    '{name} needs one instance before it can launch anything. Make one and it picks the Java runtime, or point it at a <span class="mono">.minecraft</span> folder you already have.',
  'launch.hide':      'Hide {name} until it exits',
  'launch.keepopen':  'Play and keep {name} open',
  'instance.pair':    '{name} picked the runtime for this pair. Changing either one re-checks the files before the next launch.',
  'instance.bundled': 'Bundled with {name}',
  'servers.lead':     'Saved here, not promoted here. {name} never adds a server you did not add, and it never reorders your list.',
  'accounts.token':
    '{name} keeps the Microsoft refresh token in <span class="mono">accounts.json</span> under its data folder, sealed with the operating system’s own keystore — DPAPI on Windows — for this Windows account only, under the key <span class="mono">{credential}</span>. It never reaches this window: it is sent to Microsoft to renew a session and to nowhere else. Signing out deletes it from the machine. If the OS has no keystore available, {name} writes nothing rather than writing it in the clear, and says so.',
  'accounts.sends':   'What {name} sends',
  'accounts.offline':
    'A profile with a name and no session. It plays singleplayer, joins a LAN game, and joins any server running in offline mode. Servers that check ownership with Mojang will turn it away, and {name} says which is which before you launch rather than after.',
  'java.lead':        '{name} chooses a runtime per Minecraft version and installs it if it is missing. There is nothing here you have to set.',
  'memory.hint':      'More is not better. {name} warns past 24 GB, three quarters of this PC, because the collector pauses get longer past that, not shorter.',
  'storage.using':    '{name} is using',
  'mods.foot':        '{name} leaves anything else in there alone.',
  'browse.offline':
    '{name} could not reach <span class="mono">api.modrinth.com</span>, so this is the list that ships with the app: {n} real projects with their real authors, download counts and build numbers, read off Modrinth and frozen. Search, the filters and Install all work on it.',
  'import.pack':
    'Modrinth <span class="mono">.mrpack</span> and CurseForge <span class="mono">.zip</span> exports. {name} resolves the mod list first and shows you anything it could not find before it writes a single file.',
  'import.found':     '{name} looked in the usual install locations. Nothing is copied until you pick which instances to bring across, and the originals are left alone.',
  'new.java':
    '{name} picks the runtime from the Minecraft version, so there is no Java setting here and there is not going to be one. This one gets <span class="mono">Temurin 21.0.5</span>, already on the machine.',
  'appearance.lead':  'Four palettes, each with a dark and a light cut. {name} ships no colour picker over every token, because a palette is judged as a whole or it is not designed.',
  'appearance.accent':
    'The accent carries a 56px label, a 6px dot and a 2px rail. Anything under 4.5:1 against the pane fails the smallest of those three, so {name} measures it here rather than letting you find out on the rail.',
  'privacy.source':   'The source is published, so the four lines above can be checked.',
  'states.lead':      'The Play screen shows one ordinary moment. The rest of what a launcher does is here, on its own route, so no screen has to prove that all of it exists at once.',
  'scenario.offline': '{name} cannot reach the version list. Anything already installed still launches.',
  'scenario.running': '{name} is hidden until the game exits.',
  'scenario.launching': 'The window can take a few seconds to appear. {name} will get out of the way.',
  'scenario.nojava':  'This version needs Java 8, which is not on this PC. {name} will fetch it and keep it for the other 1.8 instances.',
  'title.app':        '{name}',
  'title.screen':     '{name} \u00b7 {screen}'
};

export function t(key, vars) {
  var s = STRINGS[key];
  if (s === undefined) return '';
  return s.replace(/\{(\w+)\}/g, function (m, k) {
    if (vars && vars[k] !== undefined) return vars[k];
    if (k in BRAND) return BRAND[k];
    return m;
  });
}

/* Fill every branded element in a subtree. Called once at boot. ----------- */
export function applyBrand(root) {
  root = root || document;

  root.querySelectorAll('[data-brand]').forEach(function (el) {
    var k = el.getAttribute('data-brand');
    if (k === 'name') el.textContent = BRAND.name;
    else if (k === 'version') el.textContent = BRAND.version;
    else if (k === 'folder') el.textContent = BRAND.folder;
    else if (k === 'repo') el.textContent = BRAND.repo;
    else if (k === 'credential') el.textContent = BRAND.credential;
  });

  root.querySelectorAll('[data-path]').forEach(function (el) {
    var slug = el.getAttribute('data-path');
    slug = slug === '-' ? '' : slug;
    var form = el.getAttribute('data-path-form') || 'full';
    var full = instancePath(slug, 'full');
    el.textContent = instancePath(slug, form);
    if (form !== 'full') el.setAttribute('title', full);
    if (el.tagName === 'INPUT') { el.value = full; el.textContent = ''; }
  });

  root.querySelectorAll('[data-str]').forEach(function (el) {
    el.innerHTML = t(el.getAttribute('data-str'));
  });
}
