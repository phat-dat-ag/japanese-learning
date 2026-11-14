'use strict';
const r=require('../../p08/runtime.cjs'),fs=require('node:fs');
function os(route,options={}){
 if(options.who!=='reader')return r.os(route,options);
 const password=JSON.parse(fs.readFileSync('secrets/p07/credentials.json')).dashboard_reader;
 const cfg='silent\nshow-error\ncacert = "/usr/share/opensearch/config/p07/ca.pem"\nuser = "dashboard_reader:'+password+'"\n';
 const raw=r.docker(['exec','-i',r.container('opensearch'),'curl','--config','-','--max-time','20','-w','\n%{http_code}','-X',options.method||'GET',...(options.body?['-H','Content-Type: application/json','--data-binary',JSON.stringify(options.body)]:[]),'https://opensearch:9200'+route],cfg);
 const lines=raw.split('\n'),status=Number(lines.pop());let data;try{data=JSON.parse(lines.join('\n'));}catch{data=null;}return {status,data};
}
module.exports={...r,os,osGet:(route,options)=>{const q=os(route,options);if(q.status!==200)throw Error('OpenSearch read failed: '+q.status);return q.data;}};
