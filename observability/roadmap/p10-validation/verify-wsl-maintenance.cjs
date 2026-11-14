'use strict';
// Read-only verification after the explicitly approved infrastructure interruption.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const rt=require('../../p08/runtime.cjs'),base=path.join(__dirname,'evidence'),out=path.join(base,'wsl-maintenance-verification.json');
if(fs.existsSync(out))throw Error('Preserve previous receipt');
const before=require('./evidence/full-recovery-wsl-before.json'),after=require('./evidence/full-recovery-wsl-after.json'),maintenance=require('./evidence/wsl-maintenance.json');
const report={utc:new Date().toISOString(),fullRecoveryExecuted:false,checks:{},memorySamples:[],restartEffects:[],measurements:{peakStorageBytes:null,peakRamBytes:null,peakCpu:null,rpoSeconds:null,rtoSeconds:null,reason:'No disposable recovery workload executed'}};
function ps(code){const q=cp.spawnSync('powershell',['-NoProfile','-Command',code],{encoding:'utf8',timeout:30000});if(q.status!==0)throw Error('Read-only host measurement failed');return JSON.parse(q.stdout);}
function check(name,pass,actual){report.checks[name]={pass,actual};}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 for(let i=0;i<3;i++){
  report.memorySamples.push(ps("Add-Type -AssemblyName Microsoft.VisualBasic; $p10Host=New-Object Microsoft.VisualBasic.Devices.ComputerInfo; [pscustomobject]@{utc=[datetime]::UtcNow.ToString('o');totalBytes=$p10Host.TotalPhysicalMemory;availableBytes=$p10Host.AvailablePhysicalMemory} | ConvertTo-Json"));
  if(i<2)await pause(15000);
 }
 report.largestHostProcesses=ps("@(Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 10 ProcessName,Id,WorkingSet64) | ConvertTo-Json");
 const a=after.after,b=before.before;
 check('original_container_identities',b.inventory.length===52&&a.inventory.length===52&&b.inventory.every(c=>a.inventory.some(d=>d.id===c.id&&d.name===c.name&&d.image===c.image&&JSON.stringify(d.mounts)===JSON.stringify(c.mounts))));
 check('original_volume_identities',JSON.stringify(b.volumes)===JSON.stringify(a.volumes));
 check('backups_unchanged',JSON.stringify(b.backups)===JSON.stringify(a.backups));
 check('scheduled_task_definitions_unchanged',b.scheduledTaskXmlSha256===a.scheduledTaskXmlSha256);
 check('git_revisions_unchanged',b.head===a.head&&b.submodules===a.submodules);
 check('database_metadata_unchanged',maintenance.databaseMetadataMatch,maintenance.databaseAfter.scope);
 check('services_recovered',b.inventory.every(c=>a.inventory.some(d=>d.id===c.id&&d.state===c.state&&(!c.health||d.health==='healthy'))));
 report.restartEffects=b.inventory.map(c=>{const d=a.inventory.find(x=>x.id===c.id);return {name:c.name,id:c.id,startedBefore:c.started,startedAfter:d?.started,restartsBefore:c.restarts,restartsAfter:d?.restarts,stateBefore:c.state,stateAfter:d?.state};}).filter(c=>c.startedBefore!==c.startedAfter||c.restartsBefore!==c.restartsAfter);
 check('p08_tasks_enabled',ps("@(Get-ScheduledTask -TaskName 'JapaneseLearning-P08-*' | Select-Object @{n='state';e={[string]$_.State}}) | ConvertTo-Json").every(t=>t.state!=='Disabled'));
 const logs=rt.osGet('/application-logs-*/_count');check('existing_logs_accessible',logs.count>0,{count:logs.count});
 const prom=rt.internal('http://prometheus:9090/api/v1/query?query=up');check('existing_metrics_accessible',prom.status==='success'&&prom.data.result.length>0,{series:prom.data?.result?.length});
 const traces=rt.internal('http://tempo:3200/api/search?limit=1');check('existing_trace_storage_accessible',Array.isArray(traces.traces),{traces:traces.traces?.length});
 const dashboards=await rt.grafana('/api/search?type=dash-db');check('existing_dashboards_accessible',dashboards.length>0,{count:dashboards.length});
 check('no_p10_runtime',rt.docker(['ps','-aq','--filter','label=jp.p10.run'])==='');
 report.status='PARTIAL';report.reason='Full recovery requires every resource guard; see fresh final preflight. No settings rollback or second interruption is authorized.';
 fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({out,checks:report.checks,memorySamples:report.memorySamples,restartedContainers:report.restartEffects.length}));
}
main().catch(e=>{report.error=e.message;report.status='PARTIAL';fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.error(e.message);process.exitCode=1;});
