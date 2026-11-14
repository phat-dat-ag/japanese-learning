'use strict';
// Development-only actual telemetry exports. No Compose up/start/stop, live volume writes or DB access.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const zlib=require('node:zlib');
const r=require('./runtime.cjs'),backup=require('./backup.cjs');
function write(file,value){fs.writeFileSync(file,JSON.stringify(value),{flag:'wx',mode:0o600});}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
const digest=value=>r.hash(Buffer.from(JSON.stringify(canonical(value))));
function artifacts(c){return c.artifacts.map(a=>({id:a.id,type:a.type,root:a.root,consistency:'immutable-native-export',classification:'reviewed-telemetry'}));}
function retention(destination,keyFile,days,now=Date.now(),remove=true){
  const root=fs.realpathSync(destination),owned=[];
  if(fs.lstatSync(destination).isSymbolicLink())throw Error('Retention rejects linked destination');
  for(const name of fs.readdirSync(root)){
    if(!/^p08-local-[a-f0-9]{32}\.enc$/.test(name))continue;
    const full=path.join(root,name);if(fs.lstatSync(full).isSymbolicLink()||!fs.lstatSync(full).isFile())throw Error('Linked generation rejected');
    const data=backup.verify(full,keyFile),entry=data.entries.find(e=>e.name==='recovery/ownership.json');
    if(!entry)continue;
    const owner=JSON.parse(Buffer.from(entry.data,'base64'));
    if(owner.owner!=='japanese-learning-P08' || owner.project!=='jp_learning_dev' || owner.generation!==name)continue;
    const created=Date.parse(data.manifest.createdUtc);if(!Number.isFinite(created)||created>now)throw Error('Invalid generation time');
    owned.push({full,name,created,sha256:r.hash(fs.readFileSync(full))});
  }
  owned.sort((a,b)=>b.created-a.created);
  const deleted=[];
  for(const item of owned.slice(1))if(now-item.created>days*86400000){
    // Re-authenticate and compare exact bytes immediately before deleting only an owned expired file.
    if(fs.lstatSync(item.full).isSymbolicLink()||r.hash(fs.readFileSync(item.full))!==item.sha256)throw Error('Retention race rejected');
    backup.verify(item.full,keyFile);if(remove)fs.unlinkSync(item.full);deleted.push(item.name);
  }
  return {retentionDays:days,newestPreserved:owned[0]?.name,deleted,unrelatedFilesNeverSelected:true,dryRun:!remove};
}
async function acquire(stage,c){
  const started=new Date().toISOString(),cutoff=Date.parse(started),sources={},roots=[];
  function root(id,type){const p=path.join(stage,id);fs.mkdirSync(p);roots.push({id,type,root:p});return p;}
  const logs=root('logs','opensearch-logical');
  const whitelist=JSON.parse(fs.readFileSync('observability/p07/opensearch/index-template.json')).template.mappings._source.includes;
  const metadata=r.osGet('/application-logs-*/_mapping');
  const settings=r.osGet('/application-logs-*/_settings');
  const indices=[];
  for(const name of Object.keys(metadata).sort()){
    if(!/^application-logs-[a-z0-9._-]+$/.test(name))throw Error('Unexpected index scope');
    // A per-index scroll provides a consistent native search view; no flush, refresh or snapshot mutation.
    let page=r.osGet('/'+name+'/_search?scroll=2m',{method:'POST',body:{size:500,sort:['_doc'],track_total_hits:true,_source:whitelist,query:{range:{collected_at:{lte:started}}}}});
    const expected=page.hits.total.value,docs=[];let scroll;
    try{
      while(true){scroll=page._scroll_id;for(const h of page.hits.hits){const source=Object.fromEntries(Object.entries(h._source).filter(([k])=>whitelist.includes(k)));docs.push({id:h._id,source});}
        if(!page.hits.hits.length||docs.length>=expected)break;
        page=r.osGet('/_search/scroll',{method:'POST',body:{scroll:'2m',scroll_id:scroll}});
      }
    }finally{if(scroll){const q=r.os('/_search/scroll',{method:'DELETE',body:{scroll_id:[scroll]}});if(q.status!==200)throw Error('Scroll release failed');}}
    if(docs.length!==expected)throw Error('Incomplete log export');
    docs.sort((a,b)=>a.id.localeCompare(b.id));
    const original=settings[name].settings.index;
    const selected={};for(const k of ['number_of_shards','number_of_replicas','mapping','max_result_window','max_terms_count','max_ngram_diff','analysis','refresh_interval','max_docvalue_fields_search','max_inner_result_window','query'])if(original[k]!==undefined)selected[k]=original[k];
    const item={name,mappings:metadata[name].mappings,settings:selected,docs,sha256:digest(docs)};
    write(path.join(logs,name+'.json'),item);indices.push({name,count:docs.length,sha256:item.sha256});
  }
  if(!indices.length)throw Error('No approved log indices');sources.logs={indices,total:indices.reduce((n,i)=>n+i.count,0),pointUtc:started,filter:'Canonical allowlisted fields; collected_at <= acquisition start'};
  const metrics=root('metrics','prometheus-series');
  // Native range-vector API returns original stored sample timestamps, not query_range resampling.
  const chunks=[];let totalSamples=0,maxSeries=0;
  for(let part=0;part<8;part++){
    const end=cutoff/1000-172800+(part+1)*21600;
    const query=await r.http('http://127.0.0.1:9091/api/v1/query?'+new URLSearchParams({query:'{__name__!=""}[21600s]',time:String(end)}));
    if(query.status!=='success'||query.data.resultType!=='matrix'||query.warnings?.length)throw Error('Incomplete metrics export');
    const series=query.data.result;if(series.some(s=>s.histograms?.length))throw Error('Unsupported histogram export');
    const samples=series.reduce((n,s)=>n+s.values.length,0),file='series-'+part+'.json.gz';
    const json=Buffer.from(JSON.stringify(series));backup.validatePayload(json);
    fs.writeFileSync(path.join(metrics,file),zlib.gzipSync(json),{flag:'wx',mode:0o600});
    chunks.push({file,end,rangeSeconds:21600,samples,series:series.length,sha256:digest(series)});totalSamples+=samples;maxSeries=Math.max(maxSeries,series.length);
  }
  if(!totalSamples)throw Error('Empty metric history');
  write(path.join(metrics,'chunks.json'),chunks);sources.metrics={chunks,series:maxSeries,samples:totalSamples,pointUtc:started,rangeSeconds:172800,encoding:'gzip JSON original samples, eight native six-hour range vectors'};
  const traces=root('traces','tempo-otlp');
  const found=new Map(),windows=[];
  function search(start,end){const q=r.internal('http://tempo:3200/api/search?'+new URLSearchParams({start:String(start),end:String(end),limit:'1000'}));
    if((q.traces||[]).length>=1000){if(end-start<=1)throw Error('Trace search saturated; no truncation allowed');const mid=Math.floor((start+end)/2);search(start,mid);search(mid,end);return;}
    if(q.metrics?.completedJobs!==q.metrics?.totalJobs)throw Error('Incomplete trace search');
    for(const t of q.traces||[])found.set(t.traceID.padStart(32,'0'),t);windows.push({start,end,count:q.traces?.length||0});
  }
  search(Math.floor(cutoff/1000)-86400,Math.floor(cutoff/1000));
  for(const id of [...found.keys()].sort()){const trace=r.internal('http://tempo:3200/api/traces/'+id);write(path.join(traces,id+'.json'),trace);await new Promise(resolve=>setTimeout(resolve,100));}
  if(!found.size)throw Error('No actual traces exported');sources.traces={ids:[...found.keys()].sort(),windows,pointUtc:started};
  const dashboards=root('dashboards','grafana-dashboards');
  const list=await r.grafana('/api/search?type=dash-db&limit=1000');if(list.length>=1000)throw Error('Dashboard export pagination required');
  for(const d of list){const value=await r.grafana('/api/dashboards/uid/'+encodeURIComponent(d.uid));delete value.dashboard.id;write(path.join(dashboards,d.uid+'.json'),value.dashboard);}
  if(!list.length)throw Error('No actual dashboards exported');sources.dashboards={uids:list.map(d=>d.uid),pointUtc:started};
  const offsets=root('offsets','fluentbit-sqlite');
  const code="import sqlite3,json,base64\nr={}\nfor n in ['user','vocabulary','jwks']:\n c=sqlite3.connect('file:/stores/fluent-bit/'+n+'.db?mode=ro',uri=True); m=sqlite3.connect(':memory:'); c.backup(m); assert m.execute('pragma integrity_check').fetchall()==[('ok',)]; r[n]=base64.b64encode(m.serialize()).decode(); c.close(); m.close()\nprint(json.dumps(r))";
  const dbs=JSON.parse(r.docker(['exec',r.container('storage-monitor'),'python','-c',code]));
  for(const [name,data]of Object.entries(dbs))fs.writeFileSync(path.join(offsets,name+'.db'),Buffer.from(data,'base64'),{flag:'wx',mode:0o600});
  sources.offsets={databases:Object.keys(dbs),pointUtc:started,nativeIntegrity:'ok',scope:'Read-only online SQLite backups, no raw log/chunk payload'};
  const recovery=root('recovery','opensearch-logical');
  write(path.join(recovery,'sources.json'),sources);
  write(path.join(recovery,'ownership.json'),{owner:'japanese-learning-P08',project:'jp_learning_dev',generation:c.generation,acquiredUtc:started});
  return {sources,roots,newestRecoverableUtc:started};
}
async function main(configFile){
  const c=JSON.parse(fs.readFileSync(configFile));backup.policy(c);
  if(c.policy.environment!=='development')throw Error('Local workflow is development only');
  const destination=fs.realpathSync(c.destination),lock=path.join(destination,'.p08-local.lock');
  if(fs.lstatSync(c.destination).isSymbolicLink())throw Error('Linked destination rejected');
  const fd=fs.openSync(lock,'wx',0o600),runId=crypto.randomBytes(16).toString('hex');
  const stage=path.resolve(c.stagingRoot,runId);fs.mkdirSync(stage,{recursive:true,mode:0o700});
  const report={phase:'P08',runId,createdUtc:new Date().toISOString(),scope:'Actual local development telemetry; same-disk, not off-host',checks:{}};
  const evidence=path.resolve('observability/roadmap/p08-validation/evidence','local-backup-'+runId+'.json');
  try{
    report.before=r.inventory();
    const generations=fs.readdirSync(destination).filter(n=>/^p08-local-[a-f0-9]{32}\.enc$/.test(n));
    let latest=0;for(const n of generations)latest=Math.max(latest,Date.parse(backup.verify(path.join(destination,n),c.keyFile).manifest.createdUtc));
    if(process.argv.includes('--force')===false && Date.now()-latest<c.policy.backupIntervalHours*3600000){report.status='NOT_DUE';return report;}
    c.generation='p08-local-'+runId+'.enc';
    let data;
    const resumeIndex=process.argv.indexOf('--resume-export');
    if(resumeIndex!==-1){
      const exportId=process.argv[resumeIndex+1];if(!/^[a-f0-9]{32}$/.test(exportId))throw Error('Invalid immutable export identity');
      const existing=path.resolve(c.stagingRoot,exportId);if(fs.lstatSync(existing).isSymbolicLink())throw Error('Linked export rejected');
      const sources=JSON.parse(fs.readFileSync(path.join(existing,'recovery/sources.json')));
      if(Date.now()-Date.parse(sources.logs.pointUtc)>c.policy.rpoSeconds*1000)throw Error('Existing export outside approved RPO');
      for(const item of sources.logs.indices){const v=JSON.parse(fs.readFileSync(path.join(existing,'logs',item.name+'.json')));if(v.docs.length!==item.count||digest(v.docs)!==item.sha256)throw Error('Log export integrity failed');}
      if(sources.metrics.chunks){for(const chunk of sources.metrics.chunks){const bytes=zlib.gunzipSync(fs.readFileSync(path.join(existing,'metrics',chunk.file)),{maxOutputLength:134217728});backup.validatePayload(bytes);if(digest(JSON.parse(bytes))!==chunk.sha256)throw Error('Metric chunk integrity failed');}}
      else if(digest(JSON.parse(fs.readFileSync(path.join(existing,'metrics/series.json'))))!==sources.metrics.sha256)throw Error('Metric export integrity failed');
      for(const trace of sources.traces.ids)if(!fs.statSync(path.join(existing,'traces',trace+'.json')).isFile())throw Error('Incomplete trace export');
      for(const uid of sources.dashboards.uids)JSON.parse(fs.readFileSync(path.join(existing,'dashboards',uid+'.json')));
      for(const name of sources.offsets.databases)if(fs.readFileSync(path.join(existing,'offsets',name+'.db')).subarray(0,16).toString()!=='SQLite format 3\0')throw Error('Invalid native offset header');
      c.generation='p08-local-'+exportId+'.enc';
      const owner=JSON.parse(fs.readFileSync(path.join(existing,'recovery/ownership.json')));if(owner.generation!==c.generation||owner.project!=='jp_learning_dev'||owner.owner!=='japanese-learning-P08')throw Error('Export ownership mismatch');
      data={sources,newestRecoverableUtc:sources.logs.pointUtc,roots:[['logs','opensearch-logical'],['metrics','prometheus-series'],['traces','tempo-otlp'],['dashboards','grafana-dashboards'],['offsets','fluentbit-sqlite'],['recovery','opensearch-logical']].map(([id,type])=>({id,type,root:path.join(existing,id)}))};
      report.resumedImmutableExport=exportId;
    }else data=await acquire(stage,c);
    report.sources=data.sources;
    const bytes=data.roots.reduce((n,a)=>n+fs.readdirSync(a.root).reduce((s,f)=>s+fs.statSync(path.join(a.root,f)).size,0),0);
    const used=fs.readdirSync(destination).reduce((n,f)=>{const p=path.join(destination,f);return n+(fs.lstatSync(p).isFile()?fs.statSync(p).size:0);},0);
    if(used+bytes*2>c.policy.maxDestinationBytes)throw Error('Configured backup storage safety budget exceeded');
    const output=path.join(destination,c.generation);
    const packed=backup.create({artifacts:artifacts({artifacts:data.roots}),configFiles:c.configFiles,newestRecoverableUtc:data.newestRecoverableUtc,maxBytes:67108864},c.keyFile,output);
    const verified=backup.verify(output,c.keyFile);report.checks.authenticated=verified.manifest.files.length===packed.manifest.files.length;
    report.package={file:output,sha256:packed.encryptedSha256,bytes:packed.bytes,rawBytes:bytes,files:packed.manifest.files.length};
    report.after=r.inventory();report.checks.livePreserved=JSON.stringify(report.before)===JSON.stringify(report.after);
    if(!report.checks.livePreserved)throw Error('Live runtime changed during read-only backup');
    report.retention=retention(destination,c.keyFile,c.policy.retentionDays);
    report.status='PASS';return report;
  }catch(e){report.status='FAIL';report.error=e.message;try{report.after=r.inventory();report.checks.livePreserved=JSON.stringify(report.before)===JSON.stringify(report.after);}catch{}throw e;}
  finally{
    report.finishedUtc=new Date().toISOString();fs.writeFileSync(evidence,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    try{report.stagingCleanup=require('./cleanup-staging.cjs').clean(c.stagingRoot,runId,evidence);}catch(error){report.stagingCleanup={requiresReview:true,error:error.message};}
    fs.writeFileSync(evidence,JSON.stringify(report,null,2)+'\n');fs.closeSync(fd);fs.unlinkSync(lock);console.log(JSON.stringify({status:report.status,evidence,package:report.package},null,2));
  }
}
module.exports={acquire,main,retention,digest};
if(require.main===module)main(process.argv[2]).catch(e=>{console.error(e.message);process.exitCode=1;});
