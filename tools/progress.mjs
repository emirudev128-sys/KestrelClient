// Renders docs/state.json -> progress.html (published as the live progress Artifact).
import { readFileSync, writeFileSync } from 'node:fs';

const s = JSON.parse(readFileSync('docs/state.json', 'utf8'));
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const STATE_LABEL = { queued: 'Queued', building: 'Building', judging: 'Judging', won: 'Won', lost: 'Rebuilding' };

const rows = s.pieces.map((p) => `
      <tr class="row is-${esc(p.status)}">
        <td class="c-state"><span class="dot"></span><span class="state-label">${esc(STATE_LABEL[p.status] || p.status)}</span></td>
        <td class="c-name">${esc(p.name)}</td>
        <td class="c-rounds">${p.rounds ? esc(p.rounds) : '—'}</td>
        <td class="c-verdict">${p.verdict ? esc(p.verdict) : '<span class="nil">not yet judged</span>'}</td>
        <td class="c-gap">${p.gap ? esc(p.gap) : '<span class="nil">—</span>'}</td>
      </tr>`).join('');

const won = s.pieces.filter((p) => p.status === 'won').length;
const total = s.pieces.length;

const html = `<title>Kestrel Gauntlet</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;450;500;600&display=swap">
<style>
  :root {
    --ground: #0a0a0c;
    --panel: #0f0f12;
    --panel-2: #131317;
    --line: #1e1e24;
    --line-soft: #17171c;
    --ink: #e8e8ec;
    --ink-2: #9a9aa5;
    --ink-3: #63636e;
    --amber: #c9a227;
    --green: #6aa84f;
    --rust: #b5563f;
    --blue: #6b8fc9;
    --sans: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
    --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--ground);
    color: var(--ink);
    font-family: var(--sans);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 40px 28px 80px; }

  header { border-bottom: 1px solid var(--line); padding-bottom: 20px; margin-bottom: 28px; }
  .eyebrow {
    font-family: var(--mono); font-size: 11px; letter-spacing: .12em; text-transform: uppercase;
    color: var(--ink-3); margin: 0 0 10px;
  }
  h1 { font-size: 22px; font-weight: 600; letter-spacing: -.01em; margin: 0 0 6px; }
  .sub { color: var(--ink-2); margin: 0; max-width: 62ch; }

  .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1px; background: var(--line-soft); border: 1px solid var(--line); margin-bottom: 32px; }
  .meta > div { background: var(--panel); padding: 14px 16px; }
  .meta dt { font-family: var(--mono); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); margin: 0 0 5px; }
  .meta dd { margin: 0; font-size: 13.5px; }
  .meta dd .n { font-family: var(--mono); font-variant-numeric: tabular-nums; }

  h2 { font-size: 12px; font-family: var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); font-weight: 500; margin: 0 0 12px; }

  .tablewrap { overflow-x: auto; border: 1px solid var(--line); background: var(--panel); }
  table { border-collapse: collapse; width: 100%; min-width: 780px; }
  th {
    text-align: left; font-family: var(--mono); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase;
    color: var(--ink-3); font-weight: 500; padding: 10px 14px; border-bottom: 1px solid var(--line); background: var(--panel-2);
  }
  td { padding: 11px 14px; border-bottom: 1px solid var(--line-soft); vertical-align: top; }
  tr:last-child td { border-bottom: 0; }

  .c-state { white-space: nowrap; width: 128px; }
  .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--ink-3); margin-right: 8px; vertical-align: middle; }
  .state-label { font-family: var(--mono); font-size: 11.5px; color: var(--ink-2); }
  .is-building .dot, .is-judging .dot { background: var(--amber); }
  .is-building .state-label, .is-judging .state-label { color: var(--amber); }
  .is-won .dot { background: var(--green); }
  .is-won .state-label { color: var(--green); }
  .is-lost .dot { background: var(--rust); }
  .is-lost .state-label { color: var(--rust); }

  .c-name { font-weight: 450; width: 200px; }
  .c-rounds { font-family: var(--mono); font-variant-numeric: tabular-nums; color: var(--ink-2); width: 72px; }
  .c-verdict { color: var(--ink-2); width: 150px; }
  .c-gap { color: var(--ink-2); }
  .nil { color: var(--ink-3); }

  .barbox { border: 1px solid var(--line); background: var(--panel); padding: 18px 20px; margin-bottom: 32px; }
  .barbox .name { font-size: 15px; font-weight: 550; margin: 0 0 6px; }
  .barbox .why { color: var(--ink-2); margin: 0 0 14px; max-width: 66ch; }
  .shots { display: flex; flex-wrap: wrap; gap: 6px; }
  .shots span { font-family: var(--mono); font-size: 11px; color: var(--ink-3); border: 1px solid var(--line); padding: 3px 7px; }

  footer { margin-top: 36px; padding-top: 18px; border-top: 1px solid var(--line); color: var(--ink-3); font-family: var(--mono); font-size: 11.5px; }
</style>

<div class="wrap">
  <header>
    <p class="eyebrow">Gauntlet loop · build log</p>
    <h1>Kestrel launcher shell</h1>
    <p class="sub">A Minecraft client launcher UI, built piece by piece against a locked reference. Each piece gets a builder and a separate critic; the critic compares blind and sends it back until ours wins.</p>
  </header>

  <dl class="meta">
    <div><dt>Loops used</dt><dd><span class="n">${esc(s.loopsUsed)}</span> <span class="nil">/ ${esc(s.loopCap)} cap</span></dd></div>
    <div><dt>Pieces won</dt><dd><span class="n">${won}</span> <span class="nil">/ ${total}</span></dd></div>
    <div><dt>Bar</dt><dd>${esc(s.bar.name)}</dd></div>
    <div><dt>Design record</dt><dd>${esc(s.record || '-')}</dd></div>
    <div><dt>Current build</dt><dd><span class="n">${esc(s.build || '-')}</span></dd></div>
  </dl>

  <h2>The gate</h2>
  <div class="barbox"><p class="why">${esc(s.gate || '')}</p></div>

  <h2>The bar</h2>
  <div class="barbox">
    <p class="name">${esc(s.bar.name)}</p>
    <p class="why">${esc(s.bar.why)}</p>
    <div class="shots">${s.bar.shots.map((f) => `<span>${esc(f)}</span>`).join('')}</div>
  </div>

  <h2>Pieces</h2>
  <div class="tablewrap">
    <table>
      <thead><tr><th>State</th><th>Piece</th><th>Rounds</th><th>Last verdict</th><th>Biggest remaining gap</th></tr></thead>
      <tbody>${rows}
      </tbody>
    </table>
  </div>

  <footer>Exit is the gate above, not a round count. Hard stop at ${esc(s.loopCap)} loops. "Building" means the screen exists and is shot but has not had its own blind round.</footer>
</div>
`;

writeFileSync('progress.html', html);
console.log('progress.html written — ' + won + '/' + total + ' won, ' + s.loopsUsed + ' loops');
