'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const rt=require('../../p08/runtime.cjs');
const M=1048576;
function load(){const f=process.env.P10_RECOVERY_MANIFEST;if(!f)throw Error('Supervisor manifest required');const c=JSON.parse(fs.readFileSync(f));if(!/^jp_obs_validation_\d{14}_[a-f0-9]{8}$/.test(c.project)||path.resolve(c.stage)!==path.resolve('.local',c.project)||path.resolve(c.evidence)!==path.resolve(__dirname,'evidence',c.project))throw Error('Invalid owned paths');return c;}
function bytes(dir){if(!fs.existsSync(dir))return 0;let n=0;for(const x of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,x.name);if(x.isSymbolicLink())throw Error('Linked staging path rejected');n+=x.isDirectory()?bytes(f):fs.statSync(f).size;}return n;}
function artifacts(){return fs.readdirSync('.local').filter(n=>/^jp_obs_validation_\d{14}_[a-f0-9]{8}$/.test(n)).reduce((n,k)=>n+bytes(path.resolve('.local',k)),0)+bytes(path.resolve(__dirname,'evidence'))+bytes(path.resolve('.local/p10-wsl-maintenance'));}
function abortCheck(){const c=load();if(fs.existsSync(path.join(c.evidence,'abort.json')))throw Error('Supervisor aborted disposable workload');if(Date.now()>c.deadline)throw Error('Approved 20-minute deadline exceeded');if(bytes(c.stage)>192*M)throw Error('Host staging budget exceeded');}
function prepareModel(model){
 const c=load();abortCheck();model.volumes={};
 for(const [service,s]of Object.entries(model.services)){
  s.read_only=true;s.memswap_limit=s.mem_limit;s.logging={driver:'none'};s.cpus=1;s.labels={'jp.p10.run':c.project};
  if(service==='agent'){s.mem_limit='256m';s.memswap_limit='256m';s.volumes=s.volumes.map(v=>v.target==='/agent.py'?{...v,source:path.join(c.stage,'agent.py')}:v);}
  if(service==='restore')s.tmpfs.push('/tmp:uid=1000,gid=1000,size=67108864','/usr/share/opensearch/logs:uid=1000,gid=1000,size=67108864');
  const tmp=s.tmpfs||[];delete s.tmpfs;
  for(const [i,t]of tmp.entries()){
   const at=t.indexOf(':'),target=t.slice(0,at),opts=t.slice(at+1),size=Number(opts.match(/size=(\d+)/)?.[1]);if(!size)throw Error('Unbounded tmpfs rejected');
   const key=service+'_'+i;model.volumes[key]={driver:'local',driver_opts:{type:'tmpfs',device:'tmpfs',o:opts},labels:{'jp.p10.run':c.project}};
   s.volumes.push({type:'volume',source:key,target});
  }
 }
 // Agent can measure only these new tmpfs volumes; no Docker socket or live mount.
 for(const key of Object.keys(model.volumes))model.services.agent.volumes.push({type:'volume',source:key,target:'/measure/'+key,read_only:true});
 model.networks.recovery.labels={'jp.p10.run':c.project};
 const ram=Object.values(model.services).reduce((n,s)=>n+parseSize(s.mem_limit),0)+96*M;
 const disk=Object.values(model.volumes).reduce((n,v)=>n+Number(v.driver_opts.o.match(/size=(\d+)/)[1]),0)+192*M+16*M+artifacts();
 if(ram>3424*M||disk>4096*M||Object.values(model.services).reduce((n,s)=>n+s.cpus,0)+.25>6)throw Error('Model budget exceeded');
 for(const s of Object.values(model.services))for(const v of s.volumes||[])if(v.type==='bind'&&(!v.read_only||!path.resolve(v.source).startsWith(path.resolve(c.stage)+path.sep)&&path.resolve(v.source)!==path.resolve('observability/p08/recovery-agent.py')))throw Error('Nonowned bind rejected');
 fs.writeFileSync(path.join(c.evidence,'model-bounds.json'),JSON.stringify({ramBytes:ram,storageCeilingBytes:disk,cpuCores:5.25,modelSha256:rt.hash(Buffer.from(JSON.stringify(model))),logging:'none; no unbounded Docker log files'},null,2));
}
function parseSize(s){const m=String(s).match(/^(\d+)([mg])$/i);if(!m)throw Error('Invalid memory bound');return +m[1]*(m[2].toLowerCase()==='g'?1024*M:M);}
function validateSample(s,deadline){
 for(const k of ['windowsAvailableBytes','nodeBytes','dockerRamBytes','cpuCores','storageBytes','hostStagingBytes'])if(!Number.isFinite(s[k])||s[k]<0)throw Error('Invalid resource sample: '+k);
 if(s.windowsAvailableBytes<1024*M)throw Error('Windows available RAM below 1,024 MiB: '+(s.windowsAvailableBytes/M).toFixed(3)+' MiB');
 if(s.nodeBytes>768*M||s.dockerRamBytes>3424*M||s.cpuCores>6||s.storageBytes>4096*M||s.hostStagingBytes>192*M||!Number.isFinite(deadline)||Date.now()>deadline)throw Error('RAM/CPU/storage/deadline guard breached');
}
function composeGuard(args){const c=load();if(args.includes('create')){
 const file=args[args.indexOf('-f')+1],m=JSON.parse(fs.readFileSync(file));
 if(args[args.indexOf('-p')+1]!==c.project||path.resolve(file)!==path.join(c.stage,'compose.json')||!m.networks.recovery.internal||Object.values(m.services).some(s=>s.networks.join()!=='recovery'||s.ports||s.privileged||!s.read_only||s.restart!=='no'))throw Error('Isolation model rejected');
 if(rt.docker(['ps','-aq','--filter','label=com.docker.compose.project='+c.project]))throw Error('Project collision');
}}
function docker(args,input,timeout){abortCheck();if(args[0]==='compose')composeGuard(args);return rt.docker(args,input,timeout);}
function runtime(){return {...rt,docker};}
function cleanup(){
 const c=load(),b=JSON.parse(fs.readFileSync(c.baseline)),protectedIds=new Set(b.before.inventory.map(x=>x.id)),removed=[];
 const ids=rt.docker(['ps','-aq','--no-trunc','--filter','label=com.docker.compose.project='+c.project]).split(/\s+/).filter(Boolean);
 for(const id of ids){const q=JSON.parse(rt.docker(['inspect','--format','{"id":{{json .Id}},"project":{{json (index .Config.Labels "com.docker.compose.project")}},"run":{{json (index .Config.Labels "jp.p10.run")}}}',id]));if(protectedIds.has(q.id)||q.project!==c.project||q.run!==c.project)throw Error('Cleanup ownership rejected');rt.docker(['stop','--time','5',q.id],undefined,15000);rt.docker(['rm',q.id]);removed.push(q.id);}
 const modelFile=path.join(c.stage,'compose.json');if(fs.existsSync(modelFile)){const m=JSON.parse(fs.readFileSync(modelFile));for(const [kind,keys]of [['volume',Object.keys(m.volumes||{})],['network',Object.keys(m.networks||{})]])for(const key of keys){const n=c.project+'_'+key,known=rt.docker([kind,'ls','--format','{{.Name}}']).split('\n');if(!known.includes(n))continue;const q=JSON.parse(rt.docker([kind,'inspect','--format','{"run":{{json (index .Labels "jp.p10.run")}},"project":{{json (index .Labels "com.docker.compose.project")}}}',n]));if(q.run!==c.project||q.project!==c.project||b.before.volumes.some(v=>v.name===n))throw Error('Cleanup volume/network ownership rejected');rt.docker([kind,'rm',n]);removed.push(n);}}
 return removed;
}
function makeAgent(){const c=load();let text=fs.readFileSync('observability/p08/recovery-agent.py','utf8');
 const marker='    context = None';if(!text.includes(marker))throw Error('P08 agent changed');
 text=text.replace(marker,`    # Serialized bounded test-client admissions, across all exec processes.
    import fcntl
    with open('/tmp/p10-requests.json', 'a+') as gate:
        fcntl.flock(gate, fcntl.LOCK_EX)
        gate.seek(0)
        state = json.loads(gate.read() or '{"count":0,"last":0}')
        if state['count'] >= 1100:
            raise ValueError('P10 request ceiling reached')
        time.sleep(max(0, state['last'] + 0.26 - time.monotonic()))
        state['last'] = time.monotonic()
        state['count'] += 1
        gate.seek(0)
        gate.truncate()
        gate.write(json.dumps(state))
        gate.flush()
    context = None`);
 // Alert stimulus automatically clears within the 30-second fault ceiling.
 text=text.replace("STATE = {'active': False, 'firing': 0, 'resolved': 0}","STATE = {'active': False, 'firing': 0, 'resolved': 0, 'activeUntil': 0, 'incoming': 0}");
 text=text.replace("    def do_GET(self):","    def do_GET(self):\n        with LOCK:\n            STATE['incoming'] += 1\n            if STATE['active'] and time.monotonic() >= STATE['activeUntil']:\n                STATE['active'] = False");
 text=text.replace("    def do_POST(self):","    def do_POST(self):\n        with LOCK:\n            STATE['incoming'] += 1");
 text=text.replace("STATE['active'] = value['active']","STATE['active'] = value['active']\n                STATE['activeUntil'] = time.monotonic() + 25");
 fs.writeFileSync(path.join(c.stage,'agent.py'),text,{flag:'wx'});
}
module.exports={load,bytes,artifacts,abortCheck,prepareModel,validateSample,runtime,cleanup,makeAgent};
