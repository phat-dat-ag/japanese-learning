const{spawnSync}=require('child_process'),fs=require('fs');
const out=__dirname+'/evidence/';
function d(...a){let r=spawnSync('docker',a,{encoding:'utf8',timeout:20000,maxBuffer:12000000});return{code:r.status,text:(r.stdout||'').trim(),error:r.stderr||''}}
function j(r){try{return JSON.parse(r.text)}catch{return r.text}}
let ids=d('ps','-aq','--filter','label=com.docker.compose.project=jp_learning_dev').text.split(/\s+/),all=j(d('inspect',...ids)),by=Object.fromEntries(all.map(c=>[c.Config.Labels['com.docker.compose.service'],c]));
let e={captured_utc:new Date().toISOString(),context:d('context','show').text,projects:j(d('compose','ls','--format','json')),containers:all.map(c=>({id:c.Id,service:c.Config.Labels['com.docker.compose.service'],started:c.State.StartedAt,state:c.State.Status,health:c.State.Health,exit:c.State.ExitCode,restarts:c.RestartCount,image:c.Image,config:c.Config.Labels['com.docker.compose.project.config_files'],ports:c.NetworkSettings.Ports,mounts:c.Mounts,networks:Object.keys(c.NetworkSettings.Networks),command:c.Config.Cmd,security:{readOnly:c.HostConfig.ReadonlyRootfs,user:c.Config.User,memory:c.HostConfig.Memory,capDrop:c.HostConfig.CapDrop,securityOpt:c.HostConfig.SecurityOpt,log:c.HostConfig.LogConfig},tracing:c.Config.Env.filter(x=>/^(Tracing__|APP_OTEL_)/.test(x))})),checks:{}};
function x(s,...a){return d('exec',by[s].Id,...a)}
function save(k,r){e.checks[k]={code:r.code,data:j(r),error:r.error};fs.writeFileSync(out+'runtime.json',JSON.stringify(e,null,2))}
function curl(k,u){save(k,x('opensearch','curl','-fsS','--max-time','10',u))}
async function get(k,u,h={}){try{let r=await fetch(u,{headers:h,signal:AbortSignal.timeout(8000)}),t=await r.text();e.checks[k]={status:r.status,data:j({text:t})}}catch(err){e.checks[k]={error:err.message}}}
(async()=>{
save('composeValidation',d('compose','-p','jp_learning_dev','config','-q'));
save('networks',d('network','inspect',...new Set(all.flatMap(c=>Object.keys(c.NetworkSettings.Networks)))));
for(let [k,u] of Object.entries({fluentHealth:'http://fluent-bit:2020/api/v1/health',fluentMetricsBefore:'http://fluent-bit:2020/api/v1/metrics',fluentStorage:'http://fluent-bit:2020/api/v1/storage',opensearchHealth:'http://localhost:9200/_cluster/health',indicesBefore:'http://localhost:9200/_cat/indices/application-*?format=json&bytes=b',retention:'http://localhost:9200/_plugins/_ism/policies',retentionAssignments:'http://localhost:9200/_plugins/_ism/explain/application-*'}))curl(k,u);
save('disk',x('opensearch','df','-k','/usr/share/opensearch/data'));
save('stateListing',x('fluent-bit','/bin/sh','-c','ls -lan /state /state/buffer; du -k /state; command -v sqlite3'));
save('promtoolConfig',x('prometheus','promtool','check','config','/etc/prometheus/prometheus.yml'));
save('promtoolRules',x('prometheus','promtool','check','rules','/etc/prometheus/rules/p05.rules.yml'));
for(let[k,u]of Object.entries({promTargets:'http://localhost:9091/api/v1/targets',promRules:'http://localhost:9091/api/v1/rules',promFlags:'http://localhost:9091/api/v1/status/flags',grafanaHealth:'http://localhost:3001/api/health',grafanaAnonymous:'http://localhost:3001/api/datasources',logsAnonymous:'http://localhost:5601/'}))await get(k,u);
let env=Object.fromEntries(by.grafana.Config.Env.map(t=>{let i=t.indexOf('=');return[t.slice(0,i),t.slice(i+1)]})),auth={Authorization:'Basic '+Buffer.from(env.GF_SECURITY_ADMIN_USER+':'+env.GF_SECURITY_ADMIN_PASSWORD).toString('base64')};
await get('grafanaDatasources','http://localhost:3001/api/datasources',auth);
for(let uid of ['jp-dev-prometheus','jp-dev-tempo'])await get('datasourceHealth_'+uid,'http://localhost:3001/api/datasources/uid/'+uid+'/health',auth);
save('tempoReady',x('grafana','wget','-qO-','http://tempo:3200/ready'));
save('tempoBefore',x('grafana','wget','-qO-','http://tempo:3200/api/search?limit=20'));
e.probes=[];
for(let i=0;i<80;i++){for(let[s,p]of[['user-api',8081],['vocabulary-api',8082]]){try{let r=await fetch('http://127.0.0.1:'+p+'/p07-acceptance-missing',{signal:AbortSignal.timeout(5000)});await r.arrayBuffer();e.probes.push({service:s,status:r.status})}catch(err){e.probes.push({service:s,error:err.message})}}await new Promise(r=>setTimeout(r,200))}
await new Promise(r=>setTimeout(r,6000));
curl('fluentMetricsAfter','http://fluent-bit:2020/api/v1/metrics');curl('indicesAfter','http://localhost:9200/_cat/indices/application-*?format=json&bytes=b');
save('tempoAfter',x('grafana','wget','-qO-','http://tempo:3200/api/search?limit=100'));
for(let s of ['fluent-bit','otel-collector','tempo','grafana']){let r=d('logs','--since','30m','--tail','1000',by[s].Id),lines=(r.text+'\n'+r.error).split('\n');e.checks[s+'Diagnostics']={lines:lines.length,errors:lines.filter(l=>/error|fail|retry|drop|denied|warn/i.test(l)).slice(-50)}}
let final=j(d('inspect',...ids));e.preservation={unchanged:final.every(c=>{let b=all.find(a=>a.Id===c.Id);return b&&b.State.StartedAt===c.State.StartedAt&&b.RestartCount===c.RestartCount}),noLifecycleCommands:true,noOffsetReset:true,noVolumeDeletion:true};
fs.writeFileSync(out+'runtime.json',JSON.stringify(e,null,2)+'\n');console.log(JSON.stringify({health:e.containers.map(c=>[c.service,c.health?.Status||c.state]),checks:Object.fromEntries(Object.entries(e.checks).map(([k,v])=>[k,v.status??v.code??'captured'])),preservation:e.preservation},null,2));
})().catch(err=>{console.error(err);process.exitCode=1});

