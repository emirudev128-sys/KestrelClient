// Static audit of a variant against the greppable subset of docs/standard.md.
// Visual items still need a critic; these do not, and they are the ones that kept recurring.
//   node tools/audit.mjs variants/c4
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = process.argv[2];
if (!root) { console.error('usage: audit.mjs <variantDir>'); process.exit(1); }

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (['.css', '.html', '.js', '.mjs', '.svg', '.json'].includes(extname(p))) files.push(p);
  }
})(root);

const read = (f) => readFileSync(f, 'utf8');
const findings = [];
const add = (id, label, hits) => { if (hits.length) findings.push({ id, label, hits }); };
const scan = (re, { only, skip } = {}) => {
  const out = [];
  for (const f of files) {
    if (only && !only.test(f)) continue;
    if (skip && skip.test(f)) continue;
    const lines = read(f).split('\n');
    lines.forEach((l, i) => { const m = l.match(re); if (m) out.push(`${f}:${i + 1}  ${m[0].trim().slice(0, 70)}`); });
  }
  return out;
};

// A1 gradients
add('A1', 'gradient', scan(/linear-gradient|radial-gradient|conic-gradient|bg-clip-text/i));
// A2 emoji (surrogate pairs + common pictographs)
add('A2', 'emoji', scan(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u, { skip: /audit|standard/ }));
// A3 + C1 banned accent families
add('A3', 'banned accent hex', scan(/#(6366f1|4f46e5|7c3aed|8b5cf6|a855f7|a78bfa|5e6ad2|00d845|1bd96a|d97757|c96442|c6613f|c46849|cc785c|2dd4bf|14b8a6)/i));
// A4 shadcn signature
add('A4', 'shadcn default', scan(/--radius:\s*0\.625rem|oklch\(0\.97 0 0\)|oklch\(0\.922 0 0\)|ring-1 ring-foreground/i));
// A5 neon glow: 0-offset high-blur saturated shadow
add('A5', 'neon glow shadow', scan(/box-shadow:[^;]*\b0\s+0\s+(?:[2-9]\d|\d{3})px[^;]*rgba?\([^)]*\)/i));
// A9 centred max-width column
add('A9', 'centred max-width column', scan(/max-w-7xl|max-width:\s*(?:1280|1200|1140)px[^;]*;\s*margin:\s*0 auto/i));
// A15 icon libraries
add('A15', 'icon library reference', scan(/lucide|heroicon|feather-icons|font-awesome|bootstrap-icons/i));
// C2 cream grounds
add('C2', 'cream ground', scan(/#(faf9f5|f9f9f7|f5f4ed|f0eee6|faf8f4|f5f1ea)/i));
// B: hex literals outside the token file
add('B-tok', 'hex literal outside tokens.css', scan(/#[0-9a-f]{3,8}\b/i, { skip: /tokens\.css/ }));

// B: radius ladder — how many distinct radii?
const radii = new Set();
for (const f of files) for (const m of read(f).matchAll(/border-radius:\s*([^;]+);/gi)) radii.add(m[1].trim());
// B: motion — distinct durations
const durs = new Set();
for (const f of files) for (const m of read(f).matchAll(/(?:transition|animation)[^;]*?(\d+m?s)\b/gi)) durs.add(m[1]);
const reducedMotion = files.some((f) => /prefers-reduced-motion/.test(read(f)));

console.log(`\naudit: ${root}   (${files.length} files)\n`);
if (!findings.length) console.log('  no greppable standard violations found');
for (const f of findings) {
  console.log(`  [${f.id}] ${f.label} — ${f.hits.length} hit(s)`);
  f.hits.slice(0, 4).forEach((h) => console.log(`      ${h}`));
  if (f.hits.length > 4) console.log(`      ... ${f.hits.length - 4} more`);
}
console.log(`\n  radius values in use : ${radii.size}  ${radii.size === 1 ? '<-- A7 FAIL: one radius everywhere' : '(ladder ok)'}`);
const durVerdict = durs.size === 0 ? '<-- none matched; check motion manually' : durs.size === 1 ? '<-- B FAIL: one duration for everything' : '(ladder ok)';
console.log(`  motion durations     : ${durs.size}  ${durVerdict}`);
console.log(`  prefers-reduced-motion honoured: ${reducedMotion ? 'yes' : 'NO  <-- B FAIL'}\n`);
