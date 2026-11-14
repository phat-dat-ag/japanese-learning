'use strict';
// Fresh synthetic OpenSearch nodes only. All faults are package copies, never live stores.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const backup=require('../../p08/backup.cjs');
const project='p08_drill_'+crypto.randomBytes(8).toString('hex');
const dir=path.resolve('.local',project),priv=path.join(dir,'private'),configFile=path.join(dir,'compose.json');
const report={phase:'P08',runId:project,createdUtc:new Date().toISOString(),scope:'Same-host synthetic recovery; NOT off-host or phase acceptance',checks:{},resources:[],cleanup:'Stop manifest-owned containers only; retain files; no volume deletion'};
const evidence=path.resolve('observability/roadmap/p08-validation/evidence',project+'.json');
let config;
function save(){fs.writeFileSync(evidence,JSON.stringify(report,null,2)+'\n');}
function run(exe,args,input,timeout=30000){const r=cp.spawnSync(exe,args,{input,encoding:'utf8',timeout,maxBuffer:8*1024*1024});if(r.status!==0){if(fs.existsSync(priv))fs.writeFileSync(path.join(priv,'diagnostic-'+crypto.randomBytes(4).toString('hex')+'.txt'),(r.stderr||'')+(r.stdout||''),{mode:0o600});throw Error(exe+' operation failed ('+args[0]+'); diagnostics retained locally, no secret output');}return r.stdout.trim();}
const docker=(a,input,t)=>run('docker',a,input,t);
function compose(...args){return docker(['compose','-p',project,'-f',configFile,...args],undefined,120000);}
function check(name,pass,actual){report.checks[name]={status:pass?'PASS':'FAIL',actual};save();if(!pass)throw Error(name+' failed');}
function live(){const ids=docker(['ps','-aq','--filter','label=com.docker.compose.project=jp_learning_dev']).split(/\s+/).filter(Boolean);if(!ids.length)throw Error('Live inventory unavailable');return ids.map(id=>JSON.parse(docker(['inspect','--format','{{json .Id}}',id]))).sort().map(id=>JSON.parse(docker(['inspect','--format','{"id":{{json .Id}},"started":{{json .State.StartedAt}},"restarts":{{json .RestartCount}},"mounts":{{json .Mounts}},"networks":{{json .NetworkSettings.Networks}}}',id])));}
function id(s){return compose('ps','-aq',s);}
function api(s,route,{method='GET',body,who='admin'}={}){
  const cert='/usr/share/opensearch/config/p08/';
  let cfg='silent\nshow-error\ncacert = "'+cert+'ca.pem"\n';
  if(who==='admin')cfg+='cert = "'+cert+'admin.pem"\nkey = "'+cert+'admin.key"\n';
  else if(who==='reader'||who==='writer')cfg+='user = "'+who+':'+JSON.parse(fs.readFileSync(path.join(priv,'credentials.json')))[who]+'"\n';
  else if(who==='invalid')cfg+='user = "invalid:invalid"\n';
  const out=docker(['exec','-i',id(s),'curl','--config','-','--max-time','12','-w','\n%{http_code}','-X',method,...(body===undefined?[]:['-H','Content-Type: application/json','--data-binary',JSON.stringify(body)]),'https://'+s+':9200'+route],cfg);
  const lines=out.split('\n'),status=Number(lines.pop());let data;try{data=JSON.parse(lines.join('\n'));}catch{data=null;}return {status,data};
}
function expect(s,name,route,opt={},statuses=[200]){const q=api(s,route,opt);check(name,statuses.includes(q.status),{http:q.status});return q.data;}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function prepare(){
  report.tools={node:process.version,docker:docker(['version','--format','{{.Client.Version}}']),compose:docker(['compose','version','--short'])};
  report.candidateSources=Object.fromEntries(['observability/p08/backup.cjs','observability/roadmap/p08-validation/drill.cjs'].map(f=>[f,backup.sha(fs.readFileSync(f))]));
  report.liveBefore=live();report.git={head:run('git',['rev-parse','HEAD']),branch:run('git',['branch','--show-current']),status:run('git',['status','--short']),gitlinks:run('git',['ls-files','--stage']).split('\n').filter(l=>l.startsWith('160000 '))};
  fs.mkdirSync(priv,{recursive:true,mode:0o700});fs.mkdirSync(path.join(dir,'snapshots'));
  const ssl='C:/Program Files/Git/usr/bin/openssl.exe';
  function openssl(...a){const r=cp.spawnSync(ssl,a,{cwd:priv,encoding:'utf8'});if(r.status!==0)throw Error('Fixture certificate generation failed');}
  openssl('genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out','ca.key');
  openssl('req','-new','-x509','-key','ca.key','-days','2','-subj','/CN=P08-synthetic-CA','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign','-out','ca.pem');
  for(const [name,cn,eku,san] of [['node','p08-node','serverAuth,clientAuth','DNS:source,DNS:restore'],['admin','p08-admin','clientAuth','']]){
    openssl('genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out',name+'.key');
    openssl('req','-new','-key',name+'.key','-subj','/CN='+cn,'-out',name+'.csr');
    fs.writeFileSync(path.join(priv,name+'.ext'),'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage='+eku+'\n'+(san?'subjectAltName='+san+'\n':''));
    openssl('x509','-req','-in',name+'.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-days','1','-extfile',name+'.ext','-out',name+'.pem');
  }
  fs.writeFileSync(path.join(priv,'credentials.json'),JSON.stringify({reader:'P08-'+crypto.randomBytes(24).toString('hex')+'-Aa1!',writer:'P08-'+crypto.randomBytes(24).toString('hex')+'-Aa1!'}),{mode:0o600});
  fs.writeFileSync(path.join(priv,'internal_users.yml'),'_meta:\n  type: internalusers\n  config_version: 2\n');
  fs.writeFileSync(path.join(priv,'opensearch.yml'),['cluster.name: '+project,'node.name: p08-node','network.host: 0.0.0.0','discovery.type: single-node','path.repo: [/snapshots]','plugins.security.ssl.transport.pemcert_filepath: p08/node.pem','plugins.security.ssl.transport.pemkey_filepath: p08/node.key','plugins.security.ssl.transport.pemtrustedcas_filepath: p08/ca.pem','plugins.security.ssl.transport.enforce_hostname_verification: true','plugins.security.ssl.http.enabled: true','plugins.security.ssl.http.pemcert_filepath: p08/node.pem','plugins.security.ssl.http.pemkey_filepath: p08/node.key','plugins.security.ssl.http.pemtrustedcas_filepath: p08/ca.pem','plugins.security.ssl.http.clientauth_mode: OPTIONAL','plugins.security.authcz.admin_dn: ["CN=p08-admin"]','plugins.security.nodes_dn: ["CN=p08-node"]','plugins.security.allow_unsafe_democertificates: false','action.destructive_requires_name: true'].join('\n')+'\n');
  const source=docker(['ps','-q','--filter','label=com.docker.compose.project=jp_learning_dev','--filter','label=com.docker.compose.service=opensearch']);
  const reference=docker(['inspect','--format','{{.Config.Image}}',source]);
  const image=docker(['image','inspect','--format','{{.Id}}',reference]);report.image=image;report.imageSelection='Immutable cached image manifest for installed service reference; no pull/build';
  if(docker(['ps','-aq','--filter','label=com.docker.compose.project='+project]))throw Error('Project collision');
  config={services:{},networks:{drill:{internal:true,labels:{'jp.p08.run':project}}}};
  for(const s of ['source','restore'])config.services[s]={image,user:'1000:1000',entrypoint:['/usr/share/opensearch/bin/opensearch'],environment:{OPENSEARCH_JAVA_OPTS:'-Xms256m -Xmx256m'},mem_limit:'1g',memswap_limit:'1g',cpus:1,pids_limit:256,restart:'no',cap_drop:['ALL'],security_opt:['no-new-privileges:true'],networks:['drill'],labels:{'jp.p08.run':project},logging:{driver:'local',options:{'max-size':'1m','max-file':'2'}},ulimits:{nofile:{soft:65536,hard:65536},core:0},tmpfs:['/usr/share/opensearch/data:uid=1000,gid=1000,size=536870912'],volumes:[{type:'bind',source:path.join(dir,s==='source'?'snapshots':'unsealed/logs'),target:'/snapshots',read_only:s==='restore'},{type:'bind',source:priv,target:'/usr/share/opensearch/config/p08',read_only:true},{type:'bind',source:path.join(priv,'opensearch.yml'),target:'/usr/share/opensearch/config/opensearch.yml',read_only:true},{type:'bind',source:path.join(priv,'internal_users.yml'),target:'/usr/share/opensearch/config/opensearch-security/internal_users.yml',read_only:true}]};
  fs.writeFileSync(configFile,JSON.stringify(config,null,2));report.composeSha256=backup.sha(fs.readFileSync(configFile));report.localDirectory=dir;save();
}
async function start(s){
  const existing=id(s);
  if(existing){if(docker(['inspect','--format','{{index .Config.Labels "jp.p08.run"}}',existing])!==project)throw Error('Unowned start target');docker(['start',existing]);}
  else compose('up','-d','--no-deps','--no-build','--pull','never',s);
  const container=id(s);report.resources.push({id:container,service:s,image:docker(['inspect','--format','{{.Image}}',container])});save();
  let ready=false;for(let i=0;i<75;i++){
    try{if([200,401,503].includes(api(s,'/',{who:'none'}).status)){ready=true;break;}}catch{}
    if(docker(['inspect','--format','{{.State.Status}}',container])==='exited')throw Error('Fixture exited');await pause(2000);
  }
  if(!ready)throw Error('Fixture startup timeout');
  const cert='/usr/share/opensearch/config/p08/';
  docker(['exec','-e','JAVA_OPTS=-Xms16m -Xmx128m -XX:MaxMetaspaceSize=96m',container,'bash','/usr/share/opensearch/plugins/opensearch-security/tools/securityadmin.sh','-cd','/usr/share/opensearch/config/opensearch-security','-h',s,'-p','9200','-icl','-cacert',cert+'ca.pem','-cert',cert+'admin.pem','-key',cert+'admin.key'],undefined,120000);
  expect(s,s+'_ready','/_cluster/health?wait_for_status=yellow&timeout=10s');
  const credentials=JSON.parse(fs.readFileSync(path.join(priv,'credentials.json')));
  for(const user of ['writer','reader']){
    expect(s,s+'_'+user+'_user','/_plugins/_security/api/internalusers/'+user,{method:'PUT',body:{password:credentials[user]}},[200,201]);
    expect(s,s+'_'+user+'_role','/_plugins/_security/api/roles/p08_'+user,{method:'PUT',body:{cluster_permissions:user==='writer'?['indices:data/write/bulk']:[],index_permissions:[{index_patterns:['p08-records'],allowed_actions:[user==='reader'?'read':'write']}] }},[200,201]);
    expect(s,s+'_'+user+'_map','/_plugins/_security/api/rolesmapping/p08_'+user,{method:'PUT',body:{users:[user]}},[200,201]);
  }
}
function stop(s){const container=id(s);if(docker(['inspect','--format','{{index .Config.Labels "jp.p08.run"}}',container])!==project)throw Error('Unowned container');docker(['stop','--time','20',container],undefined,40000);}
function digest(s){const q=expect(s,s+'_search','/p08-records/_search?size=100');const docs=q.hits.hits.map(h=>({id:h._id,source:h._source})).sort((a,b)=>a.id.localeCompare(b.id));return {count:docs.length,sha256:backup.sha(Buffer.from(JSON.stringify(docs)))};}
async function main(){
  prepare();console.log('P08 isolated fixture '+project);await start('source');
  const mappings={dynamic:'strict',properties:{event:{type:'keyword'},sequence:{type:'integer'},timestamp:{type:'date'}}};
  expect('source','create_index','/p08-records',{method:'PUT',body:{settings:{number_of_shards:1,number_of_replicas:0},mappings}});
  const newest=new Date().toISOString();
  for(let i=0;i<12;i++)expect('source','synthetic_'+i,'/p08-records/_doc/event-'+i+'?refresh=true',{method:'PUT',who:'writer',body:{event:'p08-synthetic-only',sequence:i,timestamp:newest}},[201]);
  report.baseline=digest('source');
  expect('source','snapshot_repo','/_snapshot/p08',{method:'PUT',body:{type:'fs',settings:{location:'/snapshots',compress:true}}});
  const snap=expect('source','native_snapshot','/_snapshot/p08/baseline?wait_for_completion=true',{method:'PUT',body:{indices:'p08-records',include_global_state:false}});
  check('native_snapshot_success',snap.snapshot?.state==='SUCCESS',{state:snap.snapshot?.state});
  const key=path.join(priv,'backup.key');fs.writeFileSync(key,crypto.randomBytes(32),{mode:0o600});
  const enc=path.join(dir,'generation.enc');
  const packed=backup.create({newestRecoverableUtc:newest,maxBytes:16777216,artifacts:[{id:'logs',type:'opensearch-snapshot',root:path.join(dir,'snapshots'),classification:'reviewed-telemetry',consistency:'immutable-native-export'}],configFiles:['observability/p07/prometheus/rules/storage.rules.yml','observability/p07/prometheus/storage.tests.json']},key,enc);
  report.encrypted={sha256:packed.encryptedSha256,bytes:packed.bytes,files:packed.manifest.files.length};
  report.incidentDeclaredUtc=new Date().toISOString();const begin=Date.now();
  backup.restore(enc,key,path.join(dir,'unsealed'));check('authenticated_package_restore',true,{nativeFiles:packed.manifest.inventory[0].files});
  // Keep the image available through creation of both nodes; no concurrent repository writes.
  compose('create','--no-build','--pull','never','restore');stop('source');
  // Source node is stopped. Restore mounts only newly decrypted bytes and its own bounded tmpfs.
  await start('restore');
  expect('restore','readonly_repository','/_snapshot/p08',{method:'PUT',body:{type:'fs',settings:{location:'/snapshots',readonly:true}}});
  const restored=expect('restore','native_restore','/_snapshot/p08/baseline/_restore?wait_for_completion=true',{method:'POST',body:{indices:'p08-records',include_global_state:false}});
  check('native_shard_integrity',restored.snapshot?.shards?.failed===0,restored.snapshot?.shards);
  expect('restore','index_green','/_cluster/health/p08-records?wait_for_status=green&timeout=15s');
  report.restored=digest('restore');check('document_integrity',report.restored.count===12&&report.restored.sha256===report.baseline.sha256,report.restored);
  const map=expect('restore','mapping_query','/p08-records/_mapping');check('mapping_restored',JSON.stringify(map['p08-records'].mappings)===JSON.stringify(mappings),map['p08-records'].mappings);
  const settings=expect('restore','settings_query','/p08-records/_settings')['p08-records'].settings.index;check('settings_restored',settings.number_of_shards==='1'&&settings.number_of_replicas==='0',{shards:settings.number_of_shards,replicas:settings.number_of_replicas});
  expect('restore','reader_query','/p08-records/_search',{who:'reader'});
  expect('restore','anonymous_denied','/p08-records/_search',{who:'none'},[401]);
  expect('restore','invalid_credentials_denied','/p08-records/_search',{who:'invalid'},[401]);
  expect('restore','reader_write_denied','/p08-records/_doc/forbidden',{who:'reader',method:'PUT',body:{event:'forbidden'}},[403]);
  expect('restore','writer_read_denied','/p08-records/_search',{who:'writer'},[403]);
  expect('restore','reader_admin_denied','/_plugins/_security/api/roles',{who:'reader'},[403]);
  expect('restore','writer_out_of_scope_denied','/not-approved/_doc/forbidden',{who:'writer',method:'PUT',body:{event:'forbidden'}},[403]);
  expect('restore','post_restore_ingest','/p08-records/_doc/recovered?refresh=true',{who:'writer',method:'PUT',body:{event:'p08-after-recovery',sequence:12,timestamp:new Date().toISOString()}},[201]);
  const query=expect('restore','representative_query','/p08-records/_search',{who:'reader',method:'POST',body:{query:{term:{event:'p08-after-recovery'}}}});check('ingest_query',query.hits.total.value===1,{hits:query.hits.total.value});
  const prom=docker(['ps','-q','--filter','label=com.docker.compose.project=jp_learning_dev','--filter','label=com.docker.compose.service=prometheus']);
  const image=docker(['images','--no-trunc','--filter','reference=prom/prometheus','--format','{{.ID}}']).split('\n')[0];if(!/^sha256:[a-f0-9]{64}$/.test(image))throw Error('Cached Prometheus image not available');report.prometheusImage=image;
  const rules=path.join(dir,'unsealed/configuration/observability/p07/prometheus');
  const result=docker(['run','--pull=never','--name',project+'-rules','--label','jp.p08.run='+project,'--network','none','--read-only','--tmpfs','/tmp:size=67108864,mode=1777','--cap-drop=ALL','--security-opt','no-new-privileges:true','--memory','128m','--cpus','0.5','--pids-limit','32','--mount','type=bind,source='+rules+',target=/etc/prometheus,readonly','--entrypoint','/bin/promtool',image,'test','rules','/etc/prometheus/storage.tests.json'],undefined,30000);
  check('restored_alert_rule_evaluation',/SUCCESS/.test(result),{output:result});
  report.localCandidateRecovery={rpoSeconds:(Date.parse(report.incidentDeclaredUtc)-Date.parse(newest))/1000,rtoSeconds:(Date.now()-begin)/1000,start:report.incidentDeclaredUtc,end:new Date().toISOString(),scope:'Snapshot event to local declaration; full decrypt/native startup/auth/query/ingest plus rule evaluation. Excludes off-host transfer, restored Grafana/metrics/traces and notification delivery. NOT authoritative full-service RTO.'};
  stop('restore');report.liveAfter=live();check('live_resources_unchanged',JSON.stringify(report.liveBefore)===JSON.stringify(report.liveAfter),{containers:report.liveAfter.length});
  report.status='PARTIAL';report.phaseAcceptance='BLOCKED_PENDING_POLICY_AND_OFF_HOST_FULL_STACK_DRILL';report.finishedUtc=new Date().toISOString();save();console.log(JSON.stringify({evidence,checks:Object.keys(report.checks).length,measured:report.localCandidateRecovery,status:report.status},null,2));
}
main().catch(e=>{report.error=e.message;report.status='FAIL';try{if(config)for(const s of ['source','restore'])if(id(s))stop(s);}catch{report.stopRequiresReview=true;}try{report.liveAfter=live();report.livePreserved=JSON.stringify(report.liveBefore)===JSON.stringify(report.liveAfter);}catch{}save();console.error(e.message);process.exitCode=1;});
