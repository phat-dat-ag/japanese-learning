'use strict';
const r=require('./runtime.cjs'),fs=require('node:fs');
const result={utc:new Date().toISOString(),containers:r.docker(['ps','-aq','--filter','label=jp.p09.run']),volumes:r.docker(['volume','ls','-q','--filter','label=jp.p09.run']),networks:r.docker(['network','ls','-q','--filter','label=jp.p09.run'])};
result.status=[result.containers,result.volumes,result.networks].every(v=>v==='')?'PASS':'FAIL';
fs.writeFileSync(__dirname+'/evidence/cleanup.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));if(result.status!=='PASS')process.exitCode=1;
