'use strict';
// Read-only protected inventory; only the explicitly labelled, bounded fixture is mutable.
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),path=require('node:path');
const out=path.join(__dirname,'evidence');fs.mkdirSync(out,{recursive:true});
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function command(bin,args,input){const p=cp.spawnSync(bin,args,{input,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});if(p.status!==0)throw Error(bin+' '+args[0]+' operation failed'+(['inspect','start'].includes(args[0])?': '+p.stderr:''));return p.stdout.trim();}
const docker=(args,input)=>command('docker',args,input);
const json=(args)=>JSON.parse(docker(args));
function inventory(){return docker(['ps','-aq','--no-trunc']).split(/\s+/).filter(Boolean).sort().map(id=>json(['inspect','--format','{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"imageRef":{{json .Config.Image}},"started":{{json .State.StartedAt}},"state":{{json .State.Status}},"health":{{with index .State "Health"}}{{json .Status}}{{else}}null{{end}},"restarts":{{json .RestartCount}},"mounts":{{json .Mounts}},"project":{{json (index .Config.Labels "com.docker.compose.project")}}}',id]));}
function save(name,value){fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(value,null,2)+'\n');}
function guard(m,protectedIds=[]){
 if(!/^jp_obs_validation_[0-9]{14}_[a-f0-9]{8}$/.test(m.project)||m.collision)throw Error('project rejected');
 if(m.owner!=='P10'||m.run!==m.project||protectedIds.includes(m.id)||m.external||m.symlink||m.protectedEndpoint||m.binds||m.network!=='none'||!m.hardBytes||m.hardBytes>8*1024*1024)throw Error('isolation rejected');
 return true;
}
async function main(){
 const baseline={utc:new Date().toISOString(),node:process.version,git:{head:command('git',['rev-parse','HEAD']),branch:command('git',['branch','--show-current']),status:command('git',['status','--short']),submodules:command('git',['submodule','status']),index:command('git',['ls-files','--stage']).split('\n').filter(l=>l.startsWith('160000'))},docker:json(['version','--format','{{json .}}']),inventory:inventory(),volumes:docker(['volume','ls','--format','{{json .}}']).split('\n').filter(Boolean).map(JSON.parse),configHashes:{}};
 for(const file of ['docker-compose.yml','compose.observability.yml','compose.production-observability.yml'])baseline.configHashes[file]=hash(fs.readFileSync(file));
 save('baseline',baseline);
 const r=require('../p09-validation/runtime.cjs');
 const health={utc:new Date().toISOString(),checks:{},errors:[]};
 async function check(name,fn){try{health.checks[name]=await fn();}catch{health.errors.push(name);}}
 await check('targets',()=>r.internal('http://prometheus:9090/api/v1/targets').data.activeTargets.map(t=>({job:t.labels.job,health:t.health,error:!!t.lastError})));
 await check('alerts',()=>r.internal('http://prometheus:9090/api/v1/alerts').data.alerts.map(a=>({name:a.labels.alertname,state:a.state,activeAt:a.activeAt})));
 await check('rules',()=>r.internal('http://prometheus:9090/api/v1/rules').data.groups.map(g=>({name:g.name,healthy:g.rules.every(v=>v.health==='ok')})));
 await check('dashboards',async()=>(await r.grafana('/api/search?type=dash-db')).map(d=>({uid:d.uid,title:d.title})));
 for(const uid of ['jp-dev-prometheus','jp-dev-tempo'])await check(uid,()=>r.grafana('/api/datasources/uid/'+uid+'/health'));
 await check('opensearch',()=>{const q=r.osGet('/_cluster/health');return {status:q.status,nodes:q.number_of_nodes};});
 await check('tempo',()=>r.internal('http://tempo:3200/api/search?limit=1').metrics);
 await check('backup',()=>{const c=JSON.parse(fs.readFileSync('.local/p08-development/config.json'));const b=require('../../p08/backup.cjs');const items=fs.readdirSync(c.destination).filter(n=>/^p08-local-[a-f0-9]{32}\.enc$/.test(n)).map(n=>{const f=path.join(c.destination,n),v=b.verify(f,c.keyFile);return {name:n,createdUtc:v.manifest.createdUtc,sha256:hash(fs.readFileSync(f)),files:v.manifest.files.length};}).sort((a,b)=>Date.parse(b.createdUtc)-Date.parse(a.createdUtc));if(!items.length)throw Error('No valid generation');return {latest:items[0],validGenerations:items.length,ageSeconds:(Date.now()-Date.parse(items[0].createdUtc))/1000};});
 await check('scheduledTasks',()=>JSON.parse(command('powershell',['-NoProfile','-Command',"Get-ScheduledTask -TaskName 'JapaneseLearning-P08-*' | ForEach-Object { $t=$_; $i=Get-ScheduledTaskInfo -TaskName $t.TaskName; [pscustomobject]@{Name=$t.TaskName;State=[string]$t.State;Enabled=$t.Settings.Enabled;StartWhenAvailable=$t.Settings.StartWhenAvailable;Triggers=$t.Triggers;NextRun=$i.NextRunTime;LastResult=$i.LastTaskResult} } | ConvertTo-Json -Depth 5"])));
 save('health',health);
 const project='jp_obs_validation_'+new Date().toISOString().replace(/\D/g,'').slice(0,14)+'_'+crypto.randomBytes(4).toString('hex');
 const manifest={project,owner:'P10',run:project,network:'none',hardBytes:8388608,expiresUtc:new Date(Date.now()+300000).toISOString()};
 const negatives=[{project:''},{project:'jp_learning_dev'},{project:'springboot_project'},{collision:true},{owner:'wrong'},{id:baseline.inventory[0].id},{external:true},{symlink:true},{protectedEndpoint:true},{binds:true},{hardBytes:0},{network:'host'}];
 const guards=negatives.map(change=>{try{guard({...manifest,...change},baseline.inventory.map(c=>c.id));return false;}catch{return true;}});save('guards',{positive:guard(manifest),negativeCases:negatives,passed:guards.filter(Boolean).length,total:guards.length});
 // A tiny fixture is not an approved integrated performance/loss workload.
 const image=baseline.inventory.find(c=>c.imageRef.startsWith('python:3.14-alpine@sha256:'));if(!image)throw Error('Cached Python image missing');
 manifest.image=image.image;save('manifest',manifest);
 let id;
 try{
  id=docker(['create','--name',project,'--label','jp.p10.owner=P10','--label','jp.p10.run='+project,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','64m','--memory-swap','64m','--cpus','0.25','--pids-limit','16','--log-driver','local','--log-opt','max-size=1m','--log-opt','max-file=2','--tmpfs','/fixture:rw,noexec,nosuid,nodev,size=8388608','-i',image.image,'python','-']);manifest.id=id;save('manifest',manifest);
  const raw=docker(['start','-ai',id],fs.readFileSync(path.join(__dirname,'fixture.py'),'utf8'));save('bounded-fixture',JSON.parse(raw));
 }finally{if(id){const owned=json(['inspect','--format','{"id":{{json .Id}},"owner":{{json (index .Config.Labels "jp.p10.owner")}},"run":{{json (index .Config.Labels "jp.p10.run")}}}',id]);if(owned.id!==id||owned.owner!=='P10'||owned.run!==project||baseline.inventory.some(c=>c.id===id))throw Error('Cleanup ownership rejected');docker(['rm',id]);}}
 const after=inventory();save('post-test',{utc:new Date().toISOString(),inventory:after,preserved:JSON.stringify(after)===JSON.stringify(baseline.inventory)});
 if(JSON.stringify(after)!==JSON.stringify(baseline.inventory)||guards.some(v=>!v))throw Error('Preservation/guard failed');
 console.log(JSON.stringify({guardTests:guards.length+1,fixture:'executed',preserved:true,healthErrors:health.errors,integratedAcceptance:'BLOCKED: approved workload/fault budgets not identified; native integration scenarios unexecuted'}));
}
main().catch(e=>{console.error('P10 validation failed: '+e.message);save('failure',{utc:new Date().toISOString(),message:e.message,stack:e.stack});process.exitCode=1;});








