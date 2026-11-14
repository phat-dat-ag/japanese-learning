'use strict';
// One explicitly approved infrastructure interruption; never recreates containers.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'evidence'),file=path.join(root,'wsl-maintenance.json'),config=path.join(process.env.USERPROFILE,'.wslconfig');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function run(bin,args,input,timeout=30000){const q=cp.spawnSync(bin,args,{input,encoding:'utf8',timeout,maxBuffer:16*1024*1024});if(q.status!==0)throw Error(bin+' '+args[0]+' failed (no credential output)');return q.stdout.trim();}
const d=a=>run('docker',a),ps=s=>run('powershell',['-NoProfile','-Command',s]);
const phase=process.argv[2],r=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{createdUtc:new Date().toISOString(),authority:'User explicitly approves 9 GiB WSL2 ceiling and one controlled Docker/WSL interruption',actions:[]};
function save(){fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');}
function db(){
 const mysql=d(['exec','jp_learning_dev-mysql-1','sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N -B -e "SELECT COUNT(*) FROM information_schema.processlist WHERE ID<>CONNECTION_ID() AND COMMAND<>\'Sleep\' AND INFO REGEXP \'BACKUP|OPTIMIZE|ALTER|REPAIR|ANALYZE\'; SELECT TABLE_SCHEMA,TABLE_NAME,COALESCE(TABLE_ROWS,0) FROM information_schema.tables WHERE TABLE_SCHEMA NOT IN (\'mysql\',\'sys\',\'information_schema\',\'performance_schema\') ORDER BY TABLE_SCHEMA,TABLE_NAME;"']);
 const sql=d(['exec','jp_learning_dev-sqlserver-1','sh','-c','SQLCMDPASSWORD="$MSSQL_SA_PASSWORD" /opt/mssql-tools18/bin/sqlcmd -S 127.0.0.1,1433 -U sa -C -b -h -1 -W -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM sys.dm_exec_requests WHERE session_id<>@@SPID AND (command LIKE \'BACKUP%\' OR command LIKE \'RESTORE%\' OR command LIKE \'DBCC%\' OR command LIKE \'ALTER%\'); SELECT name,state_desc,create_date FROM sys.databases WHERE database_id>4 ORDER BY name;"']);
 if(!/^0\s/.test(mysql)||!/^0\s/.test(sql))throw Error('Database maintenance detected or check inconclusive');
 return {mysqlMetadataSha256:hash(mysql),sqlDatabaseMetadataSha256:hash(sql),maintenanceActive:false,scope:'Read-only database/table metadata; no business row contents exposed. MySQL TABLE_ROWS is an estimate.'};
}
try{
 if(phase==='prepare'){
  if(r.preparedUtc)throw Error('Already prepared');
  const baseline=JSON.parse(fs.readFileSync(path.join(root,'full-recovery-wsl-before.json')));
  if(baseline.before.inventory.length!==52||baseline.before.inventory.some(c=>c.state==='running'&&c.health&&c.health!=='healthy'))throw Error('Baseline health/count guard failed');
  r.backupTasks=JSON.parse(ps("@(Get-ScheduledTask -TaskName 'JapaneseLearning-P08-*' | Select-Object TaskName,@{n='State';e={[string]$_.State}}) | ConvertTo-Json"));
  if(r.backupTasks.some(t=>t.State==='Running'||t.State==='Disabled'))throw Error('P08 task running/disabled');
  r.databaseBefore=db();r.configBefore={exists:fs.existsSync(config),contents:fs.existsSync(config)?fs.readFileSync(config,'utf8'):null};
  // Private, scoped backup; absence is also recorded. Never overwrite a previous backup.
  const dir=path.resolve('.local/p10-wsl-maintenance');fs.mkdirSync(dir,{recursive:true});
  r.configurationBackup=path.join(dir,'wslconfig-before.json');fs.writeFileSync(r.configurationBackup,JSON.stringify(r.configBefore,null,2),{flag:'wx'});
  r.desktopSettings=path.join(process.env.APPDATA,'Docker','settings-store.json');r.desktopSettingsSha256=hash(fs.readFileSync(r.desktopSettings));
  fs.copyFileSync(r.desktopSettings,path.join(dir,'desktop-settings-before.json'),fs.constants.COPYFILE_EXCL);
  r.preparedUtc=new Date().toISOString();save();
 }else if(phase==='configure'){
  if(!r.preparedUtc||r.configuredUtc)throw Error('Invalid stage');
  let text=r.configBefore.contents||'',lines=text.split(/\r?\n/),section=false,found=false,sections=0;
  for(let i=0;i<lines.length;i++){if(/^\s*\[/.test(lines[i])){section=/^\s*\[wsl2\]\s*$/i.test(lines[i]);if(section)sections++;}else if(section&&/^\s*memory\s*=/i.test(lines[i])){if(found)throw Error('Duplicate memory setting');lines[i]='memory=9GB';found=true;}}
  if(sections>1)throw Error('Duplicate wsl2 section');
  if(!found){if(sections){const at=lines.findIndex(l=>/^\s*\[wsl2\]\s*$/i.test(l));lines.splice(at+1,0,'memory=9GB');}else lines.push('[wsl2]','memory=9GB');}
  text=lines.join('\r\n').replace(/^\r\n/,'');if(!text.endsWith('\r\n'))text+='\r\n';
  if(fs.existsSync(config)!==r.configBefore.exists||(r.configBefore.exists&&fs.readFileSync(config,'utf8')!==r.configBefore.contents))throw Error('Configuration changed since baseline');
  fs.writeFileSync(config,text);r.configAfter={contents:fs.readFileSync(config,'utf8'),sha256:hash(fs.readFileSync(config))};r.configuredUtc=new Date().toISOString();save();
 }else if(phase==='stop'){
  if(!r.configuredUtc||r.stopRequestedUtc)throw Error('Invalid or repeated interruption');
  if(ps("@(Get-ScheduledTask -TaskName 'JapaneseLearning-P08-*' | Where-Object State -eq Running).Count")!=='0')throw Error('P08 task running');db();
  r.stopRequestedUtc=new Date().toISOString();save();run('docker',['desktop','stop','--timeout','90'],undefined,100000);r.desktopStoppedUtc=new Date().toISOString();save();
  run('wsl',['--shutdown'],undefined,60000);r.wslShutdownUtc=new Date().toISOString();save();
 }else if(phase==='start'){
  if(!r.wslShutdownUtc||r.startRequestedUtc)throw Error('Invalid start stage');r.startRequestedUtc=new Date().toISOString();save();run('docker',['desktop','start','--timeout','120'],undefined,130000);r.desktopStartedUtc=new Date().toISOString();save();
 }else if(phase==='database-after'){r.databaseAfter=db();r.databaseMetadataMatch=JSON.stringify(r.databaseBefore)===JSON.stringify(r.databaseAfter);save();}
 else throw Error('Unknown stage');console.log(JSON.stringify({phase,ok:true,receipt:file}));
}catch(e){r.lastFailure={utc:new Date().toISOString(),phase,message:e.message};save();console.error(e.message);process.exitCode=1;}
