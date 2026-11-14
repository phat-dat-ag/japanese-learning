'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),r=require('./runtime.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 const run='p09_fixture_'+crypto.randomBytes(6).toString('hex'),dir=path.resolve('.local',run);fs.mkdirSync(dir,{recursive:true});
 const evidence=path.resolve(__dirname,'evidence/isolated.json');
 const report={run,utc:new Date().toISOString(),scope:'Isolated synthetic P09 dashboard/RBAC/persistence/incident workflow; no P10 stress or protected lifecycle',checks:{},resources:[]};
 const password=crypto.randomBytes(24).toString('hex'),viewer=crypto.randomBytes(24).toString('hex');
 const model={services:{},networks:{fixture:{internal:true,labels:{'jp.p09.run':run}},ingress:{labels:{'jp.p09.run':run}}},volumes:{grafana:{labels:{'jp.p09.run':run}}}};
 const save=()=>{const body=JSON.stringify(report,null,2)+'\n';fs.writeFileSync(evidence,body);fs.writeFileSync(path.resolve(__dirname,'evidence',run+'.json'),body);};
 function check(name,pass,actual){report.checks[name]={status:pass?'PASS':'FAIL',actual};save();if(!pass)throw Error(name);}
 const mount=(source,target)=>({type:'bind',source:path.resolve(source),target,read_only:true});
 const image=s=>r.docker(['inspect','--format','{{.Image}}',r.container(s)]);
 const common=s=>({image:image(s),pull_policy:'never',read_only:true,mem_limit:'192m',cpus:0.5,pids_limit:64,cap_drop:['ALL'],security_opt:['no-new-privileges:true'],networks:['fixture'],labels:{'jp.p09.run':run},logging:{driver:'json-file',options:{'max-size':'1m','max-file':'1'}},tmpfs:['/tmp:size=67108864,noexec,nosuid,mode=1777']});
 fs.writeFileSync(dir+'/provider.yml',JSON.stringify({apiVersion:1,providers:[{name:'P09 fixture',disableDeletion:true,allowUiUpdates:false,options:{path:'/dashboards'}}]}));
 fs.writeFileSync(dir+'/datasource.yml',JSON.stringify({apiVersion:1,datasources:[{name:'Fixture Prometheus',uid:'jp-dev-prometheus',type:'prometheus',url:'http://prometheus:9090',access:'proxy',editable:false}]}));
 fs.writeFileSync(dir+'/rules.yml',JSON.stringify({groups:[{name:'p09-fixture',rules:[{alert:'P09SyntheticMeasurementFailure',expr:'p07_telemetry_storage_measurement_error == 1',labels:{severity:'warning',owner:'jp-operations'},annotations:{runbook_url:'observability/roadmap/p09-incident-runbooks.md#telemetry-and-capacity',dashboard_uid:'jp-dev-p09-telemetry'}}]}]}));
 fs.writeFileSync(dir+'/prometheus.yml',JSON.stringify({global:{scrape_interval:'2s',evaluation_interval:'2s'},rule_files:['/rules.yml'],scrape_configs:[{job_name:'p07-storage',static_configs:[{targets:['fixture:8000']}]}],alerting:{alertmanagers:[{static_configs:[{targets:['fixture:8000']}],api_version:'v2'}]}}));
 model.services.fixture={...common('storage-monitor'),entrypoint:['python','-B','/fixture.py'],mem_limit:'64m',volumes:[mount(__dirname+'/fixture.py','/fixture.py')]};
 model.services.prometheus={...common('prometheus'),command:['--config.file=/prometheus.yml','--storage.tsdb.path=/tmp/data','--storage.tsdb.retention.time=10m','--storage.tsdb.retention.size=16MB'],volumes:[mount(dir+'/prometheus.yml','/prometheus.yml'),mount(dir+'/rules.yml','/rules.yml')]};
 model.services.grafana={...common('grafana'),mem_limit:'512m',pids_limit:256,environment:{GOMEMLIMIT:'384MiB',GOMAXPROCS:'2',GF_PLUGINS_PREINSTALL_DISABLED:'true',GF_LOG_MODE:'console',GF_LOG_LEVEL:'warn',GF_SECURITY_ADMIN_USER:'admin',GF_SECURITY_ADMIN_PASSWORD:password,GF_AUTH_ANONYMOUS_ENABLED:'false',GF_USERS_ALLOW_SIGN_UP:'false',GF_ANALYTICS_REPORTING_ENABLED:'false',GF_ANALYTICS_CHECK_FOR_UPDATES:'false',GF_PATHS_LOGS:'/tmp/logs'},ports:['127.0.0.1::3000'],volumes:[{type:'volume',source:'grafana',target:'/var/lib/grafana'},mount(dir+'/provider.yml','/etc/grafana/provisioning/dashboards/p09.yml'),mount(dir+'/datasource.yml','/etc/grafana/provisioning/datasources/p09.yml'),mount('observability/p05-candidate/grafana/dashboards','/dashboards')]};
 model.services.grafana.networks=['fixture','ingress'];
 const file=dir+'/compose.json';fs.writeFileSync(file,JSON.stringify(model),{mode:0o600});
 const compose=(...args)=>r.docker(['compose','-p',run,'-f',file,...args],undefined,90000);
 const id=s=>compose('ps','-aq',s);
 const fixture=(route,body)=>JSON.parse(r.docker(['exec','-i',id('fixture'),'python','-c','import sys,json,urllib.request; x=json.load(sys.stdin); req=urllib.request.Request(x["url"],data=json.dumps(x["body"]).encode() if x["body"] is not None else None,headers={"Content-Type":"application/json"}); print(urllib.request.urlopen(req,timeout=5).read().decode())'],JSON.stringify({url:'http://fixture:8000'+route,body:body??null})));
 async function until(fn,timeout=60000){const end=Date.now()+timeout;while(Date.now()<end){try{if(await fn())return true;}catch{}await sleep(1500);}return false;}
 let base;
 async function api(route,{method='GET',body,role='admin'}={}){const headers={};if(role!=='none')headers.Authorization='Basic '+Buffer.from((role==='viewer'?'p09-viewer:'+viewer:'admin:'+password)).toString('base64');if(body)headers['Content-Type']='application/json';const q=await fetch(base+route,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});let data;try{data=await q.json();}catch{}return {status:q.status,data};}
 try{
  report.before=r.inventory();compose('create');
  for(const service of Object.keys(model.services)){const cid=id(service);check('owner_'+service,r.docker(['inspect','--format','{{index .Config.Labels "jp.p09.run"}}',cid])===run);report.resources.push({service,id:cid,image:model.services[service].image});}
  compose('start');
  let port;
  check('loopback_port',await until(()=>{port=JSON.parse(r.docker(['inspect','--format','{{json .NetworkSettings.Ports}}',id('grafana')]))?.['3000/tcp']?.[0];return port?.HostIp==='127.0.0.1';}));base='http://127.0.0.1:'+port.HostPort;
  check('ready',await until(async()=>(await api('/api/health',{role:'none'})).status===200));
  for(const uid of ['jp-dev-p09-apis','jp-dev-p09-telemetry'])check('provisioned_'+uid,(await api('/api/dashboards/uid/'+uid)).data?.meta.provisioned===true);
  check('datasource',(await api('/api/datasources/uid/jp-dev-prometheus/health')).data?.status==='OK');
  check('create_isolated_viewer',(await api('/api/admin/users',{method:'POST',body:{name:'Synthetic viewer',login:'p09-viewer',password:viewer}})).status===200);
  check('viewer_role',(await api('/api/org/users')).data.some(u=>u.login==='p09-viewer'&&u.role==='Viewer'));
  check('viewer_read',(await api('/api/dashboards/uid/jp-dev-p09-telemetry',{role:'viewer'})).status===200);
  check('viewer_write_denied',[401,403].includes((await api('/api/dashboards/db',{role:'viewer',method:'POST',body:{dashboard:{uid:'p09-denied',title:'Denied fixture',schemaVersion:39,panels:[]}}})).status));
  const adminDenied=(await api('/api/users',{role:'viewer'})).status;
  check('viewer_admin_denied',adminDenied===403,{status:adminDenied});
  check('anonymous_denied',(await api('/api/datasources',{role:'none'})).status===401);
  check('saved_state',(await api('/api/dashboards/db',{method:'POST',body:{dashboard:{uid:'p09-saved-state',title:'P09 synthetic saved state',schemaVersion:39,panels:[]}}})).status===200);
  report.drill={faultUtc:new Date().toISOString()};fixture('/fault',{fault:1});
  check('notification_delivered',await until(()=>fixture('/').firing>0,60000));report.drill.notificationUtc=new Date().toISOString();
  const dashboard=(await api('/api/dashboards/uid/jp-dev-p09-telemetry',{role:'viewer'})).data.dashboard;
  const cause=dashboard.panels.find(p=>p.title==='Storage measurement errors');
  const query=async()=>api('/api/datasources/proxy/uid/jp-dev-prometheus/api/v1/query?query='+encodeURIComponent(cause.targets[0].expr),{role:'viewer'});
  check('dashboard_cause',(await query()).data?.data.result.some(v=>v.metric.store==='tempo'&&v.value[1]==='1'));
  fixture('/fault',{fault:0});check('dashboard_recovery',await until(async()=>(await query()).data?.data.result.some(v=>v.metric.store==='tempo'&&v.value[1]==='0')));report.drill.recoveryUtc=new Date().toISOString();
  check('resolved_notification',await until(()=>fixture('/').resolved>0,60000));
  r.docker(['restart',id('grafana')],undefined,45000);
  const restartedPort=JSON.parse(r.docker(['inspect','--format','{{json .NetworkSettings.Ports}}',id('grafana')]))['3000/tcp'][0];
  check('restart_loopback',restartedPort.HostIp==='127.0.0.1');base='http://127.0.0.1:'+restartedPort.HostPort;
  check('restart_ready',await until(async()=>(await api('/api/health',{role:'none'})).status===200));
  check('restart_saved_state',(await api('/api/dashboards/uid/p09-saved-state')).status===200);
  check('restart_provisioning',(await api('/api/dashboards/uid/jp-dev-p09-telemetry')).data?.meta.provisioned===true);
 }finally{
  report.diagnostics=report.resources.map(v=>({service:v.service,state:r.docker(['inspect','--format','{{.State.Status}}',v.id]),logs:r.docker(['logs','--tail','35',v.id]).replaceAll(password,'[REDACTED]').replaceAll(viewer,'[REDACTED]')}));
  // Cleanup only exact candidate IDs whose run ownership still matches the manifest.
  for(const resource of report.resources){if(r.docker(['inspect','--format','{{index .Config.Labels "jp.p09.run"}}',resource.id])!==run)throw Error('Cleanup owner mismatch');r.docker(['rm','-f',resource.id]);}
  for(const [type,name] of [['volume',run+'_grafana'],['network',run+'_fixture'],['network',run+'_ingress']]){if(r.docker([type,'inspect','--format','{{index .Labels "jp.p09.run"}}',name])!==run)throw Error('Cleanup resource owner mismatch');r.docker([type,'rm',name]);}
  report.after=r.inventory();report.checks.protected_runtime_preserved={status:JSON.stringify(report.before)===JSON.stringify(report.after)?'PASS':'FAIL'};report.finishedUtc=new Date().toISOString();save();
 }
 console.log(JSON.stringify({run,checks:report.checks},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});


