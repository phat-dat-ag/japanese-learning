"""Read-only selective Docker metadata. No env, full inspect or lifecycle commands."""
import json
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone

HERE = Path(__file__).resolve().parent / 'evidence'


def run(args):
    result = subprocess.run(args, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def normalized(containers):
    result = json.loads(json.dumps(containers))
    for value in result.values():
        for field in ('mounts', 'networks'):
            value[field] = sorted(filter(None, value[field].split(';')))
    return result


def capture(stage):
    assert stage in ('baseline', 'final')
    names = [name for name in run(['docker', 'ps', '-a', '--format', '{{.Names}}']).splitlines()
             if name.startswith(('jp_dev-', 'springboot_project-'))]
    template = ('{{.Id}}|{{.Name}}|{{.Image}}|{{.State.StartedAt}}|{{.State.Status}}|'
                '{{range .Mounts}}{{.Type}}:{{.Source}}:{{.Destination}}:{{.RW}};{{end}}|'
                '{{range $name,$network := .NetworkSettings.Networks}}'
                '{{$name}}:{{$network.NetworkID}};{{end}}')
    containers = {}
    for name in sorted(names):
        values = run(['docker', 'inspect', '--format', template, name]).split('|')
        assert len(values) == 7
        containers[name] = dict(zip(('id', 'name', 'image', 'started', 'state', 'mounts', 'networks'), values))
    report = {'captured_utc': datetime.now(timezone.utc).isoformat(),
              'scope': 'Selective IDs/starts/images/mounts/networks; no environment or data reads',
              'timing': 'Late baseline after source preparation; not a complete before-edit runtime baseline',
              'containers': containers}
    if stage == 'final':
        before = json.loads((HERE / 'runtime-baseline.json').read_text())
        report['raw_order_equal'] = before['containers'] == containers
        report['comparison_normalization'] = 'Sort mount/network entries; compare all identities and values'
        report['unchanged_from_late_baseline'] = normalized(before['containers']) == normalized(containers)
    (HERE / ('runtime-' + stage + '.json')).write_text(json.dumps(report, indent=2) + '\n')
    if stage == 'final':
        assert report['unchanged_from_late_baseline']
    print(json.dumps({'stage': stage, 'containers': len(containers),
                      'preserved': report.get('unchanged_from_late_baseline', 'comparison pending')}))


if __name__ == '__main__':
    capture(sys.argv[1])
