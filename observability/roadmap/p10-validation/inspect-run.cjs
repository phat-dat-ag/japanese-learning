'use strict';
const fs=require('node:fs'),path=require('node:path'),r=require('../../p08/runtime.cjs');
const run=process.argv[2];if(!/^jp_obs_validation_\d{14}_[a-f0-9]{8}$/.test(run||''))throw Error('Invalid run');
const id=r.docker(['ps','-q','--filter','label=com.docker.compose.project='+run,'--filter','label=jp.p10.run='+run,'--filter','label=com.docker.compose.service=agent']);if(!/^[a-f0-9]{12,64}$/.test(id))throw Error('Expected owned agent');
const code="import importlib.util,json\ns=importlib.util.spec_from_file_location('a','/agent.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nr={}\nfor u in ['http://prometheus:9090/-/ready','http://tempo:3200/ready','https://restore:9200/','http://grafana:3000/api/health']:\n r[u]=m.request({'url':u})\nprint(json.dumps(r))";
const result=JSON.parse(r.docker(['exec','-i',id,'python','-B','-'],code));fs.writeFileSync(path.join(__dirname,'evidence',run,'readiness-diagnostic-'+Date.now()+'.json'),JSON.stringify(result,null,2));console.log(result);
