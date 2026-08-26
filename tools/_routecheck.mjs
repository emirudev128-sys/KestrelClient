import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = join(process.cwd(), process.env.UI_ROOT || 'ui');
const MIME = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png' };
const server = createServer(async (req,res)=>{try{const raw=decodeURIComponent(req.url.split('?')[0]);const rel=normalize(raw.split('/').filter(Boolean).join('/'));const buf=await readFile(join(ROOT,rel===''?'index.html':rel));res.writeHead(200,{'Content-Type':MIME[extname(join(ROOT,rel))]||'application/octet-stream'});res.end(buf);}catch{res.writeHead(404);res.end('nf');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
const ROUTES=['play','instances','instance','modules','modules-colour','hud','presets','mods','mods-drop','new','import','servers','accounts','settings','appearance','states','states/empty','states/downloading','states/failed','states/no-java','states/offline','states/running','states/crashed','nonsense'];
const browser=await chromium.launch({headless:true,channel:'chrome'});
for (const theme of ['dark','light']) for (const pal of ['slate','cinder','basalt','tundra']) {
  const ctx=await browser.newContext({viewport:{width:1280,height:800}});
  const page=await ctx.newPage();
  const errs=[];
  page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  page.on('pageerror',e=>errs.push(String(e)));
  for (const r of ROUTES){ await page.goto(`http://127.0.0.1:${port}/index.html?theme=${theme}&palette=${pal}#${r}`,{waitUntil:'networkidle'}); await page.waitForTimeout(80); }
  // exercise interaction: palette, launch, cmd-k
  await page.goto(`http://127.0.0.1:${port}/index.html?theme=${theme}&palette=${pal}#appearance`,{waitUntil:'networkidle'});
  await page.click('.pals .pal[data-pal="basalt"]'); await page.waitForTimeout(60);
  await page.click('.sw-b[data-pal="tundra"]'); await page.waitForTimeout(60);
  await page.fill('#accentHex','#334455'); await page.waitForTimeout(120);
  await page.click('[data-act="accent-reset"]'); await page.waitForTimeout(60);
  await page.click('[data-theme-set="light"]'); await page.waitForTimeout(60);
  await page.goto(`http://127.0.0.1:${port}/index.html#play`,{waitUntil:'networkidle'});
  await page.click('#goBtn'); await page.waitForTimeout(1200);
  await page.keyboard.press('Control+k'); await page.waitForTimeout(120); await page.keyboard.press('Escape');
  if (errs.length) console.log(theme+'/'+pal+' ERRORS: '+errs.slice(0,5).join(' | '));
  await ctx.close();
}
console.log('route check done');
await browser.close(); server.close();
