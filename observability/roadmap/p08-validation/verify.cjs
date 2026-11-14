// Reproducible automated evidence. Never invokes the policy-gated job on real telemetry.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {sha}=require('../../p08/backup.cjs');
const runId='p08_automated_'+crypto.randomBytes(8).toString('hex');
const report={phase:'P08',runId,createdUtc:new Date().toISOString(),node:process.version,checks:{},scope:'Bounded synthetic package and offline SQLite checks, not off-host recovery'};
function run(exe,args){const r=cp.spawnSync(exe,args,{encoding:'utf8',timeout:90000,maxBuffer:1024*1024});return {code:r.status,output:(r.stdout||'')+(r.stderr||'')};}
const git=(...a)=>{const r=run('git',a);if(r.code!==0)throw Error('Git check failed');return r.output.trim();};
report.baseline={head:git('rev-parse','HEAD'),branch:git('branch','--show-current'),gitlinks:git('ls-files','--stage').split('\n').filter(l=>l.startsWith('160000 '))};
report.checks.packages=run(process.execPath,['--test','observability/roadmap/p08-validation/test-backup.cjs']);
const image=run('docker',['images','--no-trunc','--filter','reference=python','--format','{{.ID}}']).output.trim().split('\n')[0];
if(!/^sha256:[a-f0-9]{64}$/.test(image))throw Error('Cached Python image unavailable; no pull permitted');
report.pythonImage=image;
report.checks.sqlite=run('docker',['run','--pull=never','--name',runId,'--label','jp.p08.run='+runId,'--network','none','--read-only','--tmpfs','/tmp:size=16777216,mode=1777','--cap-drop=ALL','--security-opt','no-new-privileges:true','--memory','64m','--cpus','0.5','--pids-limit','32','--env','PYTHONDONTWRITEBYTECODE=1','--mount','type=bind,source='+path.resolve('observability')+',target=/work/observability,readonly','--workdir','/work',image,'python','observability/roadmap/p08-validation/test-sqlite.py']);
report.checks.diff=run('git',['diff','--check']);
const sourceFiles=['observability/p08/backup.cjs','observability/p08/native-sqlite.py','observability/p08/Invoke-P08Backup.ps1','observability/p08/policy.example.json','observability/roadmap/p08-validation/test-backup.cjs','observability/roadmap/p08-validation/test-sqlite.py','observability/roadmap/p08-validation/drill.cjs','observability/roadmap/p08-validation/verify.cjs'];
report.sourceHashes=Object.fromEntries(sourceFiles.map(f=>[f,sha(fs.readFileSync(f))]));
report.protectedTrackedFilesUnchanged=git('diff','--name-only','HEAD','--','docker-compose.yml','scripts','observability/p07','observability/roadmap/p07*','angular','dotnet','quarkus','springboot-jwks-api')==='';
report.gitlinksUnchanged=JSON.stringify(report.baseline.gitlinks)===JSON.stringify(git('ls-files','--stage').split('\n').filter(l=>l.startsWith('160000 ')));
report.passed=Object.values(report.checks).every(c=>c.code===0)&&report.protectedTrackedFilesUnchanged&&report.gitlinksUnchanged;
report.finishedUtc=new Date().toISOString();
const output='observability/roadmap/p08-validation/evidence/'+runId+'.json';fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:report.passed,evidence:output,checks:Object.fromEntries(Object.entries(report.checks).map(([k,v])=>[k,v.code]))},null,2));if(!report.passed)process.exitCode=1;
