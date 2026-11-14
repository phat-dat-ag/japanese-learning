const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const backup=require('../../p08/backup.cjs'),{retention}=require('../../p08/local-backup.cjs');
function setup(){const dir=path.resolve('.local','p08-retention-'+crypto.randomBytes(8).toString('hex'));fs.mkdirSync(dir,{recursive:true});const key=path.join(dir,'test.key');fs.writeFileSync(key,crypto.randomBytes(32));return{dir,key};}
function generation(dir,key,when,owner='japanese-learning-P08'){
  const name='p08-local-'+crypto.randomBytes(16).toString('hex')+'.enc',root=path.join(dir,crypto.randomBytes(8).toString('hex'));fs.mkdirSync(root);
  fs.writeFileSync(path.join(root,'ownership.json'),JSON.stringify({owner,project:'jp_learning_dev',generation:name}));
  const RealDate=Date;global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[when]));}static now(){return when;}};
  try{backup.create({artifacts:[{id:'recovery',type:'opensearch-logical',root,consistency:'immutable-native-export',classification:'reviewed-telemetry'}],newestRecoverableUtc:new Date(when).toISOString()},key,path.join(dir,name));}finally{global.Date=RealDate;}
  return name;
}
test('development exception is explicit and never off-host approval',()=>{
  const fields={owner:'test',dataClasses:['synthetic'],offHostDestinationEvidence:'local only',keyCustody:'test',retentionDays:7,maxDestinationBytes:1000000,backupIntervalHours:24,rpoSeconds:86400,rtoSeconds:14400,drillIntervalDays:30,approvalReference:'test',approved:true,offHostApproved:false,environment:'development',offHostException:{approved:true,approvalReference:'explicit test'}};
  assert.doesNotThrow(()=>backup.policy({policy:fields}));assert.throws(()=>backup.policy({policy:{...fields,environment:'production'}}));assert.throws(()=>backup.policy({policy:{...fields,offHostException:{approved:false}}}));
});
test('seven-day retention deletes only authenticated owned expired generations; preserves newest/unrelated/unknown',()=>{
  const {dir,key}=setup(),now=Date.now(),old=generation(dir,key,now-10*86400000),recent=generation(dir,key,now-86400000),unknown=generation(dir,key,now-12*86400000,'unrelated-owner');
  fs.writeFileSync(path.join(dir,'unrelated.enc'),'unrelated');fs.writeFileSync(path.join(dir,'p08-legacy.enc'),'historical');
  const dry=retention(dir,key,7,now,false);assert.deepEqual(dry.deleted,[old]);assert.ok(fs.existsSync(path.join(dir,old)));
  const result=retention(dir,key,7,now);assert.deepEqual(result.deleted,[old]);for(const n of [recent,unknown,'unrelated.enc','p08-legacy.enc'])assert.ok(fs.existsSync(path.join(dir,n)));assert.equal(fs.existsSync(path.join(dir,old)),false);
});
test('even if all expire, newest valid generation survives',()=>{const {dir,key}=setup(),now=Date.now(),a=generation(dir,key,now-20*86400000),b=generation(dir,key,now-10*86400000);retention(dir,key,7,now);assert.equal(fs.existsSync(path.join(dir,a)),false);assert.ok(fs.existsSync(path.join(dir,b)));});
test('corrupt matching file or wrong credentials prevents every deletion',()=>{const {dir,key}=setup(),now=Date.now(),old=generation(dir,key,now-10*86400000);generation(dir,key,now-86400000);const corrupt='p08-local-'+'f'.repeat(32)+'.enc';fs.writeFileSync(path.join(dir,corrupt),'corrupt');assert.throws(()=>retention(dir,key,7,now));assert.ok(fs.existsSync(path.join(dir,old)));const other=path.join(dir,'wrong.key');fs.writeFileSync(other,crypto.randomBytes(32));assert.throws(()=>retention(dir,other,7,now));});
test('reviewed committed privacy code allowed; JSON credentials still rejected',()=>{
  const {dir,key}=setup(),root=path.join(dir,'native');fs.mkdirSync(root);fs.writeFileSync(path.join(root,'source'),'safe synthetic');
  const spec={newestRecoverableUtc:new Date().toISOString(),artifacts:[{id:'logs',type:'opensearch-logical',root,consistency:'immutable-native-export',classification:'reviewed-telemetry'}],configFiles:['observability/p07/fluent-bit/normalize.lua']};
  const output=path.join(dir,'valid.enc');backup.create(spec,key,output);assert.ok(backup.verify(output,key).entries.length===2);
  fs.writeFileSync(path.join(root,'source'),JSON.stringify({password:'synthetic-secret'}));assert.throws(()=>backup.create(spec,key,path.join(dir,'denied.enc')));
});
test('staging cleanup requires exact contained path and completed ownership evidence',()=>{
  const {clean}=require('../../p08/cleanup-staging.cjs'),id=crypto.randomBytes(16).toString('hex'),root=path.resolve('.local/p08-development/staging'),dir=path.join(root,id);
  fs.mkdirSync(root,{recursive:true});fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'synthetic.txt'),'temporary synthetic data');
  const evidence=path.resolve('.local','p08-cleanup-test-'+id+'.json');fs.writeFileSync(evidence,JSON.stringify({runId:id,finishedUtc:new Date().toISOString()}));
  assert.throws(()=>clean(path.resolve('.local'),id,evidence));assert.throws(()=>clean(root,'../escape',evidence));
  const wrong=path.resolve('.local','p08-cleanup-wrong-'+id+'.json');fs.writeFileSync(wrong,JSON.stringify({runId:'other',finishedUtc:new Date().toISOString()}));assert.throws(()=>clean(root,id,wrong));assert.ok(fs.existsSync(dir));
  const result=clean(root,id,evidence);assert.equal(result.temporaryFilesRemoved,1);assert.equal(fs.existsSync(dir),false);
});
