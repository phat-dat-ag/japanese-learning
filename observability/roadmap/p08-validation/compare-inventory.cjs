const fs=require('node:fs');
const file=process.argv[2],r=JSON.parse(fs.readFileSync(file));
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const changes=[];for(const a of r.before||r.liveBefore){const b=(r.after||r.liveAfter).find(v=>v.id===a.id);if(JSON.stringify(stable(a))!==JSON.stringify(stable(b)))changes.push({service:a.service,id:a.id,fields:Object.keys(a).filter(k=>JSON.stringify(stable(a[k]))!==JSON.stringify(stable(b?.[k])))});}
const before=r.before||r.liveBefore,after=r.after||r.liveAfter;
console.log(JSON.stringify({file,beforeCount:before.length,afterCount:after.length,added:after.filter(b=>!before.some(a=>a.id===b.id)).map(b=>({id:b.id,service:b.service})),beforeOrder:before.map(a=>a.id.slice(0,12)),afterOrder:after.map(a=>a.id.slice(0,12)),rawEqual:JSON.stringify(before)===JSON.stringify(after),semanticEqual:JSON.stringify(stable(before))===JSON.stringify(stable(after)),changes},null,2));
