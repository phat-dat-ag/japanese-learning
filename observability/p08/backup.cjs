'use strict';
// Bounded, authenticated, create-only packages. Native exporters remain store-specific.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const MAGIC = Buffer.from('JP08GCM1');
const MAX = 64 * 1024 * 1024; // Candidate memory ceiling; larger stores need a reviewed streaming backend.
const TYPES = new Set(['opensearch-snapshot', 'opensearch-logical', 'prometheus-snapshot', 'prometheus-series', 'grafana-sqlite', 'grafana-dashboards', 'tempo-blocks', 'tempo-otlp', 'fluentbit-sqlite', 'configuration']);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function fail(message) { throw new Error(message); }
function regular(file) {
  const s = fs.lstatSync(file);
  if (!s.isFile() || s.isSymbolicLink()) fail('Expected regular file');
  return s;
}
function key(file) {
  regular(file);
  const b = fs.readFileSync(file);
  if (b.length !== 32) fail('Key must contain exactly 32 random bytes');
  return b;
}
function safeName(name) {
  if (typeof name !== 'string' || !/^[a-zA-Z0-9_.\/-]+$/.test(name) || name.includes('..') || name.includes('//') || name.startsWith('/') || name.includes(':')) fail('Unsafe artifact path');
  if (/(^|\/)(secrets?|private|\.git|\.env)(\/|$)|\.(pem|key|pfx|p12|jks)$/i.test(name)) fail('Secret path forbidden');
  return name;
}
function scan(b,name) {
  // Reviewed public privacy code contains literal password= detector examples and authorization=true.
  // Exempt only these exact committed code bytes, never changed code, data or credential values.
  if(name==='configuration/observability/p07/fluent-bit/normalize.lua' && sha(b)==='ca433583f7f54fab49b7d6c659b5cc796a00c297d676d74d6ce4494b574dbd57')return;
  const text=b.toString('utf8');
  if (/-----BEGIN .*PRIVATE KEY-----|(?:password|passwd|client_secret|api_key|authorization)["']?\s*[=:]\s*["']?[^\s$<{][^\s]*|Bearer\s+[a-zA-Z0-9._-]+/i.test(text)) fail('Potential secret payload; review source, never bypass automatically');
}
function files(root) {
  if (fs.lstatSync(root).isSymbolicLink()) fail('Links forbidden');
  root = fs.realpathSync(root);
  const result = [];
  function walk(dir) {
    for (const e of fs.readdirSync(dir, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const p = path.join(dir,e.name);
      if (e.isSymbolicLink() || (fs.lstatSync(p).mode & 0o170000) === 0o120000) fail('Links forbidden');
      if (e.isDirectory()) walk(p);
      else { regular(p); result.push({name:safeName(path.relative(root,p).split(path.sep).join('/')), path:p}); }
    }
  }
  walk(root);
  return result;
}
function create({artifacts, configFiles = [], newestRecoverableUtc, maxBytes = MAX}, keyFile, output) {
  if (!Array.isArray(artifacts) || !artifacts.length || !Number.isFinite(Date.parse(newestRecoverableUtc)) || Date.parse(newestRecoverableUtc) > Date.now()) fail('Artifacts and valid recoverable timestamp required');
  if (!(maxBytes > 0 && maxBytes <= MAX)) fail('Candidate budget exceeds 64 MiB');
  const entries = []; let bytes = 0;
  function add(name, buffer, type) {
    safeName(name); bytes += buffer.length;
    if (bytes > maxBytes) fail('Backup exceeds configured budget');
    scan(buffer,name);
    entries.push({name,type,bytes:buffer.length,sha256:sha(buffer),data:buffer.toString('base64')});
  }
  const inventory = [];
  for (const a of artifacts) {
    if (!/^[a-z][a-z0-9-]{0,40}$/.test(a.id) || !TYPES.has(a.type) || a.type === 'configuration' || a.consistency !== 'immutable-native-export' || a.classification !== 'reviewed-telemetry') fail('Unreviewed artifact or native consistency missing');
    const input = files(a.root);
    if (!input.length) fail('Empty native export');
    inventory.push({id:a.id,type:a.type,files:input.length,nativeValidation:'REQUIRED_ON_RESTORE'});
    for (const f of input) {
      if (fs.statSync(f.path).size > maxBytes - bytes) fail('Backup exceeds configured budget');
      add(a.id+'/'+f.name,fs.readFileSync(f.path),a.type);
    }
  }
  // Configuration comes only from reviewed tracked Git blobs, never working .env or secret mounts.
  const repo = path.resolve(__dirname,'../..');
  for (const name of configFiles) {
    safeName(name);
    if (!/^observability\/(p07|p06|p05-candidate|grafana)\/.*\.(yml|yaml|json|lua|conf)$/.test(name)) fail('Configuration outside allowlist');
    const r = cp.spawnSync('git',['show','HEAD:'+name],{cwd:repo,maxBuffer:MAX});
    if (r.status !== 0) fail('Tracked configuration unavailable');
    add('configuration/'+name,r.stdout,'configuration');
  }
  if (new Set(entries.map(e=>e.name)).size !== entries.length) fail('Duplicate artifact path');
  const manifest = {version:1,createdUtc:new Date().toISOString(),newestRecoverableUtc,inventory,files:entries.map(({data,...e})=>e)};
  const plaintext = Buffer.from(JSON.stringify({manifest,entries}));
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm',key(keyFile),iv);
  cipher.setAAD(MAGIC);
  const ciphertext = Buffer.concat([cipher.update(plaintext),cipher.final()]);
  fs.writeFileSync(output,Buffer.concat([MAGIC,iv,cipher.getAuthTag(),ciphertext]),{flag:'wx',mode:0o600});
  return {manifest,encryptedSha256:sha(fs.readFileSync(output)),bytes:fs.statSync(output).size};
}
function verify(input,keyFile) {
  if (regular(input).size > MAX * 2) fail('Encrypted package too large');
  const b = fs.readFileSync(input);
  if (b.length < 37 || !b.subarray(0,8).equals(MAGIC)) fail('Invalid envelope');
  const decipher = crypto.createDecipheriv('aes-256-gcm',key(keyFile),b.subarray(8,20));
  decipher.setAAD(MAGIC); decipher.setAuthTag(b.subarray(20,36));
  const data = JSON.parse(Buffer.concat([decipher.update(b.subarray(36)),decipher.final()]));
  if (data.manifest?.version !== 1 || !Array.isArray(data.entries) || !data.entries.length || !Array.isArray(data.manifest.files) || !Array.isArray(data.manifest.inventory) || !data.manifest.inventory.length || !Number.isFinite(Date.parse(data.manifest.createdUtc)) || !Number.isFinite(Date.parse(data.manifest.newestRecoverableUtc)) || Date.parse(data.manifest.newestRecoverableUtc) > Date.parse(data.manifest.createdUtc)) fail('Invalid manifest');
  const seen = new Set(); let bytes = 0;
  for (const e of data.entries) {
    safeName(e.name);
    if (seen.has(e.name) || !TYPES.has(e.type) || typeof e.data !== 'string') fail('Duplicate or invalid entry');
    seen.add(e.name);
    const content = Buffer.from(e.data,'base64'); bytes += content.length;
    if (bytes > MAX || content.toString('base64') !== e.data || content.length !== e.bytes || sha(content) !== e.sha256) fail('Content integrity failure');
    scan(content,e.name);
  }
  if (JSON.stringify(data.entries.map(({data,...e})=>e)) !== JSON.stringify(data.manifest.files)) fail('Manifest completeness failure');
  const ids = new Set();
  for (const a of data.manifest.inventory) {
    if (!/^[a-z][a-z0-9-]{0,40}$/.test(a.id) || ids.has(a.id) || !TYPES.has(a.type) || a.type === 'configuration') fail('Invalid native inventory');
    ids.add(a.id);
    const entries = data.entries.filter(e=>e.name.startsWith(a.id+'/'));
    if (!entries.length || entries.length !== a.files || entries.some(e=>e.type !== a.type)) fail('Native inventory incomplete');
  }
  if (data.entries.some(e=>e.type === 'configuration' ? !e.name.startsWith('configuration/observability/') : !ids.has(e.name.split('/')[0]))) fail('Unlisted artifact');
  return data;
}
function restore(input,keyFile,destination) {
  const data = verify(input,keyFile); // authenticate and validate everything before writing any plaintext
  fs.mkdirSync(destination,{recursive:false,mode:0o700}); // existing destinations ALWAYS rejected
  for (const e of data.entries) {
    const p = path.join(destination,...e.name.split('/'));
    fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});
    fs.writeFileSync(p,Buffer.from(e.data,'base64'),{flag:'wx',mode:0o600});
  }
  fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify(data.manifest,null,2),{flag:'wx',mode:0o600});
  return data.manifest;
}
function policy(c) {
  for (const field of ['owner','dataClasses','offHostDestinationEvidence','keyCustody','retentionDays','maxDestinationBytes','backupIntervalHours','rpoSeconds','rtoSeconds','drillIntervalDays','approvalReference']) {
    if (!c.policy?.[field] || (Array.isArray(c.policy[field]) && !c.policy[field].length)) fail('Pending policy: '+field);
  }
  const localException=c.policy.environment==='development' && c.policy.offHostException?.approved===true && c.policy.offHostException?.approvalReference;
  if (c.policy.approved !== true || (c.policy.offHostApproved !== true && !localException)) fail('Policy/off-host approval required');
  for (const k of ['retentionDays','maxDestinationBytes','backupIntervalHours','rpoSeconds','rtoSeconds','drillIntervalDays']) if (!(Number.isFinite(c.policy[k]) && c.policy[k] > 0)) fail('Invalid policy budget');
}
function run(configFile) {
  const c = JSON.parse(fs.readFileSync(configFile,'utf8')); policy(c);
  if (!Number.isFinite(Date.parse(c.package?.newestRecoverableUtc)) || Date.now()-Date.parse(c.package.newestRecoverableUtc) > c.policy.rpoSeconds*1000) fail('Export timestamp missing or outside approved RPO; refresh native exports');
  const directory = fs.realpathSync(c.destination);
  if (!fs.statSync(directory).isDirectory()) fail('Destination directory required');
  // Exclusive job lock: stale locks fail closed for operator review; never remove another runner's lock.
  const lock = path.join(directory,'.p08.lock'); const fd = fs.openSync(lock,'wx',0o600);
  try {
    const generations = fs.readdirSync(directory).filter(f=>/^p08-[a-f0-9]{32}\.enc$/.test(f));
    let latest = 0, used = 0; const expired = [];
    for (const f of generations) {
      const full = path.join(directory,f); regular(full); used += fs.statSync(full).size;
      const m = verify(full,c.keyFile).manifest; const t = Date.parse(m.createdUtc);
      latest = Math.max(latest,t);
      if (Date.now()-t > c.policy.retentionDays*86400000) expired.push(f);
    }
    if (Date.now()-latest < c.policy.backupIntervalHours*3600000) return {status:'NOT_DUE',expiredDeletionCandidates:expired};
    const reserve = (c.package.maxBytes || MAX) * 2;
    if (used + reserve > c.policy.maxDestinationBytes) fail('Destination budget exhausted; no automatic deletion');
    const output = path.join(directory,'p08-'+crypto.randomBytes(16).toString('hex')+'.enc');
    const result = create(c.package,c.keyFile,output);
    verify(output,c.keyFile);
    return {status:'CREATED',output,sha256:result.encryptedSha256,expiredDeletionCandidates:expired,nativeRecovery:'NOT VERIFIED'};
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
module.exports = {create,verify,restore,run,policy,sha,validatePayload:scan};
if (require.main === module) {
  try {
    const [command,...args] = process.argv.slice(2);
    let result;
    if (command === 'run' && args.length === 1) result = run(args[0]);
    else if (command === 'verify' && args.length === 2) result = verify(...args).manifest;
    else if (command === 'restore' && args.length === 3) result = restore(...args);
    else fail('Usage: backup.cjs run CONFIG | verify PACKAGE KEYFILE | restore PACKAGE KEYFILE NEW_DIRECTORY');
    console.log(JSON.stringify(result,null,2));
  } catch { console.error('P08 operation failed; check policy, custody, integrity, budget and create-only destination. No credentials logged.'); process.exitCode = 1; }
}
