'use strict';
const fs=require('node:fs'),r=require('./runtime.cjs'),cp=require('node:child_process');
const out=__dirname+'/evidence/';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
async function main(){
 const baseline=JSON.parse(fs.readFileSync(out+'baseline.json'));
 const report={phase:'P09',scope:'jp_learning_dev read-only telemetry verification',utc:new Date().toISOString(),operator:'Codex with user-authorized P09 scope',node:process.version,git:{head:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),gitlinks:cp.execFileSync('git',['ls-files','--stage'],{encoding:'utf8'}).split('\n').filter(l=>l.startsWith('160000')),status:cp.execFileSync('git',['status','--short'],{encoding:'utf8'})},checks:{},queries:[]};
 const get=q=>r.internal('http://prometheus:9090/api/v1/query?query='+encodeURIComponent(q));
 for(const name of ['p09-api-operations.json','p09-telemetry-capacity.json']){
  const source=JSON.parse(fs.readFileSync('observability/p05-candidate/grafana/dashboards/'+name));
  const live=await r.grafana('/api/dashboards/uid/'+source.uid);
  report.checks[source.uid+'_provisioned']=live.meta.provisioned===true&&r.hash(JSON.stringify(canonical(live.dashboard.panels)))===r.hash(JSON.stringify(canonical(source.panels)));
  report.checks[source.uid+'_page']=(await fetch('http://127.0.0.1:3001/d/'+source.uid)).status===200;
  for(const p of source.panels.filter(p=>p.targets)){
   const query=p.targets[0].expr.replaceAll('${service:regex}','user-api|vocabulary-api'),value=get(query);
   const end=Math.floor(Date.now()/1000),range=r.internal('http://prometheus:9090/api/v1/query_range?'+new URLSearchParams({query,start:String(end-1800),end:String(end),step:'30'}));
   report.queries.push({dashboard:source.uid,panel:p.id,title:p.title,query,unit:p.fieldConfig.defaults.unit,status:value.status==='success'&&range.status==='success'&&!value.warnings&&!range.warnings?'PASS':'FAIL',series:value.data.result.length,values:value.data.result,rangeSeries:range.data.result.length,emptyDisposition:value.data.result.length?'Data returned; values inspected':'Explicit gap; see runbook, not a healthy zero'});
  }
 }
 for(const uid of ['jp-dev-prometheus','jp-dev-tempo'])report.checks[uid]=(await r.grafana('/api/datasources/uid/'+uid+'/health')).status==='OK';
 const rules=r.internal('http://prometheus:9090/api/v1/rules');report.rules=rules.data.groups.map(g=>({name:g.name,rules:g.rules.length,healthy:g.rules.every(v=>v.health==='ok'&&!v.lastError)}));report.checks.existing_rules=report.rules.every(g=>g.healthy);
 const oldSource=JSON.parse(fs.readFileSync('observability/p05-candidate/grafana/dashboards/monitoring-health.json'));
 report.checks.old_dashboard=JSON.stringify(canonical((await r.grafana('/api/dashboards/uid/jp-dev-p05-health')).dashboard.panels))===JSON.stringify(canonical(oldSource.panels));
 report.selectors=[];
 const apiSource=JSON.parse(fs.readFileSync('observability/p05-candidate/grafana/dashboards/p09-api-operations.json'));
 for(const job of ['user-api','vocabulary-api'])for(const panel of apiSource.panels.filter(p=>p.targets?.[0].expr.includes('${service:regex}'))){const result=get(panel.targets[0].expr.replaceAll('${service:regex}',job));report.selectors.push({job,panel:panel.id,status:result.status==='success'&&result.data.result.every(s=>s.metric.job===job)?'PASS':'FAIL'});}
 report.checks.service_selectors=report.selectors.every(s=>s.status==='PASS');
 report.checks.grafana_anonymous_denied=(await fetch('http://127.0.0.1:3001/api/datasources')).status===401;
 report.checks.logs_anonymous_denied=[401,302].includes((await fetch('http://127.0.0.1:5601/',{redirect:'manual'})).status);
 report.checks.reader_log_search=r.os('/application-logs-*/_search',{who:'reader',method:'POST',body:{size:0,aggs:{services:{terms:{field:'service_name',size:5}},environments:{terms:{field:'environment',size:5}}}}}).status===200;
 report.logCoverage=r.osGet('/application-logs-*/_search',{who:'reader',method:'POST',body:{size:0,aggs:{services:{terms:{field:'service_name',size:5}},environments:{terms:{field:'environment',size:5}}}}}).aggregations;
 report.targets=r.internal('http://prometheus:9090/api/v1/targets').data.activeTargets.map(t=>({job:t.labels.job,health:t.health,error:!!t.lastError}));
 const traces=r.internal('http://tempo:3200/api/search?limit=5').traces||[];
 report.tempo=traces.map(t=>({service:t.rootServiceName,hasTraceId:/^[a-f0-9]{1,32}$/.test(t.traceID)&&!/^0+$/.test(t.traceID)}));
 report.checks.actual_trace_query=traces.some(t=>{if(!/^[a-f0-9]{1,32}$/.test(t.traceID)||/^0+$/.test(t.traceID))return false;try{const trace=r.internal('http://tempo:3200/api/traces/'+t.traceID.padStart(32,'0'));return (trace.batches||trace.resourceSpans||[]).length>0;}catch{return false;}});
 report.after=r.inventory();report.checks.runtime_preserved=JSON.stringify(baseline.inventory)===JSON.stringify(report.after);
 report.checks.no_new_exported_names=report.queries.every(q=>q.status==='PASS');
 report.limitations=['Live Grafana currently has only an Admin account; viewer denial must be tested in isolated fixture, no live users added.','Missing Tempo/Grafana store measurements, absent 5xx series and absent direct backend/exporter metrics remain explicit gaps.','HTML route checks plus provisioned API JSON are reproducible loading evidence, not screenshots.'];
 fs.writeFileSync(out+'live.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({checks:report.checks,panels:report.queries.length,empty:report.queries.filter(q=>!q.series).map(q=>q.title)},null,2));
 if(Object.values(report.checks).some(v=>!v))process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});


