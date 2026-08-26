// Resolve a critic's A/B pick against the key.
//   node tools/reveal.mjs <piece> <A|B>
import { readFileSync } from 'node:fs';
const [, , piece, pick] = process.argv;
const key = JSON.parse(readFileSync(`${process.env.BLIND_KEYS || 'docs/keys'}/${piece}.json`, 'utf8'));
const oursWon = pick.trim().toUpperCase() === key.oursIs;
console.log(JSON.stringify({ piece, criticPicked: pick.trim().toUpperCase(), oursWas: key.oursIs, oursWon }, null, 2));
