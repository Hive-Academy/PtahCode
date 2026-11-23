import fs from 'node:fs';
const c=JSON.parse(fs.readFileSync(new URL('../../nav-live-ws/.mcp.json',import.meta.url),'utf8'));
const url=Object.values(c.mcpServers)[0].url;
const [name,args]=[process.argv[2],JSON.parse(process.argv[3]||'{}')];
const t0=Date.now();
const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
const t=await r.text();const j=JSON.parse(t.startsWith('{')?t:t.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5)).join(''));
const out=(j.result?.content||[]).map(x=>x.text).join('')||JSON.stringify(j);
console.log(`[${name} ${Date.now()-t0} ms, ${out.length} ch]\n`+out.slice(0,Number(process.argv[4]||600)));
