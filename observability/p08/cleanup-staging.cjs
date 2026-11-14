'use strict';
// Only completed run directories proven by repository evidence. Never backup generations or live paths.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function clean(stagingRoot,runDirectory,evidenceFile){
  const workspace=path.resolve(__dirname,'../..'),expected=path.join(workspace,'.local','p08-development','staging');
  if(path.resolve(stagingRoot)!==expected||fs.realpathSync(stagingRoot)!==expected)throw Error('Unexpected staging root');
  if(!/^(?:[a-f0-9]{32}|drill-p08_local_[a-f0-9]{16}|verification-[a-f0-9]{16})$/.test(runDirectory))throw Error('Invalid run directory');
  const evidence=JSON.parse(fs.readFileSync(evidenceFile));
  const identities=[evidence.runId,evidence.resumedImmutableExport,evidence.id].filter(Boolean);
  if(!identities.some(id=>runDirectory===id||runDirectory==='drill-'+id||runDirectory==='verification-'+id)||!evidence.finishedUtc)throw Error('Run evidence/closure does not own this path');
  const root=path.resolve(expected,runDirectory);
  if(!root.startsWith(expected+path.sep)||fs.lstatSync(root).isSymbolicLink()||fs.realpathSync(root)!==root)throw Error('Staging containment failed');
  const plan=[],directories=[];
  function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name),s=fs.lstatSync(file);if(s.isSymbolicLink())throw Error('Link rejected');if(s.isDirectory()){walk(file);directories.push(file);}else if(s.isFile())plan.push({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});else throw Error('Unexpected filesystem entry');}}
  walk(root);
  for(const item of plan){if(fs.lstatSync(item.file).isSymbolicLink()||crypto.createHash('sha256').update(fs.readFileSync(item.file)).digest('hex')!==item.sha256)throw Error('Changed staging file');fs.unlinkSync(item.file);}
  for(const dir of directories)fs.rmdirSync(dir);fs.rmdirSync(root);
  return {directory:runDirectory,temporaryFilesRemoved:plan.length,evidence:path.relative(workspace,evidenceFile),liveOrBackupFilesDeleted:0};
}
module.exports={clean};
