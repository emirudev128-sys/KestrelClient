// Rough audit: every interactive element, and whether anything appears to handle it.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'};
const ROOT=join(process.cwd(),'ui');
const server=createServer(async(req,res)=>{try{
  const rel=normalize(decodeURIComponent(req.url.split('?')[0]).split('/').filter(Boolean).join('/'));
  const f=join(ROOT, rel===''?'index.html':rel); const buf=await readFile(f); res.writeHead(200,{'Content-Type':MIME[extname(f)]||'application/octet-stream'}); res.end(buf);
}catch{res.writeHead(404);res.end('x')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
let b; for(const o of [{channel:'chrome'},{}]){try{b=await chromium.launch({headless:true,...o});break}catch{}}
const p=await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'networkidle'});
await p.waitForTimeout(600);

const screens = await p.evaluate(()=>[...document.querySelectorAll('[id^="screen-"]')].map(s=>s.id.replace('screen-','')));
const rows=[];
for (const s of screens) {
  await p.evaluate((h)=>{location.hash='#'+h;},s);
  await p.waitForTimeout(250);
  const r = await p.evaluate((sid)=>{
    const scr=document.getElementById('screen-'+sid); if(!scr) return null;
    const els=[...scr.querySelectorAll('button,[role="button"],a[href],input,select,[tabindex]:not([tabindex="-1"])')]
      .filter(e=>e.offsetParent!==null);
    let live=0, inert=[];
    for (const e of els) {
      const label=(e.getAttribute('aria-label')||e.textContent||e.value||e.placeholder||'').replace(/\s+/g,' ').trim().slice(0,34);
      const wired = !!(e.onclick || e.getAttribute('href')?.startsWith('#') || e.dataset.act || e.dataset.action
                    || e.type==='checkbox' || e.type==='radio' || e.type==='range' || e.tagName==='SELECT' || e.tagName==='INPUT');
      if (wired) live++; else inert.push(label||('<'+e.tagName.toLowerCase()+'>'));
    }
    return { total: els.length, live, inert: inert.slice(0,10) };
  }, s);
  if(r) rows.push({screen:s, ...r});
}
console.log('screen           interactive  looks-wired  unclear');
for (const r of rows) console.log(`  ${r.screen.padEnd(14)} ${String(r.total).padStart(6)} ${String(r.live).padStart(11)} ${String(r.total-r.live).padStart(9)}   ${r.inert.slice(0,4).join(' | ')}`);
console.log('\npage errors:', errs.length ? errs.slice(0,3) : 'none');
await b.close(); server.close();
