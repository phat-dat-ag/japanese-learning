"""Prove hardening/configuration transfer before removing our redundant draft."""
import json
from pathlib import Path
from compose_check import model, validate_p05

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
data = model()
validate_p05(data)
old = json.loads((HERE/'evidence/compose-draft-transfer-baseline.json').read_text())['model']
checked = []
for name in ('prometheus', 'grafana'):
    before = old['services']['p05-'+name]
    after = data['services'][name]
    for field in ('image','user','init','read_only','cap_drop','security_opt','pids_limit',
                  'restart','logging','tmpfs','healthcheck','stop_grace_period'):
        assert before[field] == after[field], (name,field)
    assert int(after['mem_limit']) == int(after['memswap_limit']) == 512*1024*1024
    assert float(before['cpus']) == float(after['cpus']) == 1
    targets = {v['target'] for v in after['volumes']}
    original_targets = {v.split(':')[1] if isinstance(v,str) else v['target'] for v in before['volumes']}
    assert targets == original_targets
    for mount in after['volumes']:
        if mount['type'] == 'bind':
            assert Path(mount['source']).is_dir() and mount['read_only']
    checked.append(name)
result = {'result':'PASS','services':checked,'transferred':'images, identities, hardening, limits, healthchecks, persistence and all mount targets',
    'authorized_adaptations':['regular root services; profiles removed','service/DNS names prometheus and grafana',
        'root-relative mounts','existing GRAFANA_ADMIN_* and retention variables reused',
        'project-scoped prometheus_data/grafana_data volumes','default application network plus internal p05-monitoring for both services; Grafana requires non-internal bridge for publication',
        'draft run-ID labels removed; phase/owner labels retained'],
    'draft_removed':False}
# Remove only the exact overlay created by this P05 task, after all assertions pass.
draft = ROOT/'observability/p05-candidate/compose.p05.yml'
if draft.exists():
    assert json.loads(draft.read_text()) == old
    draft.unlink()
result['draft_removed'] = not draft.exists()
(HERE/'evidence/compose-transfer.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
