import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'};
const ROOT=join(process.cwd(),'ui');
const server=createServer(async(req,res)=>{try{
  const rel=normalize(decodeURIComponent(req.url.split('?')[0]).split('/').filter(Boolean).join('/'));
  const f=join(ROOT, rel===''?'index.html':rel); const b=await readFile(f);
  res.writeHead(200,{'Content-Type':MIME[extname(f)]||'application/octet-stream'}); res.end(b);
}catch{res.writeHead(404);res.end('x')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
let b; for(const o of [{channel:'chrome'},{}]){try{b=await chromium.launch({headless:true,...o});break}catch{}}
const p=await b.newPage();
await p.goto(`http://127.0.0.1:${port}/index.html#play`,{waitUntil:'networkidle'});
await p.waitForTimeout(600);
const sel = process.argv[2];
const info = await p.evaluate((s)=>{
  const el=document.querySelector(s);
  if(!el) return {found:false};
  const heads=[...el.querySelectorAll('h1,h2,h3,h4,.sec-title,.pane-head')].map(n=>n.textContent.trim()).slice(0,4);
  return { found:true, tag:el.tagName, cls:el.className, id:el.id,
    heads, textStart: el.textContent.replace(/\s+/g,' ').trim().slice(0,220),
    rect: el.getBoundingClientRect().toJSON(), childCount: el.children.length,
    siblings: [...el.parentElement.children].map(n=>n.tagName+'.'+(n.className||'').split(' ')[0]) };
}, sel);
console.log(JSON.stringify(info,null,2));
await b.close(); server.close();
