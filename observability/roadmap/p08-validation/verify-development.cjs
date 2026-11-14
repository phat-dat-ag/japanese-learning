'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const backup=require('../../p08/backup.cjs'),r=require('../../p08/runtime.cjs');
const c=JSON.parse(fs.readFileSync(process.argv[2])),id=crypto.randomBytes(8).toString('hex');
const report={phase:'P08',id,createdUtc:new Date().toISOString(),checks:{},developmentOnly:true,offHost:false};
const dir=path.resolve(c.stagingRoot,'verification-'+id);fs.mkdirSync(dir,{recursive:true});
const names=fs.readdirSync(c.destination).filter(n=>/^p08-local-[a-f0-9]{32}\.enc$/.test(n));
const all=names.map(name=>({name,manifest:backup.verify(path.join(c.destination,name),c.keyFile).manifest})).sort((a,b)=>Date.parse(b.manifest.createdUtc)-Date.parse(a.manifest.createdUtc));
if(!all.length)throw Error('No actual backup');
const input=path.join(c.destination,all[0].name),bytes=fs.readFileSync(input),wrong=path.join(dir,'wrong.key');fs.writeFileSync(wrong,crypto.randomBytes(32));
function rejects(name,call,target){let rejected=false;try{call();}catch{rejected=true;}report.checks[name]=rejected&&(!target||!fs.existsSync(target));}
report.actual={file:input,sha256:r.hash(bytes),bytes:bytes.length,files:all[0].manifest.files.length,recoverableUtc:all[0].manifest.newestRecoverableUtc};
report.checks.authentication_manifest_checksums=true;
rejects('wrong_key_denied_before_plaintext',()=>backup.restore(input,wrong,path.join(dir,'wrong-output')),path.join(dir,'wrong-output'));
rejects('missing_denied_before_plaintext',()=>backup.restore(path.join(dir,'missing.enc'),c.keyFile,path.join(dir,'missing-output')),path.join(dir,'missing-output'));
for(const [name,copy]of [['corrupt',Buffer.from(bytes)],['incomplete',bytes.subarray(0,bytes.length-32)]]){
  if(name==='corrupt')copy[Math.floor(copy.length/2)]^=1;
  const file=path.join(dir,name+'.enc'),target=path.join(dir,name+'-output');fs.writeFileSync(file,copy,{flag:'wx'});rejects(name+'_denied_before_plaintext',()=>backup.restore(file,c.keyFile,target),target);fs.unlinkSync(file);
}
const tests=cp.spawnSync(process.execPath,['--test','observability/roadmap/p08-validation/test-backup.cjs','observability/roadmap/p08-validation/test-local.cjs'],{encoding:'utf8',timeout:30000});
report.automated={code:tests.status,output:tests.stdout+tests.stderr};report.checks.unit_retention_tests=tests.status===0;
const script="$tasks=Get-ScheduledTask -TaskName 'JapaneseLearning-P08-*'; @($tasks | ForEach-Object { $i=Get-ScheduledTaskInfo -TaskName $_.TaskName; [pscustomobject]@{name=$_.TaskName;state=[string]$_.State;lastResult=$i.LastTaskResult;lastRun=$i.LastRunTime.ToString('o');nextRun=$i.NextRunTime.ToString('o');xml=(Export-ScheduledTask -TaskName $_.TaskName)} }) | ConvertTo-Json -Depth 5";
const ps=cp.spawnSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8',timeout:30000});if(ps.status!==0)throw Error('Task verification failed');report.tasks=JSON.parse(ps.stdout);
const daily=report.tasks.find(t=>t.name==='JapaneseLearning-P08-Daily'),monthly=report.tasks.find(t=>t.name==='JapaneseLearning-P08-MonthlyRecovery');
report.checks.daily_scheduled=!!daily&&daily.xml.includes('<DaysInterval>1</DaysInterval>')&&daily.xml.includes('<StartWhenAvailable>true</StartWhenAvailable>')&&daily.xml.includes('Invoke-P08Local.ps1');
report.checks.monthly_scheduled=!!monthly&&monthly.xml.includes('<ScheduleByMonth>')&&monthly.xml.includes('<Day>1</Day>');
report.policy=c.policy;report.policy.owner='Current approved Windows development account (see task principal)';
report.keyAcl=cp.spawnSync('icacls.exe',[c.keyFile],{encoding:'utf8'}).stdout;
report.sourceHashes=Object.fromEntries(['backup.cjs','runtime.cjs','local-backup.cjs','local-drill.cjs','recovery-agent.py','Configure-P08Development.ps1','Invoke-P08Local.ps1'].map(name=>[name,r.hash(fs.readFileSync('observability/p08/'+name))]));
report.passed=Object.values(report.checks).every(Boolean);report.finishedUtc=new Date().toISOString();
const evidence='observability/roadmap/p08-validation/evidence/development-verification-'+id+'.json';fs.writeFileSync(evidence,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:report.passed,evidence,checks:report.checks},null,2));if(!report.passed)process.exitCode=1;
