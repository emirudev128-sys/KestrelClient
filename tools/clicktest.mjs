// Rough functional test: click every visible control and see whether ANYTHING changed.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'};
const ROOT=join(process.cwd(), process.env.UI_ROOT||'ui');
const server=createServer(async(req,res)=>{try{
  const rel=normalize(decodeURIComponent(req.url.split('?')[0]).split('/').filter(Boolean).join('/'));
  const f=join(ROOT, rel===''?'index.html':rel); const buf=await readFile(f); res.writeHead(200,{'Content-Type':MIME[extname(f)]||'application/octet-stream'}); res.end(buf);
}catch{res.writeHead(404);res.end('x')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
let b; for(const o of [{channel:'chrome'},{}]){try{b=await chromium.launch({headless:true,...o});break}catch{}}
const ctx=await b.newContext({viewport:{width:1280,height:800}});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,120)));

const only = process.argv[2];
await p.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'networkidle'});
await p.waitForTimeout(500);
const screens = only ? [only]
  : await p.evaluate(()=>[...document.querySelectorAll('[id^="screen-"]')].map(s=>s.id.replace('screen-','')));

let totLive=0, totDead=0;
for (const s of screens) {
  await p.evaluate(h=>{location.hash='#'+h;}, s);
  await p.waitForTimeout(300);
  const n = await p.evaluate(sid=>{
    const scr=document.getElementById('screen-'+sid); if(!scr) return 0;
    window.__c=[...scr.querySelectorAll('button,[role="button"],[role="tab"],[role="option"],a[href^="#"],input[type=checkbox],select')]
      .filter(e=>e.offsetParent!==null); return window.__c.length;
  }, s);
  const dead=[];
  let live=0;
  for (let i=0;i<n;i++){
    const changed = await p.evaluate(async (idx)=>{
      const e=window.__c[idx]; if(!e) return {skip:true};
      const label=(e.getAttribute('aria-label')||e.textContent||'').replace(/\s+/g,' ').trim().slice(0,32)||e.tagName;
      const before = document.documentElement.outerHTML.length + '|' + location.hash + '|' +
        [...document.documentElement.attributes].map(a=>a.name+'='+a.value).join(',');
      let fired=false; const h=()=>{fired=true;};
      e.addEventListener('click',h,{once:true,capture:false});
      e.click();
      await new Promise(r=>setTimeout(r,60));
      const after = document.documentElement.outerHTML.length + '|' + location.hash + '|' +
        [...document.documentElement.attributes].map(a=>a.name+'='+a.value).join(',');
      return { label, changed: before!==after };
    }, i);
    if (changed.skip) continue;
    if (changed.changed) live++; else dead.push(changed.label);
  }
  totLive+=live; totDead+=dead.length;
  console.log(`${s.padEnd(12)} ${String(live).padStart(3)} respond / ${String(dead.length).padStart(3)} inert   ${dead.join(' · ')}`);
  await p.evaluate(h=>{location.hash='#'+h;}, s);  // reset after any nav
  await p.waitForTimeout(150);
}
console.log(`\nTOTAL  ${totLive} respond / ${totDead} inert`);
console.log('page errors:', errs.length?errs.slice(0,4):'none');
await b.close(); server.close();
