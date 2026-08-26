// Keep the inlined sprite in index.html byte-identical to icons/symbols.svg.
// node tools/_splice.mjs variants/c4
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.argv[2] || 'variants/c4';
const sprite = readFileSync(join(root, 'icons/symbols.svg'), 'utf8').trimEnd();
let html = readFileSync(join(root, 'index.html'), 'utf8');
const start = html.indexOf('<svg xmlns="http://www.w3.org/2000/svg" class="sprite"');
if (start === -1) { console.error('sprite start not found'); process.exit(1); }
const endTag = '\n</svg>';
const end = html.indexOf(endTag, start);
if (end === -1) { console.error('sprite end not found'); process.exit(1); }
html = html.slice(0, start) + sprite + html.slice(end + endTag.length);
writeFileSync(join(root, 'index.html'), html);
console.log('spliced ' + sprite.length + ' bytes');
