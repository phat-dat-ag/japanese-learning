'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const backup=require('./backup.cjs'),r=require('./runtime.cjs'),{digest}=require('./local-backup.cjs');
const zlib=require('node:zlib');
// Suppress automatic expiry only in disposable validation targets so archived history
// survives native integrity comparisons. Live retention and backup retention stay unchanged.
const VALIDATION_RETENTION={metrics:'10d',traces:'240h'};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(configPath){
  const policy=JSON.parse(fs.readFileSync(configPath));backup.policy(policy);
  if(policy.policy.environment!=='development')throw Error('Development-only drill');
  const lock=path.join(policy.destination,'.p08-local.lock'),fd=fs.openSync(lock,'wx',0o600);
  const project='p08_local_'+crypto.randomBytes(8).toString('hex'),dir=path.resolve(policy.stagingRoot,'drill-'+project),priv=path.join(dir,'private'),recovered=path.join(dir,'recovered');
  fs.mkdirSync(priv,{recursive:true,mode:0o700});
  const report={phase:'P08',runId:project,createdUtc:new Date().toISOString(),scope:'Actual encrypted local development backup; independent disposable runtime on same host, not off-host',checks:{},resources:[]};
  const evidence=path.resolve('observability/roadmap/p08-validation/evidence',project+'.json'),composeFile=path.join(dir,'compose.json');let model;
  function save(){fs.writeFileSync(evidence,JSON.stringify(report,null,2)+'\n');}
  function check(name,pass,actual){report.checks[name]={status:pass?'PASS':'FAIL',actual};save();if(!pass)throw Error(name+' failed');}
  function compose(...args){return r.docker(['compose','-p',project,'-f',composeFile,...args],undefined,120000);}
  function id(service){return compose('ps','-aq',service);}
  function agent(command,input){return JSON.parse(r.docker(['exec',...(input===undefined?[]:['-i']),id('agent'),'python','/agent.py',command],input===undefined?undefined:JSON.stringify(input),90000));}
  function request(url,options={}){return agent('request',{url,...options});}
  function native(url,options={}){const q=request(url,options);if(q.status<200||q.status>=300)throw Error('Isolated native response '+q.status+' from '+url.split('/')[2]);return q.data;}
  function image(service){const ref=r.docker(['inspect','--format','{{.Config.Image}}',r.container(service)]);return r.docker(['image','inspect','--format','{{.Id}}',ref]);}
  async function ready(url){const service=new URL(url).hostname;for(let i=0;i<80;i++){if(model?.services[service]&&r.docker(['inspect','--format','{{.State.Status}}',id(service)])==='exited')throw Error('Isolated '+service+' exited during readiness');try{const q=request(url,{who:'none'});if(q.status<500||(url==='https://restore:9200/'&&q.status===503))return;}catch{}await pause(1500);}throw Error('Readiness timeout: '+url);}
  try{
    report.before=r.inventory();
    const candidates=fs.readdirSync(policy.destination).filter(n=>/^p08-local-[a-f0-9]{32}\.enc$/.test(n)).map(n=>{const file=path.join(policy.destination,n);return {file,manifest:backup.verify(file,policy.keyFile).manifest};}).sort((a,b)=>Date.parse(b.manifest.createdUtc)-Date.parse(a.manifest.createdUtc));
    if(!candidates.length)throw Error('No actual authenticated backup');
    const selected=candidates[0];report.backup={file:selected.file,sha256:r.hash(fs.readFileSync(selected.file)),createdUtc:selected.manifest.createdUtc};
    report.incidentDeclaredUtc=new Date().toISOString();const begin=Date.now();
    backup.restore(selected.file,policy.keyFile,recovered);check('authenticated_manifest_checksums_before_restore',true,{files:selected.manifest.files.length});
    const sources=JSON.parse(fs.readFileSync(path.join(recovered,'recovery/sources.json')));report.sources=sources;
    const ssl='C:/Program Files/Git/usr/bin/openssl.exe';
    function openssl(...args){const q=cp.spawnSync(ssl,args,{cwd:priv,encoding:'utf8'});if(q.status!==0)throw Error('Fresh fixture TLS generation failed');}
    openssl('genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out','ca.key');
    openssl('req','-new','-x509','-key','ca.key','-days','2','-subj','/CN=P08-local-recovery-CA','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign','-out','ca.pem');
    for(const [name,cn,eku,san]of [['node','p08-node','serverAuth,clientAuth','DNS:restore'],['admin','p08-admin','clientAuth','']]){
      openssl('genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out',name+'.key');openssl('req','-new','-key',name+'.key','-subj','/CN='+cn,'-out',name+'.csr');
      fs.writeFileSync(path.join(priv,name+'.ext'),'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage='+eku+'\n'+(san?'subjectAltName='+san+'\n':''));
      openssl('x509','-req','-in',name+'.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-days','1','-extfile',name+'.ext','-out',name+'.pem');
    }
    const credentials=Object.fromEntries(['reader','writer','grafana','sink'].map(k=>[k,'P08-'+crypto.randomBytes(24).toString('hex')+'-Aa1!']));
    fs.writeFileSync(path.join(priv,'credentials.json'),JSON.stringify(credentials),{mode:0o600});fs.writeFileSync(path.join(priv,'sink.token'),credentials.sink,{mode:0o600});
    fs.writeFileSync(path.join(priv,'internal_users.yml'),'_meta:\n  type: internalusers\n  config_version: 2\n');
    const os=['cluster.name: '+project,'node.name: p08-node','network.host: 0.0.0.0','discovery.type: single-node','plugins.security.ssl.transport.pemcert_filepath: p08/node.pem','plugins.security.ssl.transport.pemkey_filepath: p08/node.key','plugins.security.ssl.transport.pemtrustedcas_filepath: p08/ca.pem','plugins.security.ssl.transport.enforce_hostname_verification: true','plugins.security.ssl.http.enabled: true','plugins.security.ssl.http.pemcert_filepath: p08/node.pem','plugins.security.ssl.http.pemkey_filepath: p08/node.key','plugins.security.ssl.http.pemtrustedcas_filepath: p08/ca.pem','plugins.security.ssl.http.clientauth_mode: OPTIONAL','plugins.security.authcz.admin_dn: ["CN=p08-admin"]','plugins.security.nodes_dn: ["CN=p08-node"]','plugins.security.allow_unsafe_democertificates: false','action.destructive_requires_name: true'].join('\n')+'\n';
    fs.writeFileSync(path.join(priv,'opensearch.yml'),os);
    const metricChunks=sources.metrics.chunks||[{file:'series.json',end:Date.parse(sources.metrics.pointUtc)/1000,rangeSeconds:172800}];
    function readSeries(chunk){const bytes=fs.readFileSync(path.join(recovered,'metrics',chunk.file));return JSON.parse(chunk.file.endsWith('.gz')?zlib.gunzipSync(bytes,{maxOutputLength:134217728}):bytes);}
    const samplesFile=path.join(dir,'samples.om'),samplesFd=fs.openSync(samplesFile,'wx',0o600);
    try{for(const chunk of metricChunks)for(const s of readSeries(chunk)){const labels=Object.entries(s.metric).filter(([k])=>k!=='__name__').map(([k,v])=>k+'='+JSON.stringify(v)).join(',');if(!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(s.metric.__name__))throw Error('Unsupported metric name');for(const [stamp,value]of s.values)fs.writeSync(samplesFd,s.metric.__name__+(labels?'{'+labels+'}':'')+' '+value+' '+Number(stamp).toFixed(3)+'\n');}fs.writeSync(samplesFd,'# EOF\n');}finally{fs.closeSync(samplesFd);}
    const restoredConfig=path.join(recovered,'configuration/observability/p07');
    const prom={global:{scrape_interval:'2s',evaluation_interval:'2s'},rule_files:['/restored/prometheus/rules/storage.rules.yml','/restored/prometheus/rules/p05.rules.yml'],scrape_configs:[{job_name:'recovered-sink',static_configs:[{targets:['agent:9105']}]}],alerting:{alertmanagers:[{static_configs:[{targets:['agent:9105']}],api_version:'v2',authorization:{credentials_file:'/private/sink.token'}}]}};
    fs.writeFileSync(path.join(priv,'prometheus.json'),JSON.stringify(prom));
    const tempo='target: all\nmultitenancy_enabled: false\nserver:\n  http_listen_port: 3200\n  log_level: warn\ndistributor:\n  receivers:\n    otlp:\n      protocols:\n        http:\n          endpoint: 0.0.0.0:4318\ningester:\n  max_block_duration: 1m\nstorage:\n  trace:\n    backend: local\n    wal:\n      path: /var/tempo/wal\n    local:\n      path: /var/tempo/blocks\ncompactor:\n  compaction:\n    block_retention: '+VALIDATION_RETENTION.traces+'\nusage_report:\n  reporting_enabled: false\n';fs.writeFileSync(path.join(priv,'tempo.yml'),tempo);report.validationRetention=VALIDATION_RETENTION;
    const bind=(source,target)=>({type:'bind',source,target,read_only:true});
    const common={cap_drop:['ALL'],security_opt:['no-new-privileges:true'],networks:['recovery'],restart:'no',cpus:1,pids_limit:256,labels:{'jp.p08.run':project},logging:{driver:'local',options:{'max-size':'2m','max-file':'2'}}};
    model={services:{},networks:{recovery:{internal:true,labels:{'jp.p08.run':project}}}};
    model.services.restore={...common,image:image('opensearch'),user:'1000:1000',entrypoint:['/usr/share/opensearch/bin/opensearch'],environment:{OPENSEARCH_JAVA_OPTS:'-Xms256m -Xmx256m'},mem_limit:'1g',memswap_limit:'1g',tmpfs:['/usr/share/opensearch/data:uid=1000,gid=1000,size=536870912'],volumes:[bind(priv,'/usr/share/opensearch/config/p08'),bind(path.join(priv,'opensearch.yml'),'/usr/share/opensearch/config/opensearch.yml'),bind(path.join(priv,'internal_users.yml'),'/usr/share/opensearch/config/opensearch-security/internal_users.yml')],ulimits:{nofile:{soft:65536,hard:65536},core:0}};
    model.services.agent={...common,image:image('storage-monitor'),read_only:true,mem_limit:'128m',tmpfs:['/tmp:size=16777216,mode=1777'],environment:{PYTHONDONTWRITEBYTECODE:'1'},entrypoint:['python','/agent.py','serve'],volumes:[bind(priv,'/private'),bind(recovered,'/recovered'),bind(path.resolve('observability/p08/recovery-agent.py'),'/agent.py')]};
    model.services.prometheus={...common,image:image('prometheus'),user:'65534:65534',mem_limit:'1g',memswap_limit:'1g',read_only:true,tmpfs:['/prometheus:uid=65534,gid=65534,size=1073741824','/tmp:mode=1777,size=67108864'],entrypoint:['/bin/sh','-c','/bin/promtool tsdb create-blocks-from openmetrics /samples.om /prometheus && exec /bin/prometheus --config.file=/private/prometheus.json --storage.tsdb.path=/prometheus --storage.tsdb.retention.time='+VALIDATION_RETENTION.metrics+' --log.level=warn'],volumes:[bind(samplesFile,'/samples.om'),bind(priv,'/private'),bind(restoredConfig,'/restored')]};
    model.services.tempo={...common,image:image('tempo'),user:'10001:10001',mem_limit:'512m',read_only:true,tmpfs:['/var/tempo:uid=10001,gid=10001,size=268435456','/tmp:size=16777216'],command:['-config.file=/config.yml'],volumes:[bind(path.join(priv,'tempo.yml'),'/config.yml')]};
    model.services.grafana={...common,image:image('grafana'),user:'472:472',mem_limit:'512m',read_only:true,tmpfs:['/var/lib/grafana:uid=472,gid=472,size=134217728','/tmp:size=67108864,mode=1777'],environment:{GF_SECURITY_ADMIN_USER:'p08-admin',GF_SECURITY_ADMIN_PASSWORD:credentials.grafana,GF_AUTH_ANONYMOUS_ENABLED:'false',GF_ANALYTICS_REPORTING_ENABLED:'false',GF_ANALYTICS_CHECK_FOR_UPDATES:'false',GF_LOG_LEVEL:'warn'},volumes:[bind(path.join(restoredConfig,'grafana/provisioning'),'/etc/grafana/provisioning')]};
    report.images=Object.fromEntries(Object.entries(model.services).map(([s,v])=>[s,v.image]));
    if(r.docker(['ps','-aq','--filter','label=com.docker.compose.project='+project]))throw Error('Project collision');
    fs.writeFileSync(composeFile,JSON.stringify(model,null,2),{mode:0o600});report.modelSha256=r.hash(fs.readFileSync(composeFile));save();
    compose('create','--no-build','--pull','never','restore','agent','prometheus','tempo','grafana');
    for(const s of Object.keys(model.services)){const container=id(s);if(r.docker(['inspect','--format','{{index .Config.Labels "jp.p08.run"}}',container])!==project)throw Error('Ownership mismatch');report.resources.push({service:s,id:container});}
    save();r.docker(['start',id('agent'),id('restore'),id('prometheus'),id('tempo'),id('grafana')]);
    await ready('https://restore:9200/');
    const cert='/usr/share/opensearch/config/p08/';r.docker(['exec','-e','JAVA_OPTS=-Xms16m -Xmx128m -XX:MaxMetaspaceSize=96m',id('restore'),'bash','/usr/share/opensearch/plugins/opensearch-security/tools/securityadmin.sh','-cd','/usr/share/opensearch/config/opensearch-security','-h','restore','-p','9200','-icl','-cacert',cert+'ca.pem','-cert',cert+'admin.pem','-key',cert+'admin.key'],undefined,120000);
    for(const user of ['reader','writer']){
      native('https://restore:9200/_plugins/_security/api/internalusers/'+user,{method:'PUT',body:{password:credentials[user]}});
      native('https://restore:9200/_plugins/_security/api/roles/p08_'+user,{method:'PUT',body:{cluster_permissions:user==='writer'?['indices:data/write/bulk']:[],index_permissions:[{index_patterns:['application-logs-*'],allowed_actions:[user==='reader'?'read':'write']}]}});
      native('https://restore:9200/_plugins/_security/api/rolesmapping/p08_'+user,{method:'PUT',body:{users:[user]}});
    }
    const logResult=agent('load-logs');check('native_log_counts_mapping_settings_digest',logResult.length===sources.logs.indices.length&&logResult.reduce((n,v)=>n+v.count,0)===sources.logs.total,logResult);
    const index=sources.logs.indices.find(v=>v.count>0).name;
    check('reader_query',request('https://restore:9200/'+index+'/_search',{who:'reader',method:'POST',body:{size:0,query:{match_all:{}}}}).status===200);
    for(const [name,route,options,expected]of [['anonymous_denied','/'+index+'/_search',{who:'none'},401],['invalid_denied','/'+index+'/_search',{who:'invalid'},401],['reader_write_denied','/'+index+'/_doc/denied',{who:'reader',method:'PUT',body:{event_name:'denied'}},403],['writer_read_denied','/'+index+'/_search',{who:'writer'},403],['reader_admin_denied','/_plugins/_security/api/roles',{who:'reader'},403]])check(name,request('https://restore:9200'+route,options).status===expected,{expected});
    check('native_offset_integrity',Object.keys(agent('sqlite')).length===3);
    await ready('http://prometheus:9090/-/ready');
    const sortSeries=s=>s.slice().sort((a,b)=>JSON.stringify(Object.entries(a.metric).sort()).localeCompare(JSON.stringify(Object.entries(b.metric).sort())));
    for(let part=0;part<metricChunks.length;part++){const chunk=metricChunks[part],series=readSeries(chunk);const restoredMetrics=native('http://prometheus:9090/api/v1/query?'+new URLSearchParams({query:'{__name__!=""}['+chunk.rangeSeconds+'s]',time:String(chunk.end)}));check('native_metrics_history_'+part,restoredMetrics.status==='success'&&digest(sortSeries(restoredMetrics.data.result))===digest(sortSeries(series)),{series:series.length,samples:chunk.samples||sources.metrics.samples});}
    await ready('http://tempo:3200/ready');
    const ids=sources.traces.ids;
    function otlp(value){if(Array.isArray(value))return value.map(otlp);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,['traceId','spanId','parentSpanId'].includes(k)&&typeof v==='string'&&v&&!/^(?:[a-fA-F0-9]{16}|[a-fA-F0-9]{32})$/.test(v)?Buffer.from(v,'base64').toString('hex'):otlp(v)]));return value;}
    for(const traceId of ids){const trace=JSON.parse(fs.readFileSync(path.join(recovered,'traces',traceId+'.json')));native('http://tempo:4318/v1/traces',{method:'POST',body:otlp({resourceSpans:trace.resourceSpans||trace.batches})});}
    let matched=0;for(let retry=0;retry<25;retry++){matched=0;for(const traceId of ids)if(request('http://tempo:3200/api/traces/'+traceId).status===200)matched++;if(matched===ids.length)break;await pause(1000);}
    check('native_trace_recovery',matched===ids.length,{traces:matched,expected:ids.length});
    await ready('http://grafana:3000/api/health');
    for(const uid of sources.dashboards.uids){const dashboard=JSON.parse(fs.readFileSync(path.join(recovered,'dashboards',uid+'.json')));native('http://grafana:3000/api/dashboards/db',{method:'POST',body:{dashboard,overwrite:false}});const got=native('http://grafana:3000/api/dashboards/uid/'+uid);check('dashboard_'+uid,digest(got.dashboard.panels)===digest(dashboard.panels)&&got.dashboard.title===dashboard.title);}
    check('grafana_anonymous_denied',request('http://grafana:3000/api/datasources',{who:'none'}).status===401);
    for(const uid of ['jp-dev-prometheus','jp-dev-tempo'])check('datasource_'+uid,native('http://grafana:3000/api/datasources/uid/'+uid+'/health').status==='OK');
    // Native Fluent Bit ingestion into restored indices, with fresh scoped credentials and CA.
    const marker='p08-recovered-'+project;
    const collector='[SERVICE]\n    Flush 1\n    Grace 1\n[INPUT]\n    Name dummy\n    Samples 1\n    Dummy '+JSON.stringify({service_name:'p08-recovery',event_name:marker,level:'INFO'})+'\n[OUTPUT]\n    Name opensearch\n    Match *\n    Host restore\n    Port 9200\n    Index '+index+'\n    HTTP_User writer\n    HTTP_Passwd '+credentials.writer+'\n    tls On\n    tls.verify On\n    tls.verify_hostname On\n    tls.ca_file /private/ca.pem\n    Suppress_Type_Name On\n    Generate_ID On\n    Write_Operation index\n    Retry_Limit 1\n';
    fs.writeFileSync(path.join(priv,'collector.conf'),collector,{mode:0o600});
    const collectorId=r.docker(['run','-d','--pull=never','--name',project+'-collector','--label','jp.p08.run='+project,'--label','com.docker.compose.project='+project,'--label','com.docker.compose.service=collector-fixture','--network',project+'_recovery','--read-only','--memory','96m','--cpus','0.25','--pids-limit','32','--cap-drop=ALL','--security-opt','no-new-privileges:true','--mount','type=bind,source='+priv+',target=/private,readonly','--entrypoint','/fluent-bit/bin/fluent-bit',image('fluent-bit'),'-c','/private/collector.conf']);report.resources.push({service:'collector',id:collectorId});save();
    let hits=0;for(let retry=0;retry<20;retry++){hits=native('https://restore:9200/'+index+'/_search',{who:'reader',method:'POST',body:{size:0,query:{term:{event_name:marker}}}}).hits.total.value;if(hits===1)break;await pause(1000);}check('native_collector_ingest_query',hits===1,{hits});
    check('sink_unauthorized_denied',request('http://agent:9105/test',{method:'POST',body:{active:true},who:'none'}).status===401);
    native('http://agent:9105/test',{method:'POST',body:{active:true}});
    let state;for(let retry=0;retry<35;retry++){state=native('http://agent:9105/state');if(state.firing>0)break;await pause(2000);}check('recovered_alert_delivered',state.firing>0,state);
    native('http://agent:9105/test',{method:'POST',body:{active:false}});
    for(let retry=0;retry<35;retry++){state=native('http://agent:9105/state');if(state.resolved>0)break;await pause(2000);}check('recovered_alert_resolved',state.resolved>0,state);
    report.recovery={rpoSeconds:(Date.parse(report.incidentDeclaredUtc)-Date.parse(selected.manifest.newestRecoverableUtc))/1000,rtoSeconds:(Date.now()-begin)/1000,start:report.incidentDeclaredUtc,end:new Date().toISOString(),scope:'Actual local encrypted generation retrieval/decryption; native logs/metrics/traces/offsets/dashboard/datasource/collector and authenticated alert delivery+resolve'};
    check('approved_RPO',report.recovery.rpoSeconds<=policy.policy.rpoSeconds,report.recovery.rpoSeconds);check('approved_RTO',report.recovery.rtoSeconds<=policy.policy.rtoSeconds,report.recovery.rtoSeconds);
    report.after=r.inventory();check('live_runtime_preserved',JSON.stringify(report.before)===JSON.stringify(report.after));report.status='PASS';
  }catch(error){report.status='FAIL';report.error=error.message;process.exitCode=1;}
  finally{
    for(const resource of report.resources.slice().reverse())try{if(r.docker(['inspect','--format','{{index .Config.Labels "jp.p08.run"}}',resource.id])!==project)throw Error('Unowned resource');r.docker(['stop','--time','15',resource.id],undefined,30000);}catch{report.stopNeedsReview=true;}
    report.finishedUtc=new Date().toISOString();save();try{report.stagingCleanup=require('./cleanup-staging.cjs').clean(policy.stagingRoot,'drill-'+project,evidence);}catch(error){report.stagingCleanup={requiresReview:true,error:error.message};}save();fs.closeSync(fd);fs.unlinkSync(lock);console.log(JSON.stringify({status:report.status,evidence,recovery:report.recovery,error:report.error},null,2));
  }
  return report;
}
module.exports={main,VALIDATION_RETENTION};
if(require.main===module)main(process.argv[2]).catch(error=>{console.error(error.message);process.exitCode=1;});
