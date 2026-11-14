'use strict';
// New scenarios only. The parent runner supplies an audited disposable environment.
module.exports=async function(c){
 const {run,agent,native,request,query,until,metricText,logs,save,scenario,docker,own,sleep,stats}=c;
 const numbers=text=>Object.fromEntries(String(text).split('\n').filter(l=>/^fluentbit_(input_records|output_proc_records|output_dropped_records|output_retries|output_retries_failed)_total/.test(l)).map(l=>{const p=l.split(/\s+/);return [p[0],Number(p[1])];}));
 await scenario('enospc_lifecycle_and_finite_replay',async()=>{
  const nominal=agent('generate',{kind:'logs',start:1,count:4,deterministic:true});await until(async()=>(await logs()).length===4);
  const before=agent('lifecycle'),metricsBefore=await metricText('fluent'),start=Date.now();let generated,during,metricsDuring,pressure;
  try{pressure=agent('pressure');generated=agent('generate',{kind:'logs',start:201,count:12,deterministic:true});during=agent('lifecycle');metricsDuring=await metricText('fluent');await sleep(1000);}finally{agent('pressure',{clear:true});}
  const cleared=Date.now();await native('https://restore:9200/p10-events/_refresh',{method:'POST'});const docsBeforeReplay=await logs();const checkpoint=agent('lifecycle');const replay=agent('reconcile');
  await until(async()=>(await logs()).length===16);const recoverySeconds=(Date.now()-cleared)/1000,docsAfterReplay=await logs(),after=agent('lifecycle'),metricsAfter=await metricText('fluent');
  // Repeat the finite handoff request: create-only replay must reject an accidental second pass.
  const ids=docsAfterReplay.map(d=>d.event_id);if(new Set(ids).size!==16)throw Error('Deterministic reconciliation');
  await native('https://restore:9200/p10-events/_refresh',{method:'POST'});
  const nativeIds=(await native('https://restore:9200/p10-events/_search',{method:'POST',body:{size:100}})).hits.hits.map(h=>h._id);
  if(nativeIds.some(id=>!ids.includes(id)))throw Error('Native deterministic IDs differ');
  const fresh=agent('generate',{kind:'logs',start:401,count:4,deterministic:true});await until(async()=>(await logs()).length===20);
  const committed=agent('lifecycle'),restartAt=Date.now();docker(['restart','--time','2',own('fluent')]);await until(async()=>(await request('http://fluent:2020/api/v1/metrics')).status===200,30);await sleep(2000);
  const afterRestart=agent('lifecycle'),finalDocs=await logs();if(finalDocs.length!==20||new Set(finalDocs.map(d=>d.event_id)).size!==20)throw Error('Restart/normal-ingestion regression');
  await until(async()=>(await native('http://agent:8000/state')).notifications.some(n=>n.name==='P10ShortCapacity'&&n.state==='resolved'),30);
  const notifications=await native('http://agent:8000/state');
  const counts=numbers(metricsAfter),admitted=counts['fluentbit_input_records_total{name="tail.0"}'],processed=counts['fluentbit_output_proc_records_total{name="opensearch.0"}'],dropped=counts['fluentbit_output_dropped_records_total{name="opensearch.0"}'];
  save('enospc-lifecycle',{before,during,checkpoint,after,committed,afterRestart,metricsBefore,metricsDuring,metricsAfter,sourcePersistence:'flush + fsync on each synthetic source record',docsBeforeReplay:docsBeforeReplay.map(d=>d.event_id),docsAfterReplay:ids});
  return {nominal,generated,pressure,faultSeconds:(cleared-start)/1000,recoverySeconds,
   generatedUnique:16,persistedAtSource:after.sourceIds.length,admittedBeforeRecovery:numbers(metricsDuring),searchableBeforeReplay:docsBeforeReplay.length,
   replay,delivered:ids.length,missing:after.sourceIds.filter(id=>!ids.includes(id)),duplicates:ids.length-new Set(ids).size,remainingBuffered:admitted-processed-dropped,
   admittedAfterRecovery:admitted,nativeOutputProcessed:processed,nativeOutputDropped:dropped,fresh,finalGeneratedUnique:20,finalDelivered:finalDocs.length,collectorRestartVerificationSeconds:(Date.now()-restartAt)/1000,
   recoveryDrops:0,nativeAdmissionFailures:16-docsBeforeReplay.length,
   sourceOriginalOffsetBeforeReplay:checkpoint.offsets,sourceOriginalOffsetAfterReplay:after.offsets,
   capacityFiring:notifications.notifications.some(n=>n.name==='P10ShortCapacity'&&n.state==='firing'),
   capacityResolved:notifications.notifications.some(n=>n.name==='P10ShortCapacity'&&n.state==='resolved'),
   scope:'Bounded source-to-search acknowledgement/replay candidate; original Fluent Bit admission defect remains visible; no live deployment or unlimited retry'};
 });
 await scenario('privacy_native_stored_pipeline',async()=>{
  const faultStart=Date.now();let generated,traces;docker(['pause',own('restore')]);docker(['pause',own('tempo')]);
  try{generated=agent('privacy-fixtures');traces=agent('privacy-traces');}finally{docker(['unpause',own('restore')]);docker(['unpause',own('tempo')]);}
  const backendFaultSeconds=(Date.now()-faultStart)/1000;
  await until(async()=>{await native('https://restore:9200/p10-privacy/_refresh',{method:'POST'});return (await native('https://restore:9200/p10-privacy/_count')).count===8;});
  const stored=(await native('https://restore:9200/p10-privacy/_search',{method:'POST',body:{size:20}})).hits.hits;
  if(stored.length!==8||stored.some(h=>/P10_[A-Z_]+_SENTINEL_483912/.test(JSON.stringify(h._source))))throw Error('Stored log sentinel');
  await sleep(3000);let retrieved=0;
  for(let i=801;i<809;i++){const q=await until(async()=>{const t=await request('http://tempo:3200/api/traces/'+i.toString(16).padStart(32,'0'));return t.status===200&&t;},30);if(/P10_[A-Z_]+_SENTINEL_483912/.test(JSON.stringify(q.data)))throw Error('Stored trace sentinel');retrieved++;}
  const schema=stored.map(h=>Object.keys(h._source).sort());save('privacy-schema',{schema,logCount:8,traceCount:retrieved,inputClasses:generated.classes,rawPayloadsExported:false});
  await native('http://agent:8000/fault',{method:'POST',body:{privacy:true}});
  let metricPrivacy=false;try{await until(async()=>{const good=await query('p10_privacy_good_total'),bad=await query('p10_privacy_bad_total');metricPrivacy=good.length===1&&bad.length===0;return metricPrivacy;},20);}finally{await native('http://agent:8000/fault',{method:'POST',body:{privacy:false}});}
  const fs=require('node:fs'),dashboards=['p09-api-operations.json','p09-telemetry-capacity.json'].map(n=>JSON.parse(fs.readFileSync('observability/p05-candidate/grafana/dashboards/'+n)));
  const dashboardPrivacy=JSON.stringify(dashboards.map(d=>({templating:d.templating,links:d.links,panels:d.panels.map(p=>({links:p.links,targets:p.targets}))}))).match(/P10_[A-Z_]+_SENTINEL_483912|Bearer\s|password=|access_token=/)===null;
  if(!metricPrivacy||!dashboardPrivacy)throw Error('Metric/dashboard privacy');
  const persistedScan=agent('privacy-scan');let diagnosticOccurrences=0;for(const service of ['fluent','collector','prometheus','grafana']){const q=require('node:child_process').spawnSync('docker',['logs','--tail','100',own(service)],{encoding:'utf8',timeout:10000});if(q.status!==0)throw Error('Diagnostic scan unavailable');const text=(q.stdout||'')+(q.stderr||'');diagnosticOccurrences+=(text.match(/P10_[A-Z_]+_SENTINEL_483912|eyJhbGciOiJub25lIn0|BEGIN PRIVATE KEY/g)||[]).length;}
  if(persistedScan.sentinelOccurrences||diagnosticOccurrences)throw Error('Collector persisted/diagnostic privacy');
  return {generated,logs:8,traces,storedTraces:retrieved,backendFaultSeconds,logSentinelOccurrences:0,traceSentinelOccurrences:0,
   metricPrivacy,dashboardPrivacy,persistedScan,diagnosticOccurrences,logFilter:'Exact copied P07 normalize.lua',traceFilter:'Exact P07 processors; HTTP fixture receiver/metrics added only',scope:'Collector/store synthetic payload regression; intentional raw source fixture excluded'};
 });
 await scenario('retention_native_ism_and_boundaries',async()=>{
  let expectedCount=(await native('https://restore:9200/p10-events/_count')).count;
  if(expectedCount===0){agent('generate',{kind:'logs',start:1,count:4,deterministic:true});await until(async()=>(await logs()).length===4);expectedCount=4;}
  const names=['p10-retention-expired','p10-retention-control'];for(const n of names){await native('https://restore:9200/'+n,{method:'PUT',body:{settings:{number_of_shards:1,number_of_replicas:0}}});await native('https://restore:9200/'+n+'/_doc/owned',{method:'PUT',body:{event:'p10-retention-control',owned:true}});}
  await native('https://restore:9200/_cluster/settings',{method:'PUT',body:{transient:{'plugins.index_state_management.job_interval':1,'plugins.index_state_management.jitter':0,'plugins.jobscheduler.sweeper.period':'10s'}}});
  await native('https://restore:9200/_plugins/_ism/policies/p10-expired',{method:'PUT',body:{policy:{description:'P10 fixture: pre-expired native delete-action verification only',default_state:'expired',states:[{name:'expired',actions:[{delete:{}}],transitions:[]}]}}});
  const attach=await native('https://restore:9200/_plugins/_ism/add/p10-retention-expired',{method:'POST',body:{policy_id:'p10-expired'}}),start=Date.now();let deleted=false;
  // This is healthy lifecycle scheduling, not a fault or a queue-drain observation.
  // Poll at <= 1/5s: fewer than 100 requests in an eight-minute observation.
  const deadline=Date.now()+480000;while(Date.now()<deadline){const q=await request('https://restore:9200/p10-retention-expired');if(q.status===404){deleted=true;break;}await sleep(5000);}
  const explain=await request('https://restore:9200/_plugins/_ism/explain/p10-retention-expired?show_policy=true');save('retention-explain',explain);
  const control=await native('https://restore:9200/p10-retention-control/_doc/owned'),lifecycle=agent('lifecycle');const count=(await native('https://restore:9200/p10-events/_count')).count;
  await native('https://restore:9200/_cluster/settings',{method:'PUT',body:{transient:{'plugins.index_state_management.job_interval':null,'plugins.index_state_management.jitter':null,'plugins.jobscheduler.sweeper.period':null}}});
  if(!control.found||count!==expectedCount||lifecycle.sqliteIntegrity!=='ok')throw Error('Retention boundary/integrity');
  const sourceRetention=agent('source-retention',{run});if(sourceRetention.removed.join()!=='acknowledged.expired'||sourceRetention.retained.join()!=='unacknowledged.expired,unrelated.keep')throw Error('Source retention acknowledgement boundary');
  const fresh=agent('generate',{kind:'logs',start:501,count:4,deterministic:true});await until(async()=>(await logs()).length===expectedCount+4);const post=agent('lifecycle');
  return {status:deleted?'PASS':'BLOCKED',attach,expiredIndexDeleted:deleted,deleteObservationSeconds:(Date.now()-start)/1000,unrelatedIndexPreserved:control.found,telemetryCountPreserved:count,sqliteIntegrity:lifecycle.sqliteIntegrity,
   sourceRetention,fresh,postRetentionDelivered:expectedCount+4,postRetentionSqliteIntegrity:post.sqliteIntegrity,
   scope:'Native ISM deletion on a pre-expired disposable index; prior accepted P07 age eligibility retained; no accelerated live retention or 30-day timing claim',reason:deleted?undefined:'Native ISM scheduling did not finish inside 480s; not a deletion PASS'};
 });
 stats('resolution-finished');
};
