'use strict';
// Value-free inventory and lossless consolidation. Never deletes source/evidence files.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),zlib=require('node:zlib');
const repo=process.cwd(),root='observability/roadmap/p10-validation',evidence=root+'/evidence',catalog=evidence+'/file-audit.json',bundle=evidence+'/duplicate-evidence.json.gz';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const git=a=>cp.execFileSync('git',a,{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
function walk(p){if(!fs.existsSync(p))return [];return fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>{const f=p+'/'+e.name;if(e.isSymbolicLink())return [];return e.isDirectory()?walk(f):[f];});}
function publicFiles(){const changed=new Set(git(['diff','--name-only']).split('\n'));return [...new Set([...walk(root),...fs.readdirSync('observability/roadmap').filter(n=>/^p10-.*\.md$/.test(n)).map(n=>'observability/roadmap/'+n),'observability/roadmap/implementation-roadmap.md',...['.gitignore','.gitattributes'].filter(p=>changed.has(p))])].sort();}
function runtimeFiles(){return fs.readdirSync('.local',{withFileTypes:true}).filter(e=>e.isDirectory()&&/^jp_obs_validation_\d{14}_[a-f0-9]{8}$/.test(e.name)).flatMap(e=>walk('.local/'+e.name)).sort();}
function classify(file){
 if(file.startsWith('.local/')){if(/\.(?:key|pem|csr|srl|ext)$|credentials\.json$|tokens\.json$|\/recovered\/|\/export\//.test(file))return 'Disposable runtime files';return /compose\.json$|\.(?:conf|ya?ml)$|\/private\/.*\.json$|nginx\.conf$/.test(file)?'Configuration':'Temporary test artifacts';}
 if(/\.(?:cjs|py)$/.test(file))return 'Source code and validation scripts';
 if(file.endsWith('.md'))return 'Documentation';
 if(['.gitignore','.gitattributes'].includes(file))return 'Configuration';
 const run=file.match(/evidence\/(jp_obs_validation_[^/]+)\//)?.[1];
 if(run){const report=JSON.parse(fs.readFileSync(evidence+'/'+run+'/results.json'));if(['BLOCKED','FAIL'].includes(report.status))return 'Historical failed evidence';}
 if(/(?:routing(?:-managed)?|resolution-acceptance-[0-9]+)\.json$/.test(file)){try{if(['BLOCKED','FAIL'].includes(JSON.parse(fs.readFileSync(file)).status))return 'Historical failed evidence';}catch{}}
 if(/failure\.json$/.test(file))return 'Historical failed evidence';
 if(/\/diagnostic-|(?:-metrics|gap-series)\.json$/.test(file))return 'Generated logs, metrics and traces';
 if(/readiness-diagnostic-/.test(file))return 'Temporary test artifacts';
 return 'Essential reproducible evidence';
}
function secretInputs(){const values=[];for(const dir of fs.readdirSync('.local').filter(n=>/^jp_obs_validation_/.test(n)))for(const suffix of ['private/credentials.json','tokens.json']){const p='.local/'+dir+'/'+suffix;if(fs.existsSync(p))for(const v of Object.values(JSON.parse(fs.readFileSync(p))))if(typeof v==='string'&&v.length>=12)values.push(v);}if(fs.existsSync('secrets/p07/credentials.json'))for(const v of Object.values(JSON.parse(fs.readFileSync('secrets/p07/credentials.json'))))if(typeof v==='string'&&v.length>=12)values.push(v);if(fs.existsSync('.env'))for(const line of fs.readFileSync('.env','utf8').split(/\r?\n/)){const m=line.match(/^([A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|CREDENTIAL)[A-Z0-9_]*)=(.*)$/);if(m){const v=m[2].replace(/^['"]|['"]$/g,'');if(v.length>=8&&!v.startsWith('${'))values.push(v);}}return [...new Set(values)];}
function archiveData(){if(!fs.existsSync(bundle))return {version:1,paths:{},objects:{}};if(fs.statSync(bundle).size>16777216)throw Error('Archive input bound');return JSON.parse(zlib.gunzipSync(fs.readFileSync(bundle),{maxOutputLength:16777216}));}
function inventory(){
 const secrets=secretInputs(),archive=archiveData(),paths=[...publicFiles(),...runtimeFiles()],rows=[];
 const ignoredResult=cp.spawnSync('git',['check-ignore','-z','--stdin'],{input:paths.join('\0')+'\0',encoding:'utf8'});if(![0,1].includes(ignoredResult.status))throw Error('Git ignore audit failed');const ignored=new Set(ignoredResult.stdout.split('\0').filter(Boolean));
 for(const file of paths){const bytes=fs.readFileSync(file),text=bytes.toString('utf8'),category=classify(file),runtime=file.startsWith('.local/');
  const intentionalFixture=file===root+'/native-agent.py';
  const findings=[];if(secrets.some(s=>text.includes(s)))findings.push('Known credential/token value');
  if(!intentionalFixture&&/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))findings.push('Private-key material');
  if(!intentionalFixture&&/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(text))findings.push('JWT-shaped value');
  if(runtime&&file.endsWith('.key')&&!findings.includes('Private-key material'))findings.push('Private/symmetric key file');
  rows.push({file,category,bytes:file===catalog?null:bytes.length,sha256:file===catalog?null:hash(bytes),gitIgnored:ignored.has(file),publication:runtime?'Ignore; local runtime/configuration only':archive.paths[file]?'Retain via verified duplicate archive; raw file ignored':'Retain as reviewable source/evidence',findings,intentionalSyntheticInputFixture:intentionalFixture||undefined});
 }
 const groups=new Map();for(const row of rows.filter(r=>!r.file.startsWith('.local/')&&r.sha256)){const a=groups.get(row.sha256)||[];a.push(row);groups.set(row.sha256,a);}
 const duplicates=[...groups.entries()].filter(([,a])=>a.length>1).map(([sha256,a])=>({sha256,bytesEach:a[0].bytes,files:a.map(r=>r.file),redundantBytes:a[0].bytes*(a.length-1)}));
 const categories=['Source code and validation scripts','Configuration','Documentation','Essential reproducible evidence','Historical failed evidence','Temporary test artifacts','Generated logs, metrics and traces','Disposable runtime files'];
 const counts=rs=>Object.fromEntries(categories.map(c=>[c,rs.filter(r=>r.category===c).length]));
 const pub=rows.filter(r=>!r.file.startsWith('.local/')),local=rows.filter(r=>r.file.startsWith('.local/'));
 return {utc:new Date().toISOString(),scope:'All physical P10 validation files, P10 Markdown, roadmap/.gitignore changes, and only manifest-named P10 .local workspaces; P08/secrets/backup directories are excluded from ownership',initialObserved:{gitChangedAndUntracked:254,trackedModified:1,untracked:253,p10ValidationFiles:249},totals:{physicalPublic:pub.length,gitEligiblePublic:pub.filter(r=>!r.gitIgnored).length,ignoredPublic:pub.filter(r=>r.gitIgnored).length,ignoredLocalRuntime:local.length,allAudited:rows.length},categoryCounts:{public:counts(pub),local:counts(local),all:counts(rows)},largestFiles:rows.filter(r=>r.bytes>262144).sort((a,b)=>b.bytes-a.bytes).map(({file,bytes,category})=>({file,bytes,category})),duplicates,publicationPrivacy:{publicFindings:pub.filter(r=>r.findings.length).map(r=>({file:r.file,classes:r.findings})),privateRuntimeFindings:local.filter(r=>r.findings.length).map(r=>({file:r.file,classes:r.findings})),controlledFixtureException:'native-agent.py contains explicitly synthetic invalid JWT/private-key templates; not real credentials, excluded only from generic shape detection'},archive:{file:fs.existsSync(bundle)?bundle:null,paths:Object.keys(archive.paths).length,uniqueObjects:Object.keys(archive.objects).length,bytes:fs.existsSync(bundle)?fs.statSync(bundle).size:0},auditProcess:{peakRssBytes:process.resourceUsage().maxRSS*1024,userCpuMicroseconds:process.resourceUsage().userCPUTime,systemCpuMicroseconds:process.resourceUsage().systemCPUTime,scope:'File audit only; not full-recovery resource measurements'},rows};
}
function writeAudit(){if(!fs.existsSync(catalog))fs.writeFileSync(catalog,'{}\n');const data=inventory();fs.writeFileSync(catalog,JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify({totals:data.totals,categories:data.categoryCounts,duplicateGroups:data.duplicates.length,publicPrivacyFindings:data.publicationPrivacy.publicFindings,localSensitiveFiles:data.publicationPrivacy.privateRuntimeFindings.length,archive:data.archive,largest:data.largestFiles.slice(0,5)}));return data;}
function consolidate(){
 const audit=inventory(),archive=archiveData();let added=0;if(audit.publicationPrivacy.publicFindings.length)throw Error('Do not archive or publish suspect public evidence');
 for(const group of audit.duplicates){const eligible=group.files.filter(f=>/\/diagnostic-[^/]+\.json$|\/preservation-[^/]+\.json$/.test(f));if(eligible.length<2)continue;
  // Keep one readable canonical payload, preferentially the baseline. No receipts,
  // primary results, metrics, root-cause diagnostics or unique failed bytes disappear.
  const canonical=eligible.find(f=>f.endsWith('/preservation-baseline.json'))||eligible.slice().sort()[0];
  for(const file of eligible.filter(f=>f!==canonical)){const bytes=fs.readFileSync(file);if(hash(bytes)!==group.sha256)throw Error('Archive input race');archive.objects[group.sha256]=bytes.toString('base64');archive.paths[file]={sha256:group.sha256,canonical};added++;}
 }
 const compressed=zlib.gzipSync(Buffer.from(JSON.stringify(archive)),{level:9,mtime:0});const restored=JSON.parse(zlib.gunzipSync(compressed));
 for(const [file,item]of Object.entries(restored.paths)){if(!file.startsWith(evidence+'/')||file.includes('..')||hash(Buffer.from(restored.objects[item.sha256],'base64'))!==item.sha256||hash(fs.readFileSync(file))!==item.sha256)throw Error('Lossless archive validation failed');}
 fs.writeFileSync(bundle,compressed);const begin='# BEGIN P10 VERIFIED DUPLICATE EVIDENCE',end='# END P10 VERIFIED DUPLICATE EVIDENCE',original=fs.readFileSync('.gitignore','utf8'),section=begin+'\n# Raw bytes remain locally and are recoverable through duplicate-evidence.json.gz.\n'+Object.keys(restored.paths).sort().map(f=>'/'+f).join('\n')+'\n'+end;
 const expression=new RegExp(begin+'[\\s\\S]*?'+end);fs.writeFileSync('.gitignore',expression.test(original)?original.replace(expression,section):original.replace(/\s*$/,'')+'\n\n'+section+'\n');
 console.log(JSON.stringify({archivedPaths:Object.keys(archive.paths).length,uniqueObjects:Object.keys(archive.objects).length,compressedBytes:compressed.length,removedFiles:0,roundTripVerified:true}));
}
const command=process.argv[2]||'audit';
if(command==='audit')writeAudit();
else if(command==='consolidate'){consolidate();writeAudit();}
else if(command==='show'){const a=archiveData(),f=process.argv[3],entry=a.paths[f];if(!entry)throw Error('Not archived');const bytes=Buffer.from(a.objects[entry.sha256],'base64');if(hash(bytes)!==entry.sha256)throw Error('Digest');process.stdout.write(bytes);}
else if(command==='restore'){const a=archiveData();for(const [f,e]of Object.entries(a.paths)){if(!f.startsWith(evidence+'/')||f.includes('..'))throw Error('Path');const bytes=Buffer.from(a.objects[e.sha256],'base64');if(hash(bytes)!==e.sha256)throw Error('Digest');if(fs.existsSync(f)){if(hash(fs.readFileSync(f))!==e.sha256)throw Error('Refuse overwrite');continue;}if(!fs.realpathSync(path.dirname(f)).startsWith(path.resolve(evidence)+path.sep))throw Error('Parent escape');fs.writeFileSync(f,bytes,{flag:'wx'});}console.log('Archive paths verified/materialized; no existing file overwritten.');}
else throw Error('Usage: audit|consolidate|show PATH|restore');
