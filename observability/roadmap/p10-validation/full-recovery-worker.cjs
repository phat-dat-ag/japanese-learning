'use strict';
// Reuse the reviewed P08 native restore body with explicit, fail-closed P10 adapters.
// P08 files and policy are never edited; no lock is written in the backup directory.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const safety=require('./full-recovery-safety.cjs'),c=safety.load();
let source=fs.readFileSync('observability/p08/local-drill.cjs','utf8').replace(/\r\n/g,'\n');
function replace(from,to){if(!source.includes(from)||source.indexOf(from)!==source.lastIndexOf(from))throw Error('P08 adapter anchor changed');source=source.replace(from,to);}
replace("r=require('./runtime.cjs')","r=require("+JSON.stringify(path.join(__dirname,'full-recovery-safety.cjs'))+").runtime()");
replace("  const lock=path.join(policy.destination,'.p08-local.lock'),fd=fs.openSync(lock,'wx',0o600);","  const safety=require("+JSON.stringify(path.join(__dirname,'full-recovery-safety.cjs'))+"); const owned=safety.load();");
replace("const project='p08_local_'+crypto.randomBytes(8).toString('hex'),dir=path.resolve(policy.stagingRoot,'drill-'+project)","const project=owned.project,dir=owned.stage");
replace("phase:'P08'","phase:'P10'");
replace("path.resolve('observability/roadmap/p08-validation/evidence',project+'.json')","path.join(owned.evidence,'restore.json')");
replace("    report.before=r.inventory();","    report.baselineEvidence=owned.baseline;");
replace("    report.images=Object.fromEntries", "    safety.prepareModel(model);\n    report.images=Object.fromEntries");
source=source.replaceAll('jp.p08.run','jp.p10.run');
replace("image('fluent-bit'),'-c'","image('fluent-bit'),'-c'"); // Assert this native candidate remains present.
replace("'--memory','96m'","'--memory','96m','--memory-swap','96m','--log-driver','none'");
replace("const collectorId=r.docker", "safety.abortCheck(); const collectorId=r.docker");
replace("if(request('http://tempo:3200/api/traces/'+traceId).status===200)matched++", "{const response=request('http://tempo:3200/api/traces/'+traceId);if(response.status===200){const original=JSON.parse(fs.readFileSync(path.join(recovered,'traces',traceId+'.json')));const spans=value=>otlp((value.resourceSpans||value.batches||[])).flatMap(resource=>(resource.scopeSpans||resource.instrumentationLibrarySpans||[]).flatMap(scope=>(scope.spans||[]).map(span=>({resource:resource.resource,scope:scope.scope||scope.instrumentationLibrary,span})))).sort((a,b)=>a.span.spanId.localeCompare(b.span.spanId));if(digest(spans(original))!==digest(spans(response.data)))throw Error('Restored trace payload integrity mismatch');matched++;}}");
replace("    report.after=r.inventory();check('live_runtime_preserved',JSON.stringify(report.before)===JSON.stringify(report.after));report.status='PASS';", "    report.status='PASS'; // Supervisor compares the complete 52-container baseline after cleanup.");
const start=source.indexOf('    for(const resource of report.resources.slice().reverse())'),end=source.indexOf('\n  }\n  return report;',start);
if(start<0||end<0)throw Error('P08 cleanup anchor changed');
source=source.slice(0,start)+"    report.finishedUtc=new Date().toISOString();save();console.log(JSON.stringify({status:report.status,recovery:report.recovery,error:report.error}));"+source.slice(end);
safety.makeAgent();
const mod=new Module(path.resolve('observability/p08/p10-adapted.cjs'),module);mod.filename=path.resolve('observability/p08/p10-adapted.cjs');mod.paths=Module._nodeModulePaths(path.dirname(mod.filename));mod._compile(source,mod.filename);
mod.exports.main('.local/p08-development/config.json').catch(e=>{console.error(e.message);process.exitCode=1;});
