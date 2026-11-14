'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const dir=path.join(__dirname,'evidence'),read=n=>JSON.parse(fs.readFileSync(path.join(dir,n+'.json')));
const health=read('health');
// Do not retain CIM host/user metadata in public evidence.
for(const t of health.checks.scheduledTasks||[])t.Triggers=t.Triggers.map(x=>({StartBoundary:x.StartBoundary,Enabled:x.Enabled,DaysInterval:x.DaysInterval,DaysOfMonth:x.DaysOfMonth,MonthsOfYear:x.MonthsOfYear}));
fs.writeFileSync(path.join(dir,'health.json'),JSON.stringify(health,null,2)+'\n');
const baseline=read('baseline'),post=read('post-test'),fixture=read('bounded-fixture'),guards=read('guards');
const files=fs.readdirSync(dir).filter(n=>n!=='acceptance.json');
const artifacts=files.map(n=>({path:n,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,n))).digest('hex')}));
const report={phase:'P10',status:'BLOCKED',utc:new Date().toISOString(),scope:'Local development only',checks:{guardPredicateTests:guards.passed+Number(guards.positive),guardPredicateTotal:guards.total+1,tmpfsEnospc:fixture.enospc,syntheticQueueAccounting:fixture.generated===fixture.recovered+fixture.dropped,syntheticIntegrity:fixture.integrity,runtimePreserved:post.preserved,originalContainers:baseline.inventory.length,developmentContainers:baseline.inventory.filter(c=>c.name.startsWith('/jp_learning_dev-')).length},measurements:fixture,blockers:['Approved integrated workload, fault durations, peak event rate/size, drain deadline and latency/drop budgets not identified; P01 gate requires them before integrated fault/load execution.','Integrated native backend/application outage, pressure, alert routing/resolution and restoration remain NOT VERIFIED.'],exceptions:['P07-DEV-QUOTA unchanged','P08-DEV-LOCAL-STORAGE unchanged'],privacy:'Only selective metadata, synthetic payload hash and aggregate health retained; no telemetry documents, credentials, environment dumps or database contents exported. Full outage sentinel regression NOT VERIFIED.',artifacts};
fs.writeFileSync(path.join(dir,'acceptance.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.checks));
