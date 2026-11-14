const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const b = require('../../p08/backup.cjs');
const root = path.resolve('.local','p08-unit-'+crypto.randomBytes(8).toString('hex'));
fs.mkdirSync(root,{recursive:true});
const key = path.join(root,'test.key'), wrong = path.join(root,'wrong.key'), native = path.join(root,'native');
fs.writeFileSync(key,crypto.randomBytes(32)); fs.writeFileSync(wrong,crypto.randomBytes(32)); fs.mkdirSync(native);
fs.writeFileSync(path.join(native,'index-0'),'synthetic native artifact only');
const spec = {artifacts:[{id:'logs',type:'opensearch-snapshot',root:native,consistency:'immutable-native-export',classification:'reviewed-telemetry'}],newestRecoverableUtc:new Date().toISOString(),configFiles:['observability/p07/prometheus/rules/storage.rules.yml']};
const enc = path.join(root,'backup.enc');
b.create(spec,key,enc);
test('authenticated roundtrip, manifest inventory and configuration',()=>{
  const data = b.verify(enc,key); assert.equal(data.manifest.inventory[0].files,1); assert.equal(data.entries.length,2);
  const output = path.join(root,'restored'); b.restore(enc,key,output);
  assert.equal(fs.readFileSync(path.join(output,'logs/index-0'),'utf8'),'synthetic native artifact only');
  assert.throws(()=>b.restore(enc,key,output));
});
test('no overwrite of existing encrypted generation',()=>assert.throws(()=>b.create(spec,key,enc)));
test('wrong key denied and no plaintext destination created',()=>{
  const output = path.join(root,'denied'); assert.throws(()=>b.restore(enc,wrong,output)); assert.equal(fs.existsSync(output),false);
});
test('missing backup rejected',()=>assert.throws(()=>b.verify(path.join(root,'missing'),key)));
test('every envelope region is authenticated',()=>{
  for (const offset of [0,8,20,36,fs.statSync(enc).size-1]) {
    const data = fs.readFileSync(enc); data[offset]^=1; const file = path.join(root,'corrupt-'+offset); fs.writeFileSync(file,data);
    assert.throws(()=>b.verify(file,key));
  }
});
test('truncation rejected',()=>{
  const file = path.join(root,'incomplete'); fs.writeFileSync(file,fs.readFileSync(enc).subarray(0,60)); assert.throws(()=>b.verify(file,key));
});
// Re-seal malformed plaintext to exercise manifest validation independently of GCM corruption.
function malformed(change) {
  const data = b.verify(enc,key); change(data);
  const iv = crypto.randomBytes(12), magic = Buffer.from('JP08GCM1'), c = crypto.createCipheriv('aes-256-gcm',fs.readFileSync(key),iv); c.setAAD(magic);
  const payload = Buffer.concat([c.update(JSON.stringify(data)),c.final()]); const file = path.join(root,crypto.randomBytes(8).toString('hex')+'.enc');
  fs.writeFileSync(file,Buffer.concat([magic,iv,c.getAuthTag(),payload])); return file;
}
test('missing entry, mismatched checksum, duplicate, inventory and path traversal rejected',()=>{
  for (const change of [d=>d.entries.pop(),d=>d.entries[0].sha256='0'.repeat(64),d=>d.entries.push(d.entries[0]),d=>d.entries[0].name='../escape',d=>d.manifest.inventory[0].files++,d=>d.manifest.inventory=[]]) assert.throws(()=>b.verify(malformed(change),key));
});
test('pending policy fails closed before destination or key use',()=>assert.throws(()=>b.run('observability/p08/policy.example.json'),/Pending policy/));
test('reject unreviewed data, oversized exports, empty exports and forbidden configuration',()=>{
  assert.throws(()=>b.create({...spec,maxBytes:1},key,path.join(root,'oversized')));
  assert.throws(()=>b.create({...spec,artifacts:[{...spec.artifacts[0],classification:'business-data'}]},key,path.join(root,'business')));
  assert.throws(()=>b.create({...spec,configFiles:['secrets/private/signing.key']},key,path.join(root,'secret')));
  const empty = path.join(root,'empty'); fs.mkdirSync(empty);
  assert.throws(()=>b.create({...spec,artifacts:[{...spec.artifacts[0],root:empty}]},key,path.join(root,'empty.enc')));
});
test('secret payload rejected',()=>{
  const dir = path.join(root,'secret-payload'); fs.mkdirSync(dir); fs.writeFileSync(path.join(dir,'index-0'),'-----BEGIN PRIVATE KEY-----');
  assert.throws(()=>b.create({...spec,artifacts:[{...spec.artifacts[0],root:dir}]},key,path.join(root,'leak.enc')));
});
test('unattended runner: due, not due, lock collision, retention report and budget refusal',()=>{
  const destination = path.join(root,'destination'); fs.mkdirSync(destination);
  const config = {policy:{approved:true,offHostApproved:true,owner:'SYNTHETIC TEST ONLY',dataClasses:['synthetic'],offHostDestinationEvidence:'MOCK ONLY; no off-host acceptance',keyCustody:'test',retentionDays:1,maxDestinationBytes:1048576,backupIntervalHours:1,rpoSeconds:3600,rtoSeconds:3600,drillIntervalDays:1,approvalReference:'TEST ONLY'},destination,keyFile:key,package:{...spec,maxBytes:10000}};
  const file = path.join(root,'config.json'); fs.writeFileSync(file,JSON.stringify(config));
  assert.equal(b.run(file).status,'CREATED'); assert.equal(b.run(file).status,'NOT_DUE');
  const lock = path.join(destination,'.p08.lock'); fs.writeFileSync(lock,'test'); assert.throws(()=>b.run(file)); fs.unlinkSync(lock);
  config.policy.backupIntervalHours=0.00000001; config.policy.retentionDays=0.00000001; config.policy.maxDestinationBytes=1; fs.writeFileSync(file,JSON.stringify(config));
  assert.throws(()=>b.run(file),/budget/);
  config.policy.maxDestinationBytes=1048576; fs.writeFileSync(file,JSON.stringify(config)); const result=b.run(file);
  assert.equal(result.status,'CREATED'); assert.ok(result.expiredDeletionCandidates.length); assert.equal(fs.readdirSync(destination).filter(f=>f.endsWith('.enc')).length,2);
  config.package.newestRecoverableUtc='2000-01-01T00:00:00Z'; fs.writeFileSync(file,JSON.stringify(config)); assert.throws(()=>b.run(file),/RPO/);
});
