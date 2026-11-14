'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
function docker(args,input,timeout=30000){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout,maxBuffer:96*1024*1024});if(r.status!==0){try{fs.writeFileSync('.local/p08-development/diagnostic-'+crypto.randomBytes(8).toString('hex')+'.txt',(r.stderr||''),{flag:'wx',mode:0o600});}catch{}throw Error('Docker operation failed: '+args.slice(0,4).join(' ')+' (private diagnostics; no credential output)');}return r.stdout.trim();}
function container(service){const id=docker(['ps','-aq','--filter','name=^/jp_learning_dev-'+service+'-1$','--filter','label=com.docker.compose.project=jp_learning_dev','--filter','label=com.docker.compose.service='+service]);if(!/^[a-f0-9]{12,64}$/.test(id))throw Error('Expected one development '+service);return id;}
function inventory(){
  const candidates=docker(['ps','-aq','--filter','label=com.docker.compose.project=jp_learning_dev']).split(/\s+/).filter(Boolean).sort().map(id=>JSON.parse(docker(['inspect','--format','{"id":{{json .Id}},"name":{{json .Name}},"testOwner":{{json (index .Config.Labels "jp.p08.run")}},"service":{{json (index .Config.Labels "com.docker.compose.service")}},"started":{{json .State.StartedAt}},"restarts":{{json .RestartCount}},"state":{{json .State.Status}},"mounts":{{json .Mounts}}}',id])));
  // Compose-built images carry project/service labels into standalone docker run containers.
  // Separately classify only exact name+owner matches for our retained disposable fixtures.
  inventory.excludedFixtures=candidates.filter(c=>/^p08_local_[a-f0-9]{16}$/.test(c.testOwner||'')&&c.name==='/'+c.testOwner+'-collector');
  return candidates.filter(c=>!inventory.excludedFixtures.includes(c)).map(c=>({...c,mounts:c.mounts.sort((a,b)=>a.Destination.localeCompare(b.Destination))}));
}
function env(file){const out={};for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m)out[m[1]]=m[2].replace(/^(["'])(.*)\1$/,'$2');}return out;}
function os(route,{method='GET',body,who='admin'}={}){
  const base='/usr/share/opensearch/config/p07/';let cfg='silent\nshow-error\ncacert = "'+base+'ca.pem"\n';
  if(who==='admin')cfg+='cert = "'+base+'admin.pem"\nkey = "'+base+'admin.key"\n';
  else if(who==='invalid')cfg+='user = "invalid:invalid"\n';
  else if(who!=='none'){const creds=JSON.parse(fs.readFileSync('secrets/p07/credentials.json'));cfg+='user = "p07_'+who+':'+creds[who]+'"\n';}
  const raw=docker(['exec','-i',container('opensearch'),'curl','--config','-','--max-time','30','-w','\n%{http_code}','-X',method,...(body===undefined?[]:['-H','Content-Type: application/json','--data-binary',JSON.stringify(body)]),'https://opensearch:9200'+route],cfg,45000);
  const lines=raw.split('\n'),status=Number(lines.pop());let data;try{data=JSON.parse(lines.join('\n'));}catch{data=null;}return {status,data};
}
function osGet(route,options){const r=os(route,options);if(r.status!==200)throw Error('OpenSearch read failed: '+r.status);return r.data;}
function internal(url){return JSON.parse(docker(['exec',container('grafana'),'wget','-T','10','-qO-',url],undefined,15000));}
async function http(url,options={}){const r=await fetch(url,{...options,signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('HTTP read failed: '+r.status);return r.json();}
async function grafana(route){const e=env('.env');return http('http://127.0.0.1:3001'+route,{headers:{Authorization:'Basic '+Buffer.from(e.GRAFANA_ADMIN_USER+':'+e.GRAFANA_ADMIN_PASSWORD).toString('base64')}});}
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
module.exports={docker,container,inventory,env,os,osGet,internal,http,grafana,hash};
