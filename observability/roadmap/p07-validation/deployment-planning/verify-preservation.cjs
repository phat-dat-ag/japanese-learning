const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
const dir=__dirname+'/evidence/';
const read=f=>JSON.parse(fs.readFileSync(dir+f,'utf8').replace(/^\uFEFF/,''));
const a=read('runtime-assessment.json'),p=read('source-preservation.json');
function run(exe,args){const r=cp.spawnSync(exe,args,{encoding:'utf8',maxBuffer:8*1024*1024});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();}
const git=(...args)=>run('git',['--no-optional-locks',...args]);
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const ids=run('docker',['ps','-aq','--filter','label=com.docker.compose.project=jp_learning_dev']).split(/\s+/).filter(Boolean);
const now=JSON.parse(run('docker',['inspect',...ids]));
const mismatches=[];
for(const old of a.originalContainers){const n=now.find(v=>v.Id===old.id);if(!n){mismatches.push(old.service+': missing original container');continue;}
 const mounts=n.Mounts.map(m=>({type:m.Type,...(m.Name?{name:m.Name}:{}),source:m.Source,destination:m.Destination,rw:m.RW}));
 if(n.State.StartedAt!==old.started||n.RestartCount!==old.restarts||JSON.stringify(mounts.sort((a,b)=>a.destination.localeCompare(b.destination)))!==JSON.stringify([...old.mounts].sort((a,b)=>a.destination.localeCompare(b.destination)))||JSON.stringify(Object.keys(n.NetworkSettings.Networks).sort())!==JSON.stringify([...old.networks].sort()))mismatches.push(old.service+': identity/start/restarts/mount/network changed');
}
const checks={sameContainerCount:now.length===a.originalContainers.length,noRuntimeChanges:mismatches.length===0,head:git('rev-parse','HEAD')===p.head,branch:git('branch','--show-current')===p.branch,remoteReport:hash('observability/roadmap/p07-verification.md')===p.remoteReportSha256,rootLocalFiles:Object.entries(p.trackedLocalHashes).every(([f,h])=>hash(f)===h),quarkusFiles:Object.entries(p.quarkusHashes).every(([f,h])=>hash(f)===h),quarkusHead:git('-C','quarkus','rev-parse','HEAD')===p.quarkusHead,quarkusStatus:git('-C','quarkus','status','--short')===p.quarkusStatus,gitlinks:git('ls-files','--stage').split('\n').filter(v=>v.startsWith('160000 ')).join('\n')===p.gitlinks};
const result={captured_utc:new Date().toISOString(),checks,mismatches,containers:now.map(n=>({id:n.Id,service:n.Config.Labels['com.docker.compose.service'],state:n.State.Status,health:n.State.Health?.Status,started:n.State.StartedAt,restarts:n.RestartCount})),status:git('status','--short'),passed:Object.values(checks).every(Boolean)};
fs.writeFileSync(dir+'final-preservation.json',JSON.stringify(result,null,2)+'\n');
const manifest={created_utc:new Date().toISOString(),files:fs.readdirSync(dir).filter(f=>f.endsWith('.json')&&f!=='manifest.json').map(f=>({path:f,sha256:hash(dir+f)})),report:{path:'../../../p07-runtime-deployment-plan.md',sha256:hash(__dirname+'/../../p07-runtime-deployment-plan.md')}};
fs.writeFileSync(dir+'manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({checks,mismatches,passed:result.passed,containerCount:now.length},null,2));if(!result.passed)process.exitCode=1;
