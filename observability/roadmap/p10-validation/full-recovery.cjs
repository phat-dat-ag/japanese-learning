'use strict';
// Parent safety supervisor stays responsive while P08 native restore calls block.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),util=require('node:util');
const safety=require('./full-recovery-safety.cjs'),rt=require('../../p08/runtime.cjs'),exec=util.promisify(cp.execFile),M=1048576;
const project='jp_obs_validation_'+new Date().toISOString().replace(/\D/g,'').slice(0,14)+'_'+crypto.randomBytes(4).toString('hex'),stage=path.resolve('.local',project),evidence=path.resolve(__dirname,'evidence',project),receipt='full-recovery-start-'+project.slice(-8)+'.json';
fs.mkdirSync(stage,{recursive:false});fs.mkdirSync(evidence,{recursive:false});
const config={project,stage,evidence,baseline:path.resolve(__dirname,'evidence',receipt),deadline:Date.now()+1200000};
const manifest=path.join(evidence,'ownership.json');fs.writeFileSync(manifest,JSON.stringify(config,null,2),{flag:'wx'});process.env.P10_RECOVERY_MANIFEST=manifest;
const result={phase:'P10',project,utc:new Date().toISOString(),status:'RUNNING',fullRecoveryExecuted:false,samples:[],peaks:{dockerRamBytes:0,hostNodeBytes:0,cpuCores:0,storageBytes:0,hostStagingBytes:0},minimumHostAvailableBytes:null,sampling:'Sequential samples approximately every 3–8 seconds; sampled peaks are not continuous high-water marks. Hard model caps bound between-sample consumption.',cleanup:[]};
let worker,exited=false,code=null,aborted=false,workerOutput='';
const output=path.join(evidence,'results.json');
function save(){fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');}
function fail(message){if(!aborted){aborted=true;result.abort={utc:new Date().toISOString(),reason:message};fs.writeFileSync(path.join(evidence,'abort.json'),JSON.stringify(result.abort));if(worker&&!exited)worker.kill();}throw Error(message);}
async function command(bin,args,timeout=15000){const q=await exec(bin,args,{encoding:'utf8',timeout,maxBuffer:8*1024*1024});return q.stdout.trim();}
function parseBytes(s){const m=s.split('/')[0].trim().match(/^([\d.]+)(B|KiB|MiB|GiB)$/);if(!m)throw Error('Unknown stats unit');return Number(m[1])*({B:1,KiB:1024,MiB:M,GiB:1024*M}[m[2]]);}
async function monitor(){
 const [hostText,statsText]=await Promise.all([
  command('powershell',['-NoProfile','-Command',"Add-Type -AssemblyName Microsoft.VisualBasic; $p10Memory=New-Object Microsoft.VisualBasic.Devices.ComputerInfo; [pscustomobject]@{availableBytes=$p10Memory.AvailablePhysicalMemory;nodeBytes=(@(Get-Process -Id "+[process.pid,worker.pid].join(',')+" -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum)} | ConvertTo-Json"]),
  command('docker',['stats','--no-stream','--format','{{json .}}'])]);
 const host=JSON.parse(hostText),stats=statsText.split('\n').filter(Boolean).map(JSON.parse).filter(s=>s.Name.startsWith(project+'-')||s.Name===project+'-collector');
 const sample={utc:new Date().toISOString(),windowsAvailableBytes:host.availableBytes,nodeBytes:host.nodeBytes||0,dockerRamBytes:stats.reduce((n,s)=>n+parseBytes(s.MemUsage),0),cpuCores:stats.reduce((n,s)=>n+parseFloat(s.CPUPerc)/100,0),hostStagingBytes:safety.bytes(stage)};
 result.minimumHostAvailableBytes=Math.min(result.minimumHostAvailableBytes??Infinity,host.availableBytes);
 try{safety.validateSample({...sample,storageBytes:0},config.deadline);}catch(e){fail(e.message);}
 const modelFile=path.join(stage,'compose.json');
 if(fs.existsSync(modelFile)){
  const ids=(await command('docker',['ps','-q','--filter','label=jp.p10.run='+project,'--filter','label=com.docker.compose.service=agent'])).trim();
  if(ids){const py="import os,json; p='/measure'; vals={n:(os.statvfs(p+'/'+n).f_blocks-os.statvfs(p+'/'+n).f_bfree)*os.statvfs(p+'/'+n).f_frsize for n in os.listdir(p)}; q='/tmp/p10-requests.json'; print(json.dumps({'used':sum(vals.values()),'byVolume':vals,'requests':json.load(open(q))['count'] if os.path.exists(q) else 0}))";
   const measured=JSON.parse(await command('docker',['exec',ids,'python','-B','-c',py]));sample.volumeUsedBytes=measured.used;sample.clientRequests=measured.requests;result.latestVolumeUsage=measured.byVolume;
  }
 }
 sample.storageBytes=(sample.volumeUsedBytes||0)+safety.artifacts();
 try{safety.validateSample(sample,config.deadline);}catch(e){fail(e.message);}
 for(const [key,value]of Object.entries({dockerRamBytes:sample.dockerRamBytes,hostNodeBytes:sample.nodeBytes,cpuCores:sample.cpuCores,storageBytes:sample.storageBytes,hostStagingBytes:sample.hostStagingBytes}))result.peaks[key]=Math.max(result.peaks[key],value);
 result.samples.push(sample);save();
}
async function main(){
 try{
  await command(process.execPath,['--max-old-space-size=512',path.join(__dirname,'full-recovery-preflight.cjs'),'--receipt='+receipt],120000);
  const baseline=JSON.parse(fs.readFileSync(config.baseline));if(!baseline.guardsPass||baseline.before.inventory.length!==52||baseline.before.inventory.some(c=>c.state==='running'&&c.health&&c.health!=='healthy'))throw Error('Fresh complete preflight or service health guard failed');
  result.preflightEvidence=receipt;save();
  worker=cp.spawn(process.execPath,['--max-old-space-size=512',path.join(__dirname,'full-recovery-worker.cjs')],{env:{...process.env},stdio:['ignore','pipe','pipe'],windowsHide:true});
  result.workerPid=worker.pid;worker.stdout.on('data',b=>{workerOutput+=b.toString();});worker.stderr.on('data',b=>{const f=path.join(stage,'worker-error.txt');if(!fs.existsSync(f)||fs.statSync(f).size<262144)fs.appendFileSync(f,b);});worker.once('exit',c=>{exited=true;code=c;});
  while(!exited){await monitor();await new Promise(resolve=>setTimeout(resolve,2000));}
  if(!fs.existsSync(path.join(evidence,'restore.json')))throw Error('Worker exited before native execution; private worker-error.txt retained, exit '+code);
  const restore=JSON.parse(fs.readFileSync(path.join(evidence,'restore.json')));result.fullRecoveryExecuted=true;result.restoreStatus=restore.status;result.recovery=restore.recovery;result.restoreChecks=restore.checks;
  if(code!==0||restore.status!=='PASS')throw Error(restore.error||'Native recovery worker failed');
  result.status='PASS';
 }catch(e){result.status='PARTIAL';result.error=e.message;if(worker&&!exited){try{fail(e.message);}catch{}}}
 finally{
  if(worker&&!exited)await new Promise(resolve=>{worker.once('exit',resolve);setTimeout(resolve,5000);});
  if(fs.existsSync(path.join(evidence,'restore.json'))){const r=JSON.parse(fs.readFileSync(path.join(evidence,'restore.json')));result.fullRecoveryExecuted=(r.resources||[]).length>0;result.restoreStatus=r.status;result.restoreChecks=r.checks;result.recovery=r.recovery||null;}
  // Native counters are captured before stopping the only owned agent.
  try{const agent=rt.docker(['ps','-q','--filter','label=jp.p10.run='+project,'--filter','label=com.docker.compose.service=agent']);if(agent){const text=rt.docker(['exec',agent,'python','-B','-c',"import json,urllib.request; print(json.dumps({'client':json.load(open('/tmp/p10-requests.json')),'sink':json.load(urllib.request.urlopen('http://127.0.0.1:9105/state'))}))"]);result.requests=JSON.parse(text);if(result.requests.client.count+result.requests.sink.incoming+34>1500){result.status='PARTIAL';result.error='Conservative total request budget exceeded';}}}catch{result.requestCaptureIncomplete=true;}
  try{result.cleanup=safety.cleanup();}catch(e){result.cleanupError=e.message;result.status='PARTIAL';}
  save();
  // Reuse the comprehensive baseline checker after exact owned cleanup.
  const finalReceipt='full-recovery-finish-'+project.slice(-8)+'.json';
  try{await command(process.execPath,['--max-old-space-size=512',path.join(__dirname,'full-recovery-preflight.cjs'),'--receipt='+finalReceipt],120000);const final=JSON.parse(fs.readFileSync(path.join(__dirname,'evidence',finalReceipt))),before=JSON.parse(fs.readFileSync(config.baseline));
   result.finalEvidence=finalReceipt;result.preservation={containers:JSON.stringify(before.before.inventory)===JSON.stringify(final.after.inventory),volumes:JSON.stringify(before.before.volumes)===JSON.stringify(final.after.volumes),backups:JSON.stringify(before.before.backups)===JSON.stringify(final.after.backups),schedules:before.before.scheduledTaskXmlSha256===final.after.scheduledTaskXmlSha256,git:before.before.head===final.after.head&&before.before.submodules===final.after.submodules,noDisposableContainers:rt.docker(['ps','-aq','--filter','label=jp.p10.run='+project])===''};
   if(!Object.values(result.preservation).every(Boolean))result.status='PARTIAL';
  }catch(e){result.finalVerificationError=e.message;result.status='PARTIAL';}
  result.finishedUtc=new Date().toISOString();save();console.log(JSON.stringify({project,evidence,status:result.status,error:result.error,abort:result.abort,peaks:result.peaks,recovery:result.recovery,preservation:result.preservation}));
 }
}
main().catch(e=>{result.status='PARTIAL';result.error=e.message;save();console.error(e.message);process.exitCode=1;});
