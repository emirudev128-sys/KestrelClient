// Dump CSS custom properties + computed type/color facts from a live site.
import { chromium } from 'playwright';
const url = process.argv[2];
let browser;
for (const o of [{ channel: 'chrome' }, { channel: 'msedge' }, {}]) {
  try { browser = await chromium.launch({ headless: true, ...o }); break; } catch {}
}
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500);

const out = await page.evaluate(() => {
  const vars = {};
  for (const sheet of Array.from(document.styleSheets)) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const r of Array.from(rules || [])) {
      if (!r.style) continue;
      for (const prop of Array.from(r.style)) {
        if (prop.startsWith('--')) vars[prop] = r.style.getPropertyValue(prop).trim();
      }
    }
  }
  const cs = getComputedStyle(document.body);
  const fonts = new Set();
  const sizes = new Set();
  const radii = new Set();
  document.querySelectorAll('*').forEach((el) => {
    const s = getComputedStyle(el);
    if (s.fontFamily) fonts.add(s.fontFamily.split(',')[0].replace(/["']/g, '').trim());
    if (s.fontSize) sizes.add(s.fontSize);
    if (s.borderRadius && s.borderRadius !== '0px') radii.add(s.borderRadius);
  });
  return {
    bodyBg: cs.backgroundColor, bodyColor: cs.color, bodyFont: cs.fontFamily,
    varCount: Object.keys(vars).length, vars,
    fonts: [...fonts].slice(0, 25),
    sizes: [...sizes].sort((a, b) => parseFloat(a) - parseFloat(b)).slice(0, 30),
    radii: [...radii].slice(0, 20),
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
