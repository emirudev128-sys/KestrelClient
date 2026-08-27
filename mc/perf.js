'use strict';
/* ============================================================================
   THE PERFORMANCE SET — WHAT A NEW INSTANCE GETS SO THE FRAMERATE CLAIM IS TRUE.

   Kestrel wants to say it gives you more frames. This is the honest way to
   mean it: install the mods that actually do it, from the same host, over the
   same hash-checked path as every other mod, and say so in the log.

   ── THE CLAIM IS NOT OURS, AND THAT IS THE POINT ──────────────────────────
   Nothing in here is written by this project. Every client that advertises a
   framerate boost on modern Minecraft is, underneath, shipping a rendering
   engine somebody else wrote and open-sourced; the honest version of that is
   to install it by name, at a pinned project id, and let the user see and
   remove it like any other mod. The dishonest version is to bundle it,
   rename the setting and call the result proprietary.

   ── WHY A TABLE AND NOT A SEARCH ──────────────────────────────────────────
   Written out exactly as mc/deps.js writes out its own: a project id, a
   title, and the reason it is here. A search for "sodium" is a search that
   can return somebody else's upload with the same name on a day the API is
   ranking differently. These four ids were read off the Modrinth API and
   checked against the loaders each project actually publishes for.

   ── AND WHY IT DEGRADES INSTEAD OF FAILING ────────────────────────────────
   Sodium does not exist for Forge, and nothing here exists for 1.8.9 at all.
   That is not an error to report, it is the ordinary case for a launcher with
   a library full of old instances: content.pickVersion throws NO_BUILD when
   the pair does not exist, this catches it, logs the miss and carries on. An
   instance that can take two of the four gets two of the four.

   ── WHAT IT MUST NEVER DO ─────────────────────────────────────────────────
   TOUCH AN INSTANCE SOMEBODY ALREADY HAS. This runs once, on the first launch
   of an instance that was created with the flag set, and the flag is absent
   on every instance that existed before this file did. A launcher that
   quietly added four mods to a curated modpack, or to the 1.8.9 PvP setup
   somebody has spent a year tuning, would be a launcher nobody trusts with a
   mods folder again. Modpack imports are excluded for the same reason: a pack
   states its own mod list, and this is not invited to edit it.
   ========================================================================= */

/* THE FOUR, AND WHY EACH ONE. Ordered by how much of the promise they carry:
   the renderer first, then the things that stop the renderer being starved.

   Verified against api.modrinth.com — id, title and published loaders — on
   27 August 2026. Add to this deliberately, never by search, and re-check the
   id when you do. */
const SET = [
  {
    project: 'AANobbMI', title: 'Sodium', slug: 'sodium',
    /* the renderer replacement, and effectively the whole of the claim on
       modern versions: region-batched chunk draws, graph-based occlusion
       culling off the main thread, asynchronous mesh building */
    why: 'the rendering engine — this is the part that is actually worth frames'
  },
  {
    project: 'gvQqBUqZ', title: 'Lithium', slug: 'lithium',
    /* no rendering surface at all, so nothing it does can look different */
    why: 'game logic and ticking, with no effect on how anything looks'
  },
  {
    project: 'uXXizFIs', title: 'FerriteCore', slug: 'ferrite-core',
    why: 'memory — less heap used is less time spent collecting it'
  },
  {
    project: 'NNAgCjsB', title: 'Entity Culling', slug: 'entityculling',
    why: 'stops entities behind walls being drawn at all'
  }
];

/* the flag on an instance record. 'pending' is the only value that does
   anything; absent means an instance that predates this and is left alone. */
const PENDING = 'pending';
const DONE = 'done';
const OFF = 'off';

/* Loaders whose mods this set can be resolved against. A resource-pack-only
   or vanilla instance has no mods folder worth writing to, and asking
   Modrinth for a "vanilla build of Sodium" is asking a question with no
   answer. */
function canApply(loader) {
  const l = String(loader || '').toLowerCase().trim().split(/\s+/)[0];
  return l === 'fabric' || l === 'quilt' || l === 'neoforge' || l === 'forge';
}

/**
 * Installs whatever of the set exists for this instance's loader and version.
 *
 * Takes the Game rather than importing ContentStore, because planning an
 * install is Game's job: it is the thing that holds the store, the reporter
 * and the content path, and a second route into that path is a second place
 * for the host allow-list and the hash check to be got wrong.
 *
 * Never throws. The caller is a launch, and a launch that fails because a
 * convenience could not reach Modrinth is a worse launcher than one without
 * the convenience.
 */
async function fill(game, instanceId, inst, report) {
  const loader = String(inst && inst.loader || '');
  const out = { installed: [], skipped: [], failed: [] };

  if (!canApply(loader)) {
    game.log('perf: ' + (loader || 'no loader') + ' has no performance set to install');
    return out;
  }

  /* WHAT IS ALREADY THERE IS NOT REPLACED. Somebody who removed Sodium on
     purpose, or pinned an older build, gets to keep that decision — this only
     ever adds what is absent. */
  let have = [];
  try {
    have = await game.content.list(instanceId, 'mod');
  } catch (e) {
    have = [];
  }

  /* EVERY IDENTIFIER EACH INSTALLED MOD HAS, not the first truthy one. The
     first version of this took `project || title || file`, which reads as
     "any of these" and means "only the first that is set" — so a mod
     installed through Kestrel matched on its project id and a jar somebody
     dropped in by hand, which has no project id, was compared on a title
     prettified out of its filename and never matched. The result would have
     been a second Sodium next to the one already there.

     The filename goes in too, lower-cased, because a hand-dropped
     `sodium-fabric-0.6.13.jar` carries the name in nothing else. */
  const present = new Set();
  for (const m of have) {
    for (const v of [m && m.project, m && m.slug, m && m.title, m && m.name, m && m.file]) {
      const s = String(v || '').toLowerCase().trim();
      if (s) present.add(s);
    }
  }
  const already = function (mod) {
    if (present.has(String(mod.project).toLowerCase())) return true;
    if (present.has(String(mod.slug).toLowerCase())) return true;
    if (present.has(String(mod.title).toLowerCase())) return true;
    /* a filename that starts with the slug — `sodium-fabric-0.6.13.jar` */
    const slug = String(mod.slug).toLowerCase();
    for (const s of present) if (s.indexOf(slug) === 0) return true;
    return false;
  };

  for (const m of SET) {
    if (already(m)) {
      out.skipped.push({ title: m.title, why: 'already installed' });
      game.log('perf: ' + m.title + ' is already there — left alone');
      continue;
    }
    try {
      if (typeof report === 'function') {
        report({ phase: 'preparing', done: 0, total: 0, bytes: 0, totalBytes: 0, file: 'installing ' + m.title });
      }
      const plan = await game.contentPlan(instanceId, m.project, 'mod');
      const r = await game.contentInstall(instanceId, plan.id);
      const names = (r.installed || []).map(function (d) { return d.filename; });
      out.installed.push({ title: m.title, files: names });
      game.log('perf: installed ' + m.title + ' — ' + names.join(', ') + '  (' + m.why + ')');
    } catch (e) {
      /* NO_BUILD IS THE ORDINARY CASE, not a failure: Sodium has no Forge
         build and nothing here has an 1.8.9 one. Everything else is a real
         failure and says so, and neither stops the next mod being tried. */
      if (e && e.code === 'NO_BUILD') {
        out.skipped.push({ title: m.title, why: 'no build for ' + (loader || '?') + ' ' + (inst.ver || '?') });
        game.log('perf: no ' + m.title + ' for ' + loader + ' ' + inst.ver + ' — skipped');
      } else {
        out.failed.push({ title: m.title, why: e && e.message || String(e) });
        game.log('perf: could not install ' + m.title + ' — ' + (e && e.message || e));
      }
    }
  }
  return out;
}

module.exports = { SET, fill, canApply, PENDING, DONE, OFF };
