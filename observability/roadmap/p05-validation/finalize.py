"""Read-only preservation audit and P05-only evidence manifest generation."""
import ast
import hashlib
import importlib.util
import json
import re
from pathlib import Path
import subprocess

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
EVIDENCE=HERE/'evidence'
BASE=json.loads((EVIDENCE/'preflight.json').read_text())
intentional={'.env.example','deployment/production.env.example','docker-compose.yml'}

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def save(path,value):
    path.write_text(json.dumps(value,indent=2)+'\n')

spec=importlib.util.spec_from_file_location('p03_read_only_snapshot',ROOT/'observability/roadmap/p03-validation/snapshot.py')
snapshot=importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)
current=snapshot.capture()
for name, before in BASE['repositories'].items():
    now=current['repositories'][name]
    for field in ('head','branch','index_sha256'):
        assert before[field]==now[field],(name,field)
    if name!='.':
        assert before==now,(name,'submodule state or pre-existing diff changed')
assert BASE['gitlinks']==current['gitlinks']
protected=[]
for name,digest in {**BASE['protected_source_sha256'],**BASE['protected_files']}.items():
    actual=sha(ROOT/name)
    if name not in intentional:
        assert actual==digest,('Protected source changed',name)
    protected.append({'path':name,'before':digest,'after':actual,
        'status':'authorized root integration' if name in intentional else 'unchanged'})

tracked=subprocess.check_output(['git','diff','--name-only'],cwd=ROOT,text=True).splitlines()
assert set(tracked)<=intentional|{'dotnet'},tracked
files=[ROOT/name for name in intentional]
files += sorted((ROOT/'observability/p05-candidate').rglob('*'))
files += sorted(HERE.rglob('*'))
files += sorted((ROOT/'observability/roadmap').glob('p05-*.md'))
files=[p for p in files if p.is_file() and p.name!='change-manifest.json']
for path in files:
    if path.suffix=='.py':
        ast.parse(path.read_text(),filename=str(path))
    if path.suffix=='.md':
        for target in re.findall(r'\]\(([^)]+)\)',path.read_text()):
            if '://' not in target and not target.startswith('#'):
                assert (path.parent/target.split('#')[0]).resolve().is_file(),(str(path),target)
    for n,line in enumerate(path.read_text().splitlines(),1):
        assert line==line.rstrip(),(str(path),n,'trailing whitespace')
subprocess.run(['git','diff','--check'],cwd=ROOT,check=True)
save(EVIDENCE/'preservation.json',{'status':'PASS source/index/submodule preservation',
    'repositories':current['repositories'],'gitlinks':current['gitlinks'],
    'protected_files':protected,'existing_dotnet_diff':'identical to preflight',
    'tracked_diff_paths':tracked,'runtime':'NOT independently verified; Docker access denied',
    'docker_lifecycle_commands':[],'resources_created':[],
    'prohibited_actions_performed':[], 'cleanup':'none; no resources created',
    'syntax_whitespace_diff_check':'PASS'})
alerts=json.loads((EVIDENCE/'alert-manifest.json').read_text())
# Include the final preservation report but deliberately exclude this self-referential manifest.
files=sorted(set(files+[EVIDENCE/'preservation.json']))
save(EVIDENCE/'change-manifest.json',{
    'phase':'P05','root_head':BASE['repositories']['.']['head'],
    'source_status':'offline candidate checks PASS; official promtool/amtool acceptance NOT VERIFIED',
    'runtime_status':'BLOCKED Docker access denied; no deployment',
    'compose':'root docker-compose.yml only; regular prometheus/grafana; no P05 overlay/profile',
    'files':[{'path':p.relative_to(ROOT).as_posix(), 'sha256':sha(p),
              'change':'modified' if p.relative_to(ROOT).as_posix() in intentional else 'created'} for p in files],
    'self_hash':'excluded to avoid recursive hash',
    'removed_task_draft':['observability/p05-candidate/compose.p05.yml'],
    'alerts':alerts['alerts'],'recording_rules':alerts['recordings'],'deferred':alerts['deferred'],
    'instrumentation_dependencies_added':[], 'application_metrics_added':[],
    'native_metrics_reused':'P04 inventory, plus standard Prometheus scrape-generated up/duration/sample contracts',
    'scrape_targets':['user-api:8080/metrics','vocabulary-api:8080/q/metrics','prometheus:9090/metrics'],
    'old_scrape_configs':'untouched; do not combine legacy overlays with main workflow',
    'shared_jwks':'source/HEAD/index/gitlink unchanged; no scrape/security change',
    'existing_work_preserved':True,'commit_push_deploy':False})
print(json.dumps({'protected_files':len(protected),'task_files':len(files)+1,
    'submodule_and_index_preservation':'PASS','git_diff_check':'PASS','runtime_preservation':'NOT independently verified'}))
