/* ============================================================================
   build/icon.ico, DRAWN FROM THE ONE MARK THAT ALREADY EXISTS.

   The brand mark is `<symbol id="mark">` in ui/icons/symbols.svg and it is
   not redrawn here — it is read out of that file.  A second copy of a logo is
   a second thing to keep in step, and this project has an opinion about that
   (see ui/scripts/brand.js: the name is a value, not a string).  Same
   argument, same answer: the mark is a value too.

   THE COLOURS COME FROM THE SHIPPING PALETTE.  Slate's ground and its one
   warm accent, --go #E3B439.  tokens.css says the window has "no warmth in
   it anywhere except the thing that starts the game", so an all-gold tile
   would be the wrong icon for this launcher however well it read in a
   taskbar.  Cold tile, warm mark.

   WHY IT RASTERISES IN A BROWSER.  The mark is vector, an .ico is seven
   bitmaps, and the honest way to get from one to the other is to let a real
   renderer draw the vector at each target size rather than scale one big
   bitmap down.  Chromium is already a dependency of the test harness.

   THE FORMAT IS WRITTEN BY HAND because it is small and the alternative is a
   dependency that would have to be trusted: sizes up to 64 are stored as
   BMP/DIB, 128 and 256 as PNG.  That split is the conventional one — Windows
   has read PNG entries since Vista, but small DIB entries are what every
   legacy shell path expects, and an icon that renders everywhere is worth
   forty lines.

     node tools/makeicon.mjs
   ========================================================================= */

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPRITE = path.join(ROOT, 'ui', 'icons', 'symbols.svg');
const OUT_ICO = path.join(ROOT, 'build', 'icon.ico');
const OUT_PNG = path.join(ROOT, 'build', 'icon.png');

/* the seven the Windows shell asks for, and 512 as a plain png beside them */
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const PNG_FROM = 128;          /* at and above this an entry is stored as PNG */

/* ── the mark, read rather than restated ───────────────────────────────── */
const sprite = await fs.readFile(SPRITE, 'utf8');
const found = sprite.match(/<symbol id="mark"[^>]*>([\s\S]*?)<\/symbol>/);
if (!found) { console.error('no <symbol id="mark"> in ' + SPRITE); process.exit(1); }
const MARK = found[1].trim();

/* ── the tile ──────────────────────────────────────────────────────────────
   The mark's ink runs x 1.4→14.6, y 2.4→13.8 in its own 16-unit box, so it
   is scaled about its own centre (8, 8.1) rather than the box's, or it sits
   low.  0.72 puts it at 59% of the tile width, which is where a glyph has to
   be to survive 16px.

   THE EDGE IS A HAIRLINE AT EVERY SIZE, which means its width is a function
   of the size and not a constant: the tile is drawn in a 16-unit box, so one
   device pixel is 16/size units.  Left at a constant it renders as a 1px
   line on the 16px entry and a 32px frame on the 256px one — the first round
   of this file did exactly that, and the tile came out looking like a
   picture of a border.                                                     */
function tile(size) {
  const hair = 16 / size;                  /* one device pixel, in tile units */
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 16 16">',
    '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0" stop-color="#1B1F25"/><stop offset="1" stop-color="#0A0E13"/>',
    '</linearGradient></defs>',
    '<rect width="16" height="16" rx="3.6" fill="url(#g)"/>',
    '<rect x="' + hair / 2 + '" y="' + hair / 2 + '" width="' + (16 - hair) + '" height="' + (16 - hair) + '"'
      + ' rx="' + (3.6 - hair / 2) + '" fill="none" stroke="#2D3137" stroke-width="' + hair + '"/>',
    '<g color="#E3B439" transform="translate(8 8.1) scale(.72) translate(-8 -8.1)">' + MARK + '</g>',
    '</svg>'
  ].join('');
}

/* ── BMP/DIB entry ─────────────────────────────────────────────────────────
   A 32-bit DIB inside an .ico declares double its own height: the header
   covers the colour image AND the 1-bit AND mask stacked under it, and both
   are stored bottom-up.  The mask is redundant where the shell honours the
   alpha channel and load-bearing where it does not, so it is computed from
   the alpha rather than left zeroed.                                       */
function dib(size, rgba) {
  const maskRow = Math.ceil(size / 32) * 4;
  const xorLen = size * size * 4;
  const buf = Buffer.alloc(40 + xorLen + maskRow * size);
  buf.writeUInt32LE(40, 0);          /* biSize */
  buf.writeInt32LE(size, 4);         /* biWidth */
  buf.writeInt32LE(size * 2, 8);     /* biHeight — image + mask */
  buf.writeUInt16LE(1, 12);          /* biPlanes */
  buf.writeUInt16LE(32, 14);         /* biBitCount */
  buf.writeUInt32LE(0, 16);          /* biCompression — BI_RGB */
  buf.writeUInt32LE(xorLen, 20);     /* biSizeImage */
  let o = 40;
  for (let y = size - 1; y >= 0; y--) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      buf[o++] = rgba[i + 2]; buf[o++] = rgba[i + 1]; buf[o++] = rgba[i]; buf[o++] = rgba[i + 3];
    }
  }
  for (let y = size - 1; y >= 0; y--) {
    const row = Buffer.alloc(maskRow);
    for (let x = 0; x < size; x++) {
      if (rgba[(y * size + x) * 4 + 3] === 0) row[x >> 3] |= 0x80 >> (x & 7);
    }
    row.copy(buf, o); o += maskRow;
  }
  return buf;
}

/* ── the container ─────────────────────────────────────────────────────────
   6-byte ICONDIR, then one 16-byte ICONDIRENTRY per image, then the images.
   256 is written as 0 in the one-byte width and height fields, which is the
   format's way of saying "256" and the reason 256 is the largest entry an
   .ico can hold at all.                                                    */
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(function (im, i) {
    const e = 6 + i * 16;
    head[e] = im.size >= 256 ? 0 : im.size;
    head[e + 1] = im.size >= 256 ? 0 : im.size;
    head.writeUInt16LE(1, e + 4);      /* planes */
    head.writeUInt16LE(32, e + 6);     /* bit count */
    head.writeUInt32LE(im.data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += im.data.length;
  });
  return Buffer.concat([head].concat(images.map(function (i) { return i.data; })));
}

/* ── rasterise ─────────────────────────────────────────────────────────── */
let browser;
for (const opts of [{ channel: 'chrome' }, { channel: 'msedge' }, {}]) {
  try { browser = await chromium.launch({ headless: true, ...opts }); break; } catch { /* next */ }
}
if (!browser) { console.error('no browser binary available'); process.exit(2); }
const page = await browser.newPage();

async function draw(size) {
  return page.evaluate(async function (arg) {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(arg.svg);
    await img.decode();
    const c = document.createElement('canvas');
    c.width = arg.size; c.height = arg.size;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0, arg.size, arg.size);
    return {
      rgba: Array.from(cx.getImageData(0, 0, arg.size, arg.size).data),
      png: c.toDataURL('image/png').split(',')[1]
    };
  }, { svg: tile(size), size: size });
}

const images = [];
for (const size of SIZES) {
  const shot = await draw(size);
  const data = size >= PNG_FROM
    ? Buffer.from(shot.png, 'base64')
    : dib(size, Uint8Array.from(shot.rgba));
  images.push({ size: size, data: data, kind: size >= PNG_FROM ? 'png' : 'dib' });
}
const big = Buffer.from((await draw(512)).png, 'base64');

await fs.mkdir(path.dirname(OUT_ICO), { recursive: true });
const out = ico(images);
await fs.writeFile(OUT_ICO, out);
await fs.writeFile(OUT_PNG, big);
await browser.close();

console.log('build/icon.ico  ' + out.length.toLocaleString() + ' bytes');
for (const i of images) {
  console.log('  ' + String(i.size).padStart(3) + '  ' + i.kind + '  ' + i.data.length.toLocaleString());
}
console.log('build/icon.png  512  ' + big.length.toLocaleString() + ' bytes');
