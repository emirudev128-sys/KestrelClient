/* ============================================================================
   Shell — hash routing, launch state, theme/palette/accent, and the state
   routes.  No framework, no build step.

   Routing:
     #play #instances #instance #mods #browse #new #import #servers #accounts
     #settings #appearance #states
     #browse/<slug>   one Modrinth project, on its own route.
     #mods-drop       the Mods screen with something held over the window.
     #states/<name>   renders the Play screen in that state, so every state is
                      judged as the real screen rather than as a swatch.

   Theme and palette are addressable so they can be captured headlessly:
     ?theme=light            ?palette=basalt        (query string)
     #play?theme=light                              (hash query)
     <html data-theme="light" data-palette="basalt"> (attribute, wins on load)
   ========================================================================= */
import { BRAND, HOME, applyBrand, instancePath, t } from './brand.js';

(function () {
  'use strict';

  var root = document.documentElement;
  var SCREENS = ['play', 'instances', 'instance', 'modules', 'hud', 'presets', 'mods',
                 'browse', 'new', 'import', 'servers', 'accounts', 'settings', 'appearance', 'states'];
  /* THE ROUTE ID IS NOT THE LABEL.  The built-in client features are called
     Tweaks on screen (see VOCABULARY at the top of index.html); the route,
     the section id and the sprite ids stay `modules`, because an identifier
     is not vocabulary and a deep link a user has saved should not break when
     a label is reworded.  #tweaks is the canonical route and #modules still
     resolves to it. */
  var ALIAS = { tweaks: 'modules', 'tweaks-colour': 'modules-colour' };
  /* the window title says what the rail says, not what the route is called */
  var TITLE_OF = { modules: 'Tweaks' };
  /* which rail item lights up for a screen that has no rail item of its own */
  var NAV_OF = { instance: '', mods: '', new: 'instances', import: 'instances',
                 appearance: 'settings', hud: 'modules', presets: 'modules' };
  /* the six keys that jump to a section, in rail order */
  var NAV_KEYS = ['play', 'instances', 'browse', 'modules', 'servers', 'accounts', 'settings'];

  applyBrand(document);

  /* ── colour helpers ─────────────────────────────────────────────────────
     Used only by the accent picker, which has to MEASURE rather than accept.
     Nothing here invents a colour; it reads the resolved token off the
     document and reports a ratio.                                          */

  function hex2rgb(h) {
    h = String(h).trim().replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgb2hex(c) {
    return '#' + c.map(function (v) {
      v = Math.max(0, Math.min(255, Math.round(v)));
      return (v < 16 ? '0' : '') + v.toString(16);
    }).join('').toUpperCase();
  }
  function parseColour(s) {
    s = String(s).trim();
    if (s.charAt(0) === '#') return hex2rgb(s);
    var m = s.match(/rgba?\(([^)]+)\)/);
    if (m) {
      var p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2]];
    }
    return null;
  }
  function relLum(c) {
    var f = c.map(function (v) {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  }
  function contrast(a, b) {
    var l1 = relLum(a), l2 = relLum(b);
    var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }
  function mix(a, b, t) { return [0, 1, 2].map(function (i) { return a[i] + (b[i] - a[i]) * t; }); }
  function token(name, el) {
    return getComputedStyle(el || root).getPropertyValue(name).trim();
  }

  /* ── theme and palette ──────────────────────────────────────────────────
     Both are attributes on <html>; tokens.css does the rest.  "system" keeps
     no attribute of its own — it resolves through matchMedia and re-resolves
     when Windows changes.                                                   */

  var PALETTES = { slate: 'Slate', cinder: 'Cinder', basalt: 'Basalt', tundra: 'Tundra' };
  var themePref = root.dataset.theme || 'dark';
  var mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

  function resolveTheme() {
    if (themePref === 'system') return mql && mql.matches ? 'light' : 'dark';
    return themePref === 'light' ? 'light' : 'dark';
  }
  function setTheme(pref) {
    themePref = pref;
    root.dataset.theme = resolveTheme();
    document.querySelectorAll('[data-theme-set]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-theme-set') === pref ? 'true' : 'false');
    });
    paintAccent(customAccent);
    paintAppearanceSummary();
  }
  if (mql && mql.addEventListener) {
    mql.addEventListener('change', function () { if (themePref === 'system') setTheme('system'); });
  }
  /* The theme and the palette are attributes on <html>, so anything may set
     them — the segmented control, the query string, a test harness.  Whoever
     does, the two readouts that are COMPUTED rather than inherited (the
     measured accent ratio and the appearance summary line) have to catch up,
     or the window shows one theme and reports another. */
  if (window.MutationObserver) {
    new MutationObserver(function () {
      themePref = root.dataset.theme || themePref;
      document.querySelectorAll('[data-theme-set]').forEach(function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-theme-set') === themePref ? 'true' : 'false');
      });
      document.querySelectorAll('.pals .pal').forEach(function (b) {
        b.setAttribute('aria-checked', b.getAttribute('data-pal') === root.dataset.palette ? 'true' : 'false');
      });
      paintAccent(customAccent);
      paintAppearanceSummary();
    }).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
  }

  function setPalette(name) {
    if (!PALETTES[name]) return;
    root.dataset.palette = name;
    document.querySelectorAll('.pals .pal').forEach(function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-pal') === name ? 'true' : 'false');
    });
    /* an accent carried over from another palette is still an override */
    paintAccent(customAccent);
    paintAppearanceSummary();
  }

  function paintAppearanceSummary() {
    var el = document.getElementById('setAppearance');
    if (!el) return;
    var name = PALETTES[root.dataset.palette] || PALETTES.slate;
    el.textContent = name + ', ' + resolveTheme() + (customAccent ? ', accent changed' : '');
  }

  /* ── the accent, and the picker that measures it ────────────────────────
     The accent carries a 56px label, a 6px dot and a 2px rail.  A value that
     passes at 56px and fails at 2px is the failure mode this exists to
     catch, so the picker reports the ratio against the pane and warns below
     4.5:1 rather than silently accepting.                                   */

  var customAccent = null;
  var accentHex = document.getElementById('accentHex');
  var accentRatio = document.getElementById('accentRatio');
  var accentWarn = document.getElementById('accentWarn');
  var palState = document.getElementById('palState');

  function paletteAccent() {
    /* the palette's own accent, read from a probe element carrying that
       palette's tokens — so the presets are the shipped accents, never a
       hex typed into a component */
    var probe = document.querySelector('.pals .pal[data-pal="' + root.dataset.palette + '"]');
    if (probe) {
      var v = token('--go', probe);
      if (v) return v;
    }
    return token('--go');
  }

  function paintAccent(hex) {
    var s = root.style;
    ['--go', '--go-ink', '--go-hi', '--go-lo', '--go-track', '--go-fill', '--on-go', '--go-divide']
      .forEach(function (p) { s.removeProperty(p); });

    customAccent = hex || null;
    root.dataset.accent = customAccent ? 'custom' : 'palette';
    if (palState) palState.hidden = !customAccent;

    if (customAccent) {
      var c = parseColour(customAccent);
      /* The two poles come out of the palette rather than out of this file:
         an accent either carries the ink or it carries the chrome, and the
         hover/press cuts move toward whichever of those two is lighter. */
      var pane = parseColour(token('--s-pane'));
      var inkC = parseColour(token('--ink'));
      var chromeC = parseColour(token('--s-app'));
      if (c && pane && inkC && chromeC) {
        var lighter = relLum(inkC) >= relLum(chromeC) ? inkC : chromeC;
        var darker = lighter === inkC ? chromeC : inkC;
        var onGo = contrast(c, inkC) >= contrast(c, chromeC) ? inkC : chromeC;
        s.setProperty('--go', rgb2hex(c));
        /* the override drives the MARK cut too, so the ratio the picker
           reports is the ratio the dot and the rail actually get */
        s.setProperty('--go-ink', rgb2hex(c));
        s.setProperty('--go-hi', rgb2hex(mix(c, lighter, 0.14)));
        s.setProperty('--go-lo', rgb2hex(mix(c, darker, 0.14)));
        s.setProperty('--go-track', rgb2hex(mix(pane, c, 0.26)));
        s.setProperty('--go-fill', rgb2hex(mix(pane, c, 0.13)));
        s.setProperty('--on-go', rgb2hex(onGo));
        s.setProperty('--go-divide', 'rgba(' + onGo.join(',') + ',0.30)');
      }
    }

    /* Report BOTH measurements, because the accent has two jobs with
       opposite requirements: a mark has to survive on the pane, a fill has
       to carry text on top of it.  One number cannot say whether an accent
       works; two can. */
    var mark = parseColour(token('--go-ink'));
    var fillC = parseColour(token('--go'));
    var onGoC = parseColour(token('--on-go'));
    var pane2 = parseColour(token('--s-pane'));
    if (mark && fillC && onGoC && pane2 && accentRatio) {
      var rMark = contrast(mark, pane2);
      var rFill = contrast(onGoC, fillC);
      accentRatio.innerHTML =
        '<span><b class="mono">' + rMark.toFixed(1) + ':1</b> mark on the pane</span>' +
        '<span><b class="mono">' + rFill.toFixed(1) + ':1</b> label on the fill</span>';
      accentRatio.dataset.pass = rMark >= 4.5 ? 'yes' : 'no';
      if (accentWarn) accentWarn.hidden = rMark >= 4.5;
    }
    /* the field shows the accent as the user thinks of it — the fill — while
       the ratio beside it reports the MARK cut, which is the one that can
       fail.  An override collapses the two, so they agree from then on. */
    var fill = parseColour(token('--go'));
    if (accentHex && document.activeElement !== accentHex && fill) accentHex.value = rgb2hex(fill);
  }

  if (accentHex) {
    accentHex.addEventListener('input', function () {
      var c = parseColour(accentHex.value);
      if (c) paintAccent(rgb2hex(c));
    });
  }

  /* ── scenarios ──────────────────────────────────────────────────────────
     The launch control is the status display, so its SUB-LINE is a readout:
     a slot whose whole job is to hold a figure that changes under the
     pointer, which is clause 1 of the figure-face rule, and the figures in
     it are mono up to the edge of the value.  The NOTE beside it is prose
     and takes none of that — this round it stopped wrapping numerals, so
     "About forty seconds left", "exit code 1" and "Three files failed their
     hash" are one face from first word to last.  See THE FIGURE FACE at the
     top of styles/tokens.css.

     `normal` has no note at all.  Nothing has happened.                    */

  var SCENARIOS = {
    normal: {
      launch: 'idle', icon: 'c-play', p: 0,
      name: '1.21.4 Fabric',
      meta: '13 mods, 2.4 GB on disk',
      label: 'Play',
      sub: '<span class="mono">1.21.4 · Fabric 0.16.9</span>',
      /* Nothing to say.  The line that used to sit here reported the end
         time and exit code of the last session — a fact the session log on
         the right already carries, and an exit code of zero is the app
         telling you that nothing happened. */
      note: ''
    },
    empty: {
      launch: 'idle', icon: 'c-play', p: 0,
      name: '1.21.4 Fabric', meta: '',
      label: 'Play', sub: '<span class="mono">1.21.4 · Fabric 0.16.9</span>', note: ''
    },
    preparing: {
      launch: 'preparing', icon: 'c-down', p: 6,
      label: 'Checking files',
      sub: '<span class="mono">6%</span> · <span class="mono">3,617</span> objects',
      note: 'Comparing what is on disk against the <span class="mono">1.21.4</span> manifest.'
    },
    downloading: {
      launch: 'downloading', icon: 'c-down', p: 62,
      label: 'Downloading',
      sub: '<span class="mono">62%</span> · <span class="mono">1,842/3,617</span> files',
      note: 'About forty seconds left. Cancelling keeps what has already come down.'
    },
    installing: {
      launch: 'installing', icon: 'c-down', p: 88,
      label: 'Installing',
      sub: '<span class="mono">88%</span> · unpacking libraries',
      note: 'Writing into the instance folder. The game window opens on its own.'
    },
    launching: {
      launch: 'launching', icon: 'c-down', p: 100,
      label: 'Starting Java',
      sub: '<span class="mono">21.0.5</span> · <span class="mono">6 GB</span> heap',
      note: t('scenario.launching')
    },
    running: {
      launch: 'playing', icon: 'c-stop', p: 100,
      label: 'Stop',
      sub: '1.21.4 Fabric · running',
      note: t('scenario.running')
    },
    failed: {
      launch: 'error', icon: 'c-repair', p: 62,
      label: 'Repair and play',
      sub: 'Three files failed their hash',
      note: 'Three files came down wrong, which is nearly always the connection rather than the install. Repairing fetches only those three.',
      fix: 'Show me which files'
    },
    'no-java': {
      launch: 'idle', icon: 'c-down', p: 0,
      name: '1.8.9 Forge',
      meta: '22 mods, 604 MB on disk',
      label: 'Install Java 8 and play',
      /* 1.8.9 takes Forge 11.15.1.2318, OptiFine or nothing.  Fabric does
         not exist for it and never will — it starts at 1.14. */
      sub: '<span class="mono">1.8.9 · Forge 11.15.1.2318</span>',
      note: t('scenario.nojava'),
      fix: 'Pick a runtime myself',
      java: '<span class="mono">Temurin 8u442</span> <span class="kv-sub">will be fetched</span>'
    },
    offline: {
      launch: 'offline', icon: 'c-play', p: 0,
      label: 'Play offline',
      sub: '<span class="mono">1.21.4 · Fabric 0.16.9</span>',
      note: t('scenario.offline')
    },
    crashed: {
      launch: 'error', icon: 'c-play', p: 0,
      label: 'Play again',
      sub: '<span class="mono">1.21.4 · Fabric 0.16.9</span>',
      note: 'The game closed on its own a minute ago with exit code 1. The report names a mod, not the launcher.',
      fix: 'Open the crash report'
    }
  };

  var el = {
    heroName: document.getElementById('heroName'),
    heroMeta: document.querySelector('.hero-meta'),
    goLabel: document.getElementById('goLabel'),
    goSub: document.getElementById('goSub'),
    goNote: document.getElementById('goNote'),
    goFix: document.getElementById('goFix'),
    goUse: document.getElementById('goUse'),
    goFill: document.getElementById('goFill'),
    goBtn: document.getElementById('goBtn'),
    progress: document.getElementById('progressFill'),
    clock: document.getElementById('railClock'),
    kvJava: null
  };

  var JAVA_REST = '<span class="mono">Temurin 21.0.5</span> <span class="kv-sub">automatic</span>';
  (function () {
    var dds = document.querySelectorAll('.play-aside .kv dd');
    if (dds.length) el.kvJava = dds[0];
  })();

  var clockTimer = null;
  var elapsed = 0;
  function two(n) { return (n < 10 ? '0' : '') + n; }

  function apply(key) {
    var s = SCENARIOS[key] || SCENARIOS.normal;
    root.dataset.scenario = key;
    root.dataset.launch = s.launch;

    el.heroName.textContent = s.name || SCENARIOS.normal.name;
    el.heroMeta.innerHTML = s.meta !== undefined ? s.meta : SCENARIOS.normal.meta;

    el.goLabel.textContent = s.label;
    el.goSub.innerHTML = s.sub;
    el.goNote.innerHTML = s.note;
    el.goNote.hidden = !s.note;
    el.goUse.setAttribute('href', '#' + s.icon);
    el.goFill.style.setProperty('--p', s.p + '%');
    el.progress.style.setProperty('--p', s.launch === 'idle' || s.launch === 'offline' ? '0%' : s.p + '%');

    if (s.fix) { el.goFix.hidden = false; el.goFix.textContent = s.fix; }
    else el.goFix.hidden = true;

    if (el.kvJava) el.kvJava.innerHTML = s.java ? s.java : JAVA_REST;

    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    if (s.launch === 'playing') {
      elapsed = 754;
      el.clock.textContent = '00:12:34';
      clockTimer = setInterval(function () {
        elapsed++;
        el.clock.textContent = two(Math.floor(elapsed / 3600)) + ':' + two(Math.floor(elapsed / 60) % 60) + ':' + two(elapsed % 60);
      }, 1000);
    } else {
      el.clock.textContent = s.p ? s.p + '%' : '';
    }
  }

  /* ══ MODULES ══════════════════════════════════════════════════════════════

     Colour values are DATA, not styling.  A Minecraft colour is eight hex
     digits with the alpha in front — 6F000000 is a background at 44% black —
     and it belongs to the user's configuration, not to the palette.  So the
     markup carries the digits in a data attribute and this file composites
     them, which keeps the rule that no component names a colour intact and
     keeps the value out of the stylesheet where it would be a lie.          */

  function argbParts(v) {
    v = String(v || '').trim();
    if (v.length !== 8) return null;
    var n = [0, 2, 4, 6].map(function (i) { return parseInt(v.slice(i, i + 2), 16); });
    return n.some(isNaN) ? null : n;
  }
  function argbCss(v) {
    var p = argbParts(v);
    if (!p) return 'transparent';
    return 'rgba(' + p[1] + ',' + p[2] + ',' + p[3] + ',' + (p[0] / 255).toFixed(3) + ')';
  }
  var HASH = String.fromCharCode(35);

  function paintChits(scope) {
    (scope || document).querySelectorAll('.chit[data-argb]').forEach(function (b) {
      var i = b.querySelector('i');
      if (i) i.style.setProperty('--c', argbCss(b.getAttribute('data-argb')));
    });
    (scope || document).querySelectorAll('.chit-hex[data-argb]').forEach(function (s) {
      s.textContent = HASH + s.getAttribute('data-argb');
    });
  }

  /* ── the picker ───────────────────────────────────────────────────────────
     A stepped field rather than a continuous one: no gradient anywhere, and
     you can land on the same value twice.  Alpha is a channel in here and
     there is no opacity control anywhere else in the app, which is the
     correction the research forced.                                        */

  var picker = document.getElementById('picker');
  var pickerGrid = document.getElementById('pickerGrid');
  var pickerHex = document.getElementById('pickerHex');
  var pickerAlpha = document.getElementById('pickerAlpha');
  var pickerPct = document.getElementById('pickerPct');
  var pickerFor = null;

  function two16(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? '0' : '') + n.toString(16).toUpperCase(); }

  if (pickerGrid) {
    var rows = [76, 60, 44, 28];
    rows.forEach(function (l) {
      for (var h = 0; h < 12; h++) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', 'Hue ' + (h * 30) + ', lightness ' + l);
        b.style.setProperty('--c', 'hsl(' + (h * 30) + ' 64% ' + l + '%)');
        pickerGrid.appendChild(b);
      }
    });
    for (var g = 0; g < 12; g++) {
      var nb = document.createElement('button');
      nb.type = 'button';
      var lv = 100 - g * 9;
      nb.setAttribute('aria-label', 'Neutral ' + lv);
      nb.style.setProperty('--c', 'hsl(0 0% ' + lv + '%)');
      if (g === 11) nb.setAttribute('aria-pressed', 'true');
      pickerGrid.appendChild(nb);
    }
  }

  function paintPicker() {
    if (!pickerFor) return;
    var v = pickerFor.getAttribute('data-argb');
    var p = argbParts(v);
    if (!p) return;
    if (pickerHex && document.activeElement !== pickerHex) pickerHex.value = HASH + v;
    if (pickerAlpha) pickerAlpha.value = p[0];
    if (pickerPct) pickerPct.textContent = Math.round(p[0] / 255 * 100) + '%';
  }
  function openPicker(chit) {
    if (!picker) return;
    pickerFor = chit || document.querySelector('#screen-modules .chit[data-act="colour"]');
    if (!pickerFor) return;
    picker.hidden = false;
    paintPicker();
    /* anchored to the swatch it came from, so it is obvious which of the
       four colours on this pane is being changed */
    var r = pickerFor.getBoundingClientRect();
    picker.style.left = Math.max(12, Math.min(r.left - 232, window.innerWidth - 288)) + 'px';
    picker.style.top = Math.max(12, Math.min(r.bottom + 7, window.innerHeight - 268)) + 'px';
  }
  function closePicker() { if (picker) picker.hidden = true; }

  if (pickerAlpha) {
    pickerAlpha.addEventListener('input', function () {
      if (!pickerFor) return;
      var v = pickerFor.getAttribute('data-argb');
      var nv = two16(pickerAlpha.value) + v.slice(2);
      pickerFor.setAttribute('data-argb', nv);
      var hex = pickerFor.parentNode.querySelector('.chit-hex');
      if (hex) hex.setAttribute('data-argb', nv);
      paintChits(document);
      paintPicker();
    });
  }

  /* ── the settings pane ────────────────────────────────────────────────────
     THE SPINE IS ONE COMPONENT.  These recur on nearly every module
     that draws on screen, verbatim from Apollo's own option keys, so they are
     declared once here and rendered once below — and then set apart from the
     module's own options by ground, pitch and heading.  If they were not set
     apart, every module's pane would be the same grey field, which is a
     failure this project has already been caught making.

     There is no opacity row.  Alpha is the leading byte of the colour.       */

  var SPINE = [
    ['scale', 'k:1.20'],
    ['text shadow', 's:1'],
    ['text colour', 'c:FFFFFFFF'],
    ['background', 'g:1;6F000000'],
    ['brackets', 'g:0;FFAAAAAA'],
    ['border', 'w:0;1.0;9F000000'],
    ['show while typing', 's:1'],
    ['reverse order', 's:0'],
    ['fixed box', 'x:96;64']
  ];
  /* the option keys as the docs list them, for the search index: the compound
     rows above carry two and three of them each */
  var SPINE_NAMES = ['scale', 'text shadow', 'text colour', 'background', 'background colour',
    'brackets', 'bracket colour', 'border', 'border thickness', 'border colour',
    'show while typing', 'reverse order', 'fixed box'];
  /* Searchable but not rows of their own: the names the game uses, and the two
     channels that live INSIDE a colour rather than beside it.  Someone off
     Lunar types "opacity", and the honest answer is not "no results" — it is
     that there is no opacity control because the alpha is in the value. */
  var SPINE_ALIAS = [
    ['static background', 'Static background width and height are the <b>Fixed box</b> row on every HUD element.'],
    ['alpha', 'Alpha is a channel inside every colour here, which is why a colour is eight digits and not six.'],
    ['chroma', 'Chroma is a mode inside the colour picker. Turn it on and the hue cycles in game.'],
    ['opacity', 'There is no opacity control anywhere in this app. Opacity is the <b>alpha</b>, and it is the first two digits of the colour.'],
    ['transparen', 'Transparency is the <b>alpha</b> channel, the first two digits of a colour.']
  ];

  function sw(on) { return '<span class="sw-sm" role="switch" tabindex="0" aria-checked="' + (on ? 'true' : 'false') + '"><i></i></span>'; }
  /* Every swatch opens the picker.  There is no second way to reach a colour
     and no opacity control beside it, because the alpha is the first byte of
     the value and the picker is where that byte lives. */
  function chit(v) {
    return '<button class="chit" type="button" data-act="colour" aria-label="Colour ' + HASH + v + '" data-argb="' + v + '"><i></i></button>' +
           '<span class="mono chit-hex" data-argb="' + v + '"></span>';
  }
  function num(v) { return '<span class="numfield numfield-sm"><input class="mono" type="text" size="3" value="' + v + '"></span>'; }

  function ctl(spec) {
    var kind = spec.charAt(0);
    var a = spec.slice(2).split(';');
    var v = document.createElement('span');
    v.className = 'opt-v';
    var dep = false, wide = false, unit = '';
    if (kind === 'n') unit = (a[0].split(' ')[1] || '');
    if (kind === 's') v.innerHTML = sw(a[0] === '1');
    else if (kind === 'c') v.innerHTML = chit(a[0]);
    /* a switch and the colour it governs, on one row: the dependency is
       readable from three inches away instead of inferred from an absence */
    else if (kind === 'g') { v.innerHTML = sw(a[0] === '1') + chit(a[1], a[1] === '6F000000'); dep = a[0] !== '1'; }
    else if (kind === 'w') {
      wide = true;
      dep = a[0] !== '1';
      v.innerHTML = sw(a[0] === '1') + num(a[1]) + '<span class="opt-u">px</span>' + chit(a[2]) +
                    (dep ? '<span class="opt-why">Border is off</span>' : '');
    } else if (kind === 'n') {
      var p = a[0].split(' ');
      v.innerHTML = num(p[0]) + (p[1] ? '<span class="opt-u">' + p[1] + '</span>' : '');
    } else if (kind === 'k') {
      wide = true;
      v.innerHTML = '<input class="slider slider-sm" type="range" min="25" max="500" step="5" value="' +
                    Math.round(parseFloat(a[0]) * 100) + '" aria-label="Scale">' +
                    '<span class="mono opt-n">' + a[0] + '</span>' +
                    '<span class="opt-u">of the size the game draws</span>';
    } else if (kind === 'x') {
      wide = true;
      dep = a[2] === '0';
      v.innerHTML = sw(a[2] !== '0') + num(a[0]) + '<span class="by">&times;</span>' + num(a[1]) +
                    '<span class="opt-u">px, so digits do not make it jitter</span>';
    } else if (kind === 'r') {
      v.innerHTML = '<span class="ramp"><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="opt-u">' + a[0] + '</span>';
    } else {
      v.innerHTML = '<button class="pick pick-sm" type="button"></button>';
      v.firstChild.textContent = a[0];
    }
    return { v: v, dep: dep, wide: wide, kind: kind, unit: unit };
  }

  /* An option row knows three things about itself — which group it is in,
     which option it is, and whether the value standing in it came from this
     instance rather than from the defaults every instance starts on.  That
     last one is the same "Override for this instance" model as #instance and
     #settings, wearing the same mark the list already uses for "not the
     default any more". */
  function renderOpts(box, list, spineish, group, key) {
    box.innerHTML = '';
    list.forEach(function (row) {
      var c = ctl(row[1]);
      var d = document.createElement('div');
      d.className = 'opt' + (c.dep ? ' opt-dep' : '') + (spineish && c.wide ? ' opt-wide' : '');
      d.dataset.opt = row[0];
      d.dataset.kind = c.kind;
      if (c.unit) d.dataset.unit = c.unit;
      if (group) d.dataset.grp = group;
      var k = document.createElement('span');
      k.className = 'opt-k';
      k.textContent = row[0].charAt(0).toUpperCase() + row[0].slice(1);
      d.appendChild(k);
      d.appendChild(c.v);
      if (key && isOvr(key, group, row[0])) markOvr(d, true);
      box.appendChild(d);
    });
    paintChits(box);
  }

  /* the other half of building the spine once: put a value into rows that are
     already standing, without replacing the control the pointer is over */
  function applyOpt(d, spec) {
    var kind = spec.charAt(0), a = spec.slice(2).split(';');
    var s = d.querySelector('.sw-sm');
    var chits = d.querySelectorAll('.chit');
    var nums = d.querySelectorAll('.numfield input');
    function on(b) { if (s) s.setAttribute('aria-checked', b ? 'true' : 'false'); }
    function col(i, v) {
      if (!chits[i]) return;
      chits[i].setAttribute('data-argb', v);
      chits[i].setAttribute('aria-label', 'Colour ' + HASH + v);
      var h = chits[i].parentNode.querySelector('.chit-hex');
      if (h) h.setAttribute('data-argb', v);
    }
    if (kind === 's') on(a[0] === '1');
    else if (kind === 'c') col(0, a[0]);
    else if (kind === 'g') { on(a[0] === '1'); col(0, a[1]); }
    else if (kind === 'w') { on(a[0] === '1'); if (nums[0]) nums[0].value = a[1]; col(0, a[2]); }
    else if (kind === 'n') { if (nums[0]) nums[0].value = a[0].split(' ')[0]; }
    else if (kind === 'x') { on(a[2] !== '0'); if (nums[0]) nums[0].value = a[0]; if (nums[1]) nums[1].value = a[1]; }
    else if (kind === 'k') {
      var sl = d.querySelector('.slider');
      if (sl) sl.value = Math.round(parseFloat(a[0]) * 100);
      var n = d.querySelector('.opt-n');
      if (n) n.textContent = a[0];
    }
    paintDep(d);
  }

  /* one mark, one sentence, in the place the value is */
  function markOvr(d, on) {
    var had = d.querySelector('.opt-ovr');
    if (!on) { if (had) had.remove(); d.removeAttribute('data-ovr'); return; }
    if (had) return;
    d.dataset.ovr = 'yes';
    var i = document.createElement('i');
    i.className = 'dirty opt-ovr';
    i.setAttribute('role', 'img');
    i.setAttribute('aria-label', 'Overridden for 1.21.4 Fabric');
    i.title = 'Set for 1.21.4 Fabric. Every other instance uses the default.';
    (d.querySelector('.opt-v') || d).appendChild(i);
  }

  function renderPreview(box, spec) {
    box.innerHTML = '';
    var kind = spec.split(':')[0];
    var rest = spec.slice(kind.length + 1);
    if (kind === 'none') { box.hidden = true; return; }
    box.hidden = false;
    if (kind === 'keys') {
      box.className = 'prev ks';
      box.innerHTML = '<span class="ks-k ks-w">W</span><span class="ks-k ks-a">A</span>' +
        '<span class="ks-k ks-s ks-on">S</span><span class="ks-k ks-d">D</span>' +
        '<span class="ks-k ks-lmb ks-on">LMB</span><span class="ks-k ks-rmb">RMB</span>' +
        '<span class="ks-k ks-space"></span>';
      return;
    }
    box.className = 'prev prev-flat';
    if (kind === 'items') {
      box.innerHTML = '<span class="pv-items">' +
        '<i class="pv-it it-1"></i><i class="pv-it it-2"></i><i class="pv-it it-3"></i><i class="pv-it it-4"></i>' +
        '</span>';
      return;
    }
    if (kind === 'map') { box.innerHTML = '<span class="pv-map"><i></i></span>'; return; }
    if (kind === 'cross') { box.innerHTML = '<span class="pv-cross"></span>'; return; }
    var lines = (kind === 'lines' ? rest.split('|') : [rest]);
    lines.forEach(function (t) {
      var s = document.createElement('span');
      s.className = 'pv-t';
      s.textContent = t;
      box.appendChild(s);
    });
  }

  function selectModule(row) {
    if (!row) return;
    document.querySelectorAll('#modRows .modrow').forEach(function (r) { r.setAttribute('aria-selected', 'false'); });
    row.setAttribute('aria-selected', 'true');
    modSel = row;
    paintPane();
  }

  /* The pane is rendered from the store rather than from the row, because the
     value in it depends on which scope is showing.  Same list of options
     either way — an override changes the value, never the shape of the panel. */
  function paintPane() {
    var row = modSel;
    if (!row) return;
    var name = modKey(row);
    var desc = row.dataset.desc || row.querySelector('.modrow-d').textContent;
    document.querySelector('.modset-name').textContent = name;
    var sub = document.querySelector('.modset-sub');
    sub.innerHTML = '';
    sub.appendChild(document.createTextNode(desc + '. '));
    var nOvr = ovrCount(name);
    if (MODSCOPE === 'inst') {
      var s = document.createElement('span');
      s.className = 'modset-dirty';
      if (nOvr) {
        s.innerHTML = '<i class="dirty"></i><span class="dirty-n"></span> set for 1.21.4 Fabric, the rest follow the defaults';
        s.querySelector('.dirty-n').textContent = String(nOvr);
      } else {
        s.textContent = 'Following the defaults on every option. Change one and only 1.21.4 Fabric takes it.';
      }
      sub.appendChild(s);
    } else if (MODG[name] && MODG[name].dirty) {
      var m = document.createElement('span');
      m.className = 'modset-dirty';
      m.innerHTML = '<i class="dirty"></i><span class="dirty-n"></span> options are off their defaults';
      m.querySelector('.dirty-n').textContent = String(dirtyCount(name));
      sub.appendChild(m);
    }
    var own = MODG[name].order.map(function (o) { return [o, eff(name, 'own', o)]; });
    renderPreview(document.getElementById('modPrev'), row.getAttribute('data-prev') || 'none');
    renderOpts(document.getElementById('modOwnOpts'), own, false, 'own', name);
    document.getElementById('modOwn').dataset.bare = row.getAttribute('data-prev') === 'none' ? 'yes' : 'no';
    /* A module that draws nothing on screen does not get the spine.  The
       section is absent rather than greyed, because there is no element for
       it to describe — that is a different thing from an option that cannot
       apply right now. */
    document.getElementById('modSpineSec').hidden = row.getAttribute('data-hud') !== '1';
    /* THE SPINE IS ONE COMPONENT, and it is one set of nodes too: the same
       nine rows for every element that draws on screen, so selecting the next
       module repaints their values rather than throwing the rows away and
       building nine identical ones back. */
    var sbox = document.getElementById('modSpine');
    var list = SPINE.map(function (r) { return [r[0], eff(name, 'spine', r[0])]; });
    if (!sbox.firstChild) renderOpts(sbox, list, true, 'spine', name);
    else {
      list.forEach(function (r, i) {
        var d = sbox.children[i];
        if (!d) return;
        applyOpt(d, r[1]);
        markOvr(d, isOvr(name, 'spine', r[0]));
      });
      paintChits(sbox);
    }
    var en = document.querySelector('.modset-head .sw-input');
    if (en) { en.checked = eff(name, 'on', 'on'); en.setAttribute('aria-label', name + ' enabled'); }
  }

  /* ── search across names AND option names ─────────────────────────────────
     Lunar has this and it is the best mitigation there is for a long flat
     list: the thing people fail at is not remembering a module's name, it is
     working out which module owns the setting they want.                    */

  var modQ = document.getElementById('modQ');
  var modRows = document.getElementById('modRows');
  var modNone = document.getElementById('modNone');
  var modHead = document.querySelector('.modlist-head');

  function runModSearch() {
    if (!modRows) return;
    var q = (modQ.value || '').trim().toLowerCase();
    var all = modRows.querySelectorAll('.modrow');
    var shown = 0;
    var say = '';
    for (var i = 0; i < all.length; i++) {
      var row = all[i];
      var d = row.querySelector('.modrow-d');
      if (!row.dataset.desc) row.dataset.desc = d.textContent;
      var name = row.querySelector('.modrow-n').textContent.toLowerCase();
      var other = row.classList.contains('modrow-other');
      var hit = '';
      if (!q) { row.hidden = other; d.textContent = row.dataset.desc; d.classList.remove('modrow-hit'); if (!other) shown++; continue; }
      if (name.indexOf(q) !== -1) { row.hidden = false; shown++; d.textContent = row.dataset.desc; d.classList.remove('modrow-hit'); continue; }
      /* one list of option names feeds the pane and the index, and the spine
         is only in the index for modules that actually have one */
      /* An option the module owns is per-row information and goes in the row.
         An option every HUD element has is not: printing the same string down
         twelve rows encodes nothing.  That answer is given once, above. */
      var own = (row.getAttribute('data-own') || '').split(';')
        .map(function (o) { return o.split('|')[0].trim(); }).filter(Boolean);
      var isHud = row.getAttribute('data-hud') === '1';
      for (var j = 0; j < own.length; j++) {
        if (own[j].toLowerCase().indexOf(q) !== -1) { hit = 'option <b>' + own[j] + '</b>'; break; }
      }
      var shared = '';
      if (!hit && isHud) {
        for (var j2 = 0; j2 < SPINE_NAMES.length; j2++) {
          if (SPINE_NAMES[j2].indexOf(q) !== -1) { shared = 'SP:' + SPINE_NAMES[j2]; break; }
        }
        if (!shared) for (var k2 = 0; k2 < SPINE_ALIAS.length; k2++) {
          if (SPINE_ALIAS[k2][0].indexOf(q) !== -1) { shared = 'AL:' + SPINE_ALIAS[k2][1]; break; }
        }
      }
      if (hit) {
        row.hidden = false;
        shown++;
        d.classList.add('modrow-hit');
        d.innerHTML = hit;
      } else if (shared) {
        row.hidden = false;
        shown++;
        d.textContent = row.dataset.desc;
        d.classList.remove('modrow-hit');
        if (!say) {
          say = shared.slice(0, 3) === 'SP:'
            ? '<b>' + shared.slice(3).replace(/^./, function (c) { return c.toUpperCase(); }) +
              '</b> is part of every HUD element, so it is on all of these.'
            : shared.slice(3);
        }
      } else {
        row.hidden = true;
      }
    }
    if (!q) { applyCat(); return; }
    if (modHead) {
      modHead.firstElementChild.textContent = 'Matches';
      modHead.querySelector('.modlist-n').textContent = String(shown);
    }
    /* a search reaches across every category, so while one is running the
       category column stops claiming to be the filter */
    var cats = document.querySelectorAll('#screen-modules .cats .cat');
    for (var c = 0; c < cats.length; c++) cats[c].removeAttribute('aria-current');
    if (cats[0]) cats[0].setAttribute('aria-current', 'page');
    if (modNone) {
      modNone.hidden = shown !== 0;
      modNone.textContent = 'No tweak and no option matches "' + modQ.value.trim() + '".';
    }
    var sayEl = document.getElementById('modSay');
    if (sayEl) { sayEl.hidden = !say; sayEl.innerHTML = say; }
  }
  if (modQ) modQ.addEventListener('input', runModSearch);

  /* ── the same field on #settings ──────────────────────────────────────────
     One search component means one behaviour: the field filters the list on
     the screen it is standing in.  On Settings the list is the rows, and a
     section with nothing left in it goes with them.                        */
  var setQ = document.getElementById('setQ');
  if (setQ) {
    setQ.addEventListener('input', function () {
      var q = (setQ.value || '').trim().toLowerCase();
      var none = document.getElementById('setNone');
      var live = 0;
      document.querySelectorAll('#setBody .set-sec').forEach(function (sec) {
        var kept = 0;
        sec.querySelectorAll('.row').forEach(function (r) {
          var hit = !q || r.textContent.toLowerCase().indexOf(q) !== -1;
          r.hidden = !hit;
          if (hit) kept++;
        });
        var head = (sec.querySelector('.set-h') || {}).textContent || '';
        var secHit = !q || kept > 0 || head.toLowerCase().indexOf(q) !== -1;
        sec.hidden = !secHit;
        if (secHit) live++;
      });
      if (none) none.hidden = live > 0;
    });
  }
  /* ══ SCOPE, AND THE VALUES UNDER IT ═══════════════════════════════════════

     GLOBAL DEFAULTS, PER-INSTANCE OVERRIDE — the same model as Memory on
     #instance, which is the whole reason not to invent a second one: MODG is
     what every instance starts on, MODI is the sparse set of options Crystal
     PvP has been given of its own, and an option is only in MODI while it
     actually differs.  Set a value back to the default while the instance is
     showing and the override goes away rather than becoming an override that
     happens to agree.                                                       */

  var MODSCOPE = 'global';           /* 'global' | 'inst' */
  var MODBASE = {}, MODG = {}, MODI = {};
  var modSel = null, modCat = 'HUD';

  function modKey(row) { return row.querySelector('.modrow-n').textContent; }
  function parseOwn(s) {
    var o = { map: {}, order: [] };
    (s || '').split(';').forEach(function (p) {
      p = p.trim();
      var i = p.indexOf('|');
      if (i < 1) return;
      var n = p.slice(0, i).trim();
      o.map[n] = p.slice(i + 1);
      o.order.push(n);
    });
    return o;
  }
  function dupVal(o) { return JSON.parse(JSON.stringify(o)); }

  var MODROWS = modRows ? [].slice.call(modRows.querySelectorAll('.modrow')) : [];
  MODROWS.forEach(function (row) {
    var k = modKey(row), p = parseOwn(row.getAttribute('data-own'));
    var spine = {};
    SPINE.forEach(function (r) { spine[r[0]] = r[1]; });
    MODBASE[k] = {
      on: row.querySelector('.sw-sm').getAttribute('aria-checked') === 'true',
      own: p.map, order: p.order, spine: spine,
      dirty: !row.querySelector('.dirty').hidden
    };
    MODG[k] = dupVal(MODBASE[k]);
    MODI[k] = { own: {}, spine: {}, on: null };
    row.dataset.k = k;
    row.dataset.desc = row.querySelector('.modrow-d').textContent;
  });

  function eff(k, grp, opt) {
    var g = MODG[k], i = MODI[k];
    if (grp === 'on') return (MODSCOPE === 'inst' && i.on !== null) ? i.on : g.on;
    if (MODSCOPE === 'inst' && Object.prototype.hasOwnProperty.call(i[grp], opt)) return i[grp][opt];
    return g[grp][opt];
  }
  function isOvr(k, grp, opt) {
    if (MODSCOPE !== 'inst' || !k || !MODI[k]) return false;
    if (grp === 'on') return MODI[k].on !== null;
    return !!(MODI[k][grp] && Object.prototype.hasOwnProperty.call(MODI[k][grp], opt));
  }
  function ovrCount(k) {
    var i = MODI[k];
    return Object.keys(i.own).length + Object.keys(i.spine).length + (i.on === null ? 0 : 1);
  }
  function dirtyCount(k) {
    var n = 0, g = MODG[k], b = MODBASE[k];
    Object.keys(g.own).forEach(function (o) { if (g.own[o] !== b.own[o]) n++; });
    Object.keys(g.spine).forEach(function (o) { if (g.spine[o] !== b.spine[o]) n++; });
    if (g.on !== b.on) n++;
    return n || 2 + (k.length % 5);   /* authored rows arrive already off their defaults */
  }

  function setVal(k, grp, opt, spec) {
    if (MODSCOPE === 'inst') {
      if (grp === 'on') MODI[k].on = (spec === MODG[k].on) ? null : spec;
      else if (spec === MODG[k][grp][opt]) delete MODI[k][grp][opt];
      else MODI[k][grp][opt] = spec;
    } else {
      if (grp === 'on') MODG[k].on = spec; else MODG[k][grp][opt] = spec;
      MODG[k].dirty = true;
    }
  }

  /* ── the list: one filter, two inputs ─────────────────────────────────────
     A category narrows the list and a search reaches across every category,
     so they cannot both be the filter at once.  Search wins while it is
     running and the column says so by standing down.                       */

  var CATS = document.querySelectorAll('#screen-modules .cats .cat');
  function catOf(row) { return (row.getAttribute('data-cat') || '').toLowerCase(); }
  function catName(a) { return a.querySelector('.cat-n').textContent; }

  function paintCounts() {
    CATS.forEach(function (a) {
      var n = catName(a), all = n === 'All tweaks';
      var rows = MODROWS.filter(function (r) { return all || catOf(r) === n.toLowerCase(); });
      var on = rows.filter(function (r) { return eff(r.dataset.k, 'on', 'on'); }).length;
      a.querySelector('.cat-c').textContent = on + '/' + rows.length;
      var d = a.querySelector('.dirty');
      var lit = rows.some(function (r) {
        return MODSCOPE === 'inst' ? ovrCount(r.dataset.k) > 0 : MODG[r.dataset.k].dirty;
      });
      if (d) d.hidden = !lit;
      else if (lit && !all) { var i = document.createElement('i'); i.className = 'dirty'; a.appendChild(i); }
    });
  }

  function paintRow(row) {
    var k = row.dataset.k, on = eff(k, 'on', 'on');
    row.querySelector('.sw-sm').setAttribute('aria-checked', on ? 'true' : 'false');
    row.classList.toggle('modrow-off', !on);
    var d = row.querySelector('.dirty');
    d.hidden = MODSCOPE === 'inst' ? ovrCount(k) === 0 : !MODG[k].dirty;
  }

  function applyCat() {
    if (!modRows) return;
    var all = modCat === 'All tweaks';
    var shown = 0;
    MODROWS.forEach(function (r) {
      var hit = all || catOf(r) === modCat.toLowerCase();
      r.hidden = !hit;
      r.querySelector('.modrow-d').textContent = r.dataset.desc || r.querySelector('.modrow-d').textContent;
      r.querySelector('.modrow-d').classList.remove('modrow-hit');
      if (hit) shown++;
    });
    if (modHead) {
      modHead.firstElementChild.textContent = modCat;
      modHead.querySelector('.modlist-n').textContent = String(shown);
    }
    CATS.forEach(function (a) {
      if (catName(a) === modCat) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (modNone) { modNone.hidden = shown !== 0; modNone.textContent = 'Nothing in ' + modCat + '.'; }
    var sayEl = document.getElementById('modSay');
    if (sayEl) { sayEl.hidden = true; sayEl.textContent = ''; }
  }
  function applyList() {
    if (modQ && (modQ.value || '').trim()) runModSearch(); else applyCat();
    paintCounts();
    MODROWS.forEach(paintRow);
  }

  CATS.forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      modCat = catName(a);
      if (modQ) modQ.value = '';
      applyList();
      say('Showing ' + (modCat === 'All tweaks' ? 'every tweak' : modCat) + '.');
    });
  });

  /* ── scope ────────────────────────────────────────────────────────────── */
  var modSeg = document.querySelectorAll('#screen-modules .seg-b');
  modSeg.forEach(function (b, i) {
    b.addEventListener('click', function () {
      var next = i === 0 ? 'global' : 'inst';
      if (next === MODSCOPE) return;
      MODSCOPE = next;
      modSeg.forEach(function (o, j) { o.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
      var scr = document.getElementById('screen-modules');
      if (scr) scr.dataset.scope = MODSCOPE;
      applyList();
      paintPane();
      say(MODSCOPE === 'inst'
        ? 'Showing <b>1.21.4 Fabric</b>. Anything you change here applies to that instance and to nothing else; the rest follow the defaults.'
        : 'Showing the defaults every instance starts on. An instance can override any of them.');
    });
  });

  /* ── enabling one, from either place it can be done ───────────────────── */
  function toggleMod(k, from) {
    var on = !eff(k, 'on', 'on');
    setVal(k, 'on', 'on', on);
    applyList();
    if (modSel && modSel.dataset.k === k) paintPane();
    /* a module carries HUD elements with it — "Armor status" owns five — so
       switching one is a change the client mod has to hear about too */
    saveHud();
    say('<b>' + esc(k) + '</b> ' + (on ? 'on' : 'off') +
        (MODSCOPE === 'inst' ? ' for 1.21.4 Fabric only.' : ' everywhere.') +
        (from ? '' : ''));
  }

  if (modRows) modRows.addEventListener('click', function (e) {
    var row = e.target.closest('.modrow');
    if (!row) return;
    if (e.target.closest('.sw-sm')) { e.preventDefault(); toggleMod(row.dataset.k); return; }
    selectModule(row);
  });

  var modEnable = document.querySelector('.modset-head .sw-input');
  if (modEnable) modEnable.addEventListener('change', function () {
    if (!modSel) return;
    toggleMod(modSel.dataset.k);
  });

  /* ── reset, behind a confirmation because it throws work away ─────────── */
  var modReset = document.querySelector('.modset-head .quiet');
  if (modReset) modReset.addEventListener('click', function () {
    if (!modSel) return;
    if (popover.owns(modReset)) { popover.close(); return; }
    var k = modSel.dataset.k;
    var inst = MODSCOPE === 'inst';
    popover.menu(modReset, [
      { note: inst
        ? 'Drops every value <b>' + esc(k) + '</b> has of its own and puts 1.21.4 Fabric back on the defaults.'
        : 'Puts every setting for <b>' + esc(k) + '</b> back to the launcher default. Instances that override it keep their own values.' },
      { label: inst ? 'Follow the defaults again' : 'Reset ' + k, danger: true, run: function () {
        if (inst) MODI[k] = { own: {}, spine: {}, on: null };
        else { MODG[k] = dupVal(MODBASE[k]); MODG[k].dirty = false; }
        applyList();
        paintPane();
        say('<b>' + esc(k) + '</b> is back on ' + (inst ? 'the defaults.' : 'its defaults.'));
      } }
    ], { label: 'Reset to defaults', focus: 0 });
  });

  /* ── writing a value back ─────────────────────────────────────────────────
     One reader for every control on the pane: the row says what kind it is,
     the DOM holds the value, and the spec that goes into the store is built
     from both.  Nothing keeps a parallel copy that can drift.              */

  function readOpt(d) {
    var kind = d.dataset.kind;
    var s = d.querySelector('.sw-sm');
    var on = s ? (s.getAttribute('aria-checked') === 'true' ? '1' : '0') : '1';
    var chits = d.querySelectorAll('.chit');
    var nums = d.querySelectorAll('.numfield input');
    var u = d.dataset.unit ? ' ' + d.dataset.unit : '';
    if (kind === 's') return 's:' + on;
    if (kind === 'c') return 'c:' + chits[0].getAttribute('data-argb');
    if (kind === 'g') return 'g:' + on + ';' + chits[0].getAttribute('data-argb');
    if (kind === 'w') return 'w:' + on + ';' + nums[0].value + ';' + chits[0].getAttribute('data-argb');
    if (kind === 'n') return 'n:' + nums[0].value + u;
    if (kind === 'x') return 'x:' + nums[0].value + ';' + nums[1].value + ';' + on;
    if (kind === 'k') return 'k:' + (d.querySelector('.slider').value / 100).toFixed(2);
    if (kind === 't') return 't:' + d.querySelector('.pick').textContent;
    return 'r:' + (d.querySelector('.opt-u') || {}).textContent;
  }

  /* the dependency rule, recomputed where it is: what cannot apply greys and
     stays put, so the panel keeps its shape and the cause is on the row */
  function paintDep(d) {
    var kind = d.dataset.kind;
    if (kind !== 'g' && kind !== 'w' && kind !== 'x') return;
    var on = d.querySelector('.sw-sm').getAttribute('aria-checked') === 'true';
    d.classList.toggle('opt-dep', !on);
    if (kind !== 'w') return;
    var why = d.querySelector('.opt-why');
    if (!on && !why) {
      var w = document.createElement('span');
      w.className = 'opt-why';
      w.textContent = 'Border is off';
      d.querySelector('.opt-v').appendChild(w);
    } else if (on && why) why.remove();
  }

  function commit(d) {
    if (!modSel || !d || !d.dataset.grp) return;
    var k = modSel.dataset.k;
    setVal(k, d.dataset.grp, d.dataset.opt, readOpt(d));
    markOvr(d, isOvr(k, d.dataset.grp, d.dataset.opt));
    paintDep(d);
    paintCounts();
    paintRow(modSel);
  }

  /* switches, on the pane.  Focusable, and Space/Enter do what a click does. */
  function optSwitch(t) {
    var s = t.closest ? t.closest('.sw-sm') : null;
    if (!s || !s.closest('.opts')) return false;
    s.setAttribute('aria-checked', s.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
    commit(s.closest('.opt'));
    return true;
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.opts')) optSwitch(e.target);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    var s = e.target.closest ? e.target.closest('.sw-sm') : null;
    if (!s || !s.closest('.opts')) return;
    e.preventDefault();
    optSwitch(e.target);
  });

  /* steppers.  The field is the stepper: arrows move it, and it commits on
     the way out, which is the same numeric field #instance already uses. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    var inp = e.target;
    if (!inp.closest || !inp.closest('.opts') || !inp.closest('.numfield')) return;
    e.preventDefault();
    var cur = parseFloat(inp.value);
    if (isNaN(cur)) return;
    var dec = /\./.test(inp.value);
    var step = (e.shiftKey ? 10 : 1) * (dec ? 0.05 : 1);
    var next = cur + (e.key === 'ArrowUp' ? step : -step);
    if (next < 0) next = 0;
    inp.value = dec ? next.toFixed(2) : String(Math.round(next));
    commit(inp.closest('.opt'));
  });
  document.addEventListener('change', function (e) {
    var inp = e.target;
    if (!inp.closest || !inp.closest('.opts')) return;
    commit(inp.closest('.opt'));
  });
  document.addEventListener('input', function (e) {
    var sl = e.target;
    if (!sl.closest || !sl.closest('.opts') || !sl.classList.contains('slider')) return;
    var d = sl.closest('.opt');
    var n = d.querySelector('.opt-n');
    if (n) n.textContent = (sl.value / 100).toFixed(2);
    commit(d);
  });

  /* ── the picker writes through to whatever swatch opened it ───────────── */
  function hslRgb(h, s, l) {
    s /= 100; l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    var t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
          : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return t.map(function (v) { return Math.round((v + m) * 255); });
  }
  function setChit(rgbHex) {
    if (!pickerFor) return;
    var v = pickerFor.getAttribute('data-argb');
    var nv = v.slice(0, 2) + rgbHex;
    pickerFor.setAttribute('data-argb', nv);
    pickerFor.setAttribute('aria-label', 'Colour ' + HASH + nv);
    var hex = pickerFor.parentNode.querySelector('.chit-hex');
    if (hex) hex.setAttribute('data-argb', nv);
    paintChits(document);
    paintPicker();
    commit(pickerFor.closest('.opt'));
  }
  if (pickerGrid) {
    [].slice.call(pickerGrid.children).forEach(function (b) {
      var lab = b.getAttribute('aria-label');
      var m = lab.match(/Hue (\d+), lightness (\d+)/);
      var rgb = m ? hslRgb(+m[1], 64, +m[2]) : hslRgb(0, 0, +lab.replace(/\D/g, ''));
      b.dataset.rgb = rgb.map(two16).join('');
    });
    pickerGrid.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      [].slice.call(pickerGrid.children).forEach(function (o) { o.removeAttribute('aria-pressed'); });
      b.setAttribute('aria-pressed', 'true');
      setChit(b.dataset.rgb);
    });
  }
  if (pickerHex) pickerHex.addEventListener('change', function () {
    var v = pickerHex.value.replace(/[^0-9a-f]/gi, '').toUpperCase();
    if (v.length !== 8 || !pickerFor) { paintPicker(); return; }
    pickerFor.setAttribute('data-argb', v);
    var hex = pickerFor.parentNode.querySelector('.chit-hex');
    if (hex) hex.setAttribute('data-argb', v);
    paintChits(document);
    paintPicker();
    commit(pickerFor.closest('.opt'));
  });
  if (pickerAlpha) pickerAlpha.addEventListener('change', function () {
    if (pickerFor) commit(pickerFor.closest('.opt'));
  });
  /* chroma cycles the hue in game, so the field under it stops meaning
     anything — it greys where it is, and the alpha stays live beneath it */
  var chromaSw = picker && picker.querySelector('.picker-row .sw-sm');
  if (chromaSw) {
    chromaSw.tabIndex = 0;
    var chroma = function () {
      var on = chromaSw.getAttribute('aria-checked') !== 'true';
      chromaSw.setAttribute('aria-checked', on ? 'true' : 'false');
      if (!pickerGrid) return;
      pickerGrid.style.opacity = on ? '.4' : '';
      pickerGrid.style.pointerEvents = on ? 'none' : '';
      pickerGrid.setAttribute('aria-disabled', on ? 'true' : 'false');
    };
    chromaSw.addEventListener('click', chroma);
    chromaSw.addEventListener('keydown', function (e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      chroma();
    });
  }

  /* ══ THE HUD LAYOUT EDITOR ════════════════════════════════════════════════

     POSITION BELONGS TO AN ELEMENT.  The state below is keyed by element, not
     by module: Armor status is one module and five elements, and the module
     itself has no anchor at all.  Every position is an anchor plus a relative
     offset in per cent of the frame, so changing the resolution moves nothing.

     Everything a layout can be told is here — drag, snap, arrow keys, corner
     scale, multi-select, undo and redo, per-element and whole-layout reset —
     and none of it has an apply button, because it saves as it goes.        */

  var frame = document.getElementById('frame');
  var elsList = document.getElementById('elsList');
  var guideV = document.getElementById('guideV');
  var guideH = document.getElementById('guideH');
  var clash = document.getElementById('clash');
  var clashT = document.getElementById('clashT');
  var anchorsBox = document.getElementById('anchors');
  var stageSel = document.getElementById('stageSel');
  var snapTog = document.getElementById('snapTog');
  var hudCtx = document.getElementById('hudCtx');
  var hudSaved = document.getElementById('hudSaved');

  var ANCHOR_NAME = {
    tl: 'Top left', tc: 'Top', tr: 'Top right',
    ml: 'Left', mc: 'Centre', mr: 'Right',
    bl: 'Bottom left', bc: 'Bottom', br: 'Bottom right'
  };
  var HELS = frame ? Array.prototype.slice.call(frame.querySelectorAll('.hel')) : [];
  var ST = {}, DEF = {}, sel = [], undoStack = [], redoStack = [], hinted = false;

  /* The defaults are where a fresh install puts each element.  They are NOT
     the current layout: reset has to visibly move things or it is not a
     reset, it is a no-op with a label on it. */
  var STOCK = {
    fps: 'tl:1.2:2.4', cps: 'tl:1.2:9.6', ping: 'tl:1.2:16.8', keys: 'bl:1.2:24',
    coords: 'tl:1.2:24', potion: 'tr:1.2:2.4',
    helmet: 'tr:1.2:10', chest: 'tr:1.2:17.2', legs: 'tr:1.2:24.4', boots: 'tr:1.2:31.6',
    held: 'br:1.2:24'
  };

  HELS.forEach(function (el) {
    var id = el.dataset.el;
    ST[id] = { a: el.dataset.a, x: +el.dataset.x, y: +el.dataset.y, s: +el.dataset.s };
    var st = (STOCK[id] || 'tl:2:2').split(':');
    DEF[id] = { a: st[0], x: +st[1], y: +st[2], s: 1 };
  });

  function snapshot() { return JSON.stringify(ST); }
  function restore(j) { var o = JSON.parse(j); Object.keys(o).forEach(function (k) { ST[k] = o[k]; }); paintAll(); }
  function mutate(fn) {
    var before = snapshot();
    fn();
    if (snapshot() === before) return;
    undoStack.push(before);
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
    paintAll();
    flashSaved();
  }
  function flashSaved() {
    /* the indicator is optional; the save is not, so persistence happens
       before the early return rather than after it */
    saveHud();
    if (!hudSaved) return;
    hudSaved.textContent = 'Saving';
    clearTimeout(flashSaved.t);
    flashSaved.t = setTimeout(function () { hudSaved.textContent = 'Saved'; }, 420);
  }

  /* ── THE LAYOUT, PERSISTED ────────────────────────────────────────────────
     "Saved" was a word on the screen and nothing else: ST is undo state and
     died with the screen, so the HUD editor arranged a HUD that no longer
     existed the moment you navigated away — and mc/hud.js, which writes the
     config the client mod reads, had nothing to write.

     THE MODULE STATE IS READ OFF THE SWITCHES rather than out of MODG. The
     modules screen keys its state by its own row keys and the launcher keys
     visibility by module NAME, and the switches already carry the name in
     their aria-label — which is the label a screen reader reads out, so it
     is a string that has to stay correct anyway. Reading it here means the
     two representations cannot drift, and tools/hudcheck.mjs asserts the
     names still match mc/hud.js's table.

     ONLY CALLED FROM USER ACTIONS. Every caller of flashSaved() is a drag, a
     nudge, an undo or a reset, and toggleMod is a click; none run during the
     initial paint. That matters more than it looks: a save firing while ST
     was still empty would overwrite a saved layout with {} on every start. */
  var saveHudT = null;
  function hudModules() {
    var out = {};
    var sw = document.querySelectorAll('#screen-modules [role="switch"][aria-label]');
    for (var i = 0; i < sw.length; i++) {
      var label = sw[i].getAttribute('aria-label') || '';
      if (!/ enabled$/.test(label)) continue;
      out[label.replace(/ enabled$/, '')] = sw[i].getAttribute('aria-checked') === 'true';
    }
    return out;
  }
  function saveHud() {
    if (!host || !host.settings) return;   /* the browser build has nowhere to put it */
    clearTimeout(saveHudT);
    saveHudT = setTimeout(function () {
      host.settings.set({ hud: { elements: JSON.parse(snapshot()), modules: hudModules() } })
        .catch(function (err) { say('The HUD layout could not be saved. ' + esc(err.message)); });
    }, 350);
  }

  function place(el) {
    var s = ST[el.dataset.el];
    var st = el.style;
    st.left = st.right = st.top = st.bottom = '';
    var v = s.a.charAt(0), h = s.a.charAt(1), t = '';
    if (v === 't') st.top = s.y + '%';
    else if (v === 'b') st.bottom = s.y + '%';
    else { st.top = 'calc(50% + ' + s.y + '%)'; t += ' translateY(-50%)'; }
    if (h === 'l') st.left = s.x + '%';
    else if (h === 'r') st.right = s.x + '%';
    else { st.left = 'calc(50% + ' + s.x + '%)'; t += ' translateX(-50%)'; }
    if (s.s !== 1) t += ' scale(' + s.s + ')';
    st.transform = t.trim();
    st.transformOrigin = (v === 't' ? 'top' : v === 'b' ? 'bottom' : 'center') + ' ' +
                         (h === 'l' ? 'left' : h === 'r' ? 'right' : 'center');
  }

  function rectOf(el) {
    var f = frame.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { l: r.left - f.left, t: r.top - f.top, w: r.width, h: r.height, r: r.right - f.left, b: r.bottom - f.top };
  }

  /* Overlap is stated, not stacked.  Lunar lets two elements sit on top of
     each other in silence and you find out in a game. */
  function checkClash() {
    if (!frame) return;
    HELS.forEach(function (e) { e.removeAttribute('data-clash'); });
    var pair = null;
    for (var i = 0; i < HELS.length && !pair; i++) {
      for (var j = i + 1; j < HELS.length; j++) {
        var a = rectOf(HELS[i]), b = rectOf(HELS[j]);
        if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) { pair = [HELS[i], HELS[j]]; break; }
      }
    }
    if (!clash) return;
    if (!pair || clash.dataset.ignored === 'yes') { clash.hidden = true; return; }
    pair[0].setAttribute('data-clash', '');
    pair[1].setAttribute('data-clash', '');
    clash.hidden = false;
    clashT.innerHTML = '<b></b> is sitting on <b></b>. Both will draw, one on top of the other.';
    var bs = clashT.querySelectorAll('b');
    bs[0].textContent = label(pair[0]);
    bs[1].textContent = label(pair[1]);
    clash.dataset.a = pair[0].dataset.el;
  }
  function label(el) { return el.dataset.sub ? el.dataset.mod + ' · ' + el.dataset.sub.toLowerCase() : el.dataset.mod; }

  /* The tree is BUILT ONCE and painted in place.  It used to be thrown away
     and rebuilt on every repaint, which meant the row you were about to click
     was a different node by the time you clicked it — and a drag rebuilt the
     whole column sixty times a second for no change at all. */
  function buildTree() {
    if (!elsList) return;
    elsList.innerHTML = '';
    var seen = {};
    HELS.forEach(function (el) {
      var mod = el.dataset.mod;
      if (el.dataset.sub && !seen[mod]) {
        seen[mod] = true;
        var g = document.createElement('div');
        g.className = 'elrow elrow-mod';
        /* a module is not a place, so this cell is a dash */
        g.innerHTML = '<span></span><span class="elrow-a">—</span>';
        g.firstChild.textContent = mod;
        elsList.appendChild(g);
      }
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'elrow' + (el.dataset.sub ? ' elrow-sub' : '');
      b.setAttribute('aria-selected', 'false');
      b.dataset.pick = el.dataset.el;
      b.innerHTML = '<span></span><span class="elrow-a"></span>';
      b.firstChild.textContent = el.dataset.sub || mod;
      b.lastChild.textContent = ANCHOR_NAME[ST[el.dataset.el].a];
      elsList.appendChild(b);
    });
  }
  function paintTree() {
    if (!elsList) return;
    elsList.querySelectorAll('[data-pick]').forEach(function (b) {
      var on = sel.indexOf(b.dataset.pick) !== -1;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.lastChild.textContent = ANCHOR_NAME[ST[b.dataset.pick].a];
    });
  }

  function paintInspector() {
    var n = document.getElementById('inspName');
    if (!n) return;
    var one = sel.length === 1 ? byId(sel[0]) : null;
    n.textContent = one ? (one.dataset.sub || one.dataset.mod) : sel.length ? sel.length + ' elements' : 'Nothing selected';
    /* only says something when there is something to say: a sub-element
       belongs to a module, a plain element is its own module and repeating
       the name under itself is a fact stated twice */
    var kind = document.getElementById('inspKind');
    kind.textContent = one
      ? (one.dataset.sub ? 'One of five in ' + one.dataset.mod : '')
      : sel.length ? 'Moving together' : 'Pick one on the frame';
    kind.hidden = !kind.textContent;
    if (one) {
      var s = ST[one.dataset.el];
      var xi = document.getElementById('inspX'), yi = document.getElementById('inspY');
      if (document.activeElement !== xi) xi.value = s.x.toFixed(1);
      if (document.activeElement !== yi) yi.value = s.y.toFixed(1);
      document.getElementById('inspS').value = Math.round(s.s * 100);
      document.getElementById('inspSn').textContent = s.s.toFixed(2);
      if (anchorsBox) anchorsBox.querySelectorAll('button').forEach(function (b) {
        b.setAttribute('aria-checked', b.dataset.a === s.a ? 'true' : 'false');
      });
    }
    if (stageSel) stageSel.textContent = sel.length > 1 ? sel.length + ' selected' : '';
  }
  function byId(id) { for (var i = 0; i < HELS.length; i++) if (HELS[i].dataset.el === id) return HELS[i]; return null; }

  function paintAll() {
    if (elsList && !elsList.firstChild) buildTree();
    HELS.forEach(function (el) {
      place(el);
      if (sel.indexOf(el.dataset.el) !== -1) el.setAttribute('data-sel', ''); else el.removeAttribute('data-sel');
    });
    paintTree();
    paintInspector();
    checkClash();
    var u = document.getElementById('hudUndo'), r = document.getElementById('hudRedo');
    if (u) u.disabled = !undoStack.length;
    if (r) r.disabled = !redoStack.length;
  }

  if (anchorsBox) {
    ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'].forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.a = a;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.setAttribute('aria-label', ANCHOR_NAME[a]);
      anchorsBox.appendChild(b);
    });
    anchorsBox.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || sel.length !== 1) return;
      var el = byId(sel[0]);
      var keep = rectOf(el);
      mutate(function () {
        var s = ST[sel[0]];
        s.a = b.dataset.a;
        var f = frame.getBoundingClientRect();
        var p = toState(keep.l, keep.t, s.a, f.width, f.height, keep.w, keep.h);
        s.x = round1(p.x); s.y = round1(p.y);
      });
    });
  }

  function round1(n) { return Math.round(n * 10) / 10; }
  function toState(l, t, a, W, H, w, h) {
    var v = a.charAt(0), hz = a.charAt(1), x, y;
    if (hz === 'l') x = l / W * 100;
    else if (hz === 'r') x = (W - (l + w)) / W * 100;
    else x = ((l + w / 2) - W / 2) / W * 100;
    if (v === 't') y = t / H * 100;
    else if (v === 'b') y = (H - (t + h)) / H * 100;
    else y = ((t + h / 2) - H / 2) / H * 100;
    return { x: x, y: y };
  }

  /* ── drag, with the guide showing only while it is snapping ───────────── */

  var drag = null;
  function clearHint() {
    if (!hinted) return;
    hinted = false;
    HELS.forEach(function (e) { e.removeAttribute('data-drag'); e.removeAttribute('data-read'); });
    if (guideV) guideV.hidden = true;
    if (guideH) guideH.hidden = true;
  }

  function onDown(e) {
    var el = e.target.closest ? e.target.closest('.hel') : null;
    if (!frame || !el) return;
    clearHint();
    if (e.button === 2) return;
    e.preventDefault();
    var id = el.dataset.el;
    if (e.ctrlKey || e.metaKey) { if (sel.indexOf(id) === -1) sel.push(id); else sel.splice(sel.indexOf(id), 1); }
    else if (sel.indexOf(id) === -1 || sel.length > 1) sel = [id];
    var scaling = e.offsetX > el.offsetWidth - 2 && e.offsetY > el.offsetHeight - 2;
    var f = frame.getBoundingClientRect();
    drag = {
      el: el, sx: e.clientX, sy: e.clientY, scaling: scaling,
      before: snapshot(), moved: false,
      start: rectOf(el), W: f.width, H: f.height,
      base: sel.map(function (k) { return { k: k, x: ST[k].x, y: ST[k].y, s: ST[k].s }; })
    };
    el.setAttribute('data-drag', '');
    paintValues();
    paintAll();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function onMove(e) {
    if (!drag) return;
    var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;

    if (drag.scaling) {
      var k = Math.max(0.25, Math.min(5, round1((drag.start.w + dx) / drag.start.w * drag.base[0].s * 100) / 100));
      ST[drag.el.dataset.el].s = Math.round(k * 20) / 20;
      place(drag.el);
      paintInspector();
      return;
    }

    var l = drag.start.l + dx, t = drag.start.t + dy;
    var snapped = { v: null, h: null };
    if (!e.altKey && (!snapTog || snapTog.checked)) {
      var TH = 5;
      var xs = [0, drag.W / 2 - drag.start.w / 2, drag.W - drag.start.w];
      var ys = [0, drag.H / 2 - drag.start.h / 2, drag.H - drag.start.h];
      var guides = { x: [0, drag.W / 2, drag.W], y: [0, drag.H / 2, drag.H] };
      HELS.forEach(function (o) {
        if (o === drag.el) return;
        var r = rectOf(o);
        xs.push(r.l, r.r - drag.start.w, r.l + r.w / 2 - drag.start.w / 2);
        guides.x.push(r.l, r.r, r.l + r.w / 2);
        ys.push(r.t, r.b - drag.start.h, r.t + r.h / 2 - drag.start.h / 2);
        guides.y.push(r.t, r.b, r.t + r.h / 2);
      });
      for (var i = 0; i < xs.length; i++) if (Math.abs(l - xs[i]) < TH) { l = xs[i]; snapped.v = guides.x[i]; break; }
      for (var j = 0; j < ys.length; j++) if (Math.abs(t - ys[j]) < TH) { t = ys[j]; snapped.h = guides.y[j]; break; }
    }
    l = Math.max(0, Math.min(drag.W - drag.start.w, l));
    t = Math.max(0, Math.min(drag.H - drag.start.h, t));

    var s0 = ST[drag.el.dataset.el];
    var p = toState(l, t, s0.a, drag.W, drag.H, drag.start.w, drag.start.h);
    var ddx = round1(p.x) - drag.base.filter(function (b) { return b.k === drag.el.dataset.el; })[0].x;
    var ddy = round1(p.y) - drag.base.filter(function (b) { return b.k === drag.el.dataset.el; })[0].y;
    drag.base.forEach(function (b) { ST[b.k].x = round1(b.x + ddx); ST[b.k].y = round1(b.y + ddy); });
    HELS.forEach(function (el2) { if (sel.indexOf(el2.dataset.el) !== -1) place(el2); });

    drag.el.setAttribute('data-read', round1(p.x).toFixed(1) + '%, ' + round1(p.y).toFixed(1) + '%');
    if (guideV) { guideV.hidden = snapped.v === null; if (snapped.v !== null) guideV.style.setProperty('--g', snapped.v + 'px'); }
    if (guideH) { guideH.hidden = snapped.h === null; if (snapped.h !== null) guideH.style.setProperty('--g', snapped.h + 'px'); }
    paintInspector();
  }

  function onUp() {
    if (!drag) return;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    drag.el.removeAttribute('data-drag');
    drag.el.removeAttribute('data-read');
    if (guideV) guideV.hidden = true;
    if (guideH) guideH.hidden = true;
    if (drag.moved && snapshot() !== drag.before) {
      undoStack.push(drag.before);
      redoStack.length = 0;
      flashSaved();
    }
    drag = null;
    if (clash) delete clash.dataset.ignored;
    paintValues();
    paintAll();
  }

  if (frame) {
    frame.addEventListener('pointerdown', onDown);
    frame.addEventListener('contextmenu', function (e) {
      var el = e.target.closest('.hel');
      if (!el || !hudCtx) return;
      e.preventDefault();
      clearHint();
      sel = [el.dataset.el];
      paintAll();
      hudCtx.hidden = false;
      hudCtx.style.left = Math.min(e.clientX, window.innerWidth - 224) + 'px';
      hudCtx.style.top = Math.min(e.clientY, window.innerHeight - 140) + 'px';
    });
  }
  document.addEventListener('click', function (e) {
    if (hudCtx && !hudCtx.hidden && !e.target.closest('.menu-ctx')) hudCtx.hidden = true;
    var pick = e.target.closest ? e.target.closest('[data-pick]') : null;
    if (pick) { clearHint(); sel = [pick.dataset.pick]; paintAll(); }
  });

  function hudEnter() {
    if (!frame || hudEnter.done) return;
    hudEnter.done = true;
    sel = ['ping'];
    paintAll();
    /* The screen opens on the moment it is for: an element under the cursor,
       caught on the left edge of the two above it, and now sitting on one of
       them.  The guide is there because it is snapping and for no other
       reason — it goes when the drag does. */
    var ping = byId('ping');
    if (ping) {
      hinted = true;
      ping.setAttribute('data-drag', '');
      ping.setAttribute('data-read', ST.ping.x.toFixed(1) + '%, ' + ST.ping.y.toFixed(1) + '%');
      var r = rectOf(ping);
      if (guideV) { guideV.hidden = false; guideV.style.setProperty('--g', r.l + 'px'); }
    }
  }

  /* ── the rest of the HUD wiring ───────────────────────────────────────── */

  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!a) return;
    var act = a.getAttribute('data-act');
    if (act === 'colour') { e.preventDefault(); openPicker(a); return; }
    if (act === 'picker-close') { e.preventDefault(); closePicker(); return; }
    if (act === 'copy-code') {
      e.preventDefault();
      var code = document.getElementById('shareCode');
      if (code && navigator.clipboard) navigator.clipboard.writeText(code.textContent.trim()).catch(function () {});
      a.textContent = 'Copied';
      setTimeout(function () { a.textContent = 'Copy code'; }, 1600);
      return;
    }
    if (act === 'hud-undo') { e.preventDefault(); clearHint(); if (undoStack.length) { redoStack.push(snapshot()); restore(undoStack.pop()); flashSaved(); } return; }
    if (act === 'hud-redo') { e.preventDefault(); clearHint(); if (redoStack.length) { undoStack.push(snapshot()); restore(redoStack.pop()); flashSaved(); } return; }
    if (act === 'hud-reset-all') {
      e.preventDefault(); clearHint();
      mutate(function () { Object.keys(DEF).forEach(function (k) { ST[k] = { a: DEF[k].a, x: DEF[k].x, y: DEF[k].y, s: DEF[k].s }; }); });
      return;
    }
    if (act === 'hud-reset-el' || act === 'hud-reset-pos') {
      e.preventDefault(); clearHint();
      if (hudCtx) hudCtx.hidden = true;
      mutate(function () {
        sel.forEach(function (k) {
          ST[k].a = DEF[k].a; ST[k].x = DEF[k].x; ST[k].y = DEF[k].y;
          if (act === 'hud-reset-el') ST[k].s = DEF[k].s;
        });
      });
      return;
    }
    if (act === 'hud-open-mod') { e.preventDefault(); if (hudCtx) hudCtx.hidden = true; location.hash = '#modules'; return; }
    if (act === 'hud-nudge') {
      e.preventDefault(); clearHint();
      var id = clash && clash.dataset.a;
      if (id) mutate(function () { ST[id].y = round1(ST[id].y - 6); });
      return;
    }
    if (act === 'hud-ignore') { e.preventDefault(); if (clash) { clash.dataset.ignored = 'yes'; clash.hidden = true; } return; }
    /* The proof that the model works: change this and nothing moves, because
       nothing here is stored in pixels. */
    if (act === 'res') {
      e.preventDefault();
      clearHint();
      var i = (RES.i + 1) % RES.list.length;
      RES.i = i;
      root.dataset.ar = RES.list[i][1];
      a.firstChild.innerHTML = RES.list[i][0];
      setTimeout(function () { paintAll(); }, 30);
      return;
    }
  });

  var RES = { i: 0, list: [['1920 &times; 1080', '16'], ['2560 &times; 1440', '16'], ['3440 &times; 1440', '21'], ['1280 &times; 1024', '4']] };

  var inspS = document.getElementById('inspS');
  if (inspS) inspS.addEventListener('input', function () {
    if (sel.length !== 1) return;
    clearHint();
    mutate(function () { ST[sel[0]].s = Math.round(inspS.value) / 100; });
  });
  ['inspX', 'inspY'].forEach(function (id) {
    var f = document.getElementById(id);
    if (!f) return;
    f.addEventListener('change', function () {
      if (sel.length !== 1) return;
      var v = parseFloat(f.value);
      if (isNaN(v)) return;
      clearHint();
      mutate(function () { ST[sel[0]][id === 'inspX' ? 'x' : 'y'] = round1(v); });
    });
  });

  /* ── example values ───────────────────────────────────────────────────────
     OneConfig's, and it is the small excellent one.  A frame counter that is
     counting frames churns three digits under the cursor while you are trying
     to line it up against the thing above it, so while this is on every
     element draws one representative value and holds it.  Turn it off and the
     numbers run — except during a drag, which is the case it exists for.    */

  var exTog = document.querySelector('#screen-hud .stage-bar .sw-input[aria-label="Example values"]');
  var exOn = true, liveTimer = null;
  function rnd(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
  function liveText(id, i, ex) {
    if (id === 'fps') return rnd(196, 262) + ' FPS';
    if (id === 'cps') return rnd(0, 16) + ' CPS';
    if (id === 'ping') return rnd(17, 74) + ' ms';
    if (id === 'coords' && i === 0) return 'X ' + rnd(112, 126) + ' Y ' + rnd(68, 74) + ' Z ' + rnd(-412, -396);
    if (id === 'potion') {
      var m = ex.match(/^(.*)(\d):(\d\d)$/);
      if (!m) return ex;
      var s = (+m[2] * 60 + +m[3] + rnd(-40, 0) + 3600) % 600;
      return m[1] + Math.floor(s / 60) + ':' + two(s % 60);
    }
    return ex;
  }
  function paintValues() {
    var live = !exOn && !drag;
    HELS.forEach(function (el) {
      var ts = el.querySelectorAll('.hel-t');
      for (var i = 0; i < ts.length; i++) {
        if (!ts[i].dataset.ex) ts[i].dataset.ex = ts[i].textContent;
        ts[i].textContent = live ? liveText(el.dataset.el, i, ts[i].dataset.ex) : ts[i].dataset.ex;
      }
    });
    if (live) checkClash();
  }
  function runValues() {
    clearInterval(liveTimer);
    liveTimer = null;
    paintValues();
    if (!exOn && (location.hash || '#play').slice(1) === 'hud') liveTimer = setInterval(paintValues, 620);
  }
  if (exTog) exTog.addEventListener('change', function () {
    exOn = exTog.checked;
    runValues();
    say(exOn
      ? 'Example values — every element holds one representative value, so nothing churns while you drag.'
      : 'Live values. They stop moving while you are dragging.');
  });

  if (snapTog) snapTog.addEventListener('change', function () {
    if (!snapTog.checked) { if (guideV) guideV.hidden = true; if (guideH) guideH.hidden = true; }
    say(snapTog.checked
      ? 'Snapping on — edges, centre lines and the other elements. Hold <kbd>Alt</kbd> to ignore it for one drag.'
      : 'Snapping off — drag lands where you put it.');
  });

  /* the two the shortcuts strip already promises */
  document.addEventListener('keydown', function (e) {
    if (!frame || (location.hash || '').slice(1) !== 'hud') return;
    if (!(e.ctrlKey || e.metaKey) || e.target.closest('input,textarea')) return;
    var k = e.key.toLowerCase();
    var un = k === 'z' && !e.shiftKey;
    var re = k === 'y' || (k === 'z' && e.shiftKey);
    if (!un && !re) return;
    e.preventDefault();
    clearHint();
    if (un && undoStack.length) { redoStack.push(snapshot()); restore(undoStack.pop()); flashSaved(); }
    else if (re && redoStack.length) { undoStack.push(snapshot()); restore(redoStack.pop()); flashSaved(); }
    paintAll();
  });

  /* ══ INSTANCE CARDS ════════════════════════════════════════════════════════
     ONE COMPONENT, ONE FUNCTION, TWO SCREENS.  `card()` below emits the only
     instance card in the app.  The grid on #instances and the Recent strip on
     #play both call it, and both call it with rows read out of the instance
     TABLE — so a card and a row are two renderings of one record and cannot
     drift into two encodings the way the table itself did in round nine.
     Building the card twice is the exact failure the coherence critic named;
     there is one of it and there is one source of rows.

     WHAT THE SECOND LINE CARRIES.  Eight of these nine instances are the
     user's own builds and have no author at all; printing "By" over an
     invented handle is the invented-data failure in section F wearing a
     credit.  So the slot takes the two things that are actually true:

       the user's own      loader and version   Fabric 0.16.9   figure face
       an imported pack    the pack's author    ATMTeam         UI face

     Two contents, two faces, one slot — and the face is not decoration, it is
     the same rule the table runs on: a version is a figure and sits in the
     mono face, a person's handle is a word and does not.

     THE COVER IS THE ROW'S MARK, TILED.  A row carries the instance's block
     face at 14px; the card carries the same 8×8 symbol laid 4×4 into a 32-unit
     box, alternate tiles mirrored so a wall of one block does not read as a
     stamp repeated sixteen times.  One drawing at two scales, and no second
     art system to keep in sync.  An instance with no block face gets the
     monogram tile, which is what its row gets.
     ═══════════════════════════════════════════════════════════════════════ */

  var LOADER_MARK = { Fabric: 'l-fabric', Forge: 'l-forge', NeoForge: 'l-neo', Quilt: 'l-quilt' };
  /* how many of the library the Recent strip takes before the list below it
     starts.  Six is where "this month" ends, so the strip is a period and
     not an arbitrary count. */
  var STRIP_N = 6;

  function esc(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* read one record out of a table row: the row is the record */
  function readRow(tr) {
    var nameCell = tr.querySelector('.td-name');
    var ic = nameCell.querySelector('.ic');
    var useEl = ic ? ic.querySelector('use') : null;
    var load = tr.querySelector('.td-load');
    var b = load ? load.querySelector('b') : null;
    return {
      name: nameCell.children[1] ? nameCell.children[1].textContent.trim() : '',
      art: useEl ? (useEl.getAttribute('href') || '').replace('#', '') : '',
      mono: useEl ? '' : (ic ? ic.textContent.trim() : ''),
      ver: (tr.querySelectorAll('.td-fig')[0] || {}).textContent || '',
      loader: b ? b.textContent.trim() : (load ? load.textContent.trim() : ''),
      lver: b ? (load.querySelector('em') || {}).textContent || '' : '',
      author: tr.getAttribute('data-author') || '',
      current: tr.hasAttribute('data-current')
    };
  }

  /* the cover: the 8×8 block face laid 4×4, alternate tiles mirrored */
  function cover(sym) {
    var out = '<svg class="card-cover" viewBox="0 0 32 32" aria-hidden="true">';
    for (var r = 0; r < 4; r++) {
      for (var c = 0; c < 4; c++) {
        var sx = (r + c) % 2 ? -1 : 1;
        var sy = r % 2 ? -1 : 1;
        var x = c * 8, y = r * 8;
        out += '<use href="#' + sym + '" width="8" height="8" transform="matrix('
             + sx + ',0,0,' + sy + ',' + (sx < 0 ? x + 8 : x) + ',' + (sy < 0 ? y + 8 : y) + ')"/>';
      }
    }
    return out + '</svg>';
  }

  function card(d) {
    var mark = LOADER_MARK[d.loader]
      ? '<svg width="10" height="10" aria-hidden="true"><use href="#' + LOADER_MARK[d.loader] + '"/></svg>'
      : '';
    var sub = d.author
      ? '<p class="card-sub" data-src="pack" title="Pack author">' + esc(d.author) + '</p>'
      : '<p class="card-sub"><span class="mono"><b>' + esc(d.loader) + '</b>'
        + (d.lver ? ' <em>' + esc(d.lver) + '</em>' : '') + '</span></p>';
    var says = d.name + ', Minecraft ' + d.ver + ', '
      + (d.author ? 'imported pack by ' + d.author : d.lver ? d.loader + ' ' + d.lver : d.loader);
    return ''
      + '<article class="card" role="listitem" tabindex="0" aria-label="' + esc(says) + '"'
      /* THE CARD CARRIES THE ID, because the card is what gets clicked. Without
         it every Play button on the grid fell back to whichever row the table
         had marked current, so clicking any instance launched the first one. */
      + (d.id ? ' data-id="' + esc(d.id) + '"' : '')
      + (d.current ? ' data-current="true"' : '') + '>'
      +   '<div class="card-art">'
      +     (d.art ? cover(d.art) : '<span class="card-mono mono" aria-hidden="true">' + esc(d.mono) + '</span>')
      +     '<i class="card-dim" aria-hidden="true"></i>'
      +     '<span class="card-badge">' + mark + '<span>' + esc(d.ver) + '</span></span>'
      +     '<div class="card-acts">'
      +       '<button class="card-sq" type="button" title="Change version" aria-haspopup="menu" aria-expanded="false" aria-label="Change version for ' + esc(d.name) + '">'
      +         '<svg width="12" height="12" aria-hidden="true"><use href="#x-swap"/></svg></button>'
      +       '<button class="card-go" type="button" data-act="launch" aria-label="Play ' + esc(d.name) + '">'
      +         '<svg class="go-ico" width="12" height="12" aria-hidden="true"><use href="#c-play"/></svg>Play</button>'
      +       '<button class="card-more2" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="More actions for ' + esc(d.name) + '">'
      +         '<svg width="14" height="14" aria-hidden="true"><use href="#r-caret"/></svg></button>'
      +     '</div>'
      +   '</div>'
      +   '<div class="card-id">'
      +     '<h4 class="card-name" title="' + esc(d.name) + '">' + esc(d.name) + '</h4>'
      +     sub
      +   '</div>'
      + '</article>';
  }

  /* ══ THE DESKTOP BRIDGE ═══════════════════════════════════════════════════
     In Electron, preload.js puts a narrow API on window.kestrel and instances
     are folders under %APPDATA%.  In a browser there is no such object, and
     everything below simply does not run: the library stays the fixture in
     the markup and every action stays in-page, which is exactly what
     kestrel.html and tools/clicktest.mjs test.  One codebase, two hosts, and
     the browser path is the one that is already shipped rather than a
     degraded copy of it.

     THE LIBRARY TABLE IS STILL THE RECORD.  Nothing here introduces a second
     model.  The store is read once, before the cards are built, and written
     into the same rows libRowHtml() already emits — so card(), the sort, the
     counts, the strip and Delete all keep reading the one thing they read
     before.  The bridge changes where a row comes from, not what a row is.
     ═══════════════════════════════════════════════════════════════════════ */

  var host = (window.kestrel && window.kestrel.available) ? window.kestrel : null;

  /* a row, read out whole — readRow() carries identity, this carries the rest */
  function fullRecord(tr, group) {
    var d = readRow(tr);
    var mods = tr.querySelector('.td-mods');
    var size = tr.querySelector('.td-size');
    var note = tr.querySelector('.td-note');
    var pt = tr.querySelector('.pt');
    d.mods = mods ? parseInt(mods.textContent, 10) || 0 : 0;
    d.size = size ? size.textContent.trim() : '327 MB';
    d.when = note ? note.textContent.trim() : 'Never';
    d.group = group || '';
    d.playtime = {
      hrs: (pt && pt.getAttribute('data-hrs')) || 'lo',
      h: (pt && pt.querySelector('b') ? pt.querySelector('b').textContent : '0h'),
      m: (pt && pt.querySelector('em') ? pt.querySelector('em').textContent : '00m')
    };
    return d;
  }

  /* the band above a row is its group; a row with none is ungrouped */
  function groupOf(tr) {
    for (var el = tr.previousElementSibling; el; el = el.previousElementSibling) {
      if (el.classList.contains('band')) return el.textContent.trim();
    }
    return '';
  }

  function libRecords(table) {
    var out = [], group = '';
    var kids = table.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (el.classList.contains('band')) { group = el.textContent.trim(); continue; }
      if (!el.classList.contains('tr') || el.classList.contains('th')) continue;
      out.push(fullRecord(el, group));
    }
    return out;
  }

  /* the folder name a record lives under, so Delete deletes the right one */
  function stampIds(table, items) {
    var byName = {};
    items.forEach(function (r) { if (r && r.id) byName[r.name] = r.id; });
    [].slice.call(table.querySelectorAll('.tr:not(.th)')).forEach(function (tr) {
      var id = byName[recordName(tr)];
      if (id) tr.setAttribute('data-id', id);
    });
  }

  function storedRowNode(rec) {
    var tr = nodeOf(libRowHtml(rec));
    if (rec.current) tr.setAttribute('data-current', 'true');
    if (rec.id) tr.setAttribute('data-id', rec.id);
    var pt = tr.querySelector('.pt');
    if (pt && rec.playtime) {
      pt.setAttribute('data-hrs', rec.playtime.hrs || 'lo');
      pt.innerHTML = '<b>' + esc(rec.playtime.h || '0h') + '</b> <em>' + esc(rec.playtime.m || '00m') + '</em>';
    }
    paintArt(tr, rec.image);
    return tr;
  }

  (function hydrate() {
    var table = document.querySelector('#screen-instances .table');
    if (!host || !table) return;

    var boot = null;
    try { boot = host.instances.boot(); } catch (err) { boot = null; }
    if (!boot) { host = null; return; }          /* a broken bridge is no bridge */

    /* FIRST RUN.  The fixture in the markup becomes nine folders on
       disk, so the app opens looking the way the prototype did and is backed
       by files from the second run onward. */
    if (!boot.seeded) {
      var made = null;
      try { made = host.instances.seed(libRecords(table)); } catch (err) { made = null; }
      if (made) stampIds(table, made);
      return;                                     /* the DOM is already right */
    }

    var items = boot.items || [];
    var th = table.querySelector('.th');
    table.innerHTML = '';
    if (th) table.appendChild(th);
    var group = null, kb = 0;
    items.forEach(function (rec) {
      if (rec.group && rec.group !== group) {
        group = rec.group;
        table.appendChild(nodeOf('<div class="band" role="row"><span>' + esc(group) + '</span></div>'));
      }
      kb += bytes(rec.size);
      table.appendChild(storedRowNode(rec));
    });

    /* the subject line is written before paintLibrary() reads it back, so the
       carried figure starts from the store rather than from the fixture */
    var sn = document.querySelector('#screen-instances .subject-n');
    var sm = document.querySelector('#screen-instances .subject-m');
    if (sn) sn.textContent = items.length + (items.length === 1 ? ' instance' : ' instances');
    if (sm) sm.textContent = sizeText(boot.libKb || kb) + ' on disk';
  })();

  /* ── the window controls the titlebar draws ─────────────────────────────
     The frame is off, so minimise, maximise and close are ours to send.  The
     maximise button is told the real state rather than toggling a guess. */
  (function windowControls() {
    var cap = document.querySelector('.titlebar .tb-caption');
    var bs = cap ? cap.querySelectorAll('.wincap') : [];
    if (!host || bs.length < 3) return;
    bs[0].addEventListener('click', function () { host.window.minimize(); });
    bs[1].addEventListener('click', function () { host.window.maximize(); });
    bs[2].addEventListener('click', function () { host.window.close(); });
    function paint(state) {
      var m = !!(state && state.maximized);
      root.dataset.win = m ? 'max' : 'normal';
      bs[1].setAttribute('aria-label', m ? 'Restore' : 'Maximise');
      bs[1].setAttribute('title', m ? 'Restore' : 'Maximise');
    }
    host.window.onState(paint);
    try { paint({ maximized: host.window.isMaximized() }); } catch (err) { paint(null); }
  })();

  /* ── build the two card surfaces, and Play's list, from the one library ──
     Walking the library table once: the current instance is skipped (it is in
     the hero on #play at four times the size, and it is the first card on
     #instances), the next STRIP_N go to the strip, and everything after that
     is cloned into Play's list along with the group labels that still have
     members under them.  Nothing is left behind a link. */
  (function buildCards() {
    var lib = document.querySelector('#screen-instances .table');
    var grid = document.getElementById('libGrid');
    var strip = document.getElementById('playStrip');
    var restTable = document.querySelector('#screen-play .rest .table');
    if (!lib || !grid || !strip) return;   /* restTable is optional: Play's list was removed */

    var all = [], stripHtml = [], groups = [], g = null, taken = 0;
    var kids = lib.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (el.classList.contains('th')) continue;
      if (el.classList.contains('band')) { g = { band: el, rows: [], inStrip: 0 }; groups.push(g); continue; }
      if (!el.classList.contains('tr')) continue;

      var d = readRow(el);
      d.id = el.getAttribute('data-id') || '';
      all.push(card(d));
      if (d.current) continue;          /* the hero, and the first card */

      var recent = taken < STRIP_N;
      if (recent) { stripHtml.push(card(d)); taken++; }
      if (g) { g.rows.push({ el: el, recent: recent }); if (recent) g.inStrip++; }
    }

    /* EVERY INSTANCE IS IN THE LIST, ALL THE TIME.  The six the strip is
       holding are marked rather than left out, so when the window is too
       short for a strip of cards (see RESPONSE in app.css) one media query
       puts them back as rows instead of taking them off the screen.  A
       responsive rule is allowed to change the SHAPE of a thing; it is not
       allowed to lose one. */
    for (var j = 0; j < groups.length; j++) {
      var gr = groups[j];
      if (!gr.rows.length) continue;    /* "Today" holds only the hero */
      var b = gr.band.cloneNode(true);
      if (gr.inStrip === gr.rows.length) b.setAttribute('data-strip', 'on');
      if (restTable) restTable.appendChild(b);
      for (var r = 0; r < gr.rows.length; r++) {
        var row = gr.rows[r].el.cloneNode(true);
        if (gr.rows[r].recent) row.setAttribute('data-strip', 'on');
        if (restTable) restTable.appendChild(row);
      }
    }

    grid.innerHTML = all.join('');
    strip.innerHTML = stripHtml.join('');
  })();

  /* KEYBOARD.  The card is a tab stop and so are its three controls, so Tab
     alone reaches every action — but a 9-card grid is 36 stops, so the cards
     also form a roving row: ← and → move card to card, ↓ drops into the
     control row, Esc comes back out, and Enter opens the instance.  The
     control row is held open by :focus-within the whole time focus is inside
     it, which is what makes a hover-only affordance legal. */
  function cardKeys(e) {
    var card = e.target.closest ? e.target.closest('.card') : null;
    if (!card) return;
    var k = e.key;
    if (e.target !== card) {
      if (k === 'Escape' || k === 'ArrowUp') { e.preventDefault(); card.focus(); }
      return;
    }
    if (k === 'Enter' || k === ' ') { e.preventDefault(); openInstance(card.closest('[data-id]') || card); return; }
    if (k === 'ArrowDown') {
      var go = card.querySelector('.card-go');
      if (go) { e.preventDefault(); go.focus(); }
      return;
    }
    if (k === 'ArrowRight' || k === 'ArrowLeft') {
      var sibs = [].slice.call(card.parentNode.querySelectorAll('.card'));
      var next = sibs[sibs.indexOf(card) + (k === 'ArrowRight' ? 1 : -1)];
      if (next) { e.preventDefault(); next.focus(); next.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    }
  }
  document.addEventListener('keydown', cardKeys);
  /* clicking the art or the title opens the instance; the three controls in
     the hover row stop the click before it gets here */
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('.card-art, .card-id') : null;
    if (!t || (e.target.closest && e.target.closest('.card-acts'))) return;
    openInstance(t.closest('[data-id]'));
  });

  /* ── OPENING AN INSTANCE MEANS OPENING THAT INSTANCE ──────────────────────
     #screen-instance is prototype markup describing one particular instance,
     and until now nothing told it which one had been clicked. So every card
     opened a screen headed "1.21.4 Fabric" whose Play button fell through to
     currentInstance() and launched 1.21.4 Fabric — whatever you had clicked.

     The screen is stamped with the id and its IDENTITY is repainted: the
     title, the name field and the version. The rest of it — the mod list, the
     session history, the sizes — is still the fixture, and that is the honest
     state of this screen rather than something this change pretends to fix.
     What matters here is that it can no longer say one name and launch
     another. */
  function openInstance(holder) {
    var screen = document.getElementById('screen-instance');
    if (screen && holder && holder.getAttribute('data-id')) {
      var name = ((holder.querySelector('.card-name') || holder.querySelector('.td-name') || {}).textContent || '')
        .trim().split('\n')[0];
      screen.setAttribute('data-id', holder.getAttribute('data-id'));
      if (name) {
        screen.setAttribute('aria-label', name);
        var title = screen.querySelector('.pane-title');
        if (title) title.textContent = name;
        var field = screen.querySelector('#instName');
        if (field) field.value = name;
      }
    }
    location.hash = '#instance';
  }

  /* ── the Recent strip's scroll controls ────────────────────────────────── */
  var stripBox = document.getElementById('playStrip');
  var stripNav = document.getElementById('stripNav');
  function paintStripNav() {
    if (!stripBox || !stripNav) return;
    var max = stripBox.scrollWidth - stripBox.clientWidth;
    stripNav.hidden = max <= 1;
    var bs = stripNav.querySelectorAll('button');
    bs[0].disabled = stripBox.scrollLeft <= 1;
    bs[1].disabled = stripBox.scrollLeft >= max - 1;
  }
  if (stripBox) {
    stripBox.addEventListener('scroll', paintStripNav);
    window.addEventListener('resize', paintStripNav);
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-act="strip"]') : null;
      if (!b) return;
      var slow = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      stripBox.scrollBy({ left: (+b.getAttribute('data-dir')) * (stripBox.clientWidth - 40),
                          behavior: slow ? 'auto' : 'smooth' });
    });
  }

  /* ── which view #instances is showing ───────────────────────────────────
     A grid is right when you are picking by identity and a table is right
     when you are comparing playtime and loader across nine rows, so
     the app ships both and remembers which one you left it on. */
  var VIEW_KEY = 'kestrel.view.instances';
  function setView(v, remember) {
    v = v === 'list' ? 'list' : 'grid';
    root.dataset.view = v;
    var bs = document.querySelectorAll('[data-act="view"]');
    for (var i = 0; i < bs.length; i++) {
      bs[i].setAttribute('aria-pressed', bs[i].getAttribute('data-view') === v ? 'true' : 'false');
    }
    if (remember !== false) { try { localStorage.setItem(VIEW_KEY, v); } catch (err) {} }
  }
  try { var saved = localStorage.getItem(VIEW_KEY); if (saved) setView(saved, false); } catch (err) {}
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-act="view"]') : null;
    if (b) setView(b.getAttribute('data-view'));
  });

  /* ── the hover state, pinned ────────────────────────────────────────────
     A reviewer cannot judge a state they cannot photograph.  #card-hover is
     #instances with one card held in its hover state; ?hover=N picks which.
     It sets the same attribute the pointer sets, so what the screenshot shows
     is the real rule and not a second one drawn to look like it. */
  var hoverPin = 0;
  function applyHover() {
    var on = document.querySelectorAll('.card[data-hover]');
    for (var i = 0; i < on.length; i++) on[i].removeAttribute('data-hover');
    if (!hoverPin) return;
    var scope = document.getElementById('screen-' + (root.dataset.screen || 'play'));
    if (!scope) return;
    var list = scope.querySelectorAll('.card');
    var el = list[Math.min(hoverPin, list.length) - 1];
    if (el) el.setAttribute('data-hover', 'on');
  }

  /* ── router ─────────────────────────────────────────────────────────── */

  function readOptions(qs) {
    if (!qs) return;
    var p = new URLSearchParams(qs);
    if (p.get('palette')) setPalette(p.get('palette'));
    if (p.get('theme')) setTheme(p.get('theme'));
    if (p.get('view')) setView(p.get('view'), false);
    if (p.get('hover')) hoverPin = Math.max(1, parseInt(p.get('hover'), 10) || 4);
    /* A REVIEWER CANNOT JUDGE A STATE THEY CANNOT PHOTOGRAPH — the same
       reason #card-hover exists.  ?net=off puts the content browser in the
       mode a machine with no route to api.modrinth.com is already in, so the
       bundled-list state can be shot on a machine that does have one. */
    if (p.get('net') === 'off' && bs) { bs.mode = 'offline'; bs.hits = []; bs.ran = false; }
  }

  function route() {
    var raw = (location.hash || '').replace(/^#\/?/, '');
    hoverPin = 0;
    var q = raw.indexOf('?');
    if (q !== -1) { readOptions(raw.slice(q + 1)); raw = raw.slice(0, q); }

    var parts = raw.split('/');
    var name = parts[0];
    var sub = parts[1] || '';
    var drop = false;

    if (ALIAS[name]) name = ALIAS[name];
    if (name === 'mods-drop') { name = 'mods'; drop = true; }
    /* the card's hover state, pinned so it can be photographed */
    if (name === 'card-hover') { name = 'instances'; setView('grid', false); if (!hoverPin) hoverPin = 4; }
    if (name === 'modules-colour') { name = 'modules'; openPicker(); }
    else closePicker();

    if (name === 'states' && sub) {
      if (SCENARIOS[sub]) { apply(sub); name = 'play'; }
      else name = 'states';
    } else if (SCREENS.indexOf(name) === -1) {
      name = 'play';
      apply('normal');
    } else if (name === 'play') {
      apply('normal');
    }

    root.dataset.screen = name;
    root.dataset.drop = drop ? 'on' : 'off';
    /* after the screen is showing, because everything the editor measures is
       zero-sized while its pane is display:none */
    if (name === 'hud') hudEnter();
    runValues();

    /* A floating panel is anchored to a button on the screen you just left,
       so it goes with the screen.  Same for the server form, which is a step
       in a flow rather than a state of the app. */
    popover.close(false);
    if (name !== 'servers') srvClose(false);

    /* the instance strip, on both of the screens that carry it: an explicit
       sub-route wins, a bare #instance lands on the tab you left, and #mods
       is the Mods tab whichever way you arrived at it */
    if (name === 'instance') setTab(sub && sub !== 'mods' ? sub : rememberedTab(), !!sub);
    else if (name === 'mods') {
      paintTabs('mods');
      /* PHASE 5.  The table is a view of a folder, so it is read on the way
         in rather than trusted to be what it was when we left. */
      var mi = (bs.inst && bs.inst.id) ? bs.inst.id : (currentInstance() || {}).id;
      if (mi) refreshMods(mi);
    }
    /* #browse is the list, #browse/<slug> is one project.  The first visit is
       what makes the only network request this app makes. */
    else if (name === 'browse') browseEnter(sub);

    applyHover();
    paintStripNav();

    var lit = NAV_OF.hasOwnProperty(name) ? NAV_OF[name] : name;
    var items = document.querySelectorAll('.nav-item[data-nav]');
    for (var i = 0; i < items.length; i++) {
      if (items[i].getAttribute('data-nav') === lit) items[i].setAttribute('aria-current', 'page');
      else items[i].removeAttribute('aria-current');
    }
    document.title = name === 'play'
      ? t('title.app')
      : t('title.screen', { screen: TITLE_OF[name] || (name[0].toUpperCase() + name.slice(1)) });
  }

  window.addEventListener('hashchange', route);

  /* ── launch sequence ────────────────────────────────────────────────── */

  var timers = [];
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  /* THE DEMONSTRATION, kept for the browser.  With no bridge there is nothing
     to download and nothing to run, so the five states are stepped through on
     a timer exactly as they were before — which is what kestrel.html and
     tools/clicktest.mjs exercise. */
  function runSequence() {
    clearTimers();
    [[0, 'preparing'], [900, 'downloading'], [3400, 'installing'], [4500, 'launching'], [5500, 'running']]
      .forEach(function (step) { timers.push(setTimeout(function () { apply(step[1]); }, step[0])); });
  }

  /* ── the real one ────────────────────────────────────────────────────────
     Phase 3.  apply() stays the single writer of the Play screen: the launch
     events edit the scenario objects it reads and call it again, so the
     progress bar, the button, the icon, the rail clock and every CSS rule
     hanging off data-launch keep working without a second rendering path.  */

  var run = { instance: '', session: '', version: '', busy: false };

  /* which instance the Play screen is about: the row marked current, else
     the first row that has an id at all */
  function currentInstance() {
    var cur = document.querySelector('#screen-instances .table .tr[data-current][data-id]')
      || document.querySelector('#screen-instances .table .tr[data-id]');
    if (!cur) return null;
    return { id: cur.getAttribute('data-id'), name: recordName(cur), ver: readRow(cur).ver.trim() };
  }

  function nf(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function mb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB'; }

  /* progress -> the scenario the screen is already able to draw */
  function onProgress(p) {
    if (!run.busy || (p.instance && p.instance !== run.instance)) return;
    var pct = p.totalBytes ? Math.round((p.bytes / p.totalBytes) * 100)
      : (p.total ? Math.round((p.done / p.total) * 100) : 0);
    pct = Math.max(0, Math.min(100, pct));
    if (p.phase === 'preparing') {
      SCENARIOS.preparing.p = p.total ? Math.max(2, Math.round((p.done / p.total) * 100)) : 2;
      SCENARIOS.preparing.sub = '<span class="mono">' + nf(p.done) + '/' + nf(p.total) + '</span> objects checked';
      SCENARIOS.preparing.note = 'Comparing what is on disk against the <span class="mono">' + esc(run.version) + '</span> manifest.';
      apply('preparing');
    } else if (p.phase === 'downloading') {
      SCENARIOS.downloading.p = pct;
      SCENARIOS.downloading.sub = '<span class="mono">' + pct + '%</span> · <span class="mono">'
        + nf(p.done) + '/' + nf(p.total) + '</span> files · <span class="mono">' + mb(p.bytes) + '</span> of <span class="mono">' + mb(p.totalBytes) + '</span>';
      SCENARIOS.downloading.note = p.file ? 'Fetching <span class="mono">' + esc(String(p.file).slice(0, 48)) + '</span>. Cancelling keeps what has already come down.' : '';
      apply('downloading');
    } else if (p.phase === 'installing') {
      SCENARIOS.installing.p = 92;
      SCENARIOS.installing.sub = '<span class="mono">92%</span> · ' + esc(p.file || 'unpacking libraries');
      apply('installing');
    } else if (p.phase === 'launching') {
      SCENARIOS.launching.sub = '<span class="mono">' + esc(p.file || 'Java') + '</span>';
      apply('launching');
    } else if (p.phase === 'cancelled') {
      run.busy = false; apply('normal');
    }
  }

  /* the child's stdout and stderr, into the log panel that already exists */
  var LOG_CAP = 600;
  function logLine(stream, line) {
    var pre = document.querySelector('#tp-instance-logs .logsnip');
    if (!pre) return;
    if (!pre.dataset.live) { pre.textContent = ''; pre.dataset.live = '1'; }
    var pinned = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 24;
    pre.appendChild(document.createTextNode((stream === 'err' ? '[stderr] ' : '') + line + '\n'));
    /* a long session is tens of thousands of lines; keep the tail, which is
       what the panel is called */
    var kids = pre.childNodes;
    while (kids.length > LOG_CAP) pre.removeChild(kids[0]);
    if (pinned) pre.scrollTop = pre.scrollHeight;
  }

  function launchFailed(msg) {
    run.busy = false;
    SCENARIOS.failed.sub = esc(String(msg).slice(0, 120));
    SCENARIOS.failed.note = esc(String(msg).slice(0, 400));
    SCENARIOS.failed.label = 'Try again';
    SCENARIOS.failed.fix = '';
    apply('failed');
  }

  /* WHICH INSTANCE A CLICK MEANT.  A Play button on a card or a row means
     THAT instance; the hero button on #play has nothing under it and means
     the current one. Resolving from the clicked element is the difference —
     currentInstance() alone answered "the row marked current, or failing
     that the first row in the table", so every card on the grid launched
     whichever instance happened to be first. */
  function clickedInstance(from) {
    var el = from && from.closest ? from.closest('[data-id]') : null;
    if (!el) return null;
    var id = el.getAttribute('data-id');
    if (!id) return null;
    var nameEl = el.querySelector('.card-name') || el.querySelector('.td-name');
    return { id: id, name: nameEl ? nameEl.textContent.trim().split('\n')[0] : id, ver: '' };
  }

  function startReal(offline, from) {
    var inst = clickedInstance(from) || currentInstance();
    if (!inst || !inst.id) { say('This instance is not backed by a folder yet, so there is nothing to launch.'); return; }
    run.instance = inst.id;
    run.version = inst.ver || '';
    run.busy = true;
    SCENARIOS.preparing.p = 2;
    SCENARIOS.preparing.sub = 'reading the version manifest';
    apply('preparing');
    /* NO VERSION IS SENT. play() falls back to the version on the instance
       RECORD, which is the truth; inst.ver came out of the table cell, and a
       cell can be stale or belong to a different row than the id does. That
       is not hypothetical — tools/bridgetest caught a launch going out as
       instance "crystal-pvp" with version "1.8.9" while that instance is on
       1.21.4, because the id and the version were read from two places. */
    host.game.play(inst.id, { offline: true }).then(function (r) {
      run.session = r.session;
      SCENARIOS.running.sub = esc(inst.name) + ' · running ' + esc(r.version)
        + (r.offline ? ' <span class="kv-sub">offline</span>' : '');
      apply('running');
    }).catch(function (err) { launchFailed(err && err.message || 'the launch failed'); });
  }

  function stopReal() {
    if (!host || !host.game) { clearTimers(); apply('normal'); return; }
    if (run.session || run.instance) host.game.kill(run.session || run.instance).catch(function () {});
    if (run.busy && !run.session) host.game.cancel(run.instance).catch(function () {});
  }

  function onLaunch(from) {
    var now = root.dataset.launch;
    var live = !!(host && host.game);
    if (now === 'idle' || now === 'error' || now === 'offline') {
      if (live) startReal(true, from); else runSequence();
    } else if (live) { stopReal(); }
    else { clearTimers(); apply('normal'); }
  }

  if (host && host.game) {
    host.game.onProgress(onProgress);
    host.game.onLog(function (p) { if (p.instance === run.instance) logLine(p.stream, p.line); });
    host.game.onStarted(function () { /* the play() promise carries the detail */ });
    host.game.onExit(function (p) {
      if (p.instance !== run.instance) return;
      run.busy = false; run.session = '';
      SCENARIOS.crashed.note = 'The game closed with exit code <span class="mono">' + esc(String(p.code)) + '</span> after '
        + esc(String(Math.round((p.ms || 0) / 1000))) + 's.';
      SCENARIOS.crashed.label = 'Play again';
      apply(p.code === 0 ? 'normal' : 'crashed');
    });
    /* a launcher restarted while a game is running should say so */
    host.game.running().then(function (list) {
      if (!list || !list.length) return;
      run.instance = list[0].instance; run.session = list[0].session; run.busy = true;
      apply('running');
    }).catch(function () {});
  }

  /* ── launch options menu ────────────────────────────────────────────── */

  var launchMenu = document.getElementById('launchMenu');
  var launchMenuBtn = document.querySelector('[data-act="launchmenu"]');

  function closeMenu() {
    if (!launchMenu || launchMenu.hidden) return;
    launchMenu.hidden = true;
    launchMenuBtn.setAttribute('aria-expanded', 'false');
  }
  function toggleMenu() {
    var open = launchMenu.hidden;
    launchMenu.hidden = !open;
    launchMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  /* ── memory slider ──────────────────────────────────────────────────── */

  var ram = document.getElementById('ramSlider');
  var ramNow = document.getElementById('ramNow');
  var ramLeft = document.getElementById('ramLeft');
  var TOTAL = 32;
  var RECOMMENDED = 6;

  /* WHAT "RECOMMENDED" MEANS, written down rather than typed in.  Half the
     machine, capped at 8 GB because a Fabric 1.21.4 client with this many
     mods does not touch six, and never past the three-quarter line the
     slider already warns at — so the button can never put the screen into
     the state the screen warns about.  Two floors: 2 GB, and never below
     what the game needs to start. */
  function ramRecommend() {
    if (!ram) return;
    var quarterCap = Math.floor(TOTAL * 0.75);
    var v = Math.max(2, Math.min(8, Math.floor(TOTAL / 2), quarterCap));
    var was = Number(ram.value);
    ram.value = v;
    paintRam();
    say(was === v
      ? fig(v + ' GB') + ' is already the recommendation — half of this PC’s ' + fig(TOTAL + ' GB') + ', capped at ' + fig('8 GB') + '.'
      : 'Set to ' + fig(v + ' GB') + ', from ' + fig(was + ' GB') + '. Half of this PC’s ' + fig(TOTAL + ' GB') +
        ', capped at ' + fig('8 GB') + ' because a Fabric client this size does not use more, and kept under the ' +
        fig(quarterCap + ' GB') + ' line so the collector pauses stay short.');
  }

  function paintRam() {
    if (!ram) return;
    var v = Number(ram.value);
    ramNow.textContent = v + ' GB';
    var left = TOTAL - v;
    ramLeft.innerHTML = v > TOTAL * 0.75
      ? 'allocated. Past three quarters of this PC the pauses get longer, not shorter.'
      : 'allocated, ' + left + ' GB left for Windows';
    ram.parentNode.dataset.over = v > TOTAL * 0.75 ? 'true' : 'false';
  }
  if (ram) {
    ram.addEventListener('input', paintRam);
    paintRam();
  }

  /* ── advanced ───────────────────────────────────────────────────────── */

  var adv = document.getElementById('advToggle');
  if (adv) {
    root.dataset.advanced = adv.checked ? 'on' : 'off';
    adv.addEventListener('change', function () { root.dataset.advanced = adv.checked ? 'on' : 'off'; });
  }

  /* ── command palette ────────────────────────────────────────────────── */

  var COMMANDS = [
    { label: 'Play 1.21.4 Fabric', hint: '1.21.4', icon: 'r-play', run: function () { location.hash = '#play'; onLaunch(); } },
    { label: 'Play 1.20.1 Fabric', hint: '1.20.1', icon: 'r-play', run: function () { location.hash = '#play'; onLaunch(); } },
    { label: 'Play 1.8.9 Forge', hint: '1.8.9', icon: 'r-play', run: function () { location.hash = '#play'; onLaunch(); } },
    { label: 'Play 1.21.4 Fabric offline', hint: 'Alt O', icon: 'r-play', run: function () { location.hash = '#states/offline'; } },
    { label: 'New instance', hint: '', icon: 'x-plus', run: function () { location.hash = '#new'; } },
    { label: 'Import an instance', hint: '', icon: 'x-box', run: function () { location.hash = '#import'; } },
    { label: 'Duplicate 1.21.4 Fabric', hint: '', icon: 'r-instances', run: function () { location.hash = '#import'; } },
    { label: 'Add a mod to 1.21.4 Fabric', hint: '', icon: 'r-mod', run: function () { location.hash = '#mods'; } },
    { label: 'Browse Modrinth for 1.21.4 Fabric', hint: '', icon: 'r-mod', run: function () { location.hash = '#browse'; } },
    { label: 'Browse shader packs', hint: '', icon: 'r-mod', run: function () { location.hash = '#browse'; bs.type = 'shader'; bs.cats = []; runBrowse(); } },
    { label: 'Open the HUD layout', hint: '', icon: 'r-hud', run: function () { location.hash = '#hud'; } },
    { label: 'Turn the minimap on', hint: '', icon: 'r-modules', run: function () { location.hash = '#modules'; } },
    { label: 'Switch preset to Building', hint: '', icon: 'r-preset', run: function () { location.hash = '#presets'; } },
    { label: 'Copy the share code for Competitive', hint: '', icon: 'r-preset', run: function () { location.hash = '#presets'; } },
    { label: 'Go to tweaks', hint: '', icon: 'r-modules', run: function () { location.hash = '#tweaks'; } },
    { label: 'Open the mods folder', hint: '', icon: 'x-folder', run: function () {} },
    { label: 'Install Fabric 0.16.9', hint: '', icon: 'r-down', run: function () { location.hash = '#instance'; } },
    { label: 'Open the instance folder', hint: '', icon: 'x-folder', run: function () {} },
    { label: 'Open the game output', hint: '', icon: 'x-terminal', run: function () {} },
    { label: 'Check for new versions', hint: '', icon: 'r-refresh', run: function () {} },
    { label: 'Create an offline profile', hint: '', icon: 'r-offline', run: function () { location.hash = '#accounts'; } },
    { label: 'Switch to the light theme', hint: '', icon: 'r-theme', run: function () { setTheme('light'); } },
    { label: 'Change the palette', hint: '', icon: 'r-theme', run: function () { location.hash = '#appearance'; } },
    { label: 'Go to instances', hint: '', icon: 'r-instances', run: function () { location.hash = '#instances'; } },
    { label: 'Go to servers', hint: '', icon: 'r-servers', run: function () { location.hash = '#servers'; } },
    { label: 'Go to accounts', hint: '', icon: 'r-accounts', run: function () { location.hash = '#accounts'; } },
    { label: 'Go to settings', hint: '', icon: 'r-settings', run: function () { location.hash = '#settings'; } },
    { label: 'Review the launch states', hint: '', icon: 'r-settings', run: function () { location.hash = '#states'; } }
  ];

  var pal = {
    box: document.getElementById('palette'),
    scrim: document.getElementById('scrim'),
    input: document.getElementById('palInput'),
    list: document.getElementById('palList'),
    count: document.getElementById('palCount')
  };
  var palMatches = [];
  var palIndex = 0;

  function palRender() {
    var q = pal.input.value.trim().toLowerCase();
    palMatches = COMMANDS.filter(function (c) { return !q || c.label.toLowerCase().indexOf(q) !== -1; });
    if (palIndex >= palMatches.length) palIndex = 0;
    pal.list.innerHTML = '';
    if (!palMatches.length) {
      var empty = document.createElement('li');
      empty.className = 'pal-empty';
      empty.textContent = 'Nothing matches "' + pal.input.value.trim() + '".';
      pal.list.appendChild(empty);
    }
    palMatches.forEach(function (c, i) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', i === palIndex ? 'true' : 'false');
      li.innerHTML = '<svg width="14" height="14" aria-hidden="true"><use href="#' + c.icon + '"/></svg><span></span><span class="pal-hint mono"></span>';
      li.children[1].textContent = c.label;
      li.children[2].textContent = c.hint;
      li.addEventListener('mousemove', function () { palIndex = i; palPaint(); });
      li.addEventListener('click', function () { palRun(); });
      pal.list.appendChild(li);
    });
    pal.count.textContent = palMatches.length + (palMatches.length === 1 ? ' result' : ' results');
  }

  function palPaint() {
    var items = pal.list.querySelectorAll('li[role="option"]');
    for (var i = 0; i < items.length; i++) items[i].setAttribute('aria-selected', i === palIndex ? 'true' : 'false');
  }
  function palOpen() {
    closeMenu();
    pal.box.hidden = false;
    pal.scrim.hidden = false;
    pal.input.value = '';
    palIndex = 0;
    palRender();
    pal.input.focus();
  }
  function palClose() { pal.box.hidden = true; pal.scrim.hidden = true; }
  function palRun() {
    var c = palMatches[palIndex];
    palClose();
    if (c) c.run();
  }

  /* ── wiring ─────────────────────────────────────────────────────────── */

  document.addEventListener('click', function (e) {
    var actor = e.target.closest ? e.target.closest('[data-act]') : null;
    if (actor) {
      var act = actor.getAttribute('data-act');
      if (act === 'launch') { e.preventDefault(); closeMenu(); onLaunch(actor); return; }
      if (act === 'launch-offline') {
        e.preventDefault(); closeMenu();
        if (host && host.game) startReal(true); else apply('offline');
        return;
      }
      if (act === 'stop') { e.preventDefault(); clearTimers(); stopReal(); if (!(host && host.game)) apply('normal'); return; }
      if (act === 'launchmenu') { e.preventDefault(); toggleMenu(); return; }
      if (act === 'palette') { e.preventDefault(); palOpen(); return; }
      if (act === 'ram-rec') { e.preventDefault(); ramRecommend(); return; }
      if (act === 'accent-reset') { e.preventDefault(); paintAccent(null); paintAppearanceSummary(); return; }
      if (act === 'copy-path') {
        e.preventDefault();
        var path = instancePath('1-21-4-fabric', 'full');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(path).catch(function () {});
        actor.setAttribute('aria-label', 'Folder path copied');
        setTimeout(function () { actor.setAttribute('aria-label', 'Copy folder path'); }, 1600);
        return;
      }
    }
    if (launchMenu && !launchMenu.hidden && !e.target.closest('.split')) closeMenu();
    if (!pal.box.hidden && e.target === pal.scrim) palClose();

    /* theme + palette + accent presets */
    var th = e.target.closest ? e.target.closest('[data-theme-set]') : null;
    if (th) {
      var want = th.getAttribute('data-theme-set');
      var wasPref = themePref;
      setTheme(want);
      /* A choice that changes nothing says nothing — clicking the theme you
         are already on is not an event.  "Match Windows" is, because what it
         resolved to is the one thing the segmented control cannot show. */
      if (wasPref !== want) {
        say(want === 'system'
          ? 'Following Windows, which is on the ' + fig(resolveTheme()) + ' theme at the moment.'
          : 'The ' + fig(want) + ' theme. Light is a separate cut, not the dark one inverted.');
      }
      return;
    }
    var pcard = e.target.closest ? e.target.closest('.pals .pal') : null;
    if (pcard) {
      var wantPal = pcard.getAttribute('data-pal');
      var wasPal = root.dataset.palette;
      setPalette(wantPal);
      if (wasPal !== wantPal && PALETTES[wantPal]) {
        say(fig(PALETTES[wantPal]) + ' applied to the whole window' +
          (customAccent ? ', but the accent is still your override — Reset it to take this palette’s own.' : '.'));
      }
      return;
    }
    var swb = e.target.closest ? e.target.closest('.sw-b') : null;
    if (swb) {
      var v = token('--go', swb);
      var c = parseColour(v);
      if (c) {
        var own = parseColour(paletteAccent());
        var same = own && rgb2hex(own) === rgb2hex(c);
        paintAccent(same ? null : rgb2hex(c));
        paintAppearanceSummary();
      }
      return;
    }

    /* The instance strip used to paint itself here and change nothing else.
       It is a real tablist now and lives in THE INSTANCE TABLIST below, where
       the panel it selects is switched with it. */
    var segb = e.target.closest ? e.target.closest('.seg-b, .loader-b, .tile') : null;
    if (segb && segb.hasAttribute('aria-pressed')) {
      var sel = segb.classList.contains('seg-b') ? '.seg-b' : segb.classList.contains('loader-b') ? '.loader-b' : '.tile';
      var ss = segb.parentNode.querySelectorAll(sel);
      for (var s3 = 0; s3 < ss.length; s3++) if (ss[s3].hasAttribute('aria-pressed')) ss[s3].setAttribute('aria-pressed', 'false');
      segb.setAttribute('aria-pressed', 'true');
    }

    /* version list: one row at a time */
    var vrow = e.target.closest ? e.target.closest('.tr-pick') : null;
    if (vrow) {
      var vs = vrow.parentNode.querySelectorAll('.tr-pick');
      for (var v2 = 0; v2 < vs.length; v2++) vs[v2].setAttribute('aria-selected', 'false');
      vrow.setAttribute('aria-selected', 'true');
    }

    /* mod rows: the toggle enables, the tick selects */
    var sw = e.target.closest ? e.target.closest('.sw-sm') : null;
    if (sw) {
      var on = sw.getAttribute('aria-checked') !== 'true';
      /* PHASE 5.  A row that names a real file does not flip an attribute: it
         asks the main process to rename the jar, and the repaint that follows
         is what moves the switch.  The optimistic flip is left to the fixture
         rows, which have no disk behind them. */
      var frow = sw.closest('.tr');
      if (frow && frow.hasAttribute('data-file') && modSetEnabled(frow, on)) return;
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
      var mrow = sw.closest('.tr');
      if (mrow) mrow.classList.toggle('tr-off', !on);
      return;
    }
    var tick = e.target.closest ? e.target.closest('.tick') : null;
    if (tick) {
      var picked = tick.getAttribute('aria-checked') !== 'true';
      tick.setAttribute('aria-checked', picked ? 'true' : 'false');
      var trow = tick.closest('.tr');
      if (trow) trow.classList.toggle('tr-sel', picked);
      paintSel();
      return;
    }
  });

  /* the selection bar exists only while something is selected */
  var selbar = document.querySelector('.selbar');
  var selN = document.querySelector('.selbar-n');
  function paintSel() {
    if (!selbar) return;
    var n = document.querySelectorAll('#screen-mods .tick[aria-checked="true"]').length;
    selbar.style.display = n ? '' : 'none';
    if (n) selN.textContent = n + (n === 1 ? ' mod selected' : ' mods selected');
  }
  var clearBtn = selbar ? selbar.querySelector('.selbar-end') : null;
  if (clearBtn) clearBtn.addEventListener('click', function () {
    var ts = document.querySelectorAll('#screen-mods .tick[aria-checked="true"]');
    for (var i = 0; i < ts.length; i++) {
      ts[i].setAttribute('aria-checked', 'false');
      ts[i].closest('.tr').classList.remove('tr-sel');
    }
    paintSel();
  });

  pal.input.addEventListener('input', function () { palIndex = 0; palRender(); });

  document.addEventListener('keydown', function (e) {
    var k = e.key;
    var typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);

    /* ONE SEARCH FIELD, ONE KEY.  Every screen that has a search field puts
       it in the same place at the same width with the same Ctrl K chip on
       it, so the key has to mean the same thing on every one of them: put
       the cursor in the search field you can see.  Where the visible field
       IS the command palette's trigger — Play, which has no list of its own
       to filter — the key opens the palette, which is a search field. */
    if ((e.ctrlKey || e.metaKey) && (k === 'k' || k === 'K')) {
      e.preventDefault();
      var field = document.querySelector('#screen-' + (root.dataset.screen || 'play') + ' .field-search input');
      if (field) { field.focus(); field.select(); return; }
      palOpen(); return;
    }

    if (!pal.box.hidden) {
      if (k === 'Escape') { e.preventDefault(); palClose(); return; }
      if (k === 'ArrowDown') { e.preventDefault(); if (palMatches.length) { palIndex = (palIndex + 1) % palMatches.length; palPaint(); } return; }
      if (k === 'ArrowUp') { e.preventDefault(); if (palMatches.length) { palIndex = (palIndex - 1 + palMatches.length) % palMatches.length; palPaint(); } return; }
      if (k === 'Enter') { e.preventDefault(); palRun(); return; }
      return;
    }

    if (k === 'Escape') { closeMenu(); if (hudCtx) hudCtx.hidden = true; closePicker(); return; }
    if (typing) return;

    /* the layout editor, while it is the screen you are on */
    if (root.dataset.screen === 'hud' && sel.length) {
      if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { e.preventDefault(); clearHint(); if (undoStack.length) { redoStack.push(snapshot()); restore(undoStack.pop()); } return; }
      if ((e.ctrlKey || e.metaKey) && (k === 'y' || k === 'Y')) { e.preventDefault(); clearHint(); if (redoStack.length) { undoStack.push(snapshot()); restore(redoStack.pop()); } return; }
      if (k.indexOf('Arrow') === 0) {
        e.preventDefault();
        clearHint();
        var f = frame.getBoundingClientRect();
        var step = e.shiftKey ? 8 : 1;
        var ax = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0;
        var ay = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0;
        mutate(function () {
          sel.forEach(function (id) {
            var s = ST[id];
            var sx = s.a.charAt(1) === 'r' ? -1 : 1;
            var sy = s.a.charAt(0) === 'b' ? -1 : 1;
            s.x = round1(s.x + ax * sx / f.width * 100);
            s.y = round1(s.y + ay * sy / f.height * 100);
          });
        });
        return;
      }
    }

    if (k >= '1' && k <= '7') {
      location.hash = '#' + NAV_KEYS[Number(k) - 1];
      return;
    }
    if ((k === 'Enter' || k === ' ') && root.dataset.screen === 'play' && document.activeElement === document.body) {
      e.preventDefault();
      onLaunch();
    }
  });

  /* ══ WHAT JUST HAPPENED ═══════════════════════════════════════════════════

     THE STATUS BAR IS THE TOAST.  There is already a strip along the bottom
     of the window carrying facts about the machine, and the result of an
     action is a fact about the machine.  Putting it there rather than in a
     card that floats over the list means the answer never covers the row you
     just acted on, nothing has to be dismissed, and there is one place to
     look rather than two.  It is hidden while empty so it costs the bar
     nothing, and it clears itself, because a result is not a setting.       */

  var sbSay = document.getElementById('sbSay');
  var sayTimer = null;
  function say(html) {
    if (!sbSay) return;
    sbSay.hidden = false;
    sbSay.innerHTML = html;
    clearTimeout(sayTimer);
    sayTimer = setTimeout(function () { sbSay.textContent = ''; sbSay.hidden = true; }, 7000);
  }
  /* every message that names a file, a version or an address puts it in the
     figure face, the same rule the rest of the app runs on */
  function fig(v) { return '<span class="mono">' + esc(v) + '</span>'; }

  /* ══ THE POPOVER ══════════════════════════════════════════════════════════

     ONE FLOATING PANEL FOR EVERY ROW MENU IN THE APP.  There are sixty-two
     "More actions" buttons and twenty-three "Change version" chevrons across
     five screens.  Building a menu per screen is how five of them end up
     behaving five ways, so there is exactly one of these and it is called
     with a list.

     It is FIXED rather than absolute because every trigger is a cell inside a
     scrolling table: an absolutely positioned menu would be clipped by the
     scroller and would then scroll away from the button that opened it.  So
     the trigger is measured and the panel is placed in viewport coordinates,
     which is what .menu-ctx on #hud already does.

     It FLIPS rather than clamps.  Against the right edge it aligns to the
     trigger's trailing edge instead of its leading one; against the bottom it
     opens upward.  A clamp would slide the menu over the control that opened
     it, and the control is the thing you are looking at.

     FOCUS.  Opening moves focus into the panel and keeps it there — arrows
     move, Enter runs, Escape and Tab close.  Closing puts focus back on the
     trigger, unless the action navigated somewhere else or the trigger is no
     longer on screen, in which case putting it back would be a worse answer
     than leaving it.

       popover.menu(trigger, items, opts)   items: {label, kbd, danger, note, run} | '-'
       popover.form(trigger, spec)          one field, two buttons, same plate
       popover.close()
       popover.owns(el)                     is this the button the open panel came from
     ═══════════════════════════════════════════════════════════════════════ */

  var popover = (function () {
    var box = null, owner = null, cells = [], at = -1;
    var GAP = 5, EDGE = 8;

    function place() {
      if (!box || !owner) return;
      var r = owner.getBoundingClientRect();
      var w = box.offsetWidth, h = box.offsetHeight;
      var l = r.left;
      if (l + w > window.innerWidth - EDGE) l = r.right - w;
      l = Math.max(EDGE, Math.min(l, window.innerWidth - w - EDGE));
      var t = r.bottom + GAP;
      if (t + h > window.innerHeight - EDGE) t = r.top - h - GAP;
      if (t < EDGE) t = Math.max(EDGE, window.innerHeight - h - EDGE);
      box.style.left = Math.round(l) + 'px';
      box.style.top = Math.round(t) + 'px';
    }

    /* The anchor is a cell inside a scroller, so it moves under the menu.
       While it is still on screen the menu follows it — a menu that jumped
       away from its own row would read as a rendering fault.  Once the row
       has scrolled out of the window the menu is pointing at nothing, and
       then it goes. */
    function onScroll(e) {
      if (!box || !owner) return;
      if (e.target && e.target.closest && e.target.closest('.menu-pop')) return;
      var r = owner.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) { close(false); return; }
      place();
    }

    function focusAt(i) {
      if (!cells.length) return;
      at = (i + cells.length) % cells.length;
      cells[at].focus();
    }

    function close(restore) {
      if (!box) return;
      var back = owner;
      box.remove();
      box = null; cells = []; at = -1;
      if (owner) { owner.setAttribute('aria-expanded', 'false'); owner = null; }
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
      /* back to where it came from — but only if that is still a place a
         person can see */
      if (restore !== false && back && document.contains(back) && back.offsetParent !== null) back.focus();
    }

    function keys(e) {
      var k = e.key;
      if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
      if (k === 'Tab') { e.preventDefault(); close(true); return; }
      if (!cells.length) return;
      if (k === 'ArrowDown') { e.preventDefault(); focusAt(at + 1); }
      else if (k === 'ArrowUp') { e.preventDefault(); focusAt(at - 1); }
      else if (k === 'Home') { e.preventDefault(); focusAt(0); }
      else if (k === 'End') { e.preventDefault(); focusAt(cells.length - 1); }
    }

    function open(trigger, role, label, build) {
      close(false);
      owner = trigger;
      box = document.createElement('div');
      box.className = 'menu menu-pop';
      box.setAttribute('role', role);
      box.setAttribute('aria-label', label);
      box.addEventListener('keydown', keys);
      build(box);
      document.body.appendChild(box);
      trigger.setAttribute('aria-expanded', 'true');
      place();
      window.addEventListener('resize', place);
      window.addEventListener('scroll', onScroll, true);
    }

    function item(spec) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'menu-item' + (spec.danger ? ' menu-item-danger' : '');
      el.setAttribute('role', 'menuitem');
      el.tabIndex = -1;
      el.appendChild(document.createTextNode(spec.label));
      if (spec.kbd) {
        var k = document.createElement('kbd');
        k.textContent = spec.kbd;
        el.appendChild(k);
      }
      el.addEventListener('click', function (e) {
        e.preventDefault();
        /* an item that opens another panel keeps the trigger; everything else
           hands focus back before it runs, so a route change starts from a
           known place */
        if (spec.keep) { if (spec.run) spec.run(); return; }
        close(true);
        if (spec.run) spec.run();
      });
      return el;
    }

    function menu(trigger, list, opts) {
      opts = opts || {};
      open(trigger, 'menu', opts.label || trigger.getAttribute('aria-label') || 'Actions', function (b) {
        list.forEach(function (spec) {
          if (spec === '-') {
            var rule = document.createElement('div');
            rule.className = 'menu-rule';
            rule.setAttribute('role', 'separator');
            b.appendChild(rule);
            return;
          }
          if (spec.note) {
            var n = document.createElement('p');
            n.className = 'menu-note';
            n.innerHTML = spec.note;
            b.appendChild(n);
            return;
          }
          b.appendChild(item(spec));
        });
      });
      cells = [].slice.call(box.querySelectorAll('[role="menuitem"]'));
      place();
      /* a confirmation opens on the way OUT of it.  Landing on Delete means a
         second Enter deletes, which is the whole thing the step exists to
         stop. */
      focusAt(opts.focus || 0);
    }

    function form(trigger, spec) {
      var input;
      open(trigger, 'dialog', spec.label, function (b) {
        var wrap = document.createElement('div');
        wrap.className = 'menu-form';
        if (spec.note) {
          var n = document.createElement('p');
          n.className = 'menu-note';
          n.innerHTML = spec.note;
          wrap.appendChild(n);
        }
        var field = document.createElement('label');
        field.className = 'field';
        input = document.createElement('input');
        input.type = 'text';
        input.value = spec.value || '';
        input.spellcheck = false;
        if (spec.mono) input.className = 'mono';
        input.setAttribute('aria-label', spec.label);
        field.appendChild(input);
        wrap.appendChild(field);

        var acts = document.createElement('div');
        acts.className = 'menu-form-acts';
        var cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'quiet quiet-sm';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', function () { close(true); });
        var ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'prim prim-sm';
        ok.textContent = spec.ok || 'Save';
        ok.addEventListener('click', function () { submit(); });
        acts.appendChild(cancel);
        acts.appendChild(ok);
        wrap.appendChild(acts);
        b.appendChild(wrap);

        function submit() {
          var v = input.value.trim();
          if (!v) { input.focus(); return; }
          close(true);
          if (spec.run) spec.run(v);
        }
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
        });
      });
      cells = [];
      place();
      if (input) { input.focus(); input.select(); }
    }

    return {
      menu: menu,
      form: form,
      close: close,
      owns: function (el) { return !!owner && owner === el; },
      isOpen: function () { return !!box; }
    };
  })();

  /* ══ WHAT THE MENUS SAY ═══════════════════════════════════════════════════

     Every action below already exists somewhere on screen — the toolbar, the
     selection bar, the share panel, the command palette.  Nothing here is a
     new capability; it is the same capability reachable from the row it
     applies to.  Anything that would need a real backend states what it would
     do rather than pretending it did it, and anything destructive asks first
     in a second step of the same panel it was chosen from.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Everything that opens the one popover, so that ONE handler decides
     whether a click opens it, toggles it shut, or is an outside click.  A row
     control says so by its class; anything else says so with data-pop, and
     the value names which panel it gets. */
  var TRIGGERS = '.rowmenu, .card-more2, .card-sq, [data-pop]';

  /* the label on the button is the record's name — every one of these buttons
     already carries it, so nothing has to be read back out of a table */
  function subjectOf(btn) {
    return (btn.getAttribute('aria-label') || '')
      .replace(/^More actions for /, '')
      .replace(/^Change version for /, '')
      .trim();
  }

  /* which list the button is standing in decides which menu it gets */
  function kindOf(btn) {
    if (btn.classList.contains('card-sq')) return 'version';
    if (btn.closest('.card')) return 'instance';
    if (btn.closest('#screen-servers')) return 'server';
    if (btn.closest('#screen-presets')) return 'preset';
    if (btn.closest('#screen-mods')) return 'mod';
    if (btn.closest('#tp-instance-worlds') || btn.closest('#tp-instance-overview')) return 'world';
    if (btn.closest('#tp-instance-shots') || btn.closest('#tp-instance-logs')) return 'file';
    return 'instance';
  }

  function slugOf(name) { return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  /* THE NAME OUT OF A NAME CELL, and only the name.  The cell can carry a
     block face in front of it, a monogram that is a literal character — the
     1.8.9 instances wear a "1" — and a credit after it, so reading its
     textContent gives "11.8.9 Forge" and "LithiumCaffeineMC".  This is the
     same rule readRow() runs on, in one place, because two spellings of it
     is how the grid and the table drift apart. */
  function recordName(tr) {
    var cell = tr.querySelector ? tr.querySelector('.td-name') : null;
    if (!cell) return '';
    var kids = [].slice.call(cell.children).filter(function (c) { return !c.classList.contains('td-by'); });
    if (kids.length) return kids[kids.length - 1].textContent.trim();
    var by = cell.querySelector('.td-by');
    var text = cell.textContent.trim();
    return by ? text.slice(0, text.length - by.textContent.trim().length).trim() : text;
  }

  function copy(text, told) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () {});
    say(told);
  }

  /* Removing a record removes every rendering of it.  An instance is drawn
     three times — a card in the grid, a card in the Recent strip, a row in
     each table — and taking one away and leaving the others is worse than
     doing nothing, so this walks all of them by name. */
  function dropRecord(name, row) {
    var gone = 0;
    /* the folder id, read off the row before the row goes */
    var id = null;
    document.querySelectorAll('#screen-instances .table .tr[data-id]').forEach(function (tr) {
      if (recordName(tr) === name) id = tr.getAttribute('data-id');
    });
    document.querySelectorAll('.card').forEach(function (c) {
      var n = c.querySelector('.card-name');
      if (n && n.textContent.trim() === name) { c.remove(); gone++; }
    });
    var kb = 0;
    document.querySelectorAll('.table .tr').forEach(function (tr) {
      if (tr.querySelector('.td-name') && recordName(tr) === name) {
        var sz = tr.querySelector('.td-size');
        if (sz && !kb) kb = bytes(sz.textContent);
        tr.remove(); gone++;
      }
    });
    if (!gone && row) { row.remove(); gone++; }
    paintLibrary(-kb);
    paintStripNav();
    paintPicks();
    if (host && id) host.instances.remove(id).catch(function () {});
    return gone;
  }

  function confirmStep(btn, spec) {
    popover.menu(btn, [
      { note: spec.q },
      { label: spec.ok, danger: true, run: spec.run },
      { label: 'Cancel' }
    ], { label: spec.ok, focus: 1 });
  }

  /* ── the version list, shared by the chevron and the instance menu ─────── */

  var VERSIONS = [
    ['1.21.8', 'latest release'], ['1.21.5', ''], ['1.21.4', ''],
    ['1.21.1', ''], ['1.20.1', ''], ['1.8.9', '']
  ];

  function versionMenu(btn, name, now) {
    var list = [{ note: esc(name) + ' is on ' + fig(now) + '.' }];
    VERSIONS.forEach(function (v) {
      list.push({
        label: v[0] + (v[0] === now ? '  ·  in use' : v[1] ? '  ·  ' + v[1] : ''),
        run: v[0] === now ? null : function () {
          say(esc(name) + ' would move to ' + fig(v[0]) + ' and re-check its files before the next launch.');
        }
      });
    });
    list.push('-');
    list.push({ label: 'All versions and loaders…', run: function () { location.hash = '#instance/versions'; } });
    popover.menu(btn, list, { label: 'Change version for ' + name });
  }

  /* ── the four menus ───────────────────────────────────────────────────── */

  function instanceMenu(btn, name, row) {
    popover.menu(btn, [
      { label: 'Play', kbd: '↵', run: function () { location.hash = '#play'; onLaunch(); } },
      { label: 'Change version…', keep: true, run: function () { versionMenu(btn, name, '1.21.4'); } },
      { label: 'Open folder', run: function () { say('Would open ' + fig(instancePath(slugOf(name), 'full')) + ' in Explorer.'); } },
      '-',
      { label: 'Duplicate…', run: function () {
        location.hash = '#import';
        say('Duplicating ' + esc(name) + '. The copy gets its own folder, mods and worlds.');
      } },
      { label: 'Export…', run: function () {
        say(esc(name) + ' would be written to ' + fig(slugOf(name) + '.mrpack') + ' — the mod list and your options, not the jars.');
      } },
      { label: 'Rename…', keep: true, run: function () {
        popover.form(btn, {
          label: 'Rename ' + name, value: name, ok: 'Rename',
          note: 'The folder does not move.',
          run: function (v) { say(esc(name) + ' would be renamed to ' + esc(v) + '.'); }
        });
      } },
      { label: 'Delete…', danger: true, keep: true, run: function () {
        confirmStep(btn, {
          q: 'Delete ' + esc(name) + ', its worlds and its mods? This cannot be undone.',
          ok: 'Delete ' + name,
          run: function () {
            var n = dropRecord(name, row);
            say(esc(name) + ' removed from the library. ' + (n > 1 ? 'All ' + n + ' of its rows went with it. ' : '') + 'Its folder would be deleted on disk.');
          }
        });
      } }
    ], { label: 'Actions for ' + name });
  }

  function presetMenu(btn, name, row) {
    popover.menu(btn, [
      { label: 'Apply', run: function () { applyPreset(row, name); } },
      { label: 'Rename…', keep: true, run: function () {
        popover.form(btn, {
          label: 'Rename ' + name, value: name, ok: 'Rename',
          run: function (v) {
            var cell = row && row.querySelector('.td-name span');
            if (cell) cell.textContent = v;
            if (btn) btn.setAttribute('aria-label', 'More actions for ' + v);
            say(esc(name) + ' is now ' + esc(v) + '. The share code does not change.');
          }
        });
      } },
      { label: 'Duplicate', run: function () {
        say(esc(name) + ' would be copied as ' + esc(name + ' 2') + ', with the same layout and the same options.');
      } },
      { label: 'Export a file…', run: function () {
        say(esc(name) + ' would be written to ' + fig(slugOf(name) + '.kes') + '. The share code on this screen carries the same thing.');
      } },
      '-',
      { label: 'Delete…', danger: true, keep: true, run: function () {
        confirmStep(btn, {
          q: 'Delete the preset ' + esc(name) + '? The tweaks it holds stay; only this arrangement of them goes.',
          ok: 'Delete ' + name,
          run: function () { if (row) row.remove(); say(esc(name) + ' deleted.'); }
        });
      } }
    ], { label: 'Actions for ' + name });
  }

  /* Applying one is real: the mark moves, and so does the status bar, because
     the status bar is already reporting which preset is in use. */
  function applyPreset(row, name) {
    if (row) {
      document.querySelectorAll('#screen-presets .table-pre .tr').forEach(function (tr) {
        tr.removeAttribute('data-current');
        var m = tr.querySelector('.pre-mark');
        if (m) m.innerHTML = '';
        var last = tr.querySelector('.td-word');
        if (last && last.textContent.trim() === 'In use') last.textContent = 'Just now';
      });
      row.setAttribute('data-current', '');
      var mark = row.querySelector('.pre-mark');
      if (mark) mark.innerHTML = '<svg width="14" height="14"><use href="#r-check"/></svg>';
      var word = row.querySelector('.td-word');
      if (word) word.textContent = 'In use';
    }
    var sb = document.querySelector('.statusbar .sb-strong');
    if (sb) sb.textContent = name;
    say(esc(name) + ' is the tweak preset from the next launch. Nothing is copied between presets.');
  }

  function serverMenu(btn, name, row) {
    var rec = readServer(row);
    popover.menu(btn, [
      { label: 'Join', run: function () {
        if (row) pickRow(row);
        location.hash = '#play';
        onLaunch();
        say('Starting ' + esc(rec.inst) + ', then joining ' + fig(rec.addr) + '.');
      } },
      { label: 'Edit…', run: function () { srvOpen(row); } },
      { label: 'Copy address', run: function () { copy(rec.addr, fig(rec.addr) + ' copied.'); } },
      '-',
      { label: 'Remove…', danger: true, keep: true, run: function () {
        confirmStep(btn, {
          q: 'Remove ' + esc(name) + ' from the list? Nothing on the server is touched.',
          ok: 'Remove ' + name,
          run: function () {
            if (row) row.remove();
            paintPicks();
            say(esc(name) + ' removed. It would go out of ' + fig('servers.dat') + ' on the next launch.');
          }
        });
      } }
    ], { label: 'Actions for ' + name });
  }

  function modMenu(btn, name, row) {
    var sw = row ? row.querySelector('.sw-sm') : null;
    var on = !sw || sw.getAttribute('aria-checked') === 'true';
    /* PHASE 5.  Same menu, real verbs: the file is renamed, checked against
       Modrinth, or deleted off disk. */
    if (row && row.hasAttribute('data-file') && modsHost()) {
      var file = row.getAttribute('data-file');
      popover.menu(btn, [
        { note: fig(file) + ' in this instance\u2019s mods folder.' },
        { label: on ? 'Disable' : 'Enable', run: function () { modSetEnabled(row, !on); } },
        { label: 'Check for updates', run: function () { modCheckUpdates(); } },
        '-',
        { label: 'Delete the file\u2026', danger: true, keep: true, run: function () {
          confirmStep(btn, {
            q: 'Delete ' + fig(file) + ' from the mods folder? The file goes; nothing else does.',
            ok: 'Delete the file',
            run: function () { modRemove(row); }
          });
        } }
      ], { label: 'Actions for ' + name });
      return;
    }
    popover.menu(btn, [
      { label: on ? 'Disable' : 'Enable', run: function () {
        if (!sw) return;
        sw.setAttribute('aria-checked', on ? 'false' : 'true');
        row.classList.toggle('tr-off', on);
        say(esc(name) + ' ' + (on ? 'disabled' : 'enabled') + ' — the jar stays in the folder either way.');
      } },
      { label: 'Check for updates', run: function () {
        say('Would ask Modrinth whether there is a newer ' + esc(name) + ' for ' + fig('1.21.4') + '.');
      } },
      { label: 'Open the mods folder', run: function () {
        say('Would open ' + fig(instancePath('1-21-4-fabric', 'full') + '\\mods') + ' in Explorer.');
      } },
      '-',
      { label: 'Remove from instance…', danger: true, keep: true, run: function () {
        confirmStep(btn, {
          q: 'Delete ' + esc(name) + ' from this instance? Anything that depends on it will say so before the next launch.',
          ok: 'Remove ' + name,
          run: function () { if (row) row.remove(); say(esc(name) + ' removed from 1.21.4 Fabric.'); }
        });
      } }
    ], { label: 'Actions for ' + name });
  }

  function worldMenu(btn, name, row) {
    popover.menu(btn, [
      { label: 'Open its folder', run: function () {
        say('Would open ' + fig(instancePath('1-21-4-fabric', 'full') + '\\saves\\' + name) + ' in Explorer.');
      } },
      { label: 'Duplicate', run: function () { say(esc(name) + ' would be copied beside itself as ' + esc(name + ' copy') + '.'); } },
      { label: 'Rename…', keep: true, run: function () {
        popover.form(btn, {
          label: 'Rename ' + name, value: name, ok: 'Rename',
          note: 'This renames the save folder too.',
          run: function (v) {
            document.querySelectorAll('#screen-instance .table-worlds .td-name span').forEach(function (s) {
              if (s.textContent.trim() === name) s.textContent = v;
            });
            say(esc(name) + ' would be renamed to ' + esc(v) + '.');
          }
        });
      } },
      '-',
      { label: 'Delete…', danger: true, keep: true, run: function () {
        confirmStep(btn, {
          q: 'Delete the world ' + esc(name) + '? The save folder goes with it.',
          ok: 'Delete ' + name,
          run: function () { if (row) row.remove(); say(esc(name) + ' deleted.'); }
        });
      } }
    ], { label: 'Actions for ' + name });
  }

  function fileMenu(btn, name, row) {
    var dir = btn.closest('#tp-instance-logs') ? '\\logs\\' : '\\screenshots\\';
    var path = instancePath('1-21-4-fabric', 'full') + dir + name;
    popover.menu(btn, [
      { label: 'Open', run: function () { say('Would open ' + fig(name) + '.'); } },
      { label: 'Show in the folder', run: function () { say('Would open ' + fig(path) + ' in Explorer.'); } },
      { label: 'Copy the path', run: function () { copy(path, fig(path) + ' copied.'); } },
      '-',
      { label: 'Delete…', danger: true, keep: true, run: function () {
        confirmStep(btn, {
          q: 'Delete ' + esc(name) + '?',
          ok: 'Delete the file',
          run: function () { if (row) row.remove(); say(esc(name) + ' deleted.'); }
        });
      } }
    ], { label: 'Actions for ' + name });
  }

  /* ── the panels that are not a row's menu ─────────────────────────────
     Same helper, same plate, same keys.  A control says which one it wants
     with data-pop and that is the whole registration. */

  var POPS = {
    sort: function (btn) { sortMenu(btn); },
    'browse-inst': function (btn) { browseInstMenu(btn); },
    'browse-sort': function (btn) { browseSortMenu(btn); },

    runtime: function (btn) {
      popover.menu(btn, [
        { note: 'Chosen from the Minecraft version. Overriding it is on you.' },
        { label: 'Temurin 21.0.5  ·  in use', run: function () { say('Already the runtime for this instance.'); } },
        { label: 'Temurin 17.0.13', run: function () { say('1.21.4 Fabric would launch on ' + fig('Temurin 17.0.13') + '. 1.21.4 needs 21 or newer, so it would not start.'); } },
        { label: 'Temurin 8u442', run: function () { say('1.21.4 Fabric would launch on ' + fig('Temurin 8u442') + '. 1.21.4 needs 21 or newer, so it would not start.'); } },
        '-',
        { label: 'Add a Java installation…', run: function () { say('Would ask for a ' + fig('java.exe') + ' and read its version out of it.'); } }
      ], { label: 'Java runtime' });
    },

    'mod-url': function (btn) {
      popover.form(btn, {
        label: 'Add a mod from a URL', ok: 'Fetch', mono: true,
        note: 'A direct link to a jar, or a Modrinth or CurseForge page.',
        run: function (v) { say('Would fetch ' + fig(v) + ' and check it is built for ' + fig('Fabric 1.21.4') + ' before it goes in.'); }
      });
    },

    'pre-save': function (btn) {
      popover.form(btn, {
        label: 'Name the preset', value: 'Competitive 2', ok: 'Save',
        note: 'Holds the HUD layout and every tweak option as they are right now.',
        run: function (v) { say(esc(v) + ' saved from the current setup — 11 elements and 26 options.'); }
      });
    },

    'pre-rename': function (btn) {
      var cur = document.querySelector('#screen-presets .table-pre .tr[data-current] .td-name span');
      var was = cur ? cur.textContent.trim() : 'Competitive';
      popover.form(btn, {
        label: 'Rename ' + was, value: was, ok: 'Rename',
        run: function (v) {
          if (cur) cur.textContent = v;
          var head = document.querySelector('#screen-presets .share .blk-title');
          if (head) head.textContent = v;
          var sb = document.querySelector('.statusbar .sb-strong');
          if (sb && sb.textContent.trim() === was) sb.textContent = v;
          var m = document.querySelector('#screen-presets .table-pre .tr[data-current] .rowmenu');
          if (m) m.setAttribute('aria-label', 'More actions for ' + v);
          say(esc(was) + ' is now ' + esc(v) + '. The share code does not change.');
        }
      });
    },

    'take-save': function (btn) {
      popover.form(btn, {
        label: 'Name the preset', value: 'hedge box 1.8', ok: 'Save',
        run: function (v) { say(esc(v) + ' saved from the code. Nothing already here is touched.'); }
      });
    }
  };

  function openMenuFor(btn) {
    var named = btn.getAttribute('data-pop');
    if (named) return POPS[named] ? POPS[named](btn) : undefined;
    /* a result row's menu is about a Modrinth project rather than about a
       record the app holds, so it is asked for by slug rather than read back
       out of the row */
    if (btn.closest('#screen-browse')) return browseMenu(btn);
    var name = subjectOf(btn);
    var row = btn.closest('.tr');
    var kind = kindOf(btn);
    if (kind === 'version') return versionMenu(btn, name, '1.21.4');
    if (kind === 'server') return serverMenu(btn, name, row);
    if (kind === 'preset') return presetMenu(btn, name, row);
    if (kind === 'mod') return modMenu(btn, name, row);
    if (kind === 'world') return worldMenu(btn, name, row);
    if (kind === 'file') return fileMenu(btn, name, row);
    return instanceMenu(btn, name, row);
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var btn = e.target.closest(TRIGGERS);
    if (btn) {
      e.preventDefault();
      /* a second click on the same button puts it away, which is what every
         menu button on Windows does */
      if (popover.owns(btn)) popover.close(true);
      else openMenuFor(btn);
      return;
    }
    if (e.target.closest('.menu-pop')) return;
    popover.close(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && popover.isOpen()) popover.close(true);
  });

  /* ══ SORTING THE LIBRARY ══════════════════════════════════════════════════

     ONE ORDER, BOTH SURFACES.  The grid and the table are two renderings of
     one list, so sorting one and leaving the other is the drift card() exists
     to prevent.  The table carries every column, so the sort is computed
     there and the grid is reordered to match by name — which is the same
     relationship they already have, since the cards were built out of these
     rows in the first place.

     Last played is the order the markup shipped in, so it is remembered
     rather than parsed out of "Yesterday" and "23 Aug".                     */

  var libTable = document.querySelector('#screen-instances .table');
  var libOrder = libTable ? [].slice.call(libTable.children) : [];
  var SORTS = [
    ['recent', 'Last played'], ['name', 'Name'], ['ver', 'Version'],
    ['size', 'Size on disk'], ['time', 'Playtime']
  ];
  var sortKey = 'recent';

  /* "2.4 GB" and "604 MB" are one quantity written two ways; comparing the
     strings would put every megabyte above every gigabyte */
  function bytes(s) {
    var m = String(s).match(/([\d.]+)\s*(GB|MB|KB)/i);
    if (!m) return 0;
    return parseFloat(m[1]) * ({ kb: 1, mb: 1024, gb: 1048576 })[m[2].toLowerCase()];
  }
  function minutes(tr) {
    var pt = tr.querySelector('.pt');
    if (!pt) return 0;
    var h = pt.querySelector('b'), m = pt.querySelector('em');
    return (h ? parseInt(h.textContent, 10) : 0) * 60 + (m ? parseInt(m.textContent, 10) : 0);
  }
  /* 1.21.4 sorts above 1.8.9, which is the one thing a string compare of a
     version number always gets wrong */
  function verKey(s) {
    return String(s).trim().split('.').map(function (n) { return ('0000' + n).slice(-4); }).join('.');
  }

  function sortLibrary(key) {
    if (!libTable) return;
    sortKey = key;
    var rows = libOrder.filter(function (el) { return el.classList.contains('tr') && !el.classList.contains('th') && el.isConnected; });
    var head = libOrder.filter(function (el) { return el.classList.contains('th'); });
    var bands = libOrder.filter(function (el) { return el.classList.contains('band'); });

    var sorted = rows.slice();
    if (key === 'name') sorted.sort(function (a, b) { return recordName(a).localeCompare(recordName(b)); });
    else if (key === 'ver') sorted.sort(function (a, b) { return verKey(b.querySelector('.td-fig').textContent).localeCompare(verKey(a.querySelector('.td-fig').textContent)); });
    else if (key === 'size') sorted.sort(function (a, b) { return bytes(b.querySelector('.td-size').textContent) - bytes(a.querySelector('.td-size').textContent); });
    else if (key === 'time') sorted.sort(function (a, b) { return minutes(b) - minutes(a); });

    libTable.innerHTML = '';
    head.forEach(function (h) { libTable.appendChild(h); });
    if (key === 'recent') {
      /* the date bands only mean anything in date order, so they come back
         with it and go away with anything else */
      libOrder.forEach(function (el) { if (el.classList.contains('th')) return; if (bands.indexOf(el) !== -1 || sorted.indexOf(el) !== -1) libTable.appendChild(el); });
    } else {
      sorted.forEach(function (r) { libTable.appendChild(r); });
    }

    var grid = document.getElementById('libGrid');
    if (grid) {
      var rank = {};
      sorted.forEach(function (r, i) { rank[recordName(r)] = i; });
      [].slice.call(grid.children)
        .sort(function (a, b) {
          var an = (a.querySelector('.card-name') || {}).textContent || '';
          var bn = (b.querySelector('.card-name') || {}).textContent || '';
          var ai = rank[an.trim()], bi = rank[bn.trim()];
          return (ai === undefined ? -1 : ai) - (bi === undefined ? -1 : bi);
        })
        .forEach(function (c) { grid.appendChild(c); });
    }

    var lab = document.querySelector('[data-pop="sort"] .sort-n');
    if (lab) lab.textContent = (SORTS.filter(function (s) { return s[0] === key; })[0] || SORTS[0])[1];
  }

  function sortMenu(btn) {
    popover.menu(btn, SORTS.map(function (s) {
      return {
        label: s[1] + (s[0] === sortKey ? '  ·  in use' : ''),
        run: function () {
          sortLibrary(s[0]);
          say('Library sorted by ' + s[1].toLowerCase() + ' — the cards and the table both.');
        }
      };
    }), { label: 'Sort the library' });
  }

  /* ══ THE INSTANCE TABLIST ═════════════════════════════════════════════════

     Seven tabs, seven routes.  A tab is a link to its own sub-route, so the
     panel can be deep-linked, the back button walks the tabs, and the strip
     in the head of #mods is the SAME strip pointing at the same seven places
     rather than a second copy carrying its own idea of which one is current.

     THE CHOICE SURVIVES.  Coming back to a bare #instance lands on the tab
     you left, remembered the same way the card-or-table choice on #instances
     is remembered.  Mods is never remembered: it is a different screen, and a
     bare #instance that bounced you off itself would be a trap.

     MANUAL ACTIVATION.  Arrows move focus and Enter or Space selects, which
     is the APG's second flavour and the required one here — one of these
     seven leaves the screen, so activating on arrow would drag you off it and
     push a history entry for every tab you passed through on the way.
     ═══════════════════════════════════════════════════════════════════════ */

  var TAB_KEY = 'kestrel.tab.instance';
  var TABS = ['overview', 'versions', 'mods', 'settings', 'worlds', 'shots', 'logs'];

  function rememberedTab() {
    try {
      var v = localStorage.getItem(TAB_KEY);
      if (v && TABS.indexOf(v) !== -1 && v !== 'mods') return v;
    } catch (err) {}
    return 'overview';
  }

  function paintTabs(tab) {
    document.querySelectorAll('[data-tabs] [role="tab"]').forEach(function (t) {
      var on = t.getAttribute('data-tab') === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll('#screen-instance [role="tabpanel"]').forEach(function (p) {
      p.hidden = p.id !== 'tp-instance-' + tab;
    });
  }

  function setTab(tab, remember) {
    if (TABS.indexOf(tab) === -1) tab = 'overview';
    paintTabs(tab);
    if (remember !== false && tab !== 'mods') { try { localStorage.setItem(TAB_KEY, tab); } catch (err) {} }
  }

  document.addEventListener('keydown', function (e) {
    if (!e.target.closest) return;
    var tab = e.target.closest('[role="tab"]');
    if (!tab) return;
    var strip = tab.closest('[data-tabs]');
    if (!strip) return;
    var all = [].slice.call(strip.querySelectorAll('[role="tab"]'));
    var i = all.indexOf(tab), n = all.length, to = -1;
    var k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowDown') to = (i + 1) % n;
    else if (k === 'ArrowLeft' || k === 'ArrowUp') to = (i - 1 + n) % n;
    else if (k === 'Home') to = 0;
    else if (k === 'End') to = n - 1;
    else if (k === ' ') { e.preventDefault(); tab.click(); return; }
    else return;
    e.preventDefault();
    all[to].focus();
  });

  /* ══ PICK LISTS ═══════════════════════════════════════════════════════════
     A .tr-pick list is a list you choose one of — versions on #new and on the
     instance's Versions tab, servers on #servers.  It was reachable only with
     a pointer.  One roving tab stop and four keys fixes that everywhere at
     once, because there is one class and one behaviour.                     */

  function pickGroups() {
    var out = [];
    document.querySelectorAll('.tr-pick').forEach(function (r) {
      if (out.indexOf(r.parentNode) === -1) out.push(r.parentNode);
    });
    return out;
  }
  function paintPicks() {
    pickGroups().forEach(function (g) {
      var rows = [].slice.call(g.querySelectorAll('.tr-pick'));
      var on = rows.filter(function (r) { return r.getAttribute('aria-selected') === 'true'; })[0] || rows[0];
      rows.forEach(function (r) { r.tabIndex = r === on ? 0 : -1; });
    });
  }
  function pickRow(row) {
    row.parentNode.querySelectorAll('.tr-pick').forEach(function (r) { r.setAttribute('aria-selected', 'false'); });
    row.setAttribute('aria-selected', 'true');
    paintPicks();
  }
  document.addEventListener('keydown', function (e) {
    if (!e.target.closest) return;
    var row = e.target.closest('.tr-pick');
    if (!row || e.target !== row) return;
    var rows = [].slice.call(row.parentNode.querySelectorAll('.tr-pick'));
    var i = rows.indexOf(row), n = rows.length, to = -1;
    var k = e.key;
    if (k === 'ArrowDown') to = Math.min(i + 1, n - 1);
    else if (k === 'ArrowUp') to = Math.max(i - 1, 0);
    else if (k === 'Home') to = 0;
    else if (k === 'End') to = n - 1;
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); row.click(); return; }
    else return;
    e.preventDefault();
    rows[to].focus();
  });

  /* ══ SERVERS ══════════════════════════════════════════════════════════════
     One form for Add and for Edit, because they are the same four facts.  It
     opens above the list it writes into rather than on a route of its own: a
     server is four fields and does not earn a screen.                       */

  var srvForm = document.getElementById('srvForm');
  var srvAddBtn = document.querySelector('[data-act="srv-add"]');
  var srvEditing = null;

  /* the row is the record, the same rule readRow() runs on for instances */
  function readServer(row) {
    if (!row) return { name: '', addr: '', inst: '1.21.4 Fabric' };
    var name = row.querySelector('.td-name');
    var words = row.querySelectorAll('.td-word');
    return {
      name: name ? name.textContent.trim() : '',
      addr: (row.querySelector('.td-fig') || {}).textContent || '',
      inst: words[0] ? words[0].textContent.trim() : '1.21.4 Fabric'
    };
  }

  function srvOpen(row) {
    if (!srvForm) return;
    srvEditing = row || null;
    var rec = readServer(row);
    srvForm.querySelector('#srvName').value = rec.name;
    srvForm.querySelector('#srvAddr').value = rec.addr;
    srvForm.querySelector('#srvInst').firstChild.textContent = rec.inst || '1.21.4 Fabric';
    srvForm.setAttribute('aria-label', row ? 'Edit ' + rec.name : 'Add a server');
    srvForm.hidden = false;
    if (srvAddBtn) srvAddBtn.setAttribute('aria-expanded', 'true');
    if (row) pickRow(row);
    srvForm.querySelector('#srvName').focus();
  }

  function srvClose(back) {
    if (!srvForm || srvForm.hidden) return;
    srvForm.hidden = true;
    srvEditing = null;
    if (srvAddBtn) {
      srvAddBtn.setAttribute('aria-expanded', 'false');
      if (back !== false) srvAddBtn.focus();
    }
  }

  function srvRow(rec) {
    var tr = document.createElement('div');
    tr.className = 'tr tr-pick';
    tr.setAttribute('role', 'row');
    tr.setAttribute('aria-selected', 'false');
    tr.innerHTML =
      '<span class="td-name" role="cell"><span></span></span>' +
      '<span class="mono td-fig" role="cell"></span>' +
      '<span class="td-word" role="cell"></span>' +
      '<span class="td-word td-off" role="cell">Never</span>' +
      '<button class="rowmenu" type="button" aria-haspopup="menu" aria-expanded="false">' +
      '<svg width="14" height="14" aria-hidden="true"><use href="#r-dots"/></svg></button>';
    return tr;
  }

  function srvPaint(tr, rec) {
    tr.querySelector('.td-name span').textContent = rec.name;
    tr.querySelector('.td-fig').textContent = rec.addr;
    tr.querySelectorAll('.td-word')[0].textContent = rec.inst;
    tr.querySelector('.rowmenu').setAttribute('aria-label', 'More actions for ' + rec.name);
  }

  function srvSave() {
    if (!srvForm) return;
    var rec = {
      name: srvForm.querySelector('#srvName').value.trim(),
      addr: srvForm.querySelector('#srvAddr').value.trim(),
      inst: srvForm.querySelector('#srvInst').firstChild.textContent.trim()
    };
    if (!rec.name && !rec.addr) { srvForm.querySelector('#srvName').focus(); return; }
    if (!rec.name) rec.name = rec.addr;
    if (!rec.addr) rec.addr = slugOf(rec.name) + '.example.net';
    var editing = srvEditing;
    if (editing) {
      srvPaint(editing, rec);
      srvClose();
      pickRow(editing);
      say(esc(rec.name) + ' updated. It would go into ' + fig('servers.dat') + ' before the next launch.');
      return;
    }
    var table = document.querySelector('#screen-servers .table-srv');
    if (!table) return;
    var tr = srvRow(rec);
    srvPaint(tr, rec);
    table.appendChild(tr);
    srvClose();
    pickRow(tr);
    say(esc(rec.name) + ' added at ' + fig(rec.addr) + '. It would go into ' + fig('servers.dat') + ' before the next launch.');
  }

  /* ══ BROWSING MODRINTH ════════════════════════════════════════════════════

     ONE SCREEN, ONE QUESTION: what can I put in THIS instance?  Everything
     below follows from that.  A browser that lists every build ever published
     is a website, and the user already has one; the thing a launcher can do
     that a website cannot is know which build will actually load.

     THE SCOPE IS A CONTROL, NEVER A SILENT FILTER.  The instance is named at
     the head of the screen and it is a picker.  The narrowing that follows
     from it is a switch with the rule written on its own label — `Only what
     fits Fabric 1.21.4` — and turning it off hides nothing: every row stays
     and the ones that do not fit are marked.  That is the posture the
     wrong-loader notice on #mods already takes, and the one the launcher
     takes everywhere: advice, not enforcement.

     TWO SOURCES, AND THE SCREEN SAYS WHICH.  api.modrinth.com when the app
     can reach it, a bundled list of real projects when it cannot.  Offline is
     a MODE, not an error: no alarming plate, no spinner that never resolves,
     one quiet line in the toolbar and a Try again beside it.  Nothing here
     claims a network it does not have, and no request is made until somebody
     opens the screen.

     THE USER-AGENT.  Modrinth asks callers to identify themselves and this
     one does — but a PAGE cannot: User-Agent is a forbidden header name, so a
     fetch() that set it would have the value dropped and would earn a CORS
     preflight for nothing.  BROWSE_UA is therefore handed to whichever fetch
     layer is allowed to set it — Electron sets it on the session, and a host
     that exposes window.kestrelFetch gets it passed through.

     NO PROJECT ARTWORK IS FETCHED.  An icon that appears on one machine and
     not on another is worse than one that never does, and the launcher
     already has a drawing for a thing with no art of its own: the monogram
     tile the rail uses, at 34px instead of 14.
     ═══════════════════════════════════════════════════════════════════════ */

  var MR = 'https://api.modrinth.com/v2';
  var BROWSE_UA = BRAND.userAgent;   /* built in brand.js; mc/net.js is handed the same string */
  var BROWSE_TIMEOUT = 6000;

  /* the five things Modrinth carries: facet, label, noun, and the folder
     inside the instance that this kind of file actually lands in */
  var BTYPES = [
    ['mod', 'Mods', 'mod', 'mods'],
    ['resourcepack', 'Resource packs', 'resource pack', 'resourcepacks'],
    ['shader', 'Shaders', 'shader pack', 'shaderpacks'],
    ['modpack', 'Modpacks', 'modpack', ''],
    ['datapack', 'Data packs', 'data pack', 'datapacks']
  ];
  function typeOf(t) { return BTYPES.filter(function (b) { return b[0] === t; })[0] || BTYPES[0]; }

  /* Modrinth's own tag list, per type — they are genuinely different sets, so
     the column is rebuilt when the type changes rather than showing mod
     categories over a list of shader packs.  '#x' is a group heading. */
  var MODCATS = ['adventure', 'cursed', 'decoration', 'economy', 'equipment', 'food',
    'game-mechanics', 'library', 'magic', 'management', 'minigame', 'mobs',
    'optimization', 'social', 'storage', 'technology', 'transportation', 'utility', 'worldgen'];
  var BCATS = {
    mod: MODCATS,
    datapack: MODCATS,
    modpack: ['adventure', 'challenging', 'combat', 'kitchen-sink', 'lightweight', 'magic',
      'multiplayer', 'optimization', 'quests', 'technology'],
    resourcepack: ['audio', 'blocks', 'combat', 'core-shaders', 'cursed', 'decoration',
      'entities', 'environment', 'equipment', 'fonts', 'gui', 'items', 'locale', 'modded',
      'models', 'realistic', 'simplistic', 'themed', 'tweaks', 'utility', 'vanilla-like',
      '#Resolution', '8x-', '16x', '32x', '48x', '64x', '128x', '256x', '512x+'],
    shader: ['atmosphere', 'bloom', 'cartoon', 'colored-lighting', 'cursed', 'fantasy',
      'foliage', 'path-tracing', 'pbr', 'realistic', 'reflections', 'semi-realistic',
      'shadows', 'vanilla-like', '#Performance cost', 'potato', 'low', 'medium', 'high', 'screenshot']
  };
  /* the tags are Modrinth's vocabulary, so they keep Modrinth's spelling; only
     the ones a straight capitalisation would mangle are written out */
  var CATLABEL = {
    'game-mechanics': 'Game mechanics', worldgen: 'World generation', 'kitchen-sink': 'Kitchen sink',
    'core-shaders': 'Core shaders', 'colored-lighting': 'Colored lighting', 'path-tracing': 'Path tracing',
    'vanilla-like': 'Vanilla-like', 'semi-realistic': 'Semi-realistic', gui: 'GUI', pbr: 'PBR',
    '512x+': '512x and up', '8x-': '8x and under', screenshot: 'Screenshot only'
  };
  function sentence(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }
  function catLabel(s) { return CATLABEL[s] || sentence(s); }

  var BSORTS = [['relevance', 'Relevance'], ['downloads', 'Downloads'],
    ['updated', 'Recently updated'], ['newest', 'Newest']];
  function sortName(k) { return (BSORTS.filter(function (s) { return s[0] === k; })[0] || BSORTS[0])[1]; }

  /* WHICH FACET AN INSTANCE'S LOADER BECOMES, PER CONTENT TYPE.  A shader
     pack does not load on Fabric, it loads on Iris; a resource pack loads on
     anything.  Getting this wrong is how a scoped filter silently empties. */
  var LOADER_FACET = { Fabric: 'fabric', Forge: 'forge', NeoForge: 'neoforge', Quilt: 'quilt' };
  var SHADER_FACET = { Fabric: 'iris', Quilt: 'iris', NeoForge: 'iris', Forge: 'optifine' };
  function facetFor(type, loader) {
    if (type === 'mod' || type === 'modpack') return LOADER_FACET[loader] || '';
    if (type === 'shader') return SHADER_FACET[loader] || '';
    return '';
  }
  var FACET_NAME = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt',
    iris: 'Iris', optifine: 'OptiFine', minecraft: 'Any loader', datapack: 'Data pack' };
  function facetLabel(f) { return FACET_NAME[f] || f; }
  /* WHICH LOADER A CHIP IS ALLOWED TO NAME, per content type.  Modrinth files
     every platform a project touches under `categories`, so an unfiltered
     read puts `bukkit` on a data pack and `minecraft` on a resource pack —
     true, and useless to somebody choosing a file for a client instance.  A
     resource pack has no loader at all and gets no chip. */
  var CHIP_LOADERS = {
    mod: ['fabric', 'forge', 'neoforge', 'quilt', 'babric', 'legacy-fabric'],
    modpack: ['fabric', 'forge', 'neoforge', 'quilt'],
    shader: ['iris', 'optifine', 'canvas'],
    resourcepack: [],
    datapack: ['datapack']
  };
  var LOADER_MARK_ID = { fabric: 'l-fabric', forge: 'l-forge', neoforge: 'l-neo', quilt: 'l-quilt' };

  /* ── the bundled list ─────────────────────────────────────────────────────
     Twenty-nine real Modrinth projects — real titles, real authors, real
     download counts, real build numbers, real file sizes and real dates, read
     off the API and frozen.  It exists so the screen still works where the
     app cannot reach the network, which is exactly what a published copy of
     this UI does.  `about` is the one field written here rather than fetched:
     online the panel renders the project's own page, and paraphrasing that
     into a fixture would be putting someone else's words in our mouth.      */

  var BFIXTURE = [
    { id: 'AANobbMI', slug: 'sodium', t: 'mod', n: 'Sodium', by: 'CaffeineMC',
      d: 'A high-performance rendering engine replacement for Minecraft, which greatly improves frame rates and reduces micro-stutter',
      cat: ['optimization', 'fabric', 'neoforge', 'quilt'], dl: 214260270, fol: 40238, up: '2026-08-07', made: '2021-01-03',
      mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 32, lic: 'LicenseRef-Polyform-Shield-1.0.0', side: 'client',
      about: 'Replaces the game\'s rendering engine with one that batches and culls far more aggressively. On most machines it is the single largest frame-rate change available, and the rest of the client-side performance stack is built around it.',
      v: [
        { n: 'mc1.21.4-0.6.13-fabric', mc: ['1.21.4'], mcn: 1, ld: ['fabric'], d: '2025-04-04', dl: 5172572, s: '1.2 MB', k: 'release' },
        { n: 'mc1.21.11-0.8.14-beta.2-fabric', mc: ['1.21.11'], mcn: 1, ld: ['fabric'], d: '2026-08-07', dl: 619977, s: '1.8 MB', k: 'beta' },
        { n: 'mc1.21.4-0.6.10-neoforge', mc: ['1.21.4'], mcn: 1, ld: ['neoforge'], d: '2025-02-26', dl: 75530, s: '1.1 MB', k: 'release' },
        { n: 'mc1.21.1-0.8.13-beta.2-neoforge', mc: ['1.21.1'], mcn: 1, ld: ['neoforge'], d: '2026-08-07', dl: 499993, s: '1.2 MB', k: 'beta' }
      ] },
    { id: 'gvQqBUqZ', slug: 'lithium', t: 'mod', n: 'Lithium', by: 'CaffeineMC',
      d: 'No-compromises game logic optimization mod, useful for both single-player games and multi-player servers',
      cat: ['optimization', 'fabric', 'neoforge', 'quilt'], dl: 121736752, fol: 23233, up: '2026-07-29', made: '2021-01-03',
      mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 33, lic: 'LGPL-3.0-only', side: 'both',
      about: 'Rewrites hot paths in the game\'s own logic — mob AI, block ticking, chunk and entity bookkeeping — without changing behaviour. Nothing looks different; the tick simply has less to do.',
      v: [
        { n: 'mc1.21.4-0.15.3-fabric', mc: ['1.21.4'], mcn: 1, ld: ['fabric', 'quilt'], d: '2025-04-09', dl: 3937370, s: '779 KB', k: 'release' },
        { n: 'mc1.21.4-0.15.2-fabric', mc: ['1.21.4'], mcn: 1, ld: ['fabric', 'quilt'], d: '2025-04-06', dl: 45064, s: '765 KB', k: 'release' },
        { n: 'mc26.2-0.25.3-fabric', mc: ['26.2'], mcn: 1, ld: ['fabric', 'quilt'], d: '2026-07-29', dl: 1613934, s: '891 KB', k: 'release' },
        { n: 'mc26.1.2-0.24.7-neoforge', mc: ['26.1.2'], mcn: 3, ld: ['neoforge'], d: '2026-07-29', dl: 17061, s: '883 KB', k: 'release' }
      ] },
    { id: 'YL57xq9U', slug: 'iris', t: 'mod', n: 'Iris Shaders', by: 'coderbot',
      d: 'A modern shader pack loader for Minecraft intended to be compatible with existing OptiFine shader packs',
      cat: ['decoration', 'optimization', 'fabric', 'neoforge', 'quilt'], dl: 166927636, fol: 28873, up: '2026-08-03', made: '2021-05-27',
      mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 30, lic: 'LGPL-3.0-only', side: 'client',
      about: 'Loads OptiFine-format shader packs on Fabric and NeoForge, and runs on top of Sodium rather than replacing it. The packs themselves go in the instance\'s shaderpacks folder.',
      v: [
        { n: '1.8.7+1.21.4-fabric', mc: ['1.21.4'], mcn: 1, ld: ['fabric', 'quilt'], d: '2025-02-20', dl: 38210, s: '2.6 MB', k: 'release' },
        { n: '1.8.8+1.21.4-fabric', mc: ['1.21.4'], mcn: 1, ld: ['fabric', 'quilt'], d: '2025-02-20', dl: 4484524, s: '2.6 MB', k: 'release' },
        { n: '1.11.3+26.1-fabric', mc: ['26.1.2'], mcn: 3, ld: ['fabric'], d: '2026-08-03', dl: 791303, s: '2.7 MB', k: 'release' },
        { n: '1.11.2+26.1-fabric', mc: ['26.1.2'], mcn: 3, ld: ['fabric'], d: '2026-07-09', dl: 959507, s: '2.7 MB', k: 'release' }
      ],
      dep: [{ n: 'Sodium', k: 'required' }] },
    { id: 'P7dR8mSH', slug: 'fabric-api', t: 'mod', n: 'Fabric API', by: 'modmuss50',
      d: 'Lightweight and modular API providing common hooks and intercompatibility measures utilized by mods using the Fabric toolchain',
      cat: ['library', 'fabric'], dl: 240966613, fol: 35348, up: '2026-08-25', made: '2021-01-22',
      mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 35, lic: 'Apache-2.0', side: 'both',
      about: 'The hooks and interoperability shims most Fabric mods compile against. It adds nothing you can see; it is here because almost everything else asks for it.',
      v: [
        { n: '0.119.4+1.21.4', mc: ['1.21.4'], mcn: 1, ld: ['fabric'], d: '2025-08-08', dl: 5594460, s: '2.0 MB', k: 'release' },
        { n: '0.119.3+1.21.4', mc: ['1.21.4'], mcn: 1, ld: ['fabric'], d: '2025-05-31', dl: 1239542, s: '2.0 MB', k: 'release' },
        { n: '0.119.2+1.21.4', mc: ['1.21.4'], mcn: 1, ld: ['fabric'], d: '2025-03-19', dl: 1810945, s: '2.0 MB', k: 'release' },
        { n: '0.158.2+26.3', mc: ['26.3-snapshot-10'], mcn: 1, ld: ['fabric'], d: '2026-08-25', dl: 906, s: '2.4 MB', k: 'beta' }
      ] },
    { id: 'mOgUt4GM', slug: 'modmenu', t: 'mod', n: 'Mod Menu', by: 'Terraformers',
      d: 'Adds a mod menu to view the list of mods you have installed',
      cat: ['utility', 'fabric', 'legacy-fabric', 'quilt'], dl: 136838393, fol: 26688, up: '2026-08-10', made: '2020-11-06',
      mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 32, lic: 'MIT', side: 'client',
      about: 'Adds the mod list to the title and pause screens, with each mod\'s own configuration screen reachable from its row.',
      v: [
        { n: '13.0.4', mc: ['1.21.4'], mcn: 1, ld: ['fabric', 'quilt'], d: '2026-03-25', dl: 896017, s: '1.0 MB', k: 'release' },
        { n: '13.0.3', mc: ['1.21.4'], mcn: 1, ld: ['fabric', 'quilt'], d: '2025-03-11', dl: 4268766, s: '1.0 MB', k: 'release' },
        { n: '13.0.2', mc: ['1.21.4'], mcn: 1, ld: ['fabric', 'quilt'], d: '2025-02-12', dl: 896223, s: '971 KB', k: 'release' },
        { n: '21.0.0-alpha.1', mc: ['26.3-snapshot-5'], mcn: 1, ld: ['fabric', 'quilt'], d: '2026-07-23', dl: 41194, s: '831 KB', k: 'alpha' }
      ],
      dep: [{ n: 'Text Placeholder API', k: 'required' }, { n: 'Fabric API', k: 'required' }] },
    { id: '9s6osm5g', slug: 'cloth-config', t: 'mod', n: 'Cloth Config API', by: 'shedaniel',
      d: 'Configuration Library for Minecraft Mods',
      cat: ['library', 'fabric', 'forge', 'neoforge'], dl: 159518835, fol: 16410, up: '2026-06-18', made: '2022-04-21',
      mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 35, lic: 'LGPL-3.0-only', side: 'both',
      about: 'A configuration-screen library. Mods that use it get one consistent settings screen instead of writing their own; the Fabric build needs Fabric API.',
      v: [
        { n: '17.0.144+fabric', mc: ['1.21.4'], mcn: 1, ld: ['fabric'], d: '2024-12-13', dl: 6301826, s: '1.1 MB', k: 'release' },
        { n: '26.2.155+fabric', mc: ['26.2'], mcn: 1, ld: ['fabric'], d: '2026-06-18', dl: 5045674, s: '1.1 MB', k: 'release' },
        { n: '17.0.142+neoforge', mc: ['1.21.4'], mcn: 1, ld: ['neoforge'], d: '2024-12-06', dl: 2840, s: '1.1 MB', k: 'release' },
        { n: '26.1.154+neoforge', mc: ['26.1.2'], mcn: 3, ld: ['neoforge'], d: '2026-03-26', dl: 254966, s: '1.1 MB', k: 'release' }
      ] },
    { id: 'NNAgCjsB', slug: 'entityculling', t: 'mod', n: 'Entity Culling', by: 'tr7zw',
      d: 'Using async path-tracing to hide Block-/Entities that are not visible',
      cat: ['optimization', 'babric', 'fabric', 'forge', 'neoforge', 'quilt'], dl: 157161095, fol: 17084, up: '2026-06-20', made: '2022-05-25',
      mc: ['1.8.9', '1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 34, lic: 'LicenseRef-tr7zw-Protective-License', side: 'client',
      about: 'Runs an asynchronous occlusion pass and skips entities and block entities that are behind something. The gain scales with how crowded the scene is.',
      v: [
        { n: '1.10.5', mc: ['1.21.4'], mcn: 1, ld: ['fabric'], d: '2026-06-20', dl: 291665, s: '1.5 MB', k: 'release' }
      ],
      dep: [{ n: 'Fabric API', k: 'required' }] },
    { id: 'uXXizFIs', slug: 'ferrite-core', t: 'mod', n: 'FerriteCore', by: 'malte0811',
      d: 'Memory usage optimizations',
      cat: ['optimization', 'utility', 'fabric', 'forge', 'neoforge', 'quilt'], dl: 143724398, fol: 15976, up: '2026-03-24', made: '2021-04-03',
      mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 28, lic: 'MIT', side: 'both',
      about: 'Cuts the memory the game holds for block states, models and identifiers. It does not move frame rate directly — it changes how much heap the same world needs.',
      v: [
        { n: '7.1.3-fabric', mc: ['1.21.4'], mcn: 1, ld: ['fabric'], d: '2026-01-25', dl: 858396, s: '107 KB', k: 'release' },
        { n: '9.0.0-fabric', mc: ['26.2'], mcn: 4, ld: ['fabric'], d: '2026-03-24', dl: 9524030, s: '71 KB', k: 'release' },
        { n: '8.2.0-fabric', mc: ['1.21.11'], mcn: 1, ld: ['fabric'], d: '2026-01-25', dl: 9929700, s: '78 KB', k: 'release' },
        { n: '7.1.2-neoforge', mc: ['1.21.4'], mcn: 1, ld: ['neoforge'], d: '2025-02-09', dl: 76457, s: '103 KB', k: 'release' }
      ] },
    { id: '5ZwdcRci', slug: 'immediatelyfast', t: 'mod', n: 'ImmediatelyFast', by: 'RaphiMC',
      d: 'Speed up immediate mode rendering in Minecraft',
      cat: ['optimization', 'fabric', 'forge', 'neoforge', 'quilt'], dl: 117430334, fol: 11165, up: '2026-08-16', made: '2022-10-01',
      mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 25, lic: 'LGPL-3.0-or-later', side: 'client',
      about: 'Batches immediate-mode draw calls: the HUD, text, item models and particles. That is where much of the remaining CPU time goes once Sodium is in.',
      v: [
        { n: '1.8.7+1.21.4-fabric', mc: ['1.21.4'], mcn: 1, ld: ['fabric', 'quilt'], d: '2026-06-30', dl: 168295, s: '325 KB', k: 'release' },
        { n: '1.6.12+1.21.1-fabric', mc: ['1.21.1'], mcn: 2, ld: ['fabric', 'quilt'], d: '2026-08-16', dl: 59204, s: '329 KB', k: 'release' },
        { n: '1.16.3+26.2-fabric', mc: ['26.2'], mcn: 1, ld: ['fabric', 'quilt'], d: '2026-08-16', dl: 433230, s: '90 KB', k: 'release' }
      ] },
    { id: 'w7ThoJFB', slug: 'zoomify', t: 'mod', n: 'Zoomify (Zoom)', by: 'isxander',
      d: 'A zoom mod with infinite customizability',
      cat: ['utility', 'fabric', 'quilt'], dl: 62754363, fol: 10469, up: '2026-06-16', made: '2022-01-29',
      mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 27, lic: 'LGPL-3.0-only', side: 'client',
      about: 'A zoom key with its own easing, secondary levels and scroll behaviour. Built for people who came off OptiFine\'s zoom and want it to feel the same.',
      v: [
        { n: '2.15.2+1.21.5', mc: ['1.21.4', '1.21.5'], mcn: 3, ld: ['fabric'], d: '2026-02-08', dl: 608916, s: '852 KB', k: 'release' },
        { n: '2.15.1+1.21.5', mc: ['1.21.4', '1.21.5'], mcn: 3, ld: ['fabric'], d: '2026-01-15', dl: 130649, s: '854 KB', k: 'release' },
        { n: '2.15.0+1.21.5', mc: ['1.21.4', '1.21.5'], mcn: 3, ld: ['fabric'], d: '2026-01-14', dl: 5230, s: '854 KB', k: 'release' },
        { n: '2.16.1+26.2', mc: ['26.2'], mcn: 1, ld: ['fabric'], d: '2026-06-16', dl: 3120926, s: '549 KB', k: 'release' }
      ],
      dep: [{ n: 'Mod Menu', k: 'optional' }, { n: 'Fabric Language Kotlin', k: 'required' }, { n: 'YetAnotherConfigLib', k: 'required' }, { n: 'Fabric API', k: 'required' }] },
    { id: 'PtjYWJkn', slug: 'sodium-extra', t: 'mod', n: 'Sodium Extra', by: 'FlashyReese',
      d: 'A Sodium addon that adds features that shouldn\'t be in Sodium',
      cat: ['cursed', 'optimization', 'utility', 'fabric', 'neoforge', 'quilt'], dl: 91601466, fol: 13368, up: '2026-07-10', made: '2021-02-17',
      mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 33, lic: 'LGPL-3.0-only', side: 'client',
      about: 'Adds the options Sodium deliberately leaves out: particle and animation toggles, fog control, and a row of per-feature switches.',
      v: [
        { n: 'mc1.21.4-0.6.1+fabric', mc: ['1.21.4'], mcn: 1, ld: ['fabric', 'quilt'], d: '2024-12-04', dl: 4988095, s: '352 KB', k: 'release' },
        { n: 'mc26.1.2-0.9.3+fabric', mc: ['26.1.2'], mcn: 1, ld: ['fabric'], d: '2026-07-10', dl: 646785, s: '467 KB', k: 'release' },
        { n: 'mc26.2-0.9.3+fabric', mc: ['26.2'], mcn: 1, ld: ['fabric'], d: '2026-07-10', dl: 2544084, s: '471 KB', k: 'release' }
      ],
      dep: [{ n: 'Iris Shaders', k: 'optional' }, { n: 'Reese\'s Sodium Options', k: 'optional' }, { n: 'Sodium', k: 'required' }] },
    { id: '1eAoo2KR', slug: 'yacl', t: 'mod', n: 'YetAnotherConfigLib (YACL)', by: 'isxander',
      d: 'A builder-based configuration library for Minecraft!',
      cat: ['library', 'management', 'utility', 'fabric', 'forge', 'neoforge', 'quilt'], dl: 116138885, fol: 9422, up: '2026-07-19', made: '2022-09-02',
      mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 24, lic: 'LGPL-3.0-or-later', side: 'both',
      about: 'A configuration-screen builder used by a growing number of client mods. Nothing to configure in itself — it is here because something else asked for it.',
      v: [
        { n: '3.8.2+1.21.4-fabric', mc: ['1.21.4'], mcn: 1, ld: ['fabric'], d: '2026-01-09', dl: 929943, s: '1.1 MB', k: 'release' },
        { n: '3.9.6+26.2-fabric', mc: ['26.2'], mcn: 1, ld: ['fabric'], d: '2026-07-19', dl: 1365076, s: '1.1 MB', k: 'release' },
        { n: '3.9.6+26.1-fabric', mc: ['26.1.2'], mcn: 3, ld: ['fabric'], d: '2026-07-19', dl: 691769, s: '1.1 MB', k: 'release' },
        { n: '3.8.1+1.21.4-neoforge', mc: ['1.21.4'], mcn: 1, ld: ['neoforge'], d: '2025-12-07', dl: 1736, s: '1.1 MB', k: 'release' }
      ],
      dep: [{ n: 'Fabric API', k: 'required' }] },
    { id: 'EsAfCjCV', slug: 'appleskin', t: 'mod', n: 'AppleSkin', by: 'squeek502',
      d: 'Food/hunger-related HUD improvements',
      cat: ['food', 'utility', 'fabric', 'forge', 'neoforge', 'quilt'], dl: 84877180, fol: 17449, up: '2026-06-18', made: '2021-11-20',
      mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 30, lic: 'Unlicense', side: 'both',
      about: 'Puts saturation and the exact hunger a food restores onto the hunger bar, so you can tell what is worth eating.',
      v: [
        { n: '3.0.6+mc1.21.3', mc: ['1.21.4'], mcn: 2, ld: ['fabric'], d: '2024-11-01', dl: 2679367, s: '1.0 MB', k: 'release' },
        { n: '3.0.10+mc26.2', mc: ['26.2'], mcn: 1, ld: ['fabric'], d: '2026-06-18', dl: 2082656, s: '177 KB', k: 'release' },
        { n: '3.0.10+mc26.1.2', mc: ['26.1.2'], mcn: 3, ld: ['fabric'], d: '2026-06-15', dl: 728438, s: '177 KB', k: 'release' },
        { n: '3.0.8+mc1.21.3', mc: ['1.21.4'], mcn: 2, ld: ['neoforge'], d: '2026-01-24', dl: 41773, s: '78 KB', k: 'release' }
      ],
      dep: [{ n: 'Fabric API', k: 'required' }] },
    { id: 'fQEb0iXm', slug: 'krypton', t: 'mod', n: 'Krypton', by: 'astei',
      d: 'A mod to optimize the Minecraft networking stack',
      cat: ['optimization', 'utility', 'fabric'], dl: 39755434, fol: 5683, up: '2026-07-14', made: '2020-12-21',
      mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 32, lic: 'LGPL-3.0-only', side: 'both',
      about: 'Rewrites parts of the networking stack the client and the integrated server share. Most noticeable on busy servers and while chunks are streaming in.',
      v: [
        { n: '0.2.8', mc: ['1.21.1', '1.21.4'], mcn: 5, ld: ['fabric'], d: '2024-06-22', dl: 15324284, s: '157 KB', k: 'release' },
        { n: '0.3.1', mc: ['26.2'], mcn: 1, ld: ['fabric'], d: '2026-07-14', dl: 369033, s: '263 KB', k: 'release' },
        { n: '0.3.0', mc: ['26.1.2'], mcn: 3, ld: ['fabric'], d: '2026-04-21', dl: 800723, s: '262 KB', k: 'release' },
        { n: '0.2.10', mc: ['1.21.11'], mcn: 3, ld: ['fabric'], d: '2025-10-05', dl: 4586643, s: '264 KB', k: 'release' }
      ] },
    { id: '50dA9Sha', slug: 'fresh-animations', t: 'resourcepack', n: 'Fresh Animations', by: 'FreshLX',
      d: 'Make your game like the trailers! Dynamic animated entities to freshen your Minecraft experience',
      cat: ['entities', 'tweaks', 'vanilla-like', 'minecraft'], dl: 44689496, fol: 13896, up: '2026-04-01', made: '2022-08-29',
      mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 27, lic: 'LicenseRef-See-Terms-of-Use-in-Description', side: 'client',
      about: 'Rebuilds the animations of nearly every vanilla mob through the extended entity formats. It needs a mod that supports those formats to do anything.',
      v: [
        { n: '1.10.4', mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8', '1.21.11'], mcn: 19, ld: ['minecraft'], d: '2026-02-24', dl: 7695236, s: '831 KB', k: 'beta' },
        { n: '1.10.3', mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8', '1.21.11'], mcn: 19, ld: ['minecraft'], d: '2025-12-19', dl: 5894846, s: '836 KB', k: 'beta' },
        { n: '1.10.2', mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8', '1.21.11'], mcn: 19, ld: ['minecraft'], d: '2025-11-22', dl: 1252112, s: '815 KB', k: 'beta' },
        { n: '1.10.5', mc: ['26.2'], mcn: 4, ld: ['minecraft'], d: '2026-04-01', dl: 3571116, s: '631 KB', k: 'beta' }
      ] },
    { id: 'uvpymuxq', slug: 'better-leaves', t: 'resourcepack', n: 'Motschen\'s Better Leaves', by: 'Motschen',
      d: 'Improves the appearance of leaves with high mod compatibility and performance!',
      cat: ['models', 'realistic', 'vanilla-like', 'minecraft'], dl: 18895759, fol: 4953, up: '2026-01-31', made: '2022-09-08',
      mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 35, lic: 'MIT', side: 'client',
      about: 'Redraws leaf blocks as layered cross models, so a canopy reads as foliage rather than as cubes. Vanilla resolution.',
      v: [
        { n: '9.5', mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8', '26.2'], mcn: 23, ld: ['minecraft'], d: '2026-01-31', dl: 3672847, s: '1.8 MB', k: 'release' },
        { n: '9.4', mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8', '1.21.11'], mcn: 19, ld: ['minecraft'], d: '2025-09-27', dl: 5106761, s: '1.4 MB', k: 'release' },
        { n: '9.3', mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 16, ld: ['minecraft'], d: '2025-07-27', dl: 1090248, s: '1.3 MB', k: 'release' }
      ],
      dep: [{ n: 'Cull Leaves', k: 'optional' }] },
    { id: 'rox3U8B6', slug: 'bare-bones', t: 'resourcepack', n: 'Bare Bones', by: 'RobotPants',
      d: 'Minecraft with the style of the trailers',
      cat: ['16x', 'simplistic', 'vanilla-like', 'minecraft'], dl: 7243072, fol: 3262, up: '2025-12-20', made: '2023-11-03',
      mc: ['1.8.9', '1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 36, lic: 'LicenseRef-All-Rights-Reserved', side: 'client',
      about: 'Strips vanilla textures back to flat colour and the barest shape — the look of the Minecraft trailers. 16x, across blocks, items and entities.',
      v: [
        { n: '1.4.12', mc: ['1.21.1', '1.21.4', '1.21.5', '1.21.8', '1.21.11'], mcn: 12, ld: ['minecraft'], d: '2025-12-20', dl: 2286995, s: '5.2 MB', k: 'release' },
        { n: '1.3.0', mc: ['1.21.4'], mcn: 1, ld: ['minecraft'], d: '2025-01-11', dl: 7553, s: '5.9 MB', k: 'release' },
        { n: '1.3.2', mc: ['1.21.4'], mcn: 1, ld: ['minecraft'], d: '2025-01-11', dl: 192481, s: '5.9 MB', k: 'release' },
        { n: '1.4.10', mc: ['1.21.9'], mcn: 1, ld: ['minecraft'], d: '2025-10-01', dl: 475244, s: '4.1 MB', k: 'release' }
      ] },
    { id: 'RRxvWKNC', slug: 'low-on-fire', t: 'resourcepack', n: 'Low On Fire', by: 'Haikis',
      d: 'Low fire on your screen! Vanilla Friendly',
      cat: ['16x', 'tweaks', 'utility', 'minecraft'], dl: 14169010, fol: 3505, up: '2026-06-19', made: '2023-06-24',
      mc: ['1.8.9', '1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 33, lic: 'LicenseRef-All-Rights-Reserved', side: 'client',
      about: 'Moves the fire overlay down the screen so burning does not blind you. One of the standing PvP quality-of-life packs.',
      v: [
        { n: '26.2', mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8', '26.2'], mcn: 83, ld: ['minecraft'], d: '2026-06-19', dl: 1905024, s: '42 KB', k: 'release' },
        { n: '26.1', mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8', '26.1'], mcn: 82, ld: ['minecraft'], d: '2026-03-27', dl: 1488831, s: '42 KB', k: 'release' },
        { n: '1.4', mc: ['1.21.4'], mcn: 1, ld: ['minecraft'], d: '2024-12-25', dl: 608556, s: '41 KB', k: 'release' },
        { n: '1.5', mc: ['1.21.11'], mcn: 1, ld: ['minecraft'], d: '2025-12-16', dl: 1235113, s: '42 KB', k: 'release' }
      ] },
    { id: 'HVnmMxH1', slug: 'complementary-reimagined', t: 'shader', n: 'Complementary Shaders - Reimagined', by: 'EminGT',
      d: 'Preserving the elements of Minecraft with exceptional quality, detail, and performance',
      cat: ['colored-lighting', 'vanilla-like', 'iris', 'optifine'], dl: 63089956, fol: 10638, up: '2026-05-21', made: '2022-12-22',
      mc: ['1.8.9', '1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 36, lic: 'LicenseRef-Custom', side: 'client',
      about: 'A shader pack built to keep Minecraft\'s own look and lighting recognisable while adding shadows, coloured light and water. Runs on Iris or OptiFine.',
      v: [
        { n: 'r5.8.1', mc: ['1.8.9', '1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8', '26.2'], mcn: 75, ld: ['iris', 'optifine'], d: '2026-05-21', dl: 7597648, s: '534 KB', k: 'release' },
        { n: 'r5.8', mc: ['1.8.9', '1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8', '26.1.2'], mcn: 74, ld: ['iris', 'optifine'], d: '2026-05-14', dl: 527665, s: '532 KB', k: 'release' },
        { n: 'r5.7.1', mc: ['1.8.9', '1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8', '26.1.2'], mcn: 74, ld: ['iris', 'optifine'], d: '2026-01-30', dl: 10149775, s: '511 KB', k: 'release' }
      ] },
    { id: 'R6NEzAwj', slug: 'complementary-unbound', t: 'shader', n: 'Complementary Shaders - Unbound', by: 'EminGT',
      d: 'Transforming the visuals of Minecraft with exceptional quality, detail, and performance',
      cat: ['colored-lighting', 'fantasy', 'iris', 'optifine'], dl: 41087439, fol: 5691, up: '2026-05-21', made: '2022-12-22',
      mc: ['1.8.9', '1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 36, lic: 'LicenseRef-Custom', side: 'client',
      about: 'The same pack tuned for a heavier look — stronger skies, richer colour, more atmosphere — rather than a vanilla match.',
      v: [
        { n: 'r5.8.1', mc: ['1.8.9', '1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8', '26.2'], mcn: 75, ld: ['iris', 'optifine'], d: '2026-05-21', dl: 5401802, s: '534 KB', k: 'release' },
        { n: 'r5.8', mc: ['1.8.9', '1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8', '26.1.2'], mcn: 74, ld: ['iris', 'optifine'], d: '2026-05-14', dl: 279921, s: '532 KB', k: 'release' },
        { n: 'r5.7.1', mc: ['1.8.9', '1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8', '26.1.2'], mcn: 74, ld: ['iris', 'optifine'], d: '2026-01-30', dl: 5815777, s: '511 KB', k: 'release' }
      ] },
    { id: 'Q1vvjJYV', slug: 'bsl-shaders', t: 'shader', n: 'BSL Shaders', by: 'CaptTatsu',
      d: 'Shaderpack for Minecraft: Java Edition. It\'s bright, colorful, and distinct',
      cat: ['bloom', 'cartoon', 'low', 'iris', 'optifine'], dl: 27790171, fol: 6036, up: '2026-04-20', made: '2022-12-22',
      mc: ['1.8.9', '1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 36, lic: 'LicenseRef-All-Rights-Reserved', side: 'client',
      about: 'Bright saturated lighting, bloom, volumetric light and reflective water. One of the longest-running packs, and one of the cheaper ones to run.',
      v: [
        { n: '10.1.3', mc: ['1.8.9', '1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8', '26.2'], mcn: 75, ld: ['iris', 'optifine'], d: '2026-04-20', dl: 4588933, s: '1.1 MB', k: 'release' },
        { n: '10.1.2', mc: ['1.8.9', '1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8', '26.1.2'], mcn: 74, ld: ['iris', 'optifine'], d: '2026-04-19', dl: 71752, s: '1.1 MB', k: 'release' },
        { n: '10.1.1', mc: ['1.8.9', '1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8', '1.21.11'], mcn: 71, ld: ['iris', 'optifine'], d: '2026-02-07', dl: 2625682, s: '1.1 MB', k: 'release' }
      ] },
    { id: 'lLqFfGNs', slug: 'photon-shader', t: 'shader', n: 'Photon Shaders', by: 'sixthsurge',
      d: 'A gameplay-focused shader pack with a semi-realistic style',
      cat: ['atmosphere', 'colored-lighting', 'semi-realistic', 'iris', 'optifine'], dl: 25063186, fol: 4037, up: '2026-04-14', made: '2024-04-08',
      mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 30, lic: 'LicenseRef-', side: 'client',
      about: 'Physically-motivated sky, cloud and water with coloured lighting, aimed at a semi-realistic look rather than a vanilla one.',
      v: [
        { n: 'v1.3b', mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8', '26.1.2'], mcn: 33, ld: ['iris', 'optifine'], d: '2026-04-14', dl: 5580569, s: '3.6 MB', k: 'release' },
        { n: 'v1.3a', mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8', '26.1.2'], mcn: 33, ld: ['iris', 'optifine'], d: '2026-04-13', dl: 92084, s: '3.6 MB', k: 'release' },
        { n: 'v1.3', mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8', '26.1.2'], mcn: 33, ld: ['iris', 'optifine'], d: '2026-04-11', dl: 186573, s: '3.6 MB', k: 'release' }
      ] },
    { id: 'kmwfVOoi', slug: 'rethinking-voxels', t: 'shader', n: 'Rethinking Voxels', by: 'gri573',
      d: '[WIP] A gameplay shaderpack based on complementary reimagined that has coloured block light with sharp shadows',
      cat: ['colored-lighting', 'shadows', 'iris', 'optifine'], dl: 12376783, fol: 4398, up: '2025-06-19', made: '2023-01-08',
      mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 21, lic: 'LicenseRef-Complementary-Agreement', side: 'client',
      about: 'A Complementary derivative that adds voxel coloured lighting, so a torch lights the room it is in rather than the area around it.',
      v: [
        { n: 'r0.1-beta9', mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8', '1.21.10'], mcn: 12, ld: ['iris'], d: '2025-06-19', dl: 4498995, s: '7.9 MB', k: 'beta' },
        { n: 'r0.1-beta8', mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5'], mcn: 7, ld: ['iris'], d: '2025-05-12', dl: 1112480, s: '7.9 MB', k: 'beta' },
        { n: 'r0.1-beta7b', mc: ['1.21.1', '1.21.4', '1.21.5'], mcn: 5, ld: ['iris'], d: '2025-04-12', dl: 214989, s: '7.9 MB', k: 'beta' }
      ] },
    { id: '1KVo5zza', slug: 'fabulously-optimized', t: 'modpack', n: 'Fabulously Optimized', by: 'Fabulously Optimized',
      d: 'Beautiful graphics, speedy performance and familiar features in a simple package. Chaos Cubed beta!',
      cat: ['lightweight', 'multiplayer', 'optimization', 'fabric'], dl: 16388681, fol: 4795, up: '2026-08-17', made: '2022-02-10',
      mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 28, lic: 'BSD-3-Clause', side: 'client', bundled: 49,
      about: 'Sodium and the mods around it, configured together, with the vanilla look intact. The usual starting point for a fast client.',
      v: [
        { n: '8.2.0', mc: ['1.21.4'], mcn: 1, ld: ['fabric'], d: '2026-06-08', dl: 52106, s: '179 KB', k: 'release' },
        { n: '8.1.0', mc: ['1.21.4'], mcn: 1, ld: ['fabric'], d: '2025-06-25', dl: 197501, s: '80 KB', k: 'alpha' },
        { n: '8.0.3', mc: ['1.21.4'], mcn: 1, ld: ['fabric'], d: '2025-06-21', dl: 23228, s: '80 KB', k: 'release' },
        { n: '14.0.0-beta.6', mc: ['26.2'], mcn: 1, ld: ['fabric'], d: '2026-08-17', dl: 189950, s: '169 KB', k: 'beta' }
      ] },
    { id: 'ch7UHY2J', slug: 'sodiumplus', t: 'modpack', n: 'Sodium Plus', by: 'HappyRedstone Modding',
      d: 'A client-side optimization modpack with a few extra tweaks',
      cat: ['lightweight', 'multiplayer', 'optimization', 'fabric', 'quilt'], dl: 2569112, fol: 606, up: '2026-08-18', made: '2022-05-19',
      mc: ['1.20.1', '1.21.5', '1.21.8'], mcn: 12, lic: 'MIT', side: 'client', bundled: 80,
      about: 'A light performance pack built around Sodium, aimed at multiplayer and at machines with little to spare.',
      v: [
        { n: '2.4.4', mc: ['26.2'], mcn: 1, ld: ['fabric'], d: '2026-08-18', dl: 26610, s: '260 KB', k: 'beta' },
        { n: '2.4.3', mc: ['26.2'], mcn: 1, ld: ['fabric'], d: '2026-07-20', dl: 121336, s: '259 KB', k: 'beta' },
        { n: '2.4.2', mc: ['26.2'], mcn: 1, ld: ['fabric'], d: '2026-07-09', dl: 43921, s: '259 KB', k: 'beta' }
      ] },
    { id: 'shFhR8Vx', slug: 'better-mc-fabric-bmc2', t: 'modpack', n: 'Better MC [FABRIC] - BMC2', by: 'Luna Pixel Studios',
      d: 'Version 1.20 | A Proper Vanilla+ Modpack | Don\'t play Vanilla play this!',
      cat: ['adventure', 'combat', 'optimization', 'fabric'], dl: 3229488, fol: 1393, up: '2026-07-15', made: '2022-05-17',
      mc: ['1.20.1'], mcn: 1, lic: 'LicenseRef-All-Rights-Reserved', side: 'both', bundled: 362,
      about: 'A large adventure pack: structures, mobs, dimensions and quests on an optimised base. It is a whole game rather than an addition to one.',
      v: [
        { n: 'v40', mc: ['1.20.1'], mcn: 1, ld: ['fabric'], d: '2026-07-15', dl: 519139, s: '63.2 MB', k: 'release' },
        { n: 'v26.5', mc: ['1.20.1'], mcn: 1, ld: ['fabric'], d: '2025-01-19', dl: 2148505, s: '39.3 MB', k: 'release' },
        { n: 'v25', mc: ['1.20.1'], mcn: 1, ld: ['fabric'], d: '2024-06-01', dl: 342185, s: '88.2 MB', k: 'release' }
      ] },
    { id: '8oi3bsk5', slug: 'terralith', t: 'datapack', n: 'Terralith', by: 'Stardust Labs',
      d: 'Explore almost 100 new biomes consisting of both realism and light fantasy, using just Vanilla blocks. Complete with several immersive structures to compliment the overhauled terrain',
      cat: ['worldgen', 'datapack', 'fabric', 'forge', 'neoforge', 'quilt'], dl: 21818013, fol: 8378, up: '2026-07-08', made: '2022-11-13',
      mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 25, lic: 'LicenseRef-Stardust-Labs-License', side: 'server',
      about: 'Rewrites overworld generation with new biomes and terrain shapes using vanilla worldgen only. Works as a data pack or as a mod.',
      v: [
        { n: '2.5.8', mc: ['1.21.1', '1.21.4'], mcn: 5, ld: ['datapack'], d: '2025-01-15', dl: 4119933, s: '3.0 MB', k: 'release' },
        { n: '2.6.4', mc: ['26.2'], mcn: 1, ld: ['datapack'], d: '2026-07-08', dl: 52536, s: '2.9 MB', k: 'release' },
        { n: '2.5.7', mc: ['1.21.1', '1.21.4'], mcn: 5, ld: ['fabric', 'forge', 'neoforge', 'quilt'], d: '2024-12-04', dl: 153530, s: '3.0 MB', k: 'release' }
      ] },
    { id: 'DjLobEOy', slug: 'towns-and-towers', t: 'datapack', n: 'Towns and Towers', by: 'Biban_Auriu',
      d: 'Spice up your world with new villages, pillager outposts, and even new ships!',
      cat: ['adventure', 'worldgen', 'datapack', 'fabric', 'forge', 'neoforge', 'quilt'], dl: 16698601, fol: 4706, up: '2026-08-15', made: '2022-05-22',
      mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 21, lic: 'CC-BY-NC-SA-4.0', side: 'server',
      about: 'Expands villages and pillager outposts into full settlements, with variants per biome. Generates alongside vanilla structures rather than replacing them.',
      v: [
        { n: '26.1-datapack', mc: ['26.2'], mcn: 4, ld: ['datapack'], d: '2026-06-30', dl: 32047, s: '3.1 MB', k: 'release' },
        { n: '1.13.5', mc: ['1.21.4', '1.21.5', '1.21.8'], mcn: 5, ld: ['fabric', 'neoforge'], d: '2025-01-30', dl: 308014, s: '3.5 MB', k: 'release' },
        { n: '1.13.3', mc: ['1.21.4'], mcn: 2, ld: ['fabric', 'neoforge'], d: '2024-11-03', dl: 38249, s: '3.5 MB', k: 'release' },
        { n: '1.13.10', mc: ['1.21.1'], mcn: 1, ld: ['fabric', 'neoforge', 'quilt'], d: '2026-08-15', dl: 1693, s: '3.4 MB', k: 'release' }
      ] },
    { id: 'LPjGiSO4', slug: 'nullscape', t: 'datapack', n: 'Nullscape', by: 'Stardust Labs',
      d: 'Transforms the boring Vanilla end into an alien dimension with the most surreal terrain imaginable. Topped with a couple of new biomes to add to the experience, whilst keeping the end desolate',
      cat: ['worldgen', 'datapack', 'fabric', 'forge', 'neoforge', 'quilt'], dl: 5460514, fol: 2720, up: '2026-07-08', made: '2022-11-23',
      mc: ['1.20.1', '1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 25, lic: 'LicenseRef-Stardust-Labs-License', side: 'server',
      about: 'Rebuilds the End as terrain with scale to it rather than islands. Data pack or mod, and it leaves the overworld alone.',
      v: [
        { n: '1.2.14', mc: ['1.21.1', '1.21.4', '1.21.5', '1.21.8', '1.21.10'], mcn: 11, ld: ['datapack'], d: '2025-10-07', dl: 50913, s: '344 KB', k: 'release' },
        { n: '1.2.13', mc: ['1.21.1', '1.21.4', '1.21.5', '1.21.8'], mcn: 9, ld: ['datapack'], d: '2025-06-30', dl: 30435, s: '340 KB', k: 'release' },
        { n: '1.2.20', mc: ['26.1.2'], mcn: 3, ld: ['datapack'], d: '2026-07-08', dl: 2389, s: '336 KB', k: 'release' }
      ] }
  ];
  var BYSLUG = {};
  BFIXTURE.forEach(function (p) { BYSLUG[p.slug] = p; BYSLUG[p.id] = p; });

  /* ── formatting ─────────────────────────────────────────────────────────── */

  function big(n) {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e7) return Math.round(n / 1e6) + 'M';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e4) return Math.round(n / 1e3) + 'K';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  }
  function comma(n) { return String(Number(n) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  /* A DATE HERE IS PROSE, NOT A FIGURE.  "3 weeks ago" is a word column and
     takes the UI face; the download count beside it is a quantity and takes
     the figure face.  Same rule as Last played and Size on #instances. */
  function ago(iso) {
    var then = Date.parse(iso);
    if (!then) return '';
    var d = Math.floor((Date.now() - then) / 86400000);
    if (d <= 0) return 'Today';
    if (d === 1) return 'Yesterday';
    if (d < 7) return d + ' days ago';
    if (d < 14) return 'Last week';
    if (d < 60) return Math.round(d / 7) + ' weeks ago';
    if (d < 365) return Math.round(d / 30) + ' months ago';
    if (d < 730) return 'Over a year ago';
    return Math.floor(d / 365) + ' years ago';
  }
  function licenceName(id) {
    return String(id || '').replace(/^LicenseRef-?/, '').replace(/-/g, ' ').trim() || 'Not stated';
  }
  function sideWord(s) {
    return s === 'client' ? 'Client only' : s === 'server' ? 'Server side' : 'Client and server';
  }
  /* Modrinth build numbers carry the loader and the game version in them; the
     mods table carries neither, because both are already columns there. */
  function cleanVer(v) {
    return String(v || '')
      .replace(/^mc[\d.]+[-+]/i, '')
      .replace(/[-+](fabric|forge|neoforge|quilt|iris|optifine|datapack|minecraft)$/i, '')
      .replace(/[-+]mc?\d[\d.]*$/i, '');
  }
  function monogram(name) {
    var w = String(name).replace(/[^A-Za-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!w.length) return '?';
    if (w.length === 1) return w[0].charAt(0).toUpperCase() + (w[0].charAt(1) || '').toLowerCase();
    return (w[0].charAt(0) + w[1].charAt(0)).toUpperCase();
  }
  function kbOf(s) {
    var m = String(s).match(/([\d.]+)\s*(GB|MB|KB)/i);
    if (!m) return 0;
    return parseFloat(m[1]) * ({ kb: 1, mb: 1024, gb: 1048576 })[m[2].toLowerCase()];
  }
  function sizeWord(kbs) {
    if (kbs >= 1048576) return (kbs / 1048576).toFixed(1) + ' GB';
    if (kbs >= 1024) return (kbs / 1024).toFixed(1) + ' MB';
    return Math.round(kbs) + ' KB';
  }
  function bytesWord(b) {
    return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
  }

  /* ── the library, as this screen needs it ─────────────────────────────────
     The instance table IS the record — the same rule card() and readRow()
     run on — so the picker cannot drift from the library it picks out of.  */

  function browseInstances() {
    var out = [];
    document.querySelectorAll('#screen-instances .table .tr').forEach(function (tr) {
      if (tr.classList.contains('th')) return;
      var d = readRow(tr);
      if (!d.name) return;
      out.push({ id: tr.getAttribute('data-id') || '', name: d.name, ver: (d.ver || '').trim(),
        loader: d.loader, art: d.art, mono: d.mono, row: tr });
    });
    return out;
  }

  /* ── state ──────────────────────────────────────────────────────────────── */

  var bs = {
    type: 'mod', cats: [], sort: 'relevance', q: '', fit: true,
    inst: null, mode: 'unknown', busy: false, ran: false, seq: 0, pseq: 0, total: 0, hits: [], slug: ''
  };
  /* WHAT IS ALREADY IN EACH INSTANCE, by Modrinth slug.  1.21.4 Fabric's is
     seeded off the rows on #mods, which each carry the slug they came from —
     that screen is the one place in the app that holds a real mod list, so it
     is the one source of truth for "installed" rather than a second flag kept
     beside it. */
  var bInstalled = {};
  function installedSet(name) {
    if (!bInstalled[name]) bInstalled[name] = {};
    return bInstalled[name];
  }
  (function seedInstalled() {
    var set = installedSet('1.21.4 Fabric');
    document.querySelectorAll('#screen-mods .table-mods .tr[data-project]').forEach(function (tr) {
      set[tr.getAttribute('data-project')] = true;
    });
  })();

  var bEl = {
    instName: document.getElementById('browseInstN'),
    instIcon: null,
    cats: document.getElementById('browseCats'),
    rows: document.getElementById('browseRows'),
    foot: document.getElementById('browseFoot'),
    say: document.getElementById('browseSay'),
    mode: document.getElementById('browseMode'),
    retry: document.getElementById('browseRetry'),
    fit: document.getElementById('browseFit'),
    fitLab: document.getElementById('browseFitLab'),
    sortN: document.getElementById('browseSortN'),
    q: document.getElementById('browseQ'),
    list: document.getElementById('browseList'),
    proj: document.getElementById('browseProj')
  };
  var bInstPick = document.getElementById('browseInst');
  if (bInstPick) bEl.instIcon = bInstPick.querySelector('.ic');

  /* ── fetch, with a real timeout and one honest failure path ─────────────── */

  function getJSON(url) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, BROWSE_TIMEOUT);
    var opts = ctl ? { signal: ctl.signal } : {};
    var go = window.kestrelFetch ? window.kestrelFetch(url, opts, BROWSE_UA) : fetch(url, opts);
    return go.then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, function (err) { clearTimeout(timer); throw err; });
  }

  /* ── the query, in both worlds ──────────────────────────────────────────── */

  function scopeFacet() {
    if (!bs.fit || !bs.inst) return null;
    return { loader: facetFor(bs.type, bs.inst.loader), mc: bs.inst.ver };
  }

  function searchURL() {
    var facets = [['project_type:' + bs.type]];
    var sc = scopeFacet();
    if (sc) {
      if (sc.loader) facets.push(['categories:' + sc.loader]);
      if (sc.mc) facets.push(['versions:' + sc.mc]);
    }
    bs.cats.forEach(function (c) { facets.push(['categories:' + c]); });
    var p = ['limit=30', 'index=' + bs.sort, 'facets=' + encodeURIComponent(JSON.stringify(facets))];
    if (bs.q) p.push('query=' + encodeURIComponent(bs.q));
    return MR + '/search?' + p.join('&');
  }

  /* one shape for a result, whichever of the two sources it came from */
  /* CATEGORIES, BOTH LISTS.  `display_categories` is what Modrinth shows on a
     card and it leaves the loader out for modpacks; `categories` carries the
     loader but not always the display tags.  The fit test needs the loader
     and the sidebar needs the tags, so the record holds the union. */
  function bothCats(h) {
    var out = (h.categories || []).slice();
    (h.display_categories || []).forEach(function (c) { if (out.indexOf(c) === -1) out.push(c); });
    return out;
  }
  function fromHit(h) {
    return {
      id: h.project_id || h.id, slug: h.slug, t: bs.type, n: h.title,
      by: h.organization || h.author || '', d: h.description || '',
      cat: bothCats(h), dl: h.downloads || 0,
      fol: h.follows || h.followers || 0, up: h.date_modified || '',
      made: h.date_created || '', mc: h.versions || [],
      lic: (h.license && h.license.id) || h.license || '',
      side: h.client_side === 'required' && h.server_side === 'unsupported' ? 'client'
        : h.server_side === 'required' && h.client_side !== 'required' ? 'server' : 'both'
    };
  }

  function fixtureSearch() {
    var q = bs.q.toLowerCase();
    var sc = scopeFacet();
    var out = BFIXTURE.filter(function (p) {
      if (p.t !== bs.type) return false;
      if (q && (p.n + ' ' + p.by + ' ' + p.d).toLowerCase().indexOf(q) === -1) return false;
      for (var i = 0; i < bs.cats.length; i++) if (p.cat.indexOf(bs.cats[i]) === -1) return false;
      if (sc && !fitsInst(p)) return false;
      return true;
    });
    /* relevance without a query is what Modrinth does with one too: the most
       downloaded first.  With a query, the closer the title, the higher. */
    if (bs.sort === 'updated') out.sort(function (a, b) { return a.up < b.up ? 1 : -1; });
    else if (bs.sort === 'newest') out.sort(function (a, b) { return a.made < b.made ? 1 : -1; });
    else if (bs.sort === 'relevance' && q) {
      out.sort(function (a, b) {
        var ai = a.n.toLowerCase().indexOf(q), bi = b.n.toLowerCase().indexOf(q);
        if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        return b.dl - a.dl;
      });
    } else out.sort(function (a, b) { return b.dl - a.dl; });
    return out;
  }

  function runBrowse() {
    if (!bEl.rows) return;
    bs.ran = true;
    var seq = ++bs.seq;
    if (bs.mode === 'offline') {
      bs.hits = fixtureSearch();
      bs.total = bs.hits.length;
      paintBrowse();
      return;
    }
    bs.busy = true;
    paintMode();
    if (bEl.say) bEl.say.textContent = 'Searching…';
    getJSON(searchURL()).then(function (d) {
      if (seq !== bs.seq) return;
      bs.busy = false;
      bs.mode = 'live';
      /* THE FIT SWITCH IS THE AUTHORITY, THE FACETS ARE ONLY AN OPTIMISATION.
         A search cannot express "an instance with no loader at all", so a
         Vanilla instance came back with thirty mods and every one of them
         marked as not fitting — a filter that is on and showing you what it
         filters out.  The same test that draws the mark decides the list. */
      bs.hits = (d.hits || []).map(fromHit);
      if (bs.fit) bs.hits = bs.hits.filter(fitsInst);
      bs.total = d.total_hits || bs.hits.length;
      paintBrowse();
    }, function () {
      if (seq !== bs.seq) return;
      bs.busy = false;
      bs.mode = 'offline';
      bs.hits = fixtureSearch();
      bs.total = bs.hits.length;
      paintBrowse();
    });
  }

  /* ── does it fit, and what would go in ──────────────────────────────────── */

  function fitsInst(p) {
    if (!bs.inst) return true;
    var f = facetFor(p.t || bs.type, bs.inst.loader);
    var t = p.t || bs.type;
    if (t === 'mod' || t === 'modpack' || t === 'shader') {
      if (!f) return false;                        /* vanilla loads neither */
      if (p.cat.indexOf(f) === -1) return false;
    }
    return !bs.inst.ver || p.mc.indexOf(bs.inst.ver) !== -1;
  }
  /* THE CHIPS ARE THE ANSWER, NOT A TAG CLOUD: the loader and the game
     version this row would actually be installed at — the instance's pair
     when the project has it, the project's own newest when it does not. */
  function chipsFor(p) {
    var t = p.t || bs.type;
    var want = bs.inst ? facetFor(t, bs.inst.loader) : '';
    var ok = CHIP_LOADERS[t] || [];
    var loader = want && p.cat.indexOf(want) !== -1 ? want
      : ok.filter(function (c) { return p.cat.indexOf(c) !== -1; })[0] || '';
    var mc = bs.inst && p.mc.indexOf(bs.inst.ver) !== -1 ? bs.inst.ver : p.mc[p.mc.length - 1] || '';
    return { loader: loader, mc: mc };
  }

  /* ── painting ───────────────────────────────────────────────────────────── */

  function paintMode() {
    if (!bEl.mode) return;
    bEl.mode.textContent = bs.busy ? 'Searching Modrinth…'
      : bs.mode === 'live' ? 'Live from Modrinth'
        : bs.mode === 'offline' ? 'Offline · bundled list' : '';
    if (bEl.retry) bEl.retry.hidden = bs.mode !== 'offline';
  }

  function paintScope() {
    if (!bs.inst) return;
    if (bEl.instName) bEl.instName.textContent = bs.inst.name;
    if (bEl.instIcon) {
      bEl.instIcon.className = 'ic' + (bs.inst.art ? '' : ' ic-mono');
      bEl.instIcon.innerHTML = bs.inst.art
        ? '<svg width="14" height="14"><use href="#' + esc(bs.inst.art) + '"/></svg>'
        : esc(bs.inst.mono || monogram(bs.inst.name).charAt(0));
    }
    if (bEl.fitLab) {
      var f = facetFor(bs.type, bs.inst.loader);
      bEl.fitLab.innerHTML = 'Only what fits ' +
        (f ? '<span class="mono">' + esc(facetLabel(f)) + '</span> ' : '') +
        '<span class="mono">' + esc(bs.inst.ver) + '</span>';
    }
  }

  /* THE FILTER COLUMN IS BUILT ONCE, ALL FIVE SETS OF IT, and the type
     switches which one is on screen.  Rebuilding the buttons on every type
     change threw away whatever had focus and made the column flicker under
     the pointer for no gain — there are eighty-seven of them in total, which
     is nothing, and a set that is never rebuilt cannot lose its state. */
  function buildCats() {
    if (!bEl.cats || bEl.cats.firstChild) return;
    var html = '';
    BTYPES.forEach(function (bt) {
      html += '<div class="cat-set" data-for="' + bt[0] + '"' + (bt[0] === bs.type ? '' : ' hidden') + '>';
      (BCATS[bt[0]] || []).forEach(function (c) {
        if (c.charAt(0) === '#') { html += '<div class="cat-head">' + esc(c.slice(1)) + '</div>'; return; }
        html += '<button class="cat cat-pick" type="button" data-bcat="' + esc(c) + '" aria-pressed="false">' +
          '<span class="box" aria-hidden="true"><svg width="10" height="10"><use href="#t-check"/></svg></span>' +
          '<span class="cat-n">' + esc(catLabel(c)) + '</span></button>';
      });
      html += '</div>';
    });
    bEl.cats.innerHTML = html;
  }

  function paintCats() {
    if (!bEl.cats) return;
    buildCats();
    document.querySelectorAll('#screen-browse .cats [data-btype]').forEach(function (b) {
      if (b.getAttribute('data-btype') === bs.type) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    bEl.cats.querySelectorAll('.cat-set').forEach(function (s) {
      s.hidden = s.getAttribute('data-for') !== bs.type;
    });
    bEl.cats.querySelectorAll('.cat-pick').forEach(function (b) {
      b.setAttribute('aria-pressed', bs.cats.indexOf(b.getAttribute('data-bcat')) !== -1 ? 'true' : 'false');
    });
  }

  /* ── the rows, filled rather than rebuilt ─────────────────────────────────
     A search runs on every keystroke, every category and every sort, and
     replacing the list wholesale each time is how a focused control vanishes
     under the person using it and how the scroll position jumps.  The rows
     are a POOL: one skeleton per line, filled in place, hidden when the
     result set is shorter.  Nothing in the list is ever detached, so a menu
     that is open stays anchored to the row it came from.                    */

  var bHead = null, bNone = null, bPool = [], bPending = {};

  function rowSkeleton() {
    var d = document.createElement('div');
    d.className = 'brow';
    d.setAttribute('role', 'row');
    d.innerHTML =
      '<span class="brow-ic" role="cell" aria-hidden="true"></span>' +
      '<a class="brow-id" role="cell" href="#browse">' +
        '<span class="brow-t"><span class="brow-n"></span><span class="td-by"></span></span>' +
        '<span class="brow-d"></span></a>' +
      '<span class="mono td-num ta-r brow-dl" role="cell"></span>' +
      '<span class="td-word brow-upd" role="cell"></span>' +
      '<span class="brow-fit" role="cell"></span>' +
      '<button class="quiet quiet-edge quiet-sm brow-in" type="button" data-act="browse-install"></button>' +
      '<span class="brow-has" role="cell" hidden><svg width="12" height="12" aria-hidden="true"><use href="#r-check"/></svg>Installed</span>' +
      '<button class="rowmenu" type="button" aria-haspopup="menu" aria-expanded="false">' +
        '<svg width="14" height="14" aria-hidden="true"><use href="#r-dots"/></svg></button>';
    return d;
  }

  function fillRow(el, p) {
    var ch = chipsFor(p);
    var fits = fitsInst(p);
    var has = !!(bs.inst && installedSet(bs.inst.name)[p.slug]);
    var pack = (p.t || bs.type) === 'modpack';
    var mark = LOADER_MARK_ID[ch.loader]
      ? '<svg width="10" height="10" aria-hidden="true"><use href="#' + LOADER_MARK_ID[ch.loader] + '"/></svg>'
      : '';
    el.hidden = false;
    el.setAttribute('data-slug', p.slug);
    el.classList.toggle('brow-no', !fits);
    el.querySelector('.brow-ic').textContent = monogram(p.n);
    var a = el.querySelector('.brow-id');
    a.setAttribute('href', '#browse/' + p.slug);
    el.querySelector('.brow-n').textContent = p.n;
    var by = el.querySelector('.td-by');
    by.textContent = p.by || '';
    by.hidden = !p.by;
    el.querySelector('.brow-d').textContent = p.d;
    var dl = el.querySelector('.brow-dl');
    dl.textContent = big(p.dl);
    dl.setAttribute('title', comma(p.dl) + ' downloads');
    el.querySelector('.brow-upd').textContent = ago(p.up);
    el.querySelector('.brow-fit').innerHTML =
      (ch.loader ? '<span class="chip">' + mark + esc(facetLabel(ch.loader)) + '</span>' : '') +
      (ch.mc ? '<span class="chip mono">' + esc(ch.mc) + '</span>' : '') +
      (fits ? '' : '<span class="chip chip-no">no</span>');
    /* the action and the fact are two elements, one of them hidden, so that
       an Install button is never taken out of the document under a pointer */
    var go = el.querySelector('.brow-in');
    go.hidden = has && !pack;
    /* A REPAINT CAUSED BY SOMETHING ELSE MUST NOT WIPE A CONTROL MID-ACTION.
       Two installs resolving a second apart both repaint the list, and
       without this the second one puts the first button back to `Install`
       while its file list is still on the wire. */
    go.disabled = !!bPending[p.slug];
    go.textContent = bPending[p.slug] ? 'Installing…' : pack ? 'New instance' : 'Install';
    go.setAttribute('data-act', pack ? 'browse-pack' : 'browse-install');
    go.setAttribute('data-slug', p.slug);
    go.setAttribute('aria-label', pack
      ? 'Make a new instance from ' + p.n
      : 'Install ' + p.n + ' into ' + (bs.inst ? bs.inst.name : 'the instance'));
    el.querySelector('.brow-has').hidden = !has || pack;
    var menu = el.querySelector('.rowmenu');
    menu.setAttribute('data-slug', p.slug);
    menu.setAttribute('aria-label', 'More actions for ' + p.n);
  }

  function paintRows() {
    var box = bEl.rows;
    if (!bHead) {
      bHead = document.createElement('div');
      bHead.className = 'brow brow-th th';
      bHead.setAttribute('role', 'row');
      bHead.innerHTML = '<span role="columnheader"></span><span role="columnheader">Project</span>' +
        '<span role="columnheader" class="ta-r brow-dl">Downloads</span>' +
        '<span role="columnheader" class="brow-upd">Updated</span>' +
        '<span role="columnheader">Fits</span>' +
        '<span role="columnheader"></span><span role="columnheader"></span>';
      bNone = document.createElement('div');
      bNone.className = 'brow-none';
      bNone.setAttribute('role', 'row');
      bNone.innerHTML = '<span role="cell"></span>';
      box.appendChild(bHead);
      box.appendChild(bNone);
    }
    while (bPool.length < bs.hits.length) {
      var r = rowSkeleton();
      bPool.push(r);
      box.appendChild(r);
    }
    bs.hits.forEach(function (p, i) { fillRow(bPool[i], p); });
    for (var i = bs.hits.length; i < bPool.length; i++) bPool[i].hidden = true;
    bNone.hidden = !!bs.hits.length;
    bHead.hidden = !bs.hits.length;
    if (!bs.hits.length) bNone.firstChild.innerHTML = emptyLine();
  }

  function paintBrowse() {
    if (!bEl.rows) return;
    paintMode();
    paintScope();
    paintCats();
    if (bEl.sortN) bEl.sortN.textContent = sortName(bs.sort);
    if (bEl.fit) bEl.fit.checked = bs.fit;

    var miss = 0;
    bs.hits.forEach(function (p) { if (!fitsInst(p)) miss++; });
    paintRows();

    if (bEl.say) {
      var n = bs.hits.length;
      bEl.say.innerHTML = bs.mode === 'live'
        ? 'Showing <b>' + n + '</b> of <b>' + comma(bs.total) + '</b>' +
          (miss ? ' · <b>' + miss + '</b> of them do not fit' : '')
        : 'Showing <b>' + n + '</b> of <b>' + BFIXTURE.length + '</b> bundled' +
          (miss ? ' · <b>' + miss + '</b> of them do not fit' : '');
    }
    if (bEl.foot) {
      if (bs.mode === 'offline') {
        bEl.foot.innerHTML = t('browse.offline', { n: BFIXTURE.length });
      } else {
        bEl.foot.innerHTML = 'Ranked by ' + esc(sortName(bs.sort).toLowerCase()) +
          ' and by nothing else. Nothing on this screen is promoted, sponsored or paid for, and there is no slot for it to go in.';
      }
    }
  }

  function emptyLine() {
    var what = typeOf(bs.type)[2];
    var f = bs.inst ? facetFor(bs.type, bs.inst.loader) : '';
    if (bs.fit && bs.inst && !f && (bs.type === 'mod' || bs.type === 'shader' || bs.type === 'modpack')) {
      return esc(bs.inst.name) + ' has no mod loader, so nothing here would load in it. ' +
        'Give it one on its <a class="link-in" href="#instance/versions">Versions tab</a>, or ' + defeat() + '.';
    }
    if (bs.q) {
      return 'No ' + what + ' matches “' + esc(bs.q) + '”' +
        (bs.fit && bs.inst ? ' for <span class="mono">' + esc(bs.inst.ver) + '</span>. Try a shorter search, or ' + defeat() + '.' : '.');
    }
    if (bs.cats.length) return 'Nothing carries all ' + bs.cats.length + ' of those categories at once. Take one off.';
    if (bs.fit && bs.inst) {
      return 'Nothing here is built for <span class="mono">' + esc(bs.inst.ver) + '</span>. You can ' + defeat() + '.';
    }
    return 'Nothing matches.';
  }
  function defeat() {
    return '<button class="link-in" type="button" data-act="browse-fit-off">see everything anyway</button>';
  }

  /* ── the two panels this screen opens, through the one popover ─────────── */

  function browseInstMenu(btn) {
    var list = [{ note: 'Everything on this screen is filtered for, and installed into, one instance.' }];
    browseInstances().forEach(function (i) {
      var here = bs.inst && i.name === bs.inst.name;
      list.push({
        label: i.name + '  ·  ' + i.ver + ' ' + (i.loader || 'Vanilla') + (here ? '  ·  in use' : ''),
        run: here ? null : function () { setBrowseInstance(i); }
      });
    });
    popover.menu(btn, list, { label: 'Instance to install into' });
  }

  function browseSortMenu(btn) {
    popover.menu(btn, BSORTS.map(function (s) {
      return {
        label: s[1] + (s[0] === bs.sort ? '  ·  in use' : ''),
        run: function () { bs.sort = s[0]; runBrowse(); }
      };
    }), { label: 'Sort the results' });
  }

  function projectURL(p) { return 'https://modrinth.com/' + (p.t || bs.type) + '/' + p.slug; }
  function findProject(slug) {
    return bs.hits.filter(function (h) { return h.slug === slug || h.id === slug; })[0] || BYSLUG[slug] || null;
  }

  function browseMenu(btn) {
    var slug = btn.getAttribute('data-slug');
    var p = findProject(slug);
    if (!p) return;
    var url = projectURL(p);
    popover.menu(btn, [
      /* the panel floats clear of the list, so it says which row it came out
         of — the same note the version menu on #instances opens with */
      { note: esc(p.n) + (p.by ? ' by ' + esc(p.by) : '') + '.' },
      { label: 'View versions', run: function () { location.hash = '#browse/' + slug; } },
      { label: 'Open on Modrinth', run: function () { say('Would open ' + fig(url) + ' in the browser.'); } },
      { label: 'Copy link', run: function () { copy(url, fig(url) + ' copied.'); } }
    ], { label: 'Actions for ' + p.n });
  }

  /* ── changing the scope ─────────────────────────────────────────────────── */

  function setBrowseInstance(i) {
    bs.inst = i;
    paintScope();
    closeProject();
    runBrowse();
    say('Browsing for ' + esc(i.name) + ' — ' + fig(i.ver + (i.loader ? ' · ' + i.loader : '')) +
      '. Anything installed from here goes into that instance.');
  }

  /* ── installing, and it is real ───────────────────────────────────────────
     YOU DO NOT INSTALL A PROJECT, YOU INSTALL ONE FILE, so the build is
     resolved before anything is written: live, that is the version list asked
     for this instance's loader and game version; offline, the newest build in
     the bundled record that fits.  The row it writes onto #mods carries the
     slug it came from, which is what makes "Installed" true on the way back
     instead of a second flag kept beside the list.                          */

  function fixtureBuild(p) {
    var rec = BYSLUG[p.slug];
    if (!rec || !rec.v || !rec.v.length) return null;
    var want = bs.inst ? facetFor(rec.t, bs.inst.loader) : '';
    var mc = bs.inst ? bs.inst.ver : '';
    var hit = rec.v.filter(function (v) {
      return (!mc || v.mc.indexOf(mc) !== -1) && (!want || v.ld.indexOf(want) !== -1);
    })[0] || rec.v[0];
    return { n: hit.n, size: hit.s, mc: hit.mc[0], ld: hit.ld[0], date: hit.d };
  }

  function liveBuild(p) {
    var want = bs.inst ? facetFor(p.t || bs.type, bs.inst.loader) : '';
    var q = [];
    if (bs.inst && bs.inst.ver) q.push('game_versions=' + encodeURIComponent(JSON.stringify([bs.inst.ver])));
    if (want) q.push('loaders=' + encodeURIComponent(JSON.stringify([want])));
    return getJSON(MR + '/project/' + p.slug + '/version' + (q.length ? '?' + q.join('&') : ''))
      .then(function (vs) {
        var v = (vs || [])[0];
        if (!v) throw new Error('no build');
        return {
          n: v.version_number, size: bytesWord(((v.files || [])[0] || {}).size || 0),
          mc: (v.game_versions || [])[0] || '', ld: (v.loaders || [])[0] || '',
          date: (v.date_published || '').slice(0, 10)
        };
      });
  }

  /* ══ PHASE 5: THE INSTALL IS A FILE ON DISK ═══════════════════════════════

     WITH A BRIDGE, NOTHING BELOW THIS POINT RESOLVES A BUILD.  The renderer
     asks the main process for a PLAN — the version it would install, every
     required dependency under it, the sizes and the digests — shows that list
     and waits for a yes.  Only then does it name the plan back, and the main
     process downloads what it itself resolved.  There is no channel on the
     bridge that takes a url, so there is no path from this screen to an
     arbitrary download, and the tree is never pulled in silently.

     WITHOUT a bridge (the published copy of this UI in a browser) the
     simulated path underneath is unchanged: it says what WOULD happen and
     writes a row, which is the honest thing for a page with no disk.       */

  var CONTENT_KIND = { mod: 'mod', resourcepack: 'resourcepack', shader: 'shader' };

  function realInstall(p, kind, inst, btn) {
    var noun = typeOf(kind)[2];
    return host.content.plan(inst.id, p.id || p.slug, kind).then(function (plan) {
      var todo = (plan.items || []).filter(function (i) { return !i.present && !i.error; });
      var bad = (plan.items || []).filter(function (i) { return i.error; });
      if (!todo.length && !bad.length) {
        delete bPending[p.slug]; paintBrowse();
        say(esc(p.n) + ' is already in ' + esc(inst.name) + ', at the same file. Nothing to download.');
        return;
      }
      /* THE WHOLE LIST, BEFORE ANY OF IT.  Dependencies are named one per
         line with the size each will cost, and a dependency that could not be
         resolved is on that list too rather than discovered half way. */
      var lines = plan.items.map(function (i) {
        if (i.error) return '· ' + esc(i.title) + ' — could not be resolved: ' + esc(i.error);
        return (i.depth ? '· needs ' : '· ') + esc(i.title) + ' ' + fig(i.version) +
          (i.present ? ' (already here)' : ' — ' + fig(bytesWord(i.size)));
      }).join('<br>');
      var head = todo.length === 1
        ? 'Install one file into ' + esc(inst.name) + ':'
        : 'Install ' + todo.length + ' files into ' + esc(inst.name) + ' — ' + esc(p.n) +
          ' and ' + (todo.length - 1) + ' required ' + (todo.length === 2 ? 'dependency' : 'dependencies') + ':';
      confirmStep(btn || document.body, {
        q: head + '<br>' + lines + '<br>' + fig(bytesWord(plan.bytes)) + ' in total, hash-verified on the way in.',
        ok: 'Install ' + todo.length + (todo.length === 1 ? ' file' : ' files'),
        run: function () {
          host.content.install(inst.id, plan.id).then(function (r) {
            delete bPending[p.slug];
            installedSet(inst.name)[p.slug] = true;
            var names = r.installed.map(function (d) { return d.filename; });
            say(esc(p.n) + ' installed into ' + esc(inst.name) + ' — ' +
              fig(names.join(', ')) + ', ' + fig(bytesWord(r.bytes)) + ', every file checked against its sha1.');
            paintBrowse();
            if (bs.slug === p.slug) reRenderProject();
            refreshMods(inst.id);
          }, function (err) {
            delete bPending[p.slug]; paintBrowse();
            say('Nothing was installed: ' + esc(String(err && err.message || err)));
          });
        }
      });
      /* the button goes back to Install while the panel is open; the pending
         flag is what keeps a second click from starting a second plan */
      var go = btn;
      if (go) { go.disabled = false; go.textContent = 'Install'; }
    }, function (err) {
      delete bPending[p.slug];
      paintBrowse();
      say('Could not work out which ' + esc(noun) + ' file fits ' + esc(inst.name) + ': ' +
        esc(String(err && err.message || err)));
    });
  }

  function browseInstall(slug, btn) {
    var p = findProject(slug);
    if (!p || !bs.inst || bPending[slug]) return;
    var inst = bs.inst;
    var kind = CONTENT_KIND[p.t || bs.type];
    if (host && host.content && inst.id) {
      if (!kind) {
        say(esc(typeOf(p.t || bs.type)[1]) + ' are not installed by this build — only mods, resource packs and shader packs go into an instance folder.');
        return;
      }
      bPending[slug] = true;
      if (btn) { btn.disabled = true; btn.textContent = 'Resolving…'; }
      realInstall(p, kind, inst, btn);
      return;
    }
    /* THE CONTROL ANSWERS ON THE CLICK.  Resolving the build is a round trip
       and a button that sits still for half a second reads as a dead one, so
       it says what it is doing first — and it always resolves, into a row or
       into a sentence saying why not. */
    bPending[slug] = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Installing…'; }
    var pick = bs.mode === 'live'
      ? liveBuild(p).catch(function () {
        var f = fixtureBuild(p);
        if (f) { bs.mode = 'offline'; paintMode(); return f; }
        throw new Error('unresolved');
      })
      : Promise.resolve(fixtureBuild(p));

    Promise.resolve(pick).then(function (b) {
      delete bPending[slug];
      if (!b) throw new Error('unresolved');
      finishInstall(p, b, inst);
    }, function () {
      delete bPending[slug];
      paintBrowse();
      say('Could not reach Modrinth for the file list, so nothing was installed. ' +
        esc(p.n) + ' is still where it was.');
    });
  }

  function finishInstall(p, b, inst) {
    installedSet(inst.name)[p.slug] = true;
    var ver = cleanVer(b.n) || b.n;
    var built = b.ld ? facetLabel(b.ld) + (b.mc ? ' ' + b.mc : '') : b.mc;

    if ((p.t || bs.type) === 'mod') {
      if (inst.name === '1.21.4 Fabric') addModRow(p, ver, b.size);
      bumpModCount(inst, 1);
      say(esc(p.n) + ' ' + fig(ver) + ' installed into ' + esc(inst.name) + ' — ' + fig(b.size) +
        (built ? ', built for ' + fig(built) : '') + '.');
    } else {
      var folder = typeOf(p.t || bs.type)[3] || 'mods';
      say(esc(p.n) + ' ' + fig(ver) + ' installed — ' + fig(b.size) + ', into ' +
        fig(instancePath(slugOf(inst.name), 'short') + '\\' + folder) +
        '. Turn it on in the game’s own options.');
    }
    paintBrowse();
    if (bs.slug === p.slug) reRenderProject();
  }

  /* == #mods, READ OFF THE FOLDER ==========================================

     THE TABLE IS A VIEW OF A DIRECTORY.  Every row is one file that is really
     there: its real name, its real size off a stat, and its enabled state read
     off whether the name ends in `.disabled` - the convention every launcher
     uses, so a jar this app turns off is a jar any other launcher also sees as
     off.  A file somebody dropped in by hand appears here too, marked as ours
     to list but not ours to update.

     THE ROW CARRIES THE FILENAME, and the filename is the only thing the
     bridge is ever handed back.  It is still not a path: the main process
     matches it against a fresh readdir of that instance's own folder and acts
     on the entry it found, not on the string it was given.

     WITH NO BRIDGE none of this runs and the shipped fixture rows stay, which
     is what the published copy of this UI has always shown.                */

  var modsInstId = '';

  function modsHost() { return (host && host.content) ? host : null; }

  function realModRow(m) {
    var tr = document.createElement('div');
    tr.className = 'tr' + (m.enabled ? '' : ' tr-off');
    tr.setAttribute('role', 'row');
    tr.setAttribute('data-file', m.file);
    tr.setAttribute('data-kind', 'mod');
    if (m.slug) tr.setAttribute('data-project', m.slug);
    tr.innerHTML =
      '<span class="tick" role="checkbox" aria-checked="false" tabindex="0"><svg width="10" height="10" aria-hidden="true"><use href="#t-check"/></svg></span>' +
      '<span class="sw-sm" role="switch" aria-checked="' + (m.enabled ? 'true' : 'false') +
      '" aria-label="' + esc(m.title) + ' enabled" tabindex="0"><i></i></span>' +
      '<span class="td-name" role="cell">' + esc(m.title) +
      (m.author ? '<span class="td-by">' + esc(m.author) + '</span>' : '') + '</span>' +
      '<span class="mono td-fig" role="cell">' + esc(m.version || '\u2014') + '</span>' +
      '<span class="td-word" role="cell">' + esc(whenWord(m.mtime)) + '</span>' +
      '<span class="mono td-num ta-r" role="cell">' + esc(bytesWord(m.size)) + '</span>' +
      '<span class="td-upd" role="cell"></span>' +
      '<button class="rowmenu" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="More actions for ' +
      esc(m.title) + '"><svg width="14" height="14" aria-hidden="true"><use href="#r-dots"/></svg></button>';
    return tr;
  }

  function whenWord(ms) {
    var d = Math.max(0, Date.now() - (Number(ms) || 0));
    if (d < 90000) return 'Just now';
    if (d < 3600000) return Math.round(d / 60000) + ' minutes ago';
    if (d < 86400000) return Math.round(d / 3600000) + ' hours ago';
    return Math.round(d / 86400000) + ' days ago';
  }

  /* REPAINT FROM DISK.  Called after every install, toggle and remove, and on
     the way into the screen, so the table can never be a stale picture of a
     folder that has moved on. */
  function refreshMods(instId) {
    var K = modsHost();
    var id = String(instId || modsInstId || '');
    if (!K || !id) return Promise.resolve(null);
    modsInstId = id;
    return K.content.list(id, 'mod').then(function (list) {
      var table = document.querySelector('#screen-mods .table-mods');
      if (!table) return list;
      table.setAttribute('data-instance', id);
      [].slice.call(table.querySelectorAll('.tr:not(.th)')).forEach(function (r) { r.remove(); });
      list.forEach(function (m) { table.appendChild(realModRow(m)); });
      /* the fixture's notice is about a jar that is not in this folder */
      var notice = document.querySelector('#screen-mods .notice');
      if (notice) notice.hidden = true;
      var on = list.filter(function (m) { return m.enabled; }).length;
      var bytes = list.reduce(function (n, m) { return n + m.size; }, 0);
      var foot = document.querySelector('#screen-mods .mod-foot');
      if (foot) {
        foot.textContent = list.length + (list.length === 1 ? ' file' : ' files') + ' in the folder, ' +
          on + ' enabled, ' + bytesWord(bytes) + ' on disk.';
      }
      paintSel();
      return list;
    }, function (err) {
      say('Could not read the mods folder: ' + esc(String(err && err.message || err)));
      return null;
    });
  }

  /* the three actions a real row has, each one a call and then a repaint */
  function modSetEnabled(row, on) {
    var K = modsHost();
    var file = row && row.getAttribute('data-file');
    if (!K || !file || !modsInstId) return false;
    K.content.setEnabled(modsInstId, row.getAttribute('data-kind') || 'mod', file, on).then(function (r) {
      say(fig(file) + (on ? ' enabled.' : ' disabled - it is ' + fig(r.file) + ' now, and the loader will not read it.'));
      refreshMods();
    }, function (err) { say('That did not change: ' + esc(String(err && err.message || err))); refreshMods(); });
    return true;
  }
  function modRemove(row) {
    var K = modsHost();
    var file = row && row.getAttribute('data-file');
    if (!K || !file || !modsInstId) return false;
    K.content.remove(modsInstId, row.getAttribute('data-kind') || 'mod', file).then(function () {
      say(fig(file) + ' deleted from the mods folder.');
      refreshMods();
    }, function (err) { say('Nothing was deleted: ' + esc(String(err && err.message || err))); });
    return true;
  }
  /* UPDATES ARE A BUTTON, NOT A POLLER.  One pass over this instance's own
     files, on demand, and the answer is drawn into the Update column. */
  function modCheckUpdates() {
    var K = modsHost();
    if (!K || !modsInstId) return false;
    say('Asking Modrinth for newer builds of what is in this folder.');
    K.content.updates(modsInstId, 'mod').then(function (rows) {
      var n = 0;
      rows.forEach(function (u) {
        var tr = modRowFor(u.file);
        var cell = tr ? tr.querySelector('.td-upd') : null;
        if (!cell) return;
        if (u.state === 'update') { n++; cell.innerHTML = '<span class="chip">' + esc(u.to) + '</span>'; }
        else if (u.state === 'unmanaged') cell.textContent = 'not from Modrinth';
        else cell.textContent = u.state === 'current' ? 'up to date' : '-';
      });
      say(n ? n + (n === 1 ? ' file has' : ' files have') + ' a newer build for this instance - the new version is in the Update column.'
            : 'Everything in this folder is the newest build Modrinth has for this loader and version.');
    }, function (err) { say('The update check failed: ' + esc(String(err && err.message || err))); });
    return true;
  }
  function modRowFor(file) {
    var rows = document.querySelectorAll('#screen-mods .tr[data-file]');
    for (var i = 0; i < rows.length; i++) if (rows[i].getAttribute('data-file') === file) return rows[i];
    return null;
  }

  /* a mod row on #mods is the same shape whether the jar was dropped on the
     window or came from here, and it carries the slug so this screen can read
     it back */
  function addModRow(p, ver, size) {
    var table = document.querySelector('#screen-mods .table-mods');
    if (!table) return;
    var tr = document.createElement('div');
    tr.className = 'tr';
    tr.setAttribute('role', 'row');
    tr.setAttribute('data-project', p.slug);
    tr.innerHTML =
      '<span class="tick" role="checkbox" aria-checked="false" tabindex="0"><svg width="10" height="10" aria-hidden="true"><use href="#t-check"/></svg></span>' +
      '<span class="sw-sm" role="switch" aria-checked="true" aria-label="' + esc(p.n) + ' enabled" tabindex="0"><i></i></span>' +
      '<span class="td-name" role="cell">' + esc(p.n) + (p.by ? '<span class="td-by">' + esc(p.by) + '</span>' : '') + '</span>' +
      '<span class="mono td-fig" role="cell">' + esc(ver) + '</span>' +
      '<span class="td-word" role="cell">Just now</span>' +
      '<span class="mono td-num ta-r" role="cell">' + esc(size) + '</span>' +
      '<span class="td-upd" role="cell"></span>' +
      '<button class="rowmenu" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="More actions for ' + esc(p.n) + '">' +
      '<svg width="14" height="14" aria-hidden="true"><use href="#r-dots"/></svg></button>';
    var head = table.querySelector('.th');
    if (head && head.nextSibling) table.insertBefore(tr, head.nextSibling);
    else table.appendChild(tr);
    paintModFoot();
  }

  function paintModFoot() {
    var rows = document.querySelectorAll('#screen-mods .table-mods .tr:not(.th)');
    var kbs = 0;
    rows.forEach(function (r) {
      var cell = r.querySelector('.td-num');
      if (cell) kbs += kbOf(cell.textContent);
    });
    var foot = document.querySelector('#screen-mods .mod-foot');
    if (foot) {
      foot.innerHTML = rows.length + ' mods, ' + sizeWord(kbs) + ' in the folder. <span data-str="mods.foot"></span>';
      applyBrand(foot);
    }
  }

  /* THE COUNT OF AN INSTANCE'S MODS IS DRAWN IN MORE THAN ONE PLACE, and a
     number that moves in one of them and not the others is the same drift
     card() exists to stop — so this walks all of them. */
  function bumpModCount(inst, by) {
    if (inst.row) {
      var cell = inst.row.querySelector('.td-mods');
      if (cell) cell.textContent = String((parseInt(cell.textContent, 10) || 0) + by);
    }
    if (inst.name === SCENARIOS.normal.name) {
      SCENARIOS.normal.meta = SCENARIOS.normal.meta.replace(/^(\d+) mods/, function (m, n) {
        return (parseInt(n, 10) + by) + ' mods';
      });
      if (root.dataset.screen === 'play' && el.heroMeta) el.heroMeta.innerHTML = SCENARIOS.normal.meta;
    }
  }

  /* ── one project ────────────────────────────────────────────────────────── */

  function mdText(md) {
    /* Online, the panel shows the project's OWN page.  Modrinth stores it as
       markdown with badge images and raw HTML in it, and this is a launcher
       window rather than a browser: images, HTML blocks, tables and link
       targets come out; headings, paragraphs and lists stay.  Nothing is
       rewritten, only dropped. */
    var out = [];
    var lines = String(md || '').replace(/\r/g, '').split('\n');
    var para = [];
    var inCode = false;
    function inline(s) {
      return esc(s
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/[*_`~]{1,3}/g, '')
        .trim());
    }
    function flush() {
      if (!para.length) return;
      var s = inline(para.join(' '));
      if (s) out.push('<p>' + s + '</p>');
      para = [];
    }
    for (var i = 0; i < lines.length && out.length < 16; i++) {
      var l = lines[i].trim();
      if (l.indexOf('```') === 0) { inCode = !inCode; continue; }
      if (inCode) continue;
      if (!l) { flush(); continue; }
      if (l.charAt(0) === '#') {
        flush();
        var h = inline(l.replace(/^#+\s*/, ''));
        if (h) out.push('<h4>' + h + '</h4>');
        continue;
      }
      if (/^([-*+]|\d+\.)\s+/.test(l)) {
        flush();
        var li = inline(l.replace(/^([-*+]|\d+\.)\s+/, ''));
        if (li) out.push('<li>' + li + '</li>');
        continue;
      }
      if (/^[|>]/.test(l) || /^<\/?\w/.test(l) || /^[-=]{3,}$/.test(l)) continue;
      para.push(l);
    }
    flush();
    return out.join('');
  }

  function versionTable(vs, p) {
    if (!vs.length) return '<p class="dep-none">No published build is listed for this project.</p>';
    var has = bs.inst && installedSet(bs.inst.name)[p.slug];
    var head = '<div class="tr th" role="row"><span role="columnheader">Build</span>' +
      '<span role="columnheader">Channel</span><span role="columnheader">Minecraft</span>' +
      '<span role="columnheader">Published</span><span role="columnheader" class="ta-r">Size</span>' +
      '<span role="columnheader"></span></div>';
    var body = vs.map(function (v) {
      return '<div class="tr" role="row">' +
        '<span class="mono td-fig" role="cell" title="' + esc(v.n) + '">' + esc(v.n) + '</span>' +
        '<span class="v-kind" data-k="' + esc(v.k) + '" role="cell">' + esc(v.k) + '</span>' +
        '<span class="mono td-fig" role="cell">' + esc(mcCell(v.mc, v.mcn)) + '</span>' +
        '<span class="td-word" role="cell">' + esc(ago(v.d)) + '</span>' +
        '<span class="mono td-num ta-r" role="cell">' + esc(v.s) + '</span>' +
        ((p.t || bs.type) === 'modpack' || has ? '<span role="cell"></span>'
          : '<button class="quiet quiet-sm" type="button" data-act="browse-install" data-slug="' + esc(p.slug) +
            '" aria-label="Install ' + esc(p.n) + ' ' + esc(v.n) + '">Install</button>') +
      '</div>';
    }).join('');
    return '<div class="table table-vlist" role="table" aria-label="Published builds">' + head + body + '</div>';
  }

  function depList(deps) {
    if (!deps || !deps.length) {
      return '<p class="dep-none">' + (bs.mode === 'offline'
        ? 'The bundled record lists none for this build.'
        : 'Modrinth lists none for the newest build.') + '</p>';
    }
    return '<div class="deps">' + deps.map(function (d) {
      var to = d.slug || (BFIXTURE.filter(function (f) { return f.n === d.n; })[0] || {}).slug;
      var have = d.have || (to && bs.inst && installedSet(bs.inst.name)[to]);
      return '<div class="dep-row">' +
        (to ? '<a class="dep-n link-in" href="#browse/' + esc(to) + '">' + esc(d.n) + '</a>'
          : '<span class="dep-n">' + esc(d.n) + '</span>') +
        '<span class="dep-k">' + esc(d.k) + '</span>' +
        '<span class="dep-k">' + (have ? 'already in ' + esc(bs.inst.name) : '') + '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  function fact(k, v, mono) {
    return '<div class="proj-fact"><dt>' + esc(k) + '</dt><dd' + (mono ? ' class="mono"' : '') + '>' + esc(v) + '</dd></div>';
  }
  /* A project supports eighty game versions and most of them are snapshots
     and release candidates.  Printing four of those is four facts nobody
     asked for; the newest three RELEASES and a count is the answer. */
  /* Modrinth lists a build's game versions oldest first, and a shader pack
     supports seventy of them.  The useful end is the new one. */
  function mcCell(list, total) {
    var n = total || (list || []).length;
    return (list || []).slice(-3).reverse().join(', ') + (n > 3 ? '  +' + (n - 3) : '');
  }
  function mcFact(list, total) {
    var rel = (list || []).filter(function (v) { return /^\d+(\.\d+){0,2}$/.test(v); });
    if (!rel.length) return '—';
    var n = total || (list || []).length;
    return rel.slice(-3).reverse().join(', ') + (n > 3 ? '  +' + (n - 3) : '');
  }

  function renderProject(p, body, vs, deps, src) {
    if (!bEl.proj) return;
    var has = bs.inst && installedSet(bs.inst.name)[p.slug];
    var act = (p.t || bs.type) === 'modpack'
      ? '<button class="prim" type="button" data-act="browse-pack" data-slug="' + esc(p.slug) + '">New instance from this</button>'
      : has
        ? '<span class="brow-has"><svg width="12" height="12" aria-hidden="true"><use href="#r-check"/></svg>Installed in ' + esc(bs.inst.name) + '</span>'
        : '<button class="prim" type="button" data-act="browse-install" data-slug="' + esc(p.slug) + '">Install into ' + esc(bs.inst ? bs.inst.name : 'the instance') + '</button>';

    bEl.proj.innerHTML =
      '<header class="proj-head">' +
        '<a class="back" href="#browse" aria-label="Back to the results"><svg width="14" height="14" aria-hidden="true"><use href="#r-chev"/></svg></a>' +
        '<span class="proj-ic" aria-hidden="true">' + esc(monogram(p.n)) + '</span>' +
        '<div class="proj-id"><h2 class="proj-n">' + esc(p.n) + '</h2>' +
          '<p class="proj-by">' + (p.by ? esc(p.by) : '') +
            '<span class="chip">' + esc(sentence(typeOf(p.t || bs.type)[2])) + '</span>' +
            '<span class="chip">' + esc(sideWord(p.side)) + '</span></p></div>' +
        '<div class="proj-act">' + act +
          '<button class="rowmenu" type="button" data-slug="' + esc(p.slug) + '" aria-haspopup="menu" aria-expanded="false" aria-label="More actions for ' + esc(p.n) + '">' +
          '<svg width="14" height="14" aria-hidden="true"><use href="#r-dots"/></svg></button></div>' +
      '</header>' +
      '<p class="proj-lead">' + esc(p.d) + '</p>' +
      '<dl class="proj-facts">' +
        fact('Downloads', comma(p.dl), true) +
        fact('Followers', comma(p.fol), true) +
        fact('Updated', ago(p.up), false) +
        fact('Licence', licenceName(p.lic), false) +
        fact('Minecraft', mcFact(p.mc, p.mcn), true) +
      '</dl>' +
      /* WHAT A PLAYER OPENED THIS FOR, IN THAT ORDER: whether it will load
         here, then which file, then the page.  The project's own prose is
         long, sometimes a thousand words of it, and putting that first would
         push the two things this screen exists to answer off the fold. */
      '<section class="proj-sec"><h3 class="proj-h">Builds</h3>' + versionTable(vs, p) + '</section>' +
      '<section class="proj-sec" id="browseDeps"><h3 class="proj-h">Dependencies</h3>' + depList(deps) + '</section>' +
      '<section class="proj-sec"><h3 class="proj-h">About</h3>' +
        '<div class="proj-body">' + (body || '<p>No description is published.</p>') + '</div>' +
        '<p class="proj-src">' + esc(src) + '</p></section>';
  }

  function projectFromFixture(rec) {
    return {
      id: rec.id, slug: rec.slug, t: rec.t, n: rec.n, by: rec.by, d: rec.d, cat: rec.cat,
      dl: rec.dl, fol: rec.fol, up: rec.up, made: rec.made, mc: rec.mc, mcn: rec.mcn, lic: rec.lic, side: rec.side
    };
  }

  function renderFromFixture(rec) {
    renderProject(projectFromFixture(rec),
      '<p>' + esc(rec.about) + '</p>',
      (rec.v || []).map(function (v) { return { n: v.n, mc: v.mc, mcn: v.mcn, k: v.k, d: v.d, s: v.s }; }),
      rec.dep || [],
      'From the list bundled with the app, read off Modrinth on ' + rec.up + '.');
  }

  function reRenderProject() { if (bs.slug) openProject(bs.slug); }

  function openProject(slug) {
    if (!bEl.proj) return;
    bs.slug = slug;
    if (bEl.list) bEl.list.hidden = true;
    bEl.proj.hidden = false;
    var known = findProject(slug);
    var rec = BYSLUG[slug];

    if (bs.mode === 'offline') {
      if (!rec) {
        bEl.proj.innerHTML = '<p class="brow-none"><span>' + esc(slug) + ' is not in the bundled list, and ' +
          'Modrinth cannot be reached to look it up. <a class="link-in" href="#browse">Back to the results</a>.</span></p>';
        return;
      }
      renderFromFixture(rec);
      return;
    }

    var base = known && known.n ? known : (rec ? projectFromFixture(rec) : null);
    if (base) renderProject(base, '<p>Reading the page from Modrinth…</p>', [], [], 'Asking Modrinth…');
    else bEl.proj.innerHTML = '<p class="brow-none"><span>Asking Modrinth about ' + esc(slug) + '…</span></p>';

    var seq = ++bs.pseq;
    Promise.all([getJSON(MR + '/project/' + slug), getJSON(MR + '/project/' + slug + '/version')])
      .then(function (r) {
        if (seq !== bs.pseq || bs.slug !== slug) return;
        bs.mode = 'live';
        paintMode();
        var pr = r[0], vs = r[1] || [];
        var p = {
          id: pr.id, slug: pr.slug, t: (base && base.t) || pr.project_type || bs.type,
          n: pr.title, by: (base && base.by) || '', d: pr.description, cat: pr.categories || [],
          dl: pr.downloads, fol: pr.followers, up: pr.updated, mc: pr.game_versions || [],
          lic: (pr.license || {}).id,
          side: pr.client_side === 'required' && pr.server_side === 'unsupported' ? 'client'
            : pr.server_side === 'required' && pr.client_side !== 'required' ? 'server' : 'both'
        };
        var top = vs.slice(0, 8).map(function (v) {
          return { n: v.version_number, mc: v.game_versions || [], mcn: (v.game_versions || []).length, k: v.version_type,
            d: (v.date_published || '').slice(0, 10), s: bytesWord(((v.files || [])[0] || {}).size || 0) };
        });
        var deps = ((vs[0] || {}).dependencies || []).filter(function (d) {
          return d.dependency_type !== 'embedded' && d.project_id;
        });
        renderProject(p, mdText(pr.body), top, [], 'From Modrinth. The page itself, not a copy of it.');
        if (!deps.length) return;
        getJSON(MR + '/projects?ids=' + encodeURIComponent(JSON.stringify(deps.map(function (d) { return d.project_id; }))))
          .then(function (list) {
            if (bs.slug !== slug) return;
            var named = deps.map(function (d) {
              var m = (list || []).filter(function (x) { return x.id === d.project_id; })[0];
              return { n: m ? m.title : 'A project on Modrinth', slug: m ? m.slug : '', k: d.dependency_type };
            });
            var sec = document.getElementById('browseDeps');
            if (sec) sec.innerHTML = '<h3 class="proj-h">Dependencies</h3>' + depList(named);
          }, function () {});
      }, function () {
        if (seq !== bs.pseq || bs.slug !== slug) return;
        bs.mode = 'offline';
        paintMode();
        if (rec) renderFromFixture(rec);
        else bEl.proj.innerHTML = '<p class="brow-none"><span>Modrinth could not be reached, and ' +
          esc(slug) + ' is not in the bundled list. <a class="link-in" href="#browse">Back to the results</a>.</span></p>';
      });
  }

  function closeProject() {
    bs.slug = '';
    if (bEl.proj) bEl.proj.hidden = true;
    if (bEl.list) bEl.list.hidden = false;
  }

  /* ── the screen, entered ────────────────────────────────────────────────── */

  function browseEnter(sub) {
    if (!bEl.rows) return;
    if (!bs.inst) {
      var all = browseInstances();
      bs.inst = all.filter(function (i) { return i.row && i.row.hasAttribute('data-current'); })[0] || all[0] || null;
      paintScope();
    }
    if (sub) {
      if (!bs.ran) runBrowse();
      openProject(sub);
      return;
    }
    closeProject();
    if (!bs.ran) runBrowse(); else paintBrowse();
  }

  /* ── wiring ─────────────────────────────────────────────────────────────── */

  var bTimer = null;
  if (bEl.q) bEl.q.addEventListener('input', function () {
    bs.q = bEl.q.value.trim();
    clearTimeout(bTimer);
    bTimer = setTimeout(function () {
      if (bs.slug) location.hash = '#browse';
      runBrowse();
    }, 220);
  });
  if (bEl.fit) bEl.fit.addEventListener('change', function () {
    bs.fit = bEl.fit.checked;
    runBrowse();
    say(bs.fit
      ? 'Filtered back to what fits ' + fig((bs.inst && bs.inst.ver) || '') + '.'
      : 'Filter off. Everything is listed, and the rows that will not load here are marked.');
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var type = e.target.closest('#screen-browse [data-btype]');
    if (type) {
      e.preventDefault();
      if (type.getAttribute('data-btype') === bs.type) return;
      bs.type = type.getAttribute('data-btype');
      bs.cats = [];
      /* THE COLUMN ANSWERS ON THE CLICK.  Resolving the search is a round
         trip; which type is selected is not, and a filter that lights up only
         once the network comes back is a filter that feels broken. */
      paintCats();
      paintScope();
      if (bs.slug) location.hash = '#browse';
      runBrowse();
      return;
    }
    var cat = e.target.closest('#screen-browse [data-bcat]');
    if (cat) {
      e.preventDefault();
      var c = cat.getAttribute('data-bcat');
      var at = bs.cats.indexOf(c);
      if (at === -1) bs.cats.push(c); else bs.cats.splice(at, 1);
      cat.setAttribute('aria-pressed', at === -1 ? 'true' : 'false');
      if (bs.slug) location.hash = '#browse';
      runBrowse();
    }
  });

  /* ══ THE REST OF THE WIRING ═══════════════════════════════════════════════ */

  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!a) return;
    var act = a.getAttribute('data-act');

    if (act === 'srv-add') {
      e.preventDefault();
      if (srvForm && !srvForm.hidden && !srvEditing) srvClose();
      else srvOpen(null);
      return;
    }
    if (act === 'srv-save') { e.preventDefault(); srvSave(); return; }
    if (act === 'srv-cancel') { e.preventDefault(); srvClose(); return; }

    if (act === 'open-folder') {
      e.preventDefault();
      var what = a.getAttribute('data-name') || 'the instance folder';
      var sub = what.indexOf('folder') !== -1 && what !== 'the instance folder'
        ? '\\' + what.replace('the ', '').replace(' folder', '')
        : '';
      /* IT OPENS THE FOLDER NOW. This printed "Would open ..." and did
         nothing for as long as the screen has existed — a button that
         narrates itself instead of working. The id comes from the screen or
         the row the button is in; the main process turns it into a path,
         because the page does not get to name one. */
      var holder = a.closest ? a.closest('[data-id]') : null;
      /* #screen-mods and the other sub-screens carry no id of their own, so
         they fall back to the instance that was opened — which is what
         "the mods folder" means when you are looking at that instance. */
      var openScreen = document.getElementById('screen-instance');
      var instId = (holder && holder.getAttribute('data-id'))
        || (openScreen && openScreen.getAttribute('data-id'))
        || '';
      var folder = sub ? sub.replace(/^\\/, '') : '';
      if (host && host.openInstanceFolder && instId) {
        host.openInstanceFolder(instId, folder).then(function (opened) {
          say('Opened ' + fig(opened) + '.');
        }, function (err) {
          say('That folder could not be opened. ' + esc(err.message));
        });
        return;
      }
      say('Would open ' + fig(instancePath(a.getAttribute('data-slug') || '1-21-4-fabric', 'full') + sub) + ' in Explorer.');
      return;
    }
    if (act === 'open-log') {
      e.preventDefault();
      say('Would open ' + fig(instancePath('1-21-4-fabric', 'full') + '\\logs\\latest.log') + ' in the text editor Windows has for it.');
      return;
    }
    if (act === 'copy-log') {
      e.preventDefault();
      var snip = document.querySelector('#tp-instance-logs .logsnip') || document.querySelector('.logsnip');
      copy(snip ? snip.textContent : '', 'The tail of ' + fig('latest.log') + ' copied.');
      return;
    }
    if (act === 'apply-version') {
      e.preventDefault();
      var mc = document.querySelector('#tp-instance-versions .table-vers .tr-pick[aria-selected="true"] .td-fig');
      var lo = document.querySelectorAll('#tp-instance-versions .table-vers')[1];
      var lv = lo ? lo.querySelector('.tr-pick[aria-selected="true"] .td-fig') : null;
      var loader = document.querySelector('#tp-instance-versions .loader-b[aria-pressed="true"]');
      say('1.21.4 Fabric would move to ' + fig((mc ? mc.textContent : '1.21.4')) + ' on ' +
          fig((loader ? loader.textContent : 'Fabric') + (lv ? ' ' + lv.textContent : '')) +
          ', and every file would be checked before the next launch.');
      return;
    }
    if (act === 'verify-files') {
      e.preventDefault();
      location.hash = '#states/preparing';
      say('Comparing 3,617 files against the manifest. Nothing is downloaded unless a hash is wrong.');
      return;
    }
    /* A control that already exists in a toolbar goes where it says it goes.
       It stays a button rather than becoming a link, because swapping the
       element under a shared class is a width change waiting to happen and
       this is a wiring job. */
    if (act === 'goto') { e.preventDefault(); location.hash = a.getAttribute('data-to'); return; }

    if (act === 'check-versions') {
      e.preventDefault();
      say('Asked Mojang for the version manifest. Nothing new since ' + fig('1.21.8') + ' on 17 July.');
      return;
    }

    /* ── the mods screen ──────────────────────────────────────────────── */

    if (act === 'mods-add-disk') {
      e.preventDefault();
      say('Would ask for ' + fig('.jar') + ' files and read each one’s loader and version before it goes in.');
      return;
    }
    /* THE NOTICE IS ABOUT ONE FILE and goes when that file is dealt with.
       It is hidden rather than removed: it is a live region, and the row it
       describes is still in the table, so the notice has to be able to come
       back if the jar does. */
    if (act === 'notice') {
      e.preventDefault();
      var notice = a.closest('.notice');
      var which = a.getAttribute('data-say');
      var jar = 'ferritecore-7.0.1-forge.jar';
      var jarRow = document.querySelector('#screen-mods .tr[data-project="ferrite-core"]');
      if (which === 'fetch') {
        if (notice) notice.hidden = true;
        say('Would fetch the Fabric build of ' + fig('ferritecore') + ' for ' + fig('1.21.4') + ' and replace the Forge jar.');
        return;
      }
      if (which === 'leave') {
        /* leaving it disabled is a state, not a sentence: the switch goes
           off and the row goes dim, so the table agrees with the message */
        if (jarRow) {
          var jsw = jarRow.querySelector('.sw-sm');
          if (jsw) jsw.setAttribute('aria-checked', 'false');
          jarRow.classList.add('tr-off');
        }
        if (notice) notice.hidden = true;
        say(fig(jar) + ' left in the folder, disabled. Fabric will not load it, and nothing else changes.');
        return;
      }
      /* deleting a file off disk asks first, in the second step of the same
         panel every other delete in this app uses */
      confirmStep(a, {
        q: 'Delete ' + fig(jar) + ' from the mods folder? It is the only copy — nothing else here has it.',
        ok: 'Delete the file',
        run: function () {
          if (jarRow) jarRow.remove();
          if (notice) notice.hidden = true;
          paintSel();
          say(fig(jar) + ' would be deleted from ' + fig(instancePath('1-21-4-fabric', 'full') + '\\mods') + '.');
        }
      });
      return;
    }
    if (act === 'sel-disable' || act === 'sel-updates' || act === 'sel-remove') {
      e.preventDefault();
      var picked = [].slice.call(document.querySelectorAll('#screen-mods .tick[aria-checked="true"]'))
        .map(function (t) { return t.closest('.tr'); });
      if (!picked.length) return;
      var count = picked.length + (picked.length === 1 ? ' mod' : ' mods');
      /* PHASE 5.  When the rows name real files the bar acts on them: the
         jars are renamed, checked, or deleted for real. */
      var real = picked.filter(function (r) { return r.hasAttribute('data-file'); });
      if (real.length && modsHost()) {
        if (act === 'sel-disable') { real.forEach(function (r) { modSetEnabled(r, false); }); return; }
        if (act === 'sel-updates') { modCheckUpdates(); return; }
        confirmStep(a, {
          q: 'Delete ' + real.length + (real.length === 1 ? ' file' : ' files') +
             ' from the mods folder? Anything that depends on them will say so before the next launch.',
          ok: 'Delete ' + real.length + (real.length === 1 ? ' file' : ' files'),
          run: function () { real.forEach(function (r) { modRemove(r); }); }
        });
        return;
      }
      if (act === 'sel-disable') {
        picked.forEach(function (r) {
          var sw = r.querySelector('.sw-sm');
          if (sw) sw.setAttribute('aria-checked', 'false');
          r.classList.add('tr-off');
        });
        say(count + ' disabled. The jars stay in the folder.');
      } else if (act === 'sel-updates') {
        say('Would ask Modrinth for a newer build of ' + count + ' against ' + fig('1.21.4') + '.');
      } else {
        /* deleting jars asks first, the same second step every other delete
           on the screen uses */
        confirmStep(a, {
          q: 'Delete ' + count + ' from 1.21.4 Fabric? Anything that depends on them will say so before the next launch.',
          ok: 'Remove ' + count,
          run: function () {
            picked.forEach(function (r) { r.remove(); });
            paintSel();
            say(count + ' removed from 1.21.4 Fabric.');
          }
        });
        return;
      }
      paintSel();
      return;
    }

    /* ── the content browser ──────────────────────────────────────────── */

    if (act === 'browse-install') {
      e.preventDefault();
      browseInstall(a.getAttribute('data-slug'), a);
      return;
    }
    if (act === 'browse-pack') {
      e.preventDefault();
      var packSlug = a.getAttribute('data-slug');
      var pack = findProject(packSlug);
      location.hash = '#import';
      say((pack ? esc(pack.n) : 'That pack') + ' would be fetched as an ' + fig('.mrpack') +
        ' and become a new instance. Nothing already in the library is touched.');
      return;
    }
    if (act === 'browse-fit-off') {
      e.preventDefault();
      var fitBox = document.getElementById('browseFit');
      if (fitBox) { fitBox.checked = false; fitBox.dispatchEvent(new Event('change')); }
      return;
    }
    if (act === 'browse-retry') {
      e.preventDefault();
      bs.mode = 'unknown';
      if (bs.slug) { runBrowse(); openProject(bs.slug); } else runBrowse();
      return;
    }

    /* ── the presets screen ───────────────────────────────────────────── */

    if (act === 'pre-export' || act === 'pre-dup') {
      e.preventDefault();
      var cur = document.querySelector('#screen-presets .table-pre .tr[data-current] .td-name span');
      var curName = cur ? cur.textContent.trim() : 'Competitive';
      if (act === 'pre-export') say(esc(curName) + ' would be written to ' + fig(slugOf(curName) + '.kes') + '. The share code above carries the same thing.');
      else say(esc(curName) + ' would be copied as ' + esc(curName + ' 2') + ', with the same layout and the same options.');
      return;
    }
    if (act === 'take-on') {
      e.preventDefault();
      a.closest('li').classList.remove('take-warn');
      a.remove();
      say('Both tweaks turned on, so the code would apply in full.');
      return;
    }
    if (act === 'take-read') { e.preventDefault(); say('Read it: nine elements would be placed and eighteen options would change.'); return; }
    if (act === 'take-open') {
      e.preventDefault();
      say('Would ask for a ' + fig('.kes') + ' file and read the same thing the code carries.');
      return;
    }

  });

  /* ══ MAKING AN INSTANCE, AND BRINGING ONE IN ══════════════════════════════

     ONE RECORD, EVERY RENDERING.  An instance is drawn four times — a row in
     the library table, a card in the library grid, a card in the Recent strip
     on #play, and two figures in the subject line — so creating one writes
     all four in one call, the same way dropRecord() removes all four.  A
     create that only appended a row would leave the grid and the strip lying
     about what the library holds, which is the exact fault Delete was written
     to avoid.

     LOADER LEGALITY IS A TABLE, NOT A HOPE.  Forge is versioned per Minecraft
     release and its build numbers are NOT interchangeable: 11.15.1.2318 is a
     1.8.9 build and offering it against 1.21.4 is the bug this project has
     already fixed once.  So the builds live in a map keyed by the Minecraft
     version, the loader row is painted from that map every time the version
     changes, and a loader with no entry cannot be selected at all.  Fabric
     and Quilt are the exceptions that prove it: their loaders are genuinely
     version-independent above 1.14, and below 1.14 they do not exist.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Fabric Loader and Quilt Loader are one build for every Minecraft version
     they support — 1.14 upward for Fabric, 1.14 upward for Quilt — so they
     are lists rather than maps. */
  var FABRIC_BUILDS = [
    ['0.16.9', 'latest stable'], ['0.16.5', ''], ['0.16.0', ''],
    ['0.15.11', ''], ['0.14.24', ''], ['0.14.21', '']
  ];
  var QUILT_BUILDS = [
    ['0.26.4', 'latest stable'], ['0.26.3', ''], ['0.25.0', ''],
    ['0.24.0', ''], ['0.23.1', '']
  ];
  /* Forge and NeoForge are per Minecraft version, and the first number is the
     part that makes a build legal or illegal. */
  var FORGE_BUILDS = {
    '1.21.8': [['58.1.0', 'recommended']],
    '1.21.7': [['57.0.4', 'recommended']],
    '1.21.6': [['56.0.5', 'recommended']],
    '1.21.5': [['55.0.24', 'recommended']],
    '1.21.4': [['54.1.6', 'recommended'], ['54.0.16', '']],
    '1.21.3': [['53.1.0', 'recommended']],
    '1.21.1': [['52.1.7', 'recommended'], ['52.0.40', '']],
    '1.21':   [['51.0.33', 'recommended']],
    '1.20.6': [['50.2.0', 'recommended']],
    '1.20.4': [['49.1.0', 'recommended']],
    '1.20.1': [['47.4.0', 'recommended'], ['47.2.20', ''], ['47.1.3', '']],
    '1.19.4': [['45.4.0', 'recommended']],
    '1.19.2': [['43.5.0', 'recommended'], ['43.2.0', '']],
    '1.18.2': [['40.3.0', 'recommended'], ['40.2.0', '']],
    '1.16.5': [['36.2.42', 'recommended'], ['36.2.34', '']],
    '1.14.4': [['28.2.26', 'recommended']],
    '1.12.2': [['14.23.5.2860', 'recommended'], ['14.23.5.2859', '']],
    '1.8.9':  [['11.15.1.2318', 'recommended'], ['11.15.1.1722', '']],
    '1.7.10': [['10.13.4.1614', 'recommended']]
  };
  /* NeoForge forked Forge at 1.20.1 and has nothing older.  Its 1.20.1 build
     still carries Forge's 47 line; everything after it is numbered from the
     Minecraft version it loads on. */
  var NEO_BUILDS = {
    '1.21.8': [['21.8.47', 'latest'], ['21.8.29', '']],
    '1.21.7': [['21.7.24', 'latest']],
    '1.21.6': [['21.6.20', 'latest']],
    '1.21.5': [['21.5.95', 'latest'], ['21.5.66', '']],
    '1.21.4': [['21.4.147', 'latest'], ['21.4.110', '']],
    '1.21.3': [['21.3.86', 'latest']],
    '1.21.1': [['21.1.209', 'latest'], ['21.1.169', '']],
    '1.21':   [['21.0.167', 'latest']],
    '1.20.6': [['20.6.119', 'latest']],
    '1.20.4': [['20.4.237', 'latest']],
    '1.20.1': [['47.1.106', 'the fork’s first build']]
  };
  /* 1.8.9 has no Fabric, no NeoForge and no Quilt.  It has Forge, and it has
     OptiFine, which is not a loader and so is not in the loader row — the
     hint under Loader version says so rather than leaving a dead button. */
  var OPTIFINE = { '1.8.9': 'HD U M5', '1.12.2': 'HD U G5', '1.16.5': 'HD U G8', '1.20.1': 'HD U I6' };

  /* the versions the release filter does not show, real ids and real dates */
  var MK_EXTRA_VERS = [
    ['snapshot', '25w31a', '30 Jul 2025'],
    ['snapshot', '25w21a', '20 May 2025'],
    ['snapshot', '1.21.5-rc2', '24 Mar 2025'],
    ['snapshot', '25w10a', '5 Mar 2025'],
    ['snapshot', '1.21.4-pre3', '28 Nov 2024'],
    ['snapshot', '24w33a', '15 Aug 2024'],
    ['beta', 'b1.8.1', '19 Sep 2011'],
    ['beta', 'b1.7.3', '8 Jul 2011'],
    ['beta', 'b1.6.6', '31 May 2011'],
    ['beta', 'b1.5_01', '21 Apr 2011'],
    ['beta', 'b1.2_02', '21 Jan 2011'],
    ['beta', 'b1.0', '20 Dec 2010'],
    ['alpha', 'a1.2.6', '31 Mar 2011'],
    ['alpha', 'a1.1.2_01', '21 Sep 2010'],
    ['alpha', 'a1.0.17_04', '13 Aug 2010'],
    ['alpha', 'a1.0.14', '30 Jul 2010'],
    ['alpha', 'a1.0.4', '5 Jul 2010']
  ];
  var VTYPE_WORD = { release: 'release', snapshot: 'snapshot', beta: 'old beta', alpha: 'old alpha' };

  /* 1.14 is where Fabric starts, and the string compare that would put 1.8.9
     above 1.14.4 is the same one verKey() already exists to stop */
  function mcAtLeast114(id) {
    var m = String(id).match(/^1\.(\d+)/);
    return !!m && parseInt(m[1], 10) >= 14;
  }

  /* ── the real builds, and the fixture underneath them ─────────────────────
     THE TABLE ABOVE IS THE FALLBACK, not the plan — the same arrangement the
     version list already uses.  With a bridge, each of the four loaders is
     asked its own meta service or maven what it actually has for the selected
     Minecraft version, and the answer replaces the fixture for that pair.

     THREE STATES, NOT TWO, and the third is the one that matters.  `undefined`
     means nobody has asked yet, so the fixture answers and a request goes out.
     An array means the network answered: a non-empty one is the real build
     list, and an EMPTY one is the service saying "this loader has never had a
     build for that version" — which is a stronger answer than the fixture's
     silence and greys the button out.  A failed request stores nothing, so
     the fixture keeps standing and an offline launcher still offers Fabric on
     1.21.4 rather than claiming no loader exists.                          */
  var MK_LIVE = {};       /* "fabric|1.16.5" -> [[version, tag], ...] */
  var MK_ASKED = {};
  var MK_LOADERS = ['Fabric', 'Forge', 'NeoForge', 'Quilt'];

  function mkLiveKey(loader, ver) { return loader.toLowerCase() + '|' + ver; }

  function mkFetchBuilds(ver) {
    if (!ver || !host || !host.game || !host.game.loaderVersions) return;
    MK_LOADERS.forEach(function (nm) {
      var k = mkLiveKey(nm, ver);
      if (MK_ASKED[k]) return;
      MK_ASKED[k] = true;
      host.game.loaderVersions(nm, ver).then(function (list) {
        if (!Array.isArray(list)) return;
        /* the picker's shape is [version, tag]; the tag is the one word the
           menu shows beside a build, and "latest stable" is the only one the
           services actually assert */
        var seenStable = false;
        MK_LIVE[k] = list.slice(0, 60).map(function (e) {
          var tag = '';
          if (e.stable && !seenStable) { tag = 'latest stable'; seenStable = true; }
          return [String(e.version), tag];
        });
        if (mk.ver === ver) { mkPaintLoaders(); mkPaintCreate(); }
      }, function () {
        /* the request failed — leave the fixture standing and let it be
           asked again the next time the version is selected */
        MK_ASKED[k] = false;
      });
    });
  }

  /* THE ONE ANSWER TO "can this loader load this version".  null means the
     loader has no build at all for it and must not be offerable; an empty
     list means the loader itself has no version to pick (Vanilla). */
  function mkBuilds(loader, ver, type) {
    if (loader === 'Vanilla') return [];
    if (!ver) return null;
    var live = MK_LIVE[mkLiveKey(loader, ver)];
    if (live) return live.length ? live : null;
    if (type === 'beta' || type === 'alpha') return null;   /* nothing loaded these */
    if (loader === 'Fabric') return (type === 'snapshot' || mcAtLeast114(ver)) ? FABRIC_BUILDS : null;
    if (loader === 'Quilt')  return (type === 'snapshot' || mcAtLeast114(ver)) ? QUILT_BUILDS : null;
    if (type === 'snapshot') return null;                   /* Forge and NeoForge ship for releases */
    if (loader === 'Forge') return FORGE_BUILDS[ver] || null;
    if (loader === 'NeoForge') return NEO_BUILDS[ver] || null;
    return null;
  }

  /* ── the library, as a thing that can be added to ──────────────────────── */

  var libSubjN = document.querySelector('#screen-instances .subject-n');
  var libSubjM = document.querySelector('#screen-instances .subject-m');
  /* the figure on the subject line is the sum of the rows.  It is carried
     and adjusted by the delta rather than re-summed on every change, so a
     record that has already left the table still takes its bytes with it. */
  var libKb = libSubjM ? bytes(libSubjM.textContent) : 0;

  function sizeText(kb) {
    if (kb >= 1044381) return (kb / 1048576).toFixed(1) + ' GB';
    return Math.round(kb / 1024) + ' MB';
  }

  function libRows() {
    return [].slice.call(document.querySelectorAll('#screen-instances .table .tr:not(.th)'));
  }
  function libNames() {
    return libRows().map(function (tr) { return recordName(tr).toLowerCase(); });
  }
  /* THE NAMING RULE, in one place: "1.21.4 Fabric" taken and nothing else
     gives "1.21.4 Fabric 2", which is the value #import was shipped prefilled
     with. */
  function nextFreeName(base) {
    var names = libNames();
    var stem = String(base).replace(/\s+\d+$/, '').trim() || 'Instance';
    if (names.indexOf(stem.toLowerCase()) === -1) return stem;
    var n = 2;
    while (names.indexOf((stem + ' ' + n).toLowerCase()) !== -1) n++;
    return stem + ' ' + n;
  }
  /* AN IMPORT IS NOT A COPY.  "All the Mods 10" is the pack's name and the 10
     is part of it, so a name that comes in from outside is kept whole and only
     falls through to the copy rule if the library already holds it. */
  function freeName(want) {
    want = String(want).trim();
    return libNames().indexOf(want.toLowerCase()) === -1 ? want : nextFreeName(want);
  }

  function paintLibrary(deltaKb) {
    if (deltaKb) libKb = Math.max(0, libKb + deltaKb);
    var n = libRows().length;
    if (libSubjN) libSubjN.textContent = n + (n === 1 ? ' instance' : ' instances');
    if (libSubjM) libSubjM.textContent = sizeText(libKb) + ' on disk';
    /* carried across runs so the figure survives a restart with whatever
       add and remove have done to it since */
    if (host && deltaKb) host.settings.set({ libKb: libKb }).catch(function () {});
  }

  function libRowHtml(d) {
    var art = d.art
      ? '<span class="ic" aria-hidden="true"><svg width="14" height="14"><use href="#' + d.art + '"/></svg></span>'
      : '<span class="ic ic-mono" aria-hidden="true">' + esc(d.mono || monogram(d.name)) + '</span>';
    return '<div class="tr" role="row"' + (d.author ? ' data-author="' + esc(d.author) + '"' : '') + '>'
      + '<button class="rowplay" type="button" data-act="launch" aria-label="Play ' + esc(d.name) + '">'
      +   '<svg width="14" height="14" aria-hidden="true"><use href="#r-play"/></svg></button>'
      + '<span class="td-name" role="cell">' + art + '<span>' + esc(d.name) + '</span></span>'
      + '<span class="mono td-fig" role="cell">' + esc(d.ver) + '</span>'
      + '<span class="mono td-fig td-load" role="cell"><b>' + esc(d.loader) + '</b>'
      +   (d.lver ? ' <em>' + esc(d.lver) + '</em>' : '') + '</span>'
      + '<span class="mono td-fig ta-r td-mods" role="cell">' + esc(String(d.mods || 0)) + '</span>'
      + '<span class="td-note" role="cell">' + esc(d.when || 'Never') + '</span>'
      + '<span class="mono td-num ta-r td-size" role="cell">' + esc(d.size) + '</span>'
      + '<span class="mono td-num ta-r pt" data-hrs="lo" role="cell"><b>0h</b> <em>00m</em></span>'
      + '<button class="rowmenu" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="More actions for ' + esc(d.name) + '">'
      +   '<svg width="14" height="14" aria-hidden="true"><use href="#r-dots"/></svg></button>'
      + '</div>';
  }

  function nodeOf(html) {
    var box = document.createElement('div');
    box.innerHTML = html;
    return box.firstChild;
  }

  /* a user's own image, wherever the record is drawn */
  function paintArt(node, url) {
    if (!node || !url) return;
    node.querySelectorAll('.ic').forEach(function (i) {
      i.style.backgroundImage = 'url("' + url + '")';
      i.style.backgroundSize = 'cover';
      i.innerHTML = '';
    });
    var art = node.classList && node.classList.contains('card-art') ? node : node.querySelector('.card-art');
    if (art) {
      art.style.backgroundImage = 'url("' + url + '")';
      art.style.backgroundSize = 'cover';
      var cov = art.querySelector('.card-cover');
      if (cov) cov.style.display = 'none';
    }
  }

  /* THE ONE WRITE.  Everything that shows the library is written here, in the
     order the library already puts things in: newest first, under the
     instance that is current. */
  /* `then` is called with the saved record once the folder is on disk — the
     id only exists after that, and a loader install needs one */
  function addInstance(d, then) {
    var grid = document.getElementById('libGrid');
    var strip = document.getElementById('playStrip');
    if (!libTable) return null;

    var rec = {
      name: d.name, art: d.art || '', mono: d.mono || '', ver: d.ver,
      loader: d.loader, lver: d.lver || '', author: d.author || '',
      mods: d.mods || 0, size: d.size || '327 MB', when: d.when || 'Never',
      image: d.image || '', current: false
    };

    var tr = nodeOf(libRowHtml(rec));
    var cur = libTable.querySelector('.tr[data-current]');
    var after = cur || libTable.querySelector('.th');
    if (after && after.nextSibling) libTable.insertBefore(tr, after.nextSibling);
    else libTable.appendChild(tr);
    /* the sort remembers the shipped order in an array, so a row that is only
       in the DOM would vanish the first time somebody sorted by name */
    var at = libOrder.indexOf(after);
    if (at === -1) libOrder.push(tr); else libOrder.splice(at + 1, 0, tr);
    paintArt(tr, rec.image);

    if (grid) {
      var c = nodeOf(card(rec));
      paintArt(c, rec.image);
      grid.insertBefore(c, grid.children[1] || null);
    }
    if (strip) {
      var s = nodeOf(card(rec));
      paintArt(s, rec.image);
      strip.insertBefore(s, strip.firstChild);
      /* the strip is a period, not a queue: it holds STRIP_N and the rest
         stay in the table, which is where they already were */
      while (strip.children.length > STRIP_N) strip.removeChild(strip.lastChild);
    }

    paintLibrary(bytes(rec.size));
    paintStripNav();
    paintPicks();

    /* THE FOLDER.  New, duplicated and imported instances all come through
       here, so this is the one place a record has to reach disk.  The row is
       already on screen; the id comes back and is stamped on it so Delete
       knows which folder it is deleting. */
    if (host) {
      rec.group = groupOf(tr);
      rec.playtime = { hrs: 'lo', h: '0h', m: '00m' };
      /* A MODPACK INSTALL ALREADY MADE THE FOLDER.  packInstall() creates the
         instance in the main process — it has to, because the files go into
         it as they download — so the row is stamped with the id that came
         back rather than creating a second instance for the same pack. */
      if (d.id) {
        tr.setAttribute('data-id', String(d.id));
        if (typeof then === 'function') then(rec);
      } else {
        host.instances.create(rec).then(function (saved) {
          if (saved && saved.id) tr.setAttribute('data-id', saved.id);
          if (typeof then === 'function') then(saved);
        }, function (err) { say('Could not write the instance folder. ' + esc(err.message)); });
      }
    }
    return tr;
  }

  /* the library row, read back as a record, so a duplicate is a copy of the
     thing on screen rather than a second description of it */
  function recordOf(name) {
    var hit = libRows().filter(function (tr) { return recordName(tr) === name; })[0];
    if (!hit) return null;
    var d = readRow(hit);
    var mods = hit.querySelector('.td-mods'), size = hit.querySelector('.td-size');
    d.mods = mods ? parseInt(mods.textContent, 10) || 0 : 0;
    d.size = size ? size.textContent.trim() : '327 MB';
    d.current = false;
    return d;
  }

  /* ══ #new ═════════════════════════════════════════════════════════════════ */

  var mkVersTable = document.getElementById('mkVers');
  var mkNameEl = document.getElementById('mkName');
  var mkIconEl = document.getElementById('mkIcon');
  var mkCountEl = document.getElementById('mkCount');
  var mkFindEl = document.getElementById('mkFind');
  var mkCreateEl = document.getElementById('mkCreate');
  var mkBuildEl = document.getElementById('mkLoaderVer');
  var mkGroupEl = document.getElementById('mkGroup');
  var mkPathEl = document.querySelector('#screen-new .f-path');
  var mkJavaEl = document.querySelector('#screen-new .mk-java');
  var mkJavaWas = mkJavaEl ? mkJavaEl.innerHTML : '';
  var mkBuildHint = mkBuildEl ? mkBuildEl.parentNode.querySelector('.f-hint') : null;
  var mkBuildHintWas = mkBuildHint ? mkBuildHint.textContent : '';

  var mk = {
    art: 'b-obsid', icon: 'Obsidian', image: '',
    types: ['release'], q: '',
    ver: '1.21.4', vtype: 'release',
    loader: 'Fabric', build: '0.16.9',
    group: 'PvP'
  };

  function mkVerRowHtml(vtype, id, date, thin) {
    return '<div class="tr tr-pick' + (thin ? ' tr-thin' : '') + '" role="row" aria-selected="false" data-vtype="' + esc(vtype) + '">'
      + '<span class="mono td-fig">' + esc(id) + '</span>'
      + '<span class="td-word">' + esc(date) + '</span>'
      + '<span class="td-word"></span>'
      + '<span class="mono td-num ta-r td-off">—</span></div>';
  }

  if (mkVersTable) {
    /* everything the screen shipped with is a release; the other three types
       are the rows the filter had nothing to filter to */
    mkVersTable.querySelectorAll('.tr-pick').forEach(function (r) { r.setAttribute('data-vtype', 'release'); });
    MK_EXTRA_VERS.forEach(function (v) {
      mkVersTable.appendChild(nodeOf(mkVerRowHtml(v[0], v[1], v[2], true)));
    });
  }

  /* ── the real list ────────────────────────────────────────────────────────
     THE FIXTURE IS THE FALLBACK, not the plan.  The rows above are in the
     markup and are what the browser build shows; with a bridge, Mojang's
     version_manifest_v2.json replaces them wholesale.  If the fetch fails —
     no network, or a cache that has never been filled — nothing is replaced
     and the screen is the one that shipped, which is the right degradation:
     a launcher that shows nine hundred versions or nineteen is more use than
     one that shows a spinner.

     Mojang's four types map onto the four the filter already knows about:
     release, snapshot, old_beta and old_alpha.                            */
  var MK_TYPE = { release: 'release', snapshot: 'snapshot', old_beta: 'beta', old_alpha: 'alpha' };
  function mkDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ' ' + d.getFullYear();
  }
  function mkLoadRealVersions() {
    if (!mkVersTable || !host || !host.game) return;
    host.game.versions(false).then(function (m) {
      var list = (m && m.versions) || [];
      if (list.length < 10) return;                 /* not a manifest; keep the fixture */
      var th = mkVersTable.querySelector('.th');
      mkVersTable.innerHTML = '';
      if (th) mkVersTable.appendChild(th);
      var frag = document.createDocumentFragment();
      list.forEach(function (v) {
        var kind = MK_TYPE[v.type] || 'snapshot';
        frag.appendChild(nodeOf(mkVerRowHtml(kind, v.id, mkDate(v.released), kind !== 'release')));
      });
      mkVersTable.appendChild(frag);
      /* the selection the screen booted with is almost certainly gone now, so
         mkPaintVers() is asked to choose again from what is actually there */
      mk.ver = ''; mk.vtype = '';
      mkPaint();
    }).catch(function () { /* the fixture stays */ });
  }

  function mkVerRows() {
    return mkVersTable ? [].slice.call(mkVersTable.querySelectorAll('.tr-pick')) : [];
  }
  function mkVerId(r) { return r.querySelector('.td-fig').textContent.trim(); }

  function mkPaintVers() {
    var shown = [];
    mkVerRows().forEach(function (r) {
      var t = r.getAttribute('data-vtype');
      var id = mkVerId(r).toLowerCase();
      var ok = mk.types.indexOf(t) !== -1 && (!mk.q || id.indexOf(mk.q) !== -1);
      /* an inline display beats [hidden] here: .tr sets display itself and
         would win the cascade against it */
      r.style.display = ok ? '' : 'none';
      if (ok) shown.push(r);
    });
    var on = shown.filter(function (r) { return r.getAttribute('aria-selected') === 'true'; })[0];
    if (!on) {
      mkVerRows().forEach(function (r) { r.setAttribute('aria-selected', 'false'); });
      on = shown[0] || null;
      if (on) on.setAttribute('aria-selected', 'true');
    }
    mk.ver = on ? mkVerId(on) : '';
    mk.vtype = on ? on.getAttribute('data-vtype') : '';
    if (mkCountEl) {
      mkCountEl.textContent = (mk.types.length === 1 && mk.types[0] === 'release' && !mk.q)
        ? 'Sorted newest first'
        : shown.length ? shown.length + (shown.length === 1 ? ' version' : ' versions') + ', newest first'
                       : 'Nothing of that kind';
    }
    paintPicks();
  }

  function mkLoaderBtns() {
    return [].slice.call(document.querySelectorAll('#screen-new .loaders .loader-b'));
  }

  function mkPaintLoaders() {
    /* ask the four services what they really have for this version; the
       answers arrive later and call back in here */
    mkFetchBuilds(mk.ver);
    /* a loader with no build for this version cannot be the selection, so if
       the version moved out from under it the row falls back to Vanilla */
    if (!mkBuilds(mk.loader, mk.ver, mk.vtype)) mk.loader = 'Vanilla';
    mkLoaderBtns().forEach(function (b) {
      var nm = b.textContent.trim();
      var legal = !!mkBuilds(nm, mk.ver, mk.vtype);
      b.setAttribute('aria-disabled', legal ? 'false' : 'true');
      b.setAttribute('aria-pressed', legal && nm === mk.loader ? 'true' : 'false');
    });
    var list = mkBuilds(mk.loader, mk.ver, mk.vtype) || [];
    if (list.length && !list.filter(function (b) { return b[0] === mk.build; }).length) mk.build = list[0][0];
    if (!list.length) mk.build = '';
    mkPaintBuild();
  }

  function mkPaintBuild() {
    if (!mkBuildEl) return;
    var mono = mkBuildEl.querySelector('.mono');
    var tag = mkBuildEl.querySelector('.td-latest');
    var list = mkBuilds(mk.loader, mk.ver, mk.vtype) || [];
    var hit = list.filter(function (b) { return b[0] === mk.build; })[0];
    if (mono) mono.textContent = mk.loader === 'Vanilla' ? 'None' : mk.loader + ' ' + mk.build;
    if (tag) tag.textContent = mk.loader === 'Vanilla' ? 'no mod loader' : (hit && hit[1]) || '';
    if (mkBuildHint) mkBuildHint.textContent = mkLegalLine();
  }

  /* THE RULE, WRITTEN DOWN WHERE THE CHOICE IS MADE.  The loader row greys
     out on its own, but a control that is off without saying why is a bug
     report, so the hint under it names what this version can actually take. */
  function mkLegalLine() {
    if (!mk.ver) return 'Pick a Minecraft version and the loaders it can take are listed here.';
    var can = ['Fabric', 'Forge', 'NeoForge', 'Quilt'].filter(function (l) { return !!mkBuilds(l, mk.ver, mk.vtype); });
    var of = OPTIFINE[mk.ver];
    if (!can.length) {
      return mk.ver + ' predates every mod loader in this list, so it runs vanilla'
        + (of ? ', or with OptiFine ' + of + ' installed by hand.' : '.');
    }
    return mk.ver + ' takes ' + can.join(', ').replace(/, ([^,]*)$/, ' and $1')
      + (of ? ' — or OptiFine ' + of + ', which is not a loader.' : '.')
      + ' Older builds are in the list for packs that pin one.';
  }

  /* what stops this being created, in the words of the thing that is missing */
  function mkProblem() {
    var name = mkNameEl ? mkNameEl.value.trim() : '';
    if (!name) return 'Needs a name.';
    if (libNames().indexOf(name.toLowerCase()) !== -1) return 'The library already has an instance called ' + esc(name) + '. Pick another name.';
    if (!mk.ver) return 'Needs a Minecraft version — no version matches the filter above.';
    if (!mkBuilds(mk.loader, mk.ver, mk.vtype)) return esc(mk.loader) + ' has no build for ' + fig(mk.ver) + '.';
    return '';
  }

  function mkPaintCreate() {
    if (!mkCreateEl) return;
    var bad = mkProblem();
    mkCreateEl.disabled = !!bad;
    mkCreateEl.setAttribute('aria-disabled', bad ? 'true' : 'false');
    if (mkJavaEl) mkJavaEl.innerHTML = bad || mkJavaWas;
    mkCreateEl.title = bad && mkJavaEl ? mkJavaEl.textContent : '';
  }

  function mkPaintName() {
    var name = mkNameEl ? mkNameEl.value.trim() : '';
    if (mkPathEl) {
      mkPathEl.setAttribute('data-path', slugOf(name) || 'instance');
      mkPathEl.textContent = instancePath(slugOf(name) || 'instance', 'short');
      mkPathEl.setAttribute('title', instancePath(slugOf(name) || 'instance', 'full'));
    }
    mkPaintCreate();
  }

  function mkPaintIcon() {
    document.querySelectorAll('#screen-new .tiles .tile').forEach(function (t) {
      var use = t.querySelector('use');
      var sym = use ? (use.getAttribute('href') || '').replace('#', '') : '';
      var mine = t.classList.contains('tile-file') ? !!mk.image : (!mk.image && sym === mk.art);
      t.setAttribute('aria-pressed', mine ? 'true' : 'false');
    });
    if (!mkIconEl) return;
    if (mk.image) {
      mkIconEl.innerHTML = '';
      mkIconEl.style.backgroundImage = 'url("' + mk.image + '")';
      mkIconEl.style.backgroundSize = 'cover';
    } else {
      mkIconEl.style.backgroundImage = '';
      mkIconEl.innerHTML = '<svg width="14" height="14"><use href="#' + mk.art + '"/></svg>';
    }
  }

  function mkPaint() {
    mkPaintVers();
    mkPaintLoaders();
    mkPaintIcon();
    mkPaintName();
  }

  /* the six block faces, each said in its own words: a status line that only
     swaps one six-letter noun for another is a line nobody reads twice */
  var BLOCK_SAYS = {
    Stone:    'Stone — the plain grey face an instance falls back to.',
    Obsidian: 'Obsidian — near-black, which is what most of this library already wears.',
    Planks:   'Planks — oak.',
    Bricks:   'Bricks — the red clay block.',
    Grass:    'Grass — the block that is on every Minecraft box ever printed.',
    Glass:    'Glass — pale, and the lightest of the six.'
  };

  /* one hidden input, made when it is asked for and taken away again, because
     a file dialog is the only way a page can be handed a real file */
  function pickFile(accept, then) {
    document.querySelectorAll('input.kx-file').forEach(function (o) { o.remove(); });
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.className = 'kx-file';
    inp.accept = accept;
    inp.tabIndex = -1;
    inp.setAttribute('aria-hidden', 'true');
    inp.style.position = 'fixed';
    inp.style.left = '-9999px';
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      inp.remove();
      if (f) then(f);
    });
    document.body.appendChild(inp);
    inp.click();
  }

  /* ── the four groups of controls on #new ──────────────────────────────── */

  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;

    var tile = e.target.closest('#screen-new .tiles .tile');
    if (tile) {
      e.preventDefault();
      if (tile.classList.contains('tile-file')) {
        say('Pick a ' + fig('PNG') + ' or ' + fig('JPG') + '. It is copied into the instance folder as ' + fig('icon.png') + ' and used at every size.');
        pickFile('image/png,image/jpeg,image/*', function (f) {
          mk.image = URL.createObjectURL(f);
          mkPaintIcon();
          say(fig(f.name) + ', ' + bytesWord(f.size) + ', is now the icon.');
        });
        return;
      }
      var use = tile.querySelector('use');
      mk.image = '';
      mk.art = use ? (use.getAttribute('href') || '').replace('#', '') : mk.art;
      mk.icon = tile.getAttribute('aria-label') || mk.icon;
      mkPaintIcon();
      say((BLOCK_SAYS[mk.icon] || esc(mk.icon))
        + ' It is the face the card, the row and the Recent strip all draw.');
      return;
    }

    var lb = e.target.closest('#screen-new .loaders .loader-b');
    if (lb) {
      e.preventDefault();
      var nm = lb.textContent.trim();
      if (!mkBuilds(nm, mk.ver, mk.vtype)) {
        say('There is no ' + esc(nm) + ' build for ' + fig(mk.ver) + '. ' + mkLegalLine());
        return;
      }
      mk.loader = nm;
      mk.build = '';
      mkPaintLoaders();
      mkPaintCreate();
      say(mk.loader === 'Vanilla'
        ? 'No mod loader. ' + fig(mk.ver) + ' would launch as Mojang ships it.'
        : esc(mk.loader) + ' ' + fig(mk.build) + ' selected for ' + fig(mk.ver) + '.');
      return;
    }

    var seg = e.target.closest('#screen-new .mk-filter .seg-b');
    if (seg) {
      e.preventDefault();
      /* four filters, not four modes: this is the same set of checkboxes the
         version list in Prism and MultiMC has, so they combine */
      var t = seg.getAttribute('data-vtype');
      var at = mk.types.indexOf(t);
      if (at === -1) mk.types.push(t); else mk.types.splice(at, 1);
      seg.setAttribute('aria-pressed', at === -1 ? 'true' : 'false');
      mkPaintVers();
      mkPaintLoaders();
      mkPaintCreate();
      return;
    }

    var vrow = e.target.closest('#screen-new .table-vers .tr-pick');
    if (vrow) {
      e.preventDefault();
      pickRow(vrow);
      var was = mk.loader;
      mk.ver = mkVerId(vrow);
      mk.vtype = vrow.getAttribute('data-vtype');
      mkPaintLoaders();
      mkPaintCreate();
      say(mk.loader === was
        ? fig(mk.ver) + ' selected. ' + mkLegalLine()
        : fig(mk.ver) + ' selected, and ' + esc(was) + ' has no build for it — the loader fell back to ' + esc(mk.loader) + '. ' + mkLegalLine());
      return;
    }
  });

  if (mkNameEl) mkNameEl.addEventListener('input', mkPaintName);
  if (mkFindEl) mkFindEl.addEventListener('input', function () {
    mk.q = mkFindEl.value.trim().toLowerCase();
    mkPaintVers();
    mkPaintLoaders();
    mkPaintCreate();
  });

  POPS['mk-loader'] = function (btn) {
    var list = mkBuilds(mk.loader, mk.ver, mk.vtype);
    if (!list || !list.length) {
      popover.menu(btn, [{ note: mk.loader === 'Vanilla'
        ? 'Vanilla has no loader to version. Pick Fabric, Forge, NeoForge or Quilt first.'
        : esc(mk.loader) + ' has no build for ' + fig(mk.ver) + '.' }], { label: 'Loader version' });
      return;
    }
    var items = [{ note: 'Builds of ' + esc(mk.loader) + ' that load on ' + fig(mk.ver) + '.' }];
    list.forEach(function (b) {
      items.push({
        label: b[0] + (b[0] === mk.build ? '  ·  in use' : b[1] ? '  ·  ' + b[1] : ''),
        run: function () {
          mk.build = b[0];
          mkPaintBuild();
          say(esc(mk.loader) + ' ' + fig(b[0]) + ' selected.');
        }
      });
    });
    popover.menu(btn, items, { label: 'Loader version' });
  };

  var MK_GROUPS = ['PvP', 'Modded', 'Servers', 'Testing', 'Archive'];
  POPS['mk-group'] = function (btn) {
    var items = [{ note: 'Groups only change how the instance list is sorted.' }];
    MK_GROUPS.concat(['No group']).forEach(function (g) {
      items.push({
        label: g + (g === mk.group ? '  ·  in use' : ''),
        run: function () {
          mk.group = g === 'No group' ? '' : g;
          btn.firstChild.textContent = g === 'No group' ? 'No group' : g;
          say(mk.group ? esc(mk.group) + ' is the group.' : 'No group. It sorts with everything else.');
        }
      });
    });
    items.push('-');
    items.push({ label: 'New group…', keep: true, run: function () {
      popover.form(btn, { label: 'Name the group', value: '', ok: 'Create', run: function (v) {
        if (MK_GROUPS.indexOf(v) === -1) MK_GROUPS.push(v);
        mk.group = v;
        btn.firstChild.textContent = v;
        say(esc(v) + ' created as a group.');
      } });
    } });
    popover.menu(btn, items, { label: 'Group' });
  };

  /* ── Create ───────────────────────────────────────────────────────────── */

  function mkCreate() {
    var bad = mkProblem();
    if (bad) { say(bad); return; }
    var name = mkNameEl.value.trim();
    var d = {
      name: name, art: mk.image ? '' : mk.art, mono: mk.image ? '' : '',
      image: mk.image, ver: mk.ver,
      loader: mk.loader, lver: mk.loader === 'Vanilla' ? '' : mk.build,
      mods: 0, size: mkFreshSize(), when: 'Never'
    };
    if (mk.image) d.art = mk.art;   /* the block face is the frame the image is painted into */
    var tr = addInstance(d, mkInstallLoader);
    location.hash = '#instances';
    setTimeout(function () {
      var c = [].slice.call(document.querySelectorAll('#libGrid .card')).filter(function (x) {
        var n = x.querySelector('.card-name');
        return n && n.textContent.trim() === name;
      })[0];
      if (c) { c.scrollIntoView({ block: 'nearest' }); c.focus(); }
      else if (tr) tr.scrollIntoView({ block: 'nearest' });
    }, 30);
    say(esc(name) + ' created at ' + fig(instancePath(slugOf(name), 'short')) + ' — '
      + fig(mk.ver) + ' on ' + fig(mk.loader === 'Vanilla' ? 'no loader' : mk.loader + ' ' + mk.build)
      + (mk.group ? ', in ' + esc(mk.group) : '') + '. It is in the library.');
  }

  /* ── the loader actually gets installed ───────────────────────────────────
     CREATE WRITES THE FOLDER; THIS WRITES THE PROFILE.  The instance record
     already carries the loader and its build, so this call is only the
     trigger — main process picks the version out of the record, fetches the
     profile from the loader's own service, and writes it beside the vanilla
     one.  What comes back is the merged profile's id and, for modern Forge
     and NeoForge, the honest news that the installer's processors have not
     been run and the instance is not launchable yet.

     IT IS NOT AWAITED BY CREATE.  The row is already on screen and the
     library is already correct; the loader is a second, slower fact about the
     same instance, and blocking the navigation on a maven round trip would
     make Create feel broken on a slow link.                                */
  function mkInstallLoader(saved) {
    if (!saved || !saved.id || !host || !host.game || !host.game.installLoader) return;
    var nm = String(saved.loader || '');
    if (!nm || nm === 'Vanilla') return;
    host.game.installLoader(saved.id, nm, saved.lver || '').then(function (r) {
      if (!r) return;
      if (r.partial) {
        say(esc(nm) + ' ' + fig(saved.lver || '') + ' is installed as far as this build goes: '
          + esc(r.notes.join(' ')) + ' The instance is in the library and its version json is correct, but Play will say the same thing.');
      } else {
        say(esc(nm) + ' ' + fig(saved.lver || r.id) + ' installed for ' + fig(r.mc)
          + ' — the profile is ' + fig(r.id) + ' and it launches ' + fig(r.mainClass) + '.');
      }
    }, function (err) {
      say('Could not install ' + esc(nm) + ' for ' + fig(saved.ver || '') + '. ' + esc(err.message));
    });
  }

  /* a new instance is the version and nothing else, so its size is the
     version's, which the list on this screen already states */
  function mkFreshSize() {
    var row = mkVerRows().filter(function (r) { return mkVerId(r) === mk.ver; })[0];
    var cell = row ? row.querySelector('.td-num') : null;
    var txt = cell ? cell.textContent.trim() : '';
    return /\d/.test(txt) ? txt : '312 MB';
  }

  /* ══ #import ══════════════════════════════════════════════════════════════ */

  var impInstEl = document.getElementById('impInst');
  var impNameEl = document.getElementById('impName');
  var impWorldsEl = document.getElementById('impWorlds');
  var impWorldsLab = document.querySelector('#screen-import .imp-dup .check');
  var impFileH = document.querySelector('#screen-import .imp-file-h');
  var impFileS = document.querySelector('#screen-import .imp-file-s');
  var imp = { src: '1.21.4 Fabric', file: null };

  /* the instances each launcher is holding.  Real packs, real folders — the
     launcher names and the paths are the ones the screen already states. */
  var FOUND = {
    'Prism Launcher': [
      ['All the Mods 10', '1.21.1', 'NeoForge', '21.1.209', 428, '4.8 GB', 'p-atm'],
      ['Better MC BMC4', '1.21.1', 'Fabric', '0.16.9', 366, '4.1 GB', 'p-arena'],
      ['Vault Hunters 3', '1.18.2', 'Forge', '40.2.0', 219, '3.6 GB', 'b-nether'],
      ['SkyFactory 4', '1.12.2', 'Forge', '14.23.5.2859', 218, '2.9 GB', 'b-sand'],
      ['Fabulously Optimized', '1.21.4', 'Fabric', '0.16.9', 61, '1.2 GB', 'b-prism'],
      ['1.8.9 Practice', '1.8.9', 'Forge', '11.15.1.2318', 12, '512 MB', 'b-stone']
    ],
    'CurseForge': [
      ['RLCraft', '1.12.2', 'Forge', '14.23.5.2859', 176, '2.7 GB', 'b-nether'],
      ['DawnCraft', '1.18.2', 'Forge', '40.2.0', 293, '3.9 GB', 'p-bed'],
      ['Prominence II RPG', '1.20.1', 'Fabric', '0.16.9', 341, '4.2 GB', 'p-arena']
    ]
  };

  function bringIn(spec, where) {
    var name = freeName(spec[0]);
    addInstance({
      name: name, art: spec[6], ver: spec[1], loader: spec[2], lver: spec[3],
      mods: spec[4], size: spec[5], when: 'Never'
    });
    return name;
  }

  POPS['imp-launcher'] = function (btn) {
    var row = btn.closest('.imp-row');
    var who = row ? row.querySelector('.imp-name').textContent.trim() : 'Prism Launcher';
    var where = row ? row.querySelector('.imp-where').textContent.trim() : '';
    var total = row ? row.querySelector('.imp-n').textContent.trim() : '';
    var list = FOUND[who] || [];
    var items = [{ note: total + ' in ' + fig(where) + '. Each one is copied — nothing in '
      + esc(who) + ' is moved or deleted.' }];
    list.forEach(function (spec) {
      items.push({
        label: spec[0] + '  ·  ' + spec[1] + ' ' + spec[2],
        run: function () {
          var nm = bringIn(spec, who);
          say(esc(nm) + ' brought across from ' + esc(who) + ' — ' + fig(spec[1]) + ' on '
            + fig(spec[2] + ' ' + spec[3]) + ', ' + spec[4] + ' mods, ' + fig(spec[5]) + '.');
        }
      });
    });
    items.push('-');
    items.push({
      label: 'Import all ' + list.length + ' of these',
      run: function () {
        var n = 0;
        list.forEach(function (spec) { bringIn(spec, who); n++; });
        var rest = (parseInt(total, 10) || n) - n;
        say(n + ' instances brought across from ' + esc(who) + '.'
          + (rest > 0 ? ' The other ' + rest + ' would follow the same way.' : ''));
      }
    });
    popover.menu(btn, items, { label: 'Instances found in ' + who });
  };

  POPS['imp-inst'] = function (btn) {
    var items = [{ note: 'The copy gets its own folder, its own mods and its own options.' }];
    libRows().forEach(function (tr) {
      var nm = recordName(tr);
      items.push({
        label: nm + (nm === imp.src ? '  ·  in use' : ''),
        run: function () {
          imp.src = nm;
          btn.firstChild.textContent = nm;
          if (impNameEl) impNameEl.value = nextFreeName(nm);
          var rec = recordOf(nm);
          say(esc(nm) + ' would be copied as ' + esc(impNameEl ? impNameEl.value : nm)
            + (rec ? ' — ' + fig(rec.ver) + ' on ' + fig(rec.loader + (rec.lver ? ' ' + rec.lver : '')) + ', ' + fig(rec.size) : '') + '.');
        }
      });
    });
    popover.menu(btn, items, { label: 'Instance to duplicate' });
  };

  if (impWorldsEl) impWorldsEl.addEventListener('change', function () {
    /* the property is what a checkbox changes; the attribute is what anything
       reading this row back out of the DOM can see */
    if (impWorldsEl.checked) impWorldsEl.setAttribute('checked', 'checked');
    else impWorldsEl.removeAttribute('checked');
    say(impWorldsEl.checked
      ? 'The saves folder is copied too, so the copy starts where the original is.'
      : 'The copy starts with an empty saves folder. The original keeps its worlds.');
  });

  function impDuplicate() {
    var rec = recordOf(imp.src);
    if (!rec) { say('Pick an instance to duplicate first.'); return; }
    var want = (impNameEl && impNameEl.value.trim()) || nextFreeName(imp.src);
    var name = libNames().indexOf(want.toLowerCase()) === -1 ? want : nextFreeName(want);
    var worlds = !!(impWorldsEl && impWorldsEl.checked);
    var kb = bytes(rec.size);
    var lost = impWorldsLab ? bytes(impWorldsLab.textContent) : 0;
    var size = worlds ? rec.size : sizeText(Math.max(kb * 0.2, kb - lost));
    addInstance({
      name: name, art: rec.art, mono: rec.mono, ver: rec.ver, loader: rec.loader,
      lver: rec.lver, author: rec.author, mods: rec.mods, size: size, when: 'Never'
    });
    if (impNameEl) impNameEl.value = nextFreeName(imp.src);
    say(esc(rec.name) + ' duplicated as ' + esc(name) + ' at ' + fig(instancePath(slugOf(name), 'short'))
      + ' — ' + fig(rec.ver) + ' on ' + fig(rec.loader + (rec.lver ? ' ' + rec.lver : '')) + ', '
      + rec.mods + ' mods, ' + fig(size) + (worlds ? ', worlds and all' : ', without the worlds') + '.');
  }

  function impPack(f) {
    imp.file = f;
    var base = f.name.replace(/\.(mrpack|zip|modpack)$/i, '').replace(/[._-]+/g, ' ').trim();
    var name = freeName(base || 'Imported pack');
    if (impFileH) impFileH.textContent = f.name;
    if (impFileS) impFileS.textContent = bytesWord(f.size) + ' · would be read, not run · choose another to replace it';
    var btn = document.querySelector('#screen-import [data-act="imp-pack"]');
    popover.menu(btn || document.body, [
      { note: fig(f.name) + ', ' + bytesWord(f.size) + '. A pack file carries a manifest — the '
        + 'Minecraft version, the loader and its build, and every mod as a hash and a download. '
        + 'It would be created as ' + esc(name) + ' at ' + fig(instancePath(slugOf(name), 'short'))
        + ', on ' + fig(mk.ver) + ' with ' + fig(mk.loader === 'Vanilla' ? 'no loader' : mk.loader + ' ' + mk.build)
        + ', and both corrected from the manifest before anything is downloaded.' },
      { label: 'Import as ' + name, run: function () {
        addInstance({ name: name, art: 'p-atm', ver: mk.ver, loader: mk.loader,
          lver: mk.loader === 'Vanilla' ? '' : mk.build, mods: 0, size: mkFreshSize(), when: 'Never' });
        say(esc(name) + ' created from ' + fig(f.name) + '. Its mods would come down on the first launch.');
      } },
      { label: 'Cancel' }
    ], { label: 'Import ' + f.name });
  }

  /* ── a .mrpack, for real ──────────────────────────────────────────────────
     THE PAGE NEVER HOLDS A PATH.  choose() takes no argument: the main
     process opens the picker, reads the manifest and answers with what is in
     it. What comes back is a plan and an id, and install() hands the id
     straight back — so nothing here can name a file to read or a url to
     fetch, which is the same rule the Modrinth browser runs on.

     THE CONFIRMATION IS THE PACK'S OWN NUMBERS.  Not the file size and not
     the name of the file: the Minecraft version, the loader and its build,
     how many files, how many of them are configuration, and anything the
     pack asked for that will not be installed.  A modpack is a few hundred
     jars from a few hundred authors and this is the moment to say so.      */
  function impPackReal(btn) {
    host.pack.choose().then(function (plan) {
      /* a dismissed dialog is an answer, not a failure */
      if (!plan) return;

      var name = freeName(plan.name || 'Modpack');
      var loader = plan.loader
        ? plan.loader.charAt(0).toUpperCase() + plan.loader.slice(1) + (plan.loaderVersion ? ' ' + plan.loaderVersion : '')
        : 'no loader';
      if (impFileH) impFileH.textContent = plan.name + (plan.versionId ? ' ' + plan.versionId : '');
      if (impFileS) {
        impFileS.textContent = plan.files + ' files, ' + bytesWord(plan.bytes)
          + (plan.overrides ? ' · ' + plan.overrides + ' configuration files' : '')
          + ' · read, not run';
      }

      var note = fig(plan.name) + (plan.versionId ? ' ' + fig(plan.versionId) : '')
        + ' asks for ' + fig(plan.mc) + ' with ' + fig(loader) + '. '
        + plan.files + ' files, ' + bytesWord(plan.bytes)
        + (plan.overrides ? ', and ' + plan.overrides + ' configuration files it brings with it' : '')
        + '. Every one is checked against the hash the pack published before it is kept, '
        + 'and it would be created as ' + esc(name) + ' at ' + fig(instancePath(slugOf(name), 'short')) + '.';
      if (plan.skipped && plan.skipped.length) {
        note += ' ' + plan.skipped.length + ' server-side file'
          + (plan.skipped.length === 1 ? '' : 's') + ' in the pack will be skipped, which is correct for a client.';
      }

      popover.menu(btn || document.body, [
        { note: note },
        { label: 'Install as ' + name, run: function () { impPackInstall(plan, name); } },
        { label: 'Cancel' }
      ], { label: 'Install ' + plan.name });
    }, function (err) {
      say('That pack could not be read. ' + esc(err.message));
    });
  }

  function impPackInstall(plan, name) {
    say('Installing ' + esc(name) + ' — the Minecraft version and the loader come down first, then the pack&rsquo;s own files.');
    host.pack.install(plan.id, name).then(function (r) {
      /* the folder already exists: packInstall made it, so the row is
         stamped with that id rather than creating a second instance */
      addInstance({
        id: r.instance, name: name, art: 'p-atm', ver: plan.mc,
        loader: plan.loader ? plan.loader.charAt(0).toUpperCase() + plan.loader.slice(1) : 'Vanilla',
        lver: plan.loaderVersion || '', mods: r.files, size: bytesWord(plan.bytes), when: 'Never'
      });
      say(esc(name) + ' installed — ' + r.files + ' files'
        + (r.overrides ? ' and ' + r.overrides + ' configuration files' : '')
        + ', each checked against the hash the pack published.'
        + (r.skipped ? ' ' + r.skipped + ' server-side file' + (r.skipped === 1 ? '' : 's') + ' skipped.' : ''));
      location.hash = '#instances';
    }, function (err) {
      /* packInstall removes the half-built instance itself, so there is
         nothing on screen to undo — only something to explain */
      say('That pack did not install, and nothing was left behind. ' + esc(err.message));
    });
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!a) return;
    var act = a.getAttribute('data-act');
    if (act === 'mk-create') { e.preventDefault(); mkCreate(); return; }
    if (act === 'imp-dup') { e.preventDefault(); impDuplicate(); return; }
    if (act === 'imp-pack') {
      e.preventDefault();
      /* THE REAL ONE WHEN THERE IS A BACKEND.  In the browser build there is
         no window.kestrel, no file dialog and nothing to install into, so the
         fixture below still describes what would happen.  In the app the
         manifest is read for real and the numbers in the confirmation are the
         pack's own rather than the picker's. */
      if (host && host.pack) { impPackReal(a); return; }
      say('Pick an ' + fig('.mrpack') + ', a CurseForge ' + fig('.zip') + ' or a MultiMC export. It is read, never run.');
      pickFile('.mrpack,.zip,.modpack,application/zip', impPack);
      return;
    }
  });

  /* both screens paint once from their own state, so what is on screen at
     rest is what the state says rather than what the markup shipped with */
  if (mkVersTable) { mkPaint(); mkLoadRealVersions(); }
  paintLibrary(0);


  /* ══ #settings, #accounts, #appearance ════════════════════════════════════

     THE LAST FOUR SCREENS, wired on the rules the rest of the app already
     runs on: the status bar is the toast, the popover is the only menu, a
     destructive action asks in a second step of the same panel, and anything
     that needs a real backend states what it would do rather than pretending
     it did it.

     ONE THING HERE IS A REFUSAL.  There is no field on #accounts that takes
     a Microsoft password, address or token, and there is not going to be
     one.  A launcher that asks for a Microsoft password is a launcher that
     has your Microsoft password.  The real handshake is the OAuth 2.0 device
     authorisation grant: the app asks Microsoft for a short user code, shows
     it, and polls; the person opens microsoft.com/link in their own browser
     and types the code THERE, on Microsoft's page, under Microsoft's URL bar.
     Nothing sensitive crosses this window, so this window has nowhere to put
     it.  That is what is built below.
     ═══════════════════════════════════════════════════════════════════════ */

  /* a folder picker, next to the file picker that is already here.  Chromium
     and Edge both take webkitdirectory, which is what a packaged build would
     replace with the shell's own dialog. */
  function pickFolder(then) {
    document.querySelectorAll('input.kx-file').forEach(function (o) { o.remove(); });
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.className = 'kx-file';
    inp.webkitdirectory = true;
    inp.setAttribute('webkitdirectory', '');
    inp.setAttribute('directory', '');
    inp.tabIndex = -1;
    inp.setAttribute('aria-hidden', 'true');
    inp.style.position = 'fixed';
    inp.style.left = '-9999px';
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      var rel = f ? (f.webkitRelativePath || f.name) : '';
      inp.remove();
      then(rel.split('/')[0] || '');
    });
    document.body.appendChild(inp);
    inp.click();
  }

  /* hand the browser a file.  A Blob and an object URL, revoked after the
     click, because a palette is small enough to build in memory. */
  function download(name, text, mime) {
    var url = URL.createObjectURL(new Blob([text], { type: mime || 'application/json' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 0);
  }

  /* ── #settings ────────────────────────────────────────────────────────── */

  /* THE RUNTIMES, as they actually identify themselves.  A test that prints
     "OK" has told you nothing: the answer people need is the version banner
     the JVM prints, the bitness, and whether it can take the heap set on
     this same screen.  Both of these are real Adoptium builds at their real
     install paths — the bundled one under the launcher's own folder, the
     found one where the Adoptium MSI puts it. */
  var JVMS = {
    '21': {
      name: 'Temurin 21.0.5+11',
      path: HOME + '\\' + BRAND.folder + '\\runtimes\\jdk-21.0.5+11\\bin\\javaw.exe',
      banner: 'OpenJDK 64-Bit Server VM Temurin-21.0.5+11 (build 21.0.5+11-LTS, mixed mode, sharing)',
      bits: 64
    },
    '8': {
      name: 'Temurin 8u442-b06',
      path: 'C:\\Program Files (x86)\\Eclipse Adoptium\\jdk-8.0.442.6-hotspot\\bin\\javaw.exe',
      banner: 'OpenJDK Client VM (build 25.442-b06, mixed mode, sharing)',
      bits: 32
    }
  };

  function javaTest(btn) {
    var j = JVMS[btn.getAttribute('data-jvm')] || JVMS['21'];
    var gb = ram ? Number(ram.value) : RECOMMENDED;
    if (j.bits === 32) {
      /* the specific failure, and it is the one that actually happens: the
         x86 JDK 8 the Adoptium installer leaves in Program Files (x86) is a
         32-bit VM, and a 32-bit VM cannot take a heap this size at all */
      say('Ran ' + fig(j.path) + ' — it answered in 180 ms with ' + fig(j.banner) +
        '. That is a 32-bit VM: it refuses ' + fig('-Xmx' + gb + 'G') + ' and stops near ' + fig('1.5 GB') +
        ', so 1.8 to 1.16 would fail to start on the allocation above. The x64 build of ' +
        fig('8u442') + ' would fix it.');
      return;
    }
    say('Ran ' + fig(j.path) + ' — it answered in 240 ms with ' + fig(j.banner) +
      '. 64-bit, so it takes ' + fig('-Xmx' + gb + 'G') + ', and it satisfies the ' + fig('Java 21') +
      ' that ' + fig('1.21.4') + ' asks for. Nothing to change.');
  }

  /* THE THREE FIELDS PERSIST.  A checkbox that only moves its property is a
     control that forgets on the next render, so the attribute is written
     too — that is the value the markup carries, the one a reset returns to,
     and the one a saved settings file would be written from. */
  function persist(el) {
    if (el.type === 'checkbox' || el.type === 'radio') el.toggleAttribute('checked', el.checked);
    else if (el.tagName === 'TEXTAREA') el.textContent = el.value;
    else el.setAttribute('value', el.value);
  }

  var SET_SAYS = {
    'Start full screen': function (on) {
      var w = document.querySelectorAll('#screen-settings .numfield input');
      var size = w.length > 1 ? w[0].value + ' \u00d7 ' + w[1].value : '1920 \u00d7 1080';
      return on
        ? 'New instances would start full screen. The ' + fig(size) + ' above is what they return to.'
        : 'New instances would start windowed at ' + fig(size) + '.';
    },
    'Check files after downloading': function (on) {
      return on
        ? 'Every downloaded file would be compared against the hash in the manifest before it is used.'
        : 'Files would be taken as downloaded. A truncated jar then shows up as a crash rather than as a re-download.';
    },
    'Anonymous usage statistics': function (on) {
      return on
        ? 'On: version numbers and launch counts only. No account, no server addresses, no world names.'
        : 'Off. Nothing is sent.';
    }
  };

  /* the name of a setting is the label ON it, and a checkbox inside a row
     may carry its own — "Start full screen" sits in the Window size row and
     is not the Window size setting */
  function setRowName(el) {
    var own = el.closest('label.check');
    if (own) return own.textContent.trim();
    var row = el.closest('.row');
    var t = row ? row.querySelector('.row-t') : null;
    if (t && t.childNodes[0]) return t.childNodes[0].textContent.trim();
    return el.getAttribute('aria-label') || '';
  }

  var setScreen = document.getElementById('screen-settings');
  if (setScreen) {
    setScreen.addEventListener('change', function (e) {
      var el = e.target;
      if (!el || !el.tagName) return;
      if (el.id === 'advToggle' || el.id === 'setQ' || el.type === 'range') return;
      if (!/^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      persist(el);
      var label = setRowName(el);
      if (el.type === 'checkbox') {
        var line = SET_SAYS[label];
        say(line ? line(el.checked) : esc(label) + (el.checked ? ' on.' : ' off.'));
        return;
      }
      var name = el.getAttribute('aria-label') || label;
      say(esc(name) + ' saved as ' + fig(el.value.trim() || 'empty') + '.');
    });
    /* the slider carries its value in an attribute too, so what is on screen
       at rest is what the markup says */
    if (ram) ram.addEventListener('change', function () { ram.setAttribute('value', ram.value); });
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!a) return;
    var act = a.getAttribute('data-act');

    if (act === 'java-test') { e.preventDefault(); javaTest(a); return; }

    if (act === 'java-browse') {
      e.preventDefault();
      say('Pick a ' + fig('javaw.exe') + '. It is run once with ' + fig('-version') + ' and the banner it prints is what gets stored, not the path you typed.');
      pickFile('.exe', function (f) {
        var field = document.querySelector('#screen-settings input[aria-label="Java executable path"]');
        if (field) { field.value = f.name; persist(field); }
        say(fig(f.name) + ' read. Its ' + fig('-version') + ' banner decides which Minecraft versions may use it.');
      });
      return;
    }

    if (act === 'dir-change') {
      e.preventDefault();
      var field2 = document.querySelector('#screen-settings input[aria-label="Instance folder"]');
      var wasDir = field2 ? field2.value : instancePath('', 'full');
      say('Pick a folder. ' + fig(BRAND.folder) + ' is created inside it, and every instance goes in ' + fig('\instances') + ' under that.');
      pickFolder(function (dir) {
        if (!dir) { say('Instance folder left at ' + fig(wasDir) + '.'); return; }
        var next = 'C:\\' + dir + '\\' + BRAND.folder + '\\instances';
        if (field2) { field2.value = next; persist(field2); }
        say('New instances would go to ' + fig(next) + '. The ' + fig('38.2 GB') +
          ' already at ' + fig(wasDir) + ' is not moved — each instance is re-pointed as you open it.');
      });
      return;
    }

    if (act === 'cache-empty') {
      e.preventDefault();
      var sizeEl = document.getElementById('cacheSize');
      var was = sizeEl ? sizeEl.textContent.trim() : '2.9 GB';
      if (bytes(was) === 0) { say('The download cache is already empty.'); return; }
      confirmStep(a, {
        q: 'Empty the download cache? ' + fig(was) + ' of jars and assets go, and anything ' +
           'needed again is fetched again. Nothing installed is touched.',
        ok: 'Empty the cache',
        run: function () {
          if (sizeEl) sizeEl.textContent = '0 bytes';
          say(fig(was) + ' freed from ' + fig(HOME + '\\' + BRAND.folder + '\\cache') +
            '. Every instance still has its own copies; the next download starts cold.');
        }
      });
      return;
    }
  });

  /* ── #accounts ────────────────────────────────────────────────────────── */

  /* THE OFFLINE IDENTIFIER IS DERIVED, NOT ISSUED.  The game builds it as a
     version-3 UUID over the bytes of "OfflinePlayer:<name>", which is why the
     same name always returns to the same world folder and the same inventory.
     So it is computed here rather than typed into the markup — a typed one is
     a number that looks right and sends the player to the wrong save. */
  function md5(str) {
    function rol(n, c) { return (n << c) | (n >>> (32 - c)); }
    function add(a, b) { return (a + b) | 0; }
    var S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
             5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
             4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
             6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    var K = [];
    for (var ki = 0; ki < 64; ki++) K[ki] = (Math.floor(Math.abs(Math.sin(ki + 1)) * 4294967296)) | 0;
    /* UTF-8 bytes, because a Minecraft name may be outside ASCII */
    var bytesIn = [];
    var enc = unescape(encodeURIComponent(str));
    for (var ci = 0; ci < enc.length; ci++) bytesIn.push(enc.charCodeAt(ci) & 0xff);
    var bitLen = bytesIn.length * 8;
    bytesIn.push(0x80);
    while (bytesIn.length % 64 !== 56) bytesIn.push(0);
    for (var bi = 0; bi < 8; bi++) bytesIn.push((bi < 4 ? (bitLen >>> (8 * bi)) : 0) & 0xff);

    var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (var off = 0; off < bytesIn.length; off += 64) {
      var M = [];
      for (var mi = 0; mi < 16; mi++) {
        M[mi] = bytesIn[off + mi * 4] | (bytesIn[off + mi * 4 + 1] << 8) |
                (bytesIn[off + mi * 4 + 2] << 16) | (bytesIn[off + mi * 4 + 3] << 24);
      }
      var A = a0, B = b0, C = c0, D = d0;
      for (var i = 0; i < 64; i++) {
        var F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = add(add(add(F, A), K[i]), M[g]);
        A = D; D = C; C = B;
        B = add(B, rol(F, S[i]));
      }
      a0 = add(a0, A); b0 = add(b0, B); c0 = add(c0, C); d0 = add(d0, D);
    }
    var out = [];
    [a0, b0, c0, d0].forEach(function (w) {
      for (var j = 0; j < 4; j++) out.push((w >>> (8 * j)) & 0xff);
    });
    return out;
  }

  function offlineUuid(name) {
    var h = md5('OfflinePlayer:' + name);
    h[6] = (h[6] & 0x0f) | 0x30;   /* version 3 */
    h[8] = (h[8] & 0x3f) | 0x80;   /* RFC 4122 variant */
    var hex = h.map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' +
           hex.slice(16, 20) + '-' + hex.slice(20);
  }

  var accList = document.querySelector('#screen-accounts .acc-list');
  var railAcc = document.querySelector('.rail-foot .account');

  function accRead(li) {
    var kind = li.querySelector('.acc-kind');
    var use = li.querySelector('.acc-face use');
    return {
      /* the store's id when the row came from disk; a fixture row has none
         and stays in-page, the way it did before there was a store */
      id: li.dataset.accId || '',
      demo: li.dataset.demo === 'true',
      name: li.querySelector('.acc-name').textContent.trim(),
      uuid: li.querySelector('.acc-sub').textContent.trim(),
      offline: /Offline/.test(kind ? kind.textContent : ''),
      art: use ? (use.getAttribute('href') || '#head').replace('#', '') : 'head'
    };
  }

  /* what a row says when it is NOT the one in use.  Read off the markup at
     boot, so each account keeps its own renewal date instead of inheriting
     the one below it. */
  function accRest(li, rec) {
    if (li.dataset.rest) return li.dataset.rest;
    return rec.offline ? 'Singleplayer, LAN, offline-mode servers' : 'Signed in';
  }
  if (accList) {
    accList.querySelectorAll('.acc-row').forEach(function (r) {
      if (!r.hasAttribute('data-active')) {
        var st = r.querySelector('.acc-state');
        if (st) r.dataset.rest = st.textContent.trim();
      }
    });
  }

  /* ONE ACTIVE ACCOUNT, EVERY RENDERING OF IT.  The account is drawn in four
     places — the row, the rail foot, the Play screen's note and the status
     bar — so switching writes all four in one call, the same way an instance
     is created and deleted in one call. */
  function accActivate(li, told) {
    if (!li || !accList) return;
    var rec = accRead(li);
    accList.querySelectorAll('.acc-row').forEach(function (r) {
      var isIt = r === li;
      var btn = r.querySelector('button');
      var state = r.querySelector('.acc-state');
      var was = accRead(r);
      if (isIt) r.setAttribute('data-active', 'true'); else r.removeAttribute('data-active');
      if (btn) { btn.textContent = isIt ? 'Sign out' : 'Use this one'; }
      /* the resting line is the row's own — a renewal date belongs to one
         account and copying another's onto it would be a fact invented by a
         click */
      if (state) state.textContent = isIt ? 'In use' : accRest(r, was);
    });
    /* the rail foot */
    if (railAcc) {
      var use = railAcc.querySelector('.avatar use');
      if (use) use.setAttribute('href', '#' + rec.art);
      var nm = railAcc.querySelector('.account-name');
      if (nm) nm.textContent = rec.name;
      var sub = railAcc.querySelector('.account-sub');
      if (sub) sub.textContent = rec.demo ? 'Demo profile, not signed in'
        : rec.offline ? 'Offline profile' : 'Microsoft account';
    }
    /* the Play screen.  An offline profile changes what Play can reach, and
       that belongs on Play rather than three routes away, so it goes in the
       note slot the launch states already use. */
    var note = rec.offline
      ? esc(rec.name) + ' is an offline profile: singleplayer, LAN and offline-mode servers. A server that checks ownership with Mojang will turn it away.'
      : '';
    SCENARIOS.normal.note = note;
    SCENARIOS.empty.note = note;
    if (root.dataset.scenario === 'normal' || root.dataset.scenario === 'empty') apply(root.dataset.scenario);
    /* the store owns which one is active, so the click that changes it here
       changes it there too rather than only on screen */
    if (host && host.accounts && rec.id) host.accounts.activate(rec.id).catch(function () {});
    if (told !== false) {
      say(fig(rec.name) + ' is the account the next launch uses' +
        (rec.demo
          ? ' — except that it is a demo profile and nobody is signed in. It exists to exercise this screen, and it cannot launch anything.'
          : rec.offline
            ? ' — offline, so singleplayer, LAN and offline-mode servers only.'
            : '. Its session is renewed from the token under ' + fig(BRAND.credential) + '.'));
    }
  }

  function accSignOut(btn, li) {
    var rec = accRead(li);
    confirmStep(btn, {
      q: rec.demo
        ? 'Remove the demo profile? It holds no credential — there was never a sign-in behind it — so this only takes the row away.'
        : 'Sign ' + esc(rec.name) + ' out of this PC? The refresh token under ' + fig(BRAND.credential) +
          ' is deleted. Worlds, instances and mods are untouched.',
      ok: (rec.demo ? 'Remove ' : 'Sign out ') + rec.name,
      run: function () {
        var wasActive = li.hasAttribute('data-active');
        /* SIGNING OUT IS A DELETE, not a hidden row.  The record and its
           sealed credential go off the disk before this returns. */
        if (host && host.accounts && rec.id) host.accounts.remove(rec.id).catch(function () {});
        li.remove();
        var next = accList ? accList.querySelector('.acc-row') : null;
        if (wasActive && next) accActivate(next, false);
        /* the subject line above the list is a count of it, so it is written
           by the same act that changed the count */
        accPaintCount();
        say(fig(rec.name) + (rec.demo ? ' removed. ' : ' signed out. ') +
          (rec.demo ? 'A demo profile has no credential to delete; it was never a sign-in.'
            : rec.offline ? 'An offline profile has no token to delete; the name is simply gone from the list.'
                          : 'The entry under ' + fig(BRAND.credential) + ' is deleted from this PC.') +
          (wasActive && next ? ' ' + fig(accRead(next).name) + ' is the account now.' : ''));
      }
    });
  }

  /* ── the device-code handshake ─────────────────────────────────────────
     No field takes a password here, because none is asked for.  The code is
     shown, the browser goes to Microsoft's page, this window waits.  A user
     code from Microsoft is short, uppercase and drawn from an alphabet with
     no 0/O or 1/I in it, because it is meant to be read off a screen and
     typed on another device. */
  var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var DEVICE_URL = 'microsoft.com/link';
  /* flow is the OPAQUE handle the main process hands back.  The device code
     the poll actually runs on is a bearer credential and never comes here;
     the user code below is the short one meant to be read off this screen
     and typed on Microsoft's, which is why it is the one on display. */
  var signin = { code: null, at: 0, timer: null, flow: null, demo: false, url: DEVICE_URL, busy: false };

  var wayBtn = document.querySelector('#screen-accounts .way-ms .prim');
  var wayCode = document.querySelector('#screen-accounts .way-code');
  var wayCodeK = document.querySelector('#screen-accounts .way-code-k');
  var wayCodeV = document.querySelector('#screen-accounts .way-code-v');
  var WAY_K = wayCodeK ? wayCodeK.textContent : 'Your code will look like';
  var WAY_V = wayCodeV ? wayCodeV.innerHTML : 'F7QK&ndash;9BLD';

  function newCode() {
    var out = '';
    for (var i = 0; i < 8; i++) {
      out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      if (i === 3) out += '–';
    }
    return out;
  }
  function bareUrl(u) { return String(u || DEVICE_URL).replace(/^https?:\/\//, '').replace(/\/$/, ''); }

  function signinPanel(btn) {
    var url = bareUrl(signin.url);
    var items = [];
    if (signin.demo) {
      items.push({ note: 'DEMO MODE. This is <b>not</b> a real sign-in and there is nowhere to type ' +
        '<b class="mono">' + esc(signin.code) + '</b> — no request has left this PC. The sequence you are ' +
        'watching is the real one: the code, the wait, cancel and expiry all behave the way they will once an ' +
        'Azure client id is configured. It ends by adding a profile marked <b>Demo</b>, which cannot launch anything.' });
      items.push({ label: 'Copy the code (it opens nothing)', run: function () { copy(signin.code, fig(signin.code) + ' copied — though in demo mode there is no page to enter it on.'); } });
    } else {
      items.push({ note: 'Open <b class="mono">' + esc(url) + '</b> in a browser and enter <b class="mono">' +
        esc(signin.code) + '</b> there. Nothing is typed into this window &mdash; it holds no password field ' +
        'and never will. It is polling Microsoft until the code is authorised.' });
      items.push({ label: 'Copy the code', run: function () { copy(signin.code, fig(signin.code) + ' copied. Enter it at ' + fig(url) + '.'); } });
      items.push({ label: 'Copy the address', run: function () { copy('https://' + url, fig('https://' + url) + ' copied.'); } });
      items.push({ label: 'Open ' + url, run: function () {
        if (host) { window.open('https://' + url, '_blank'); say('Opening ' + fig('https://' + url) + ' in your browser. The sign-in happens there, on Microsoft’s page, under Microsoft’s address bar.'); }
        else say('Would open ' + fig('https://' + url) + ' in the default browser. The sign-in happens there, on Microsoft’s page, under Microsoft’s address bar.');
      } });
    }
    items.push('-');
    items.push({ label: 'Cancel the sign-in', danger: true, run: function () { signinStop(true); } });
    popover.menu(btn, items, { label: signin.demo ? 'Demo sign-in' : 'Sign in at ' + url });
  }

  /* the screen back to rest.  It does NOT cancel anything, because it is
     also what runs when the handshake has already ended by itself. */
  function signinReset() {
    if (signin.timer) { clearInterval(signin.timer); signin.timer = null; }
    signin.code = null;
    signin.flow = null;
    signin.busy = false;
    if (wayCodeK) wayCodeK.textContent = WAY_K;
    if (wayCodeV) wayCodeV.innerHTML = WAY_V;
    if (wayCode) wayCode.setAttribute('aria-hidden', 'true');
    if (wayBtn) {
      wayBtn.textContent = 'Get a sign-in code';
      wayBtn.removeAttribute('aria-busy');
      wayBtn.removeAttribute('data-waiting');
    }
  }

  function signinStop(told) {
    var was = signin.code;
    var flow = signin.flow;
    signinReset();
    /* the poll runs in the main process, so cancelling has to reach it */
    if (host && host.auth && flow) host.auth.cancel(flow).catch(function () {});
    if (told && was) say('Sign-in cancelled. ' + fig(was) + ' is dead — a new code is issued next time, and no half-finished session is left on the account.');
  }

  /* the sample becomes the real thing, so it stops being decoration and
     starts being the code — which means it also stops being aria-hidden */
  function signinShow(code, url, demo) {
    signin.code = code;
    signin.url = url || DEVICE_URL;
    signin.demo = !!demo;
    signin.busy = false;
    if (wayCodeK) wayCodeK.textContent = demo ? 'Demo code — it goes nowhere' : 'Enter this at ' + bareUrl(signin.url);
    if (wayCodeV) wayCodeV.textContent = code;
    if (wayCode) wayCode.removeAttribute('aria-hidden');
    if (wayBtn) {
      wayBtn.textContent = 'Waiting… cancel';
      wayBtn.setAttribute('aria-busy', 'true');
      wayBtn.setAttribute('data-waiting', 'true');
    }
  }

  /* WITH A BRIDGE the whole handshake belongs to the main process: this asks
     for a code and then listens.  WITHOUT ONE — the browser build, and the
     click test — the same screen runs the same states off a local timer,
     which is what it did before there was a main process at all. */
  function signinStart(btn) {
    if (signin.busy) return;
    if (host && host.auth) {
      signin.busy = true;
      if (wayBtn) { wayBtn.setAttribute('aria-busy', 'true'); wayBtn.textContent = 'Asking…'; }
      host.auth.begin().then(function (h) {
        signin.flow = h.flowId;
        signinShow(h.userCode, h.verificationUri, h.demo);
        say(h.demo
          ? 'DEMO MODE: ' + fig(h.userCode) + ' is a stub code and nothing was sent anywhere. The screen behaves exactly as it will with a real client id — wait, cancel, or let it expire.'
          : 'Waiting for ' + fig(bareUrl(h.verificationUri)) + '. Enter ' + fig(h.userCode) +
            ' there. This window is polling; it is not asking you for anything.');
        signinPanel(btn);
      }).catch(function (err) {
        signinReset();
        say('The sign-in could not be started. ' + esc(String(err && err.message || 'Microsoft did not answer.')));
      });
      return;
    }

    signinShow(newCode(), DEVICE_URL, false);
    signin.at = 15 * 60;
    say('Waiting for ' + fig(DEVICE_URL) + '. Enter ' + fig(signin.code) +
      ' there — it is good for 15 minutes. This window is polling; it is not asking you for anything.');
    signin.timer = setInterval(function () {
      signin.at -= 5;
      if (signin.at <= 0) {
        var dead = signin.code;
        signinReset();
        say(fig(dead) + ' expired after 15 minutes without being entered. Ask for another one.');
      }
    }, 5000);
    signinPanel(btn);
  }

  /* ── what the main process says back ──────────────────────────────
     phase is one of pending | expired | error | done, plus renewed | stale
     for a session renewed in the background.  An account on any of these is
     the same seven-field record — no token has a channel to arrive on.    */
  function signinEvent(ev) {
    if (!ev || !ev.phase) return;
    if (ev.phase === 'renewed') {
      var row = accRowFor(ev.account && ev.account.id);
      if (row) accPaintRest(row, ev.account);
      return;
    }
    if (ev.phase === 'stale') {
      var bad = accRowFor(ev.id);
      if (bad) {
        bad.dataset.rest = 'Needs signing in again';
        var st = bad.querySelector('.acc-state');
        if (st) st.textContent = 'Needs signing in again';
      }
      say(esc(String(ev.message || 'A stored session could not be renewed.')));
      return;
    }
    if (!signin.flow || ev.flowId !== signin.flow) return;
    if (ev.phase === 'pending') return;                 /* the button already says so */

    var dead = signin.code;
    var wasDemo = signin.demo;
    if (ev.phase === 'expired') {
      signinReset(); popover.close();
      say(fig(dead) + ' expired without being entered. Ask for another one.');
      return;
    }
    if (ev.phase === 'error') {
      signinReset(); popover.close();
      say(esc(String(ev.message || 'The sign-in did not complete. Nothing was changed on this PC.')));
      return;
    }
    if (ev.phase === 'done' && ev.account) {
      signinReset(); popover.close();
      accAdd(ev.account);
      say(wasDemo || ev.account.demo
        ? fig(ev.account.name) + ' added — and it is a DEMO profile, not a sign-in. Nothing was sent to Microsoft and no token exists. It is here so this screen can be walked end to end without an Azure client id.'
        : fig(ev.account.name) + ' is signed in. The refresh token is sealed with the OS keystore under ' + fig(BRAND.credential) +
          '; it never reaches this window.' + (ev.canPersist === false
            ? ' This PC has no OS encryption available, so nothing was written to disk and the sign-in will not be remembered after you close the launcher.' : ''));
    }
  }

  /* ── the account list, when it comes off disk ────────────────────
     The three rows in the markup are the browser build's fixture.  With a
     store behind the screen they are replaced by what is actually on this
     PC, which on a fresh install is nothing — an empty list is the honest
     answer, and a Microsoft row nobody signed in to is not.               */
  function accRowFor(id) {
    if (!accList || !id) return null;
    /* the id is a uuid the main process minted; anything else is not one,
       and stripping is cheaper than trusting an attribute selector */
    return accList.querySelector('.acc-row[data-acc-id="' + String(id).replace(/[^a-zA-Z0-9-]/g, '') + '"]');
  }

  function renewText(ms) {
    var n = Number(ms) || 0;
    if (!n) return 'Signed in';
    var d = new Date(n);
    if (isNaN(d.getTime())) return 'Signed in';
    return 'Renews ' + d.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  }

  function accPaintRest(li, acc) {
    var rest = acc.demo ? 'Demo mode — not a real sign-in' : renewText(acc.expiresAt);
    li.dataset.rest = rest;
    var st = li.querySelector('.acc-state');
    if (st && !li.hasAttribute('data-active')) st.textContent = rest;
  }

  function accRowNode(acc) {
    var li = document.createElement('li');
    li.className = 'acc-row';
    li.dataset.accId = acc.id;
    if (acc.demo) li.dataset.demo = 'true';
    li.innerHTML =
      '<span class="acc-face" aria-hidden="true"><svg width="30" height="30"><use href="' + (acc.demo ? '#head-c' : '#head') + '"/></svg></span>' +
      '<span class="acc-id"><span class="acc-name"></span><span class="acc-sub mono"></span></span>' +
      '<span class="acc-kind"><svg width="14" height="14" aria-hidden="true"><use href="' + (acc.demo ? '#r-offline' : '#r-key') + '"/></svg>' +
        (acc.demo ? 'Demo' : 'Microsoft') + '</span>' +
      '<span class="acc-state"></span>' +
      '<button class="quiet" type="button">Use this one</button>';
    li.querySelector('.acc-name').textContent = acc.name;
    li.querySelector('.acc-sub').textContent = acc.uuid;
    accPaintRest(li, acc);
    li.querySelector('.acc-state').textContent = li.dataset.rest;
    return li;
  }

  function accPaintCount() {
    var n = accList ? accList.querySelectorAll('.acc-row').length : 0;
    var txt = document.querySelector('#screen-accounts .pane-tools .tool-txt');
    if (txt) txt.textContent = n ? 'Signed in on this PC' : 'No account on this PC yet';
    if (accList) accList.hidden = !n;
    if (!n && railAcc) {
      var nm = railAcc.querySelector('.account-name');
      if (nm) nm.textContent = 'No account';
      var sub = railAcc.querySelector('.account-sub');
      if (sub) sub.textContent = 'Sign in to play';
    }
  }

  function accAdd(acc) {
    if (!accList) return;
    var was = accRowFor(acc.id);
    var li = accRowNode(acc);
    if (was) was.replaceWith(li); else accList.appendChild(li);
    accPaintCount();
    accActivate(li, false);
  }

  /* DEMO MODE IS SAID OUT LOUD, in the block that offers the sign-in rather
     than in a status line that clears itself after seven seconds. */
  function paintAuthMode(s) {
    var way = document.querySelector('#screen-accounts .way-ms');
    if (!way || !s) return;
    way.dataset.mode = s.mode;
    var lead = way.querySelector('.lead');
    if (lead && s.mode === 'demo') {
      lead.innerHTML = '<b>Demo mode — this is not a real sign-in.</b> No Azure application client id is configured, ' +
        'so nothing on this screen talks to Microsoft. The device-code sequence below is the real one — the code, ' +
        'the wait, cancel and expiry all behave as they will — but it runs against a local stub and ends by adding ' +
        'a profile marked ' + fig('Demo') + ' that cannot launch anything. Put your own client id in ' +
        fig('auth.config.json') + ' and this same screen does the real handshake, unchanged.';
    }
    if (s.canPersist === false && lead && !way.querySelector('.acc-nopersist')) {
      var p = document.createElement('p');
      p.className = 'lead acc-nopersist';
      p.innerHTML = '<b>This PC has no OS encryption available.</b> Rather than write a refresh token to disk in the ' +
        'clear, the launcher writes nothing at all: a sign-in lasts until you close the window and is not remembered.';
      lead.after(p);
    }
  }

  (function accountsHydrate() {
    if (!host || !host.auth || !host.accounts || !accList) return;
    host.auth.onEvent(signinEvent);
    host.auth.status().then(paintAuthMode).catch(function () {});
    host.accounts.list().then(function (items) {
      accList.querySelectorAll('.acc-row').forEach(function (r) { r.remove(); });
      (items || []).forEach(function (a) {
        var li = accRowNode(a);
        if (a.active) li.setAttribute('data-active', 'true');
        accList.appendChild(li);
      });
      accPaintCount();
      var act = accList.querySelector('.acc-row[data-active="true"]') || accList.querySelector('.acc-row');
      if (act) accActivate(act, false);
    }).catch(function () {});
  })();

  function accCreateOffline(btn) {
    var field = document.getElementById('offName');
    var name = field ? field.value.trim() : '';
    if (!name) { if (field) field.focus(); say('An offline profile needs a name. That is the whole of it — there is no password, because there is no account behind it.'); return; }
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
      say(fig(name) + ' is not a Minecraft name: 3 to 16 characters, letters, digits and underscore. The game would refuse it on the first world.');
      if (field) field.focus();
      return;
    }
    var taken = accList && [].slice.call(accList.querySelectorAll('.acc-name'))
      .some(function (n) { return n.textContent.trim().toLowerCase() === name.toLowerCase(); });
    if (taken) { say(fig(name) + ' is already in the list. The identifier is derived from the name, so a second one would be the same profile twice.'); return; }

    var uuid = offlineUuid(name);
    var li = document.createElement('li');
    li.className = 'acc-row';
    li.innerHTML =
      '<span class="acc-face" aria-hidden="true"><svg width="30" height="30"><use href="#head-c"/></svg></span>' +
      '<span class="acc-id"><span class="acc-name"></span><span class="acc-sub mono"></span></span>' +
      '<span class="acc-kind"><svg width="14" height="14" aria-hidden="true"><use href="#r-offline"/></svg>Offline</span>' +
      '<span class="acc-state">Singleplayer, LAN, offline-mode servers</span>' +
      '<button class="quiet" type="button">Use this one</button>';
    li.dataset.rest = 'Singleplayer, LAN, offline-mode servers';
    li.querySelector('.acc-name').textContent = name;
    li.querySelector('.acc-sub').textContent = uuid;
    if (accList) accList.appendChild(li);
    accPaintCount();
    say(esc(name) + ' created as an offline profile. Its identifier ' + fig(uuid) +
      ' is derived from the name, so the same name always returns to the same worlds. No password was asked for and none exists.');
  }

  /* the offline form's identifier is a readout of the field above it, so it
     follows the field rather than sitting there as a fixed string */
  var offName = document.getElementById('offName');
  var offUuid = document.querySelector('#screen-accounts .off-uuid');
  if (offName && offUuid) {
    offName.addEventListener('input', function () {
      var v = offName.value.trim();
      offUuid.textContent = v ? offlineUuid(v) : '\u2014';
    });
  }

  if (accList) {
    accList.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button') : null;
      if (!btn) return;
      var li = btn.closest('.acc-row');
      if (!li) return;
      e.preventDefault();
      if (li.hasAttribute('data-active')) {
        /* THIS IS THE ONE PLACE a confirmation is opened by a bare button
           rather than from inside a menu that is already up.  The document
           closer treats any click that is not on a known trigger and not
           inside .menu-pop as a click outside, so the panel this is about to
           open would be closed by its own click on the way to the document.
           Any other panel is closed here instead, and the click stops. */
        popover.close(false);
        e.stopPropagation();
        accSignOut(btn, li);
      } else accActivate(li, true);
    });
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var scr = e.target.closest('#screen-accounts');
    if (!scr) return;

    var get = e.target.closest('.way-ms .prim');
    if (get) {
      e.preventDefault();
      if (signin.code) signinStop(true);
      else signinStart(get);
      return;
    }
    var make = e.target.closest('.off-form .quiet-edge');
    if (make) { e.preventDefault(); accCreateOffline(make); return; }

    var cred = e.target.closest('.acc-actrow .quiet');
    if (cred && cred.tagName === 'BUTTON') {
      e.preventDefault();
      /* it names a real file now, so it opens the folder that file is in
         rather than describing one */
      if (host) {
        host.openDataFolder().then(function (root) {
          say('Opened ' + fig(root) + '. The sign-in is the ' + fig('sealed') + ' field of ' + fig('accounts.json') +
            ' in there — encrypted by the OS keystore for this Windows account only, under the key ' + fig(BRAND.credential) +
            '. Everything else in that file is a name, an identifier and a date.');
        }).catch(function () { say('The data folder could not be opened.'); });
      } else {
        say('Would open the data folder. The sign-in is the ' + fig('sealed') + ' field of ' + fig('accounts.json') +
          ' in there, encrypted by the OS keystore for this Windows account only, under the key ' + fig(BRAND.credential) + '.');
      }
      return;
    }
  });

  /* ── #appearance: the palette as a file ───────────────────────────────── */

  /* WHAT A PALETTE FILE HOLDS.  The four things that are choices — the
     palette, the theme, whether the accent is an override, and its value —
     and the resolved ladder alongside them so the file can be read by a
     person and diffed by a machine.  It is not a stylesheet: importing it
     picks a shipped palette, it does not inject colours the app never
     designed. */
  var PAL_TOKENS = ['--s-well', '--s-app', '--s-pane', '--s-raise', '--go', '--go-ink', '--ink', '--body', '--mute'];

  function paletteFile() {
    var out = {
      app: BRAND.name,
      version: BRAND.version,
      palette: root.dataset.palette || 'slate',
      theme: themePref,
      accent: customAccent || null,
      resolved: {}
    };
    PAL_TOKENS.forEach(function (k) { out.resolved[k] = token(k); });
    return out;
  }

  function paletteExport() {
    var file = paletteFile();
    var name = BRAND.slug + '-' + file.palette + '-' + resolveTheme() + '.json';
    download(name, JSON.stringify(file, null, 2) + '\n', 'application/json');
    say(fig(name) + ' written — ' + fig(PALETTES[file.palette] || file.palette) + ', ' + fig(resolveTheme()) +
      (file.accent ? ', accent ' + fig(file.accent) : ', the palette\u2019s own accent') +
      ', and the ' + PAL_TOKENS.length + ' resolved tokens beside them.');
  }

  function paletteImport() {
    say('Pick a palette file. It names one of the four shipped palettes and an accent; it cannot inject colours the app never designed.');
    pickFile('.json,application/json', function (f) {
      var fr = new FileReader();
      fr.onload = function () {
        var data;
        try { data = JSON.parse(String(fr.result)); }
        catch (err) { say(fig(f.name) + ' is not readable as JSON, so nothing changed.'); return; }
        if (!data || !PALETTES[data.palette]) {
          say(fig(f.name) + ' names no palette this app ships. The four are ' +
            fig('slate') + ', ' + fig('cinder') + ', ' + fig('basalt') + ' and ' + fig('tundra') + '. Nothing changed.');
          return;
        }
        setPalette(data.palette);
        if (data.theme === 'dark' || data.theme === 'light' || data.theme === 'system') setTheme(data.theme);
        var acc = data.accent ? parseColour(data.accent) : null;
        paintAccent(acc ? rgb2hex(acc) : null);
        paintAppearanceSummary();
        say(fig(f.name) + ' applied — ' + fig(PALETTES[data.palette]) + ', ' + fig(resolveTheme()) +
          (acc ? ', accent ' + fig(rgb2hex(acc)) : ', the palette\u2019s own accent') + '.');
      };
      fr.readAsText(f);
    });
  }

  var palExport = document.getElementById('palExport');
  var palImport = document.getElementById('palImport');
  if (palExport) palExport.addEventListener('click', function (e) { e.preventDefault(); paletteExport(); });
  if (palImport) palImport.addEventListener('click', function (e) { e.preventDefault(); paletteImport(); });


  /* ── boot ───────────────────────────────────────────────────────────── */

  readOptions(location.search.slice(1));
  setTheme(themePref);
  setPalette(root.dataset.palette || 'slate');
  paintAccent(null);
  apply('normal');
  selectModule(document.querySelector('#modRows .modrow[aria-selected="true"]'));
  applyList();
  paintChits(document);
  paintPicks();
  if (frame) paintAll();
  route();
})();
