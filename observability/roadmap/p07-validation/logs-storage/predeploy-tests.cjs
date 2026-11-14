const cp=require('child_process'),fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'../../../..'),out=__dirname+'/evidence/';function run(a){let q=cp.spawnSync('docker',a,{encoding:'utf8',timeout:30000,maxBuffer:4000000});return{code:q.status,output:q.stdout||'',error:q.stderr||''}}const image='nginx:stable-alpine@sha256:73c75df4075c918f91017fdda46ad81e55e5af77ba3a64ca3d5014bd9244fe7f',base=['run','--rm','--network','none','--read-only','--memory','32m','--pids-limit','32','--cap-drop','ALL','--security-opt','no-new-privileges:true','--user','101:101'];let r={captured_utc:new Date().toISOString()};r.directoryGuard=run([...base,'--mount','type=bind,source='+root+'/secrets/logging/htpasswd,target=/etc/nginx/logs.htpasswd,readonly','--mount','type=bind,source='+root+'/observability/logging/logs-ui-entrypoint.sh,target=/guard.sh,readonly','--entrypoint','/bin/sh',image,'/guard.sh']);r.runtimeUserCanRead=run([...base,'--mount','type=bind,source='+root+'/secrets/logging/htpasswd.recovered,target=/auth,readonly','--entrypoint','/bin/sh',image,'-ec','test -f /auth && test -s /auth && test -r /auth']);
const program=`import importlib.util,pathlib,tempfile,unittest,json
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('setup','/workspace/scripts/setup-log-access.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Safety(unittest.TestCase):
 def test_existing_credentials_are_unchanged(self):
  with tempfile.TemporaryDirectory() as p:
   root=pathlib.Path(p);f=root/'.env.logging';f.write_text('existing-private-data');
   with patch.object(m,'ROOT',root),patch.object(m.subprocess,'run') as run:
    with self.assertRaises(RuntimeError):m.main()
    run.assert_not_called();self.assertEqual(f.read_text(),'existing-private-data')
 def test_directory_auth_source_is_preserved(self):
  with tempfile.TemporaryDirectory() as p:
   root=pathlib.Path(p);bad=root/'secrets/logging/htpasswd';bad.mkdir(parents=True)
   with patch.object(m,'ROOT',root),patch.object(m.subprocess,'run') as run:
    with self.assertRaises(RuntimeError):m.main()
    run.assert_not_called();self.assertTrue(bad.is_dir())
 def test_existing_empty_parent_is_supported(self):
  with tempfile.TemporaryDirectory() as p:
   root=pathlib.Path(p);(root/'secrets/logging').mkdir(parents=True)
   result=type('Result',(),{'returncode':0,'stdout':'logs-admin:$2y$12$'+'A'*53})()
   with patch.object(m,'ROOT',root),patch.object(m.subprocess,'run',return_value=result),patch.object(m.secrets,'token_hex',return_value='A'*64),patch('builtins.print'):
    m.main();self.assertTrue((root/'secrets/logging/htpasswd').is_file());self.assertTrue((root/'.env.logging').is_file())
suite=unittest.defaultTestLoader.loadTestsFromTestCase(Safety);result=unittest.TextTestRunner(verbosity=1).run(suite)
print(json.dumps({'tests':result.testsRun,'passed':result.wasSuccessful()}))
raise SystemExit(0 if result.wasSuccessful() else 1)
`;r.setupTests=run(['run','--rm','--network','none','--read-only','--memory','64m','--pids-limit','32','--tmpfs','/tmp:rw,nosuid,nodev,size=16m,mode=1777','--mount','type=bind,source='+root+'/scripts,target=/workspace/scripts,readonly','--entrypoint','python','python:3.14-alpine@sha256:016508ba505da24f7139765bc4bb669df4e88eb2f12eeadd571bf2f88d7533df','-B','-c',program]);r.passed=r.directoryGuard.code===78&&r.runtimeUserCanRead.code===0&&r.setupTests.code===0;fs.writeFileSync(out+'predeploy-tests.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r,null,2));if(!r.passed)process.exitCode=1;
