// Build a blind A/B pair. Copies two PNGs to neutral names in shuffled order and
// writes the answer key somewhere the critic is never pointed at.
//   node tools/blind.mjs <piece> <oursPng> <barPng>
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';

const [, , piece, ours, bar] = process.argv;
if (!piece || !ours || !bar) { console.error('usage: blind.mjs <piece> <ours.png> <bar.png>'); process.exit(1); }

mkdirSync('shots/blind', { recursive: true });
const KEYS = process.env.BLIND_KEYS || 'docs/keys';
mkdirSync(KEYS, { recursive: true });

// SIDE env var forces the assignment so a batch can be balanced instead of random.
// Position bias is a real confound: in round 1 all three pairs randomly put ours at B
// and all three critics picked B, which is unfalsifiable as stated.
const forced = (process.env.SIDE || '').toUpperCase();
const oursIsA = forced === 'A' ? true : forced === 'B' ? false : Math.random() < 0.5;
copyFileSync(oursIsA ? ours : bar, `shots/blind/${piece}-A.png`);
copyFileSync(oursIsA ? bar : ours, `shots/blind/${piece}-B.png`);
writeFileSync(`${KEYS}/${piece}.json`, JSON.stringify({ piece, oursIs: oursIsA ? 'A' : 'B', ours, bar }, null, 2));

console.log(`blind pair ready: shots/blind/${piece}-A.png  shots/blind/${piece}-B.png`);
console.log(`(key written to ${KEYS}/${piece}.json — do not show the critic)`);
