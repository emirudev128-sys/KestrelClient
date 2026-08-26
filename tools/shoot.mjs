// Headless screenshotter.
//   node tools/shoot.mjs <url> <out.png> [w] [h] [full] [waitMs] [scrollY] [selector]
import { chromium } from 'playwright';

const [, , url, out, w = '1440', h = '900', full = 'false', waitMs = '2500', scrollY = '0', selector = ''] = process.argv;
if (!url || !out) { console.error('usage: shoot.mjs <url> <out.png> [w] [h] [full] [waitMs] [scrollY] [selector]'); process.exit(1); }

let browser;
for (const opts of [{ channel: 'chrome' }, { channel: 'msedge' }, {}]) {
  try { browser = await chromium.launch({ headless: true, ...opts }); break; } catch { /* next */ }
}
if (!browser) { console.error('no browser binary available'); process.exit(2); }

const ctx = await browser.newContext({
  viewport: { width: +w, height: +h },
  deviceScaleFactor: 2,
  colorScheme: (process.env.SCHEME || 'dark'),
});
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
if (+scrollY) { await page.evaluate((y) => window.scrollTo(0, y), +scrollY); await page.waitForTimeout(1200); }
await page.waitForTimeout(+waitMs);

const clip = process.env.CLIP ? JSON.parse(process.env.CLIP) : null;
if (clip) {
  await page.screenshot({ path: out, clip });
} else if (selector) {
  const el = await page.$(selector);
  if (!el) { console.error('selector not found: ' + selector); process.exit(3); }
  await el.screenshot({ path: out });
} else {
  await page.screenshot({ path: out, fullPage: full === 'true' });
}
console.log('ok ' + out);
await browser.close();
