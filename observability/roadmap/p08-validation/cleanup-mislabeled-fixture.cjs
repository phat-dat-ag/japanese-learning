const fs=require('node:fs'),r=require('../../p08/runtime.cjs');
const file='observability/roadmap/p08-validation/evidence/preservation-investigation.json',audit=JSON.parse(fs.readFileSync(file));
const target=audit.actualDrillFalsePositive.ownCollector;
const current=JSON.parse(r.docker(['inspect','--format','{"id":{{json .Id}},"name":{{json .Name}},"state":{{json .State.Status}},"owner":{{json (index .Config.Labels "jp.p08.run")}},"mounts":{{json .Mounts}}}',target.id]));
if(current.id!==target.id||current.name!==target.name||current.owner!==target.testOwner||current.state!=='exited'||current.mounts.some(m=>m.Type!=='bind'||m.RW))throw Error('Fixture cleanup guard failed');
const result={createdUtc:new Date().toISOString(),reason:'Remove stopped, manifest-owned disposable collector whose inherited image labels falsely classify it as root runtime; retain complete investigation/evidence',target:current,volumesRemoved:0,sourceContainersModified:0};
r.docker(['container','rm',current.id]);result.removed=true;
fs.writeFileSync('observability/roadmap/p08-validation/evidence/mislabeled-fixture-cleanup.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({removed:true,id:current.id,volumesRemoved:0}));
