'use strict';
const fs=require('node:fs'),r=require('../../p08/runtime.cjs');
const dir='observability/p05-candidate/grafana/dashboards';
const dashboards=fs.readdirSync(dir).filter(n=>n.startsWith('p09-')).map(n=>JSON.parse(fs.readFileSync(dir+'/'+n)));
const panels=dashboards.flatMap(d=>d.panels.filter(p=>p.targets).map(p=>({...p,dashboard:d.uid})));
const expand=q=>q.replaceAll('${service:regex}','user-api|vocabulary-api');
const counterNames=['http_requests_received_total','http_server_requests_seconds_count','http_request_duration_seconds_bucket','http_server_requests_seconds_bucket','process_cpu_seconds_total','prometheus_notifications_errors_total','p07_notifications_received_total','prometheus_rule_evaluation_failures_total'];
let series=[];
function add(name,labels,value='4+0x20'){series.push({series:name+'{'+Object.entries(labels).map(([k,v])=>k+'="'+v+'"').join(',')+'}',values:value});}
for(const job of ['user-api','vocabulary-api','prometheus','p07-storage'])add('up',{job},'1+0x20');
for(const name of counterNames){const job=name.startsWith('http_server')?'vocabulary-api':name.startsWith('prometheus_')?'prometheus':name.startsWith('p07_')?'p07-storage':'user-api';const labels={job};if(name==='http_requests_received_total')labels.code='500';if(name==='http_server_requests_seconds_count')labels.status='500';if(name.endsWith('_bucket')){for(const le of ['1','+Inf'])add(name,{...labels,le},'0+15x20');}else add(name,labels,'0+15x20');}
for(const [name,labels] of [['dotnet_total_memory_bytes',{job:'user-api'}],['jvm_memory_used_bytes',{job:'vocabulary-api',area:'heap'}],['process_cpu_usage',{job:'vocabulary-api'}],['app_database_pool_connections',{job:'user-api',state:'active'}],['sql_pool_queue_size',{job:'vocabulary-api'}],['sql_pool_ratio',{job:'vocabulary-api'}],['p07_backing_disk_available_bytes',{job:'p07-storage'}],['p07_telemetry_storage_used_bytes',{job:'p07-storage',store:'tempo'}],['p07_telemetry_storage_budget_bytes',{job:'p07-storage',store:'tempo'}],['p07_telemetry_storage_measurement_error',{job:'p07-storage',store:'tempo'}],['ALERTS',{alertstate:'firing',severity:'warning'}]])add(name,labels);
const counts=[2,2,2,2,2,1,1,1,1,1,2,1,1,1,1,1,1,1,1,1];
const cases=['data','no-data','counter-reset'].map(mode=>({name:mode,interval:'15s',input_series:mode==='no-data'?[]:series.map(s=>({...s,values:mode==='counter-reset'&&counterNames.some(n=>s.series.startsWith(n+'{'))?'0 15 30 45 0 15 30 45 60 75 90 105 120 135 150 165 180 195 210 225 240':s.values})),promql_expr_test:panels.map((p,i)=>({expr:'count(('+expand(p.targets[0].expr)+') >= 0)',eval_time:'5m',exp_samples:mode==='no-data'?[]:[{labels:'{}',value:counts[i]}]}))}));
// Golden values exercise seconds, ratios, aggregation, and native reset compensation.
cases[0].promql_expr_test.push({expr:expand(panels[3].targets[0].expr),eval_time:'5m',exp_samples:[{labels:'{job="user-api"}',value:.95},{labels:'{job="vocabulary-api"}',value:.95}]});
cases[0].promql_expr_test.push({expr:expand(panels[2].targets[0].expr),eval_time:'5m',exp_samples:[{labels:'{job="user-api"}',value:1},{labels:'{job="vocabulary-api"}',value:1}]});
cases[2].promql_expr_test.push({expr:'resets(http_requests_received_total[5m])',eval_time:'5m',exp_samples:[{labels:'{code="500",job="user-api"}',value:1}]});
const file='observability/roadmap/p09-validation/panels.tests.json';fs.writeFileSync(file,JSON.stringify({evaluation_interval:'15s',tests:cases},null,2)+'\n');
const image=r.docker(['inspect','--format','{{.Image}}',r.container('prometheus')]);
const result=require('node:child_process').spawnSync('docker',['run','--rm','--pull=never','--network','none','--label','jp.p09.owner=panel-tests','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--memory','128m','--cpus','0.5','--pids-limit','32','--cap-drop=ALL','--security-opt','no-new-privileges:true','--mount','type=bind,source='+require('node:path').resolve(file)+',target=/panels.tests.json,readonly','--entrypoint','/bin/promtool',image,'test','rules','/panels.tests.json'],{encoding:'utf8',timeout:60000}); const output=result.stdout+result.stderr; console.log(output); if(result.status!==0)process.exit(1);
fs.writeFileSync('observability/roadmap/p09-validation/evidence/panel-tests.json',JSON.stringify({utc:new Date().toISOString(),image,panels:panels.length,scenarios:cases.map(c=>({name:c.name,assertions:c.promql_expr_test.length})),output,status:'PASS'},null,2)+'\n');console.log(output);


