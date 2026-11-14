'use strict';
// Explicit historical run only; no prefix deletion or broad prune.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const run=process.argv[2];if(!/^jp_obs_validation_\d{14}_[a-f0-9]{8}$/.test(run||''))throw Error('Invalid run');
const evidence=path.join(__dirname,'evidence',run),report=JSON.parse(fs.readFileSync(path.join(evidence,'results.json'))),base=JSON.parse(fs.readFileSync(path.join(evidence,'baseline.json'))),file=path.resolve('.local',run,'compose.json'),bytes=fs.readFileSync(file),model=JSON.parse(bytes);
if(report.run!==run||crypto.createHash('sha256').update(bytes).digest('hex')!==report.modelSha256)throw Error('Manifest mismatch');
function d(a){return cp.execFileSync('docker',a,{encoding:'utf8'}).trim();}
const removed=[];
for(const s of Object.keys(model.services)){
 const ids=d(['ps','-aq','--filter','label=com.docker.compose.project='+run,'--filter','label=jp.p10.run='+run,'--filter','label=com.docker.compose.service='+s]).split(/\s+/).filter(Boolean);
 for(const id of ids){const q=JSON.parse(d(['inspect','--format','{"id":{{json .Id}},"run":{{json (index .Config.Labels "jp.p10.run")}},"project":{{json (index .Config.Labels "com.docker.compose.project")}},"state":{{json .State.Status}}}',id]));if(q.run!==run||q.project!==run||base.inventory.some(c=>c.id===q.id)||q.state!=='created')throw Error('Ownership/state rejected');d(['rm',q.id]);removed.push(q.id);}
}
for(const [kind,names]of [['volume',Object.keys(model.volumes)],['network',Object.keys(model.networks)]])for(const n of names){const name=run+'_'+n;const list=d([kind,'ls','--format',kind==='volume'?'{{.Name}}':'{{.Name}}']).split('\n');if(!list.includes(name))continue;if(d([kind,'inspect','--format','{{index .Labels "jp.p10.run"}}',name])!==run)throw Error('Owner rejected');d([kind,'rm',name]);removed.push(name);}
fs.writeFileSync(path.join(evidence,'partial-create-cleanup.json'),JSON.stringify({run,utc:new Date().toISOString(),removed},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({run,removed:removed.length}));
