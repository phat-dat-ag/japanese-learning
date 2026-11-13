"""Additional current read-only acceptance observations; no writes or secret values."""
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
helpers = {'__name__': 'readonly_helpers', '__file__': str(HERE/'audit_active.py')}
exec(compile((HERE/'audit_active.py').read_text(), str(HERE/'audit_active.py'), 'exec'), helpers)
command, get_json = helpers['command'], helpers['get_json']


def inspect(name, template):
    return command(['docker', 'inspect', '--format', template, 'jp_dev-' + name + '-1']).decode().strip()


def main():
    result = {'captured_utc': datetime.now(timezone.utc).isoformat(), 'service_settings': {}, 'checks': {}}
    expected_grafana = {'GF_USERS_AUTO_ASSIGN_ORG_ROLE':'Viewer', 'GF_SECURITY_ALLOW_EMBEDDING':'false',
        'GF_SECURITY_COOKIE_SAMESITE':'strict', 'GF_SECURITY_DISABLE_GRAVATAR':'true',
        'GF_AUTH_LOGIN_MAXIMUM_INACTIVE_LIFETIME_DURATION':'4h', 'GF_AUTH_LOGIN_MAXIMUM_LIFETIME_DURATION':'7d',
        'GF_AUTH_ANONYMOUS_ENABLED':'false', 'GF_USERS_ALLOW_SIGN_UP':'false'}
    allowed_env = list(expected_grafana) + ['Tracing__ExportEnabled','Tracing__SampleRatio',
        'Tracing__MaxRootsPerSecond','APP_OTEL_EXPORT_ENABLED','APP_OTEL_SAMPLE_RATIO','APP_OTEL_MAX_ROOTS_PER_SECOND']
    conditions = ' '.join('(eq (index (split . "=") 0) "' + key + '")' for key in allowed_env)
    template = '{{range .Config.Env}}{{if or ' + conditions + '}}{{println .}}{{end}}{{end}}'
    for name in ('fluent-bit','prometheus','grafana','otel-collector','tempo','user-api','vocabulary-api','gateway','frontend'):
        item = {'log_driver': inspect(name, '{{.HostConfig.LogConfig.Type}}')}
        if item['log_driver'] == 'local':
            item['log_options'] = json.loads(inspect(name, '{{json .HostConfig.LogConfig.Config}}'))
        if name in ('grafana','user-api','vocabulary-api'):
            env = dict(x.split('=',1) for x in inspect(name, template).splitlines() if '=' in x)
            if name == 'grafana':
                item['p07_security_settings'] = {key: {'expected':value, 'active':env.get(key),
                    'matches':env.get(key)==value} for key,value in expected_grafana.items()}
            else:
                item['tracing_controls'] = env
        result['service_settings'][name] = item
    try:
        data = get_json('jp_dev-opensearch-1','http://127.0.0.1:9200/_cluster/health')
        result['checks']['opensearch_health'] = {key:data.get(key) for key in ('status','timed_out','number_of_nodes','unassigned_shards')}
        data = get_json('jp_dev-opensearch-1', 'http://127.0.0.1:9200/_plugins/_ism/explain/application-logs-*')
        entries = [v for k,v in data.items() if isinstance(v,dict)]
        result['checks']['opensearch_ism'] = {'indices':len(entries),
            'with_retention_policy':sum(v.get('policy_id')=='application-logs-retention' for v in entries),
            'managed_indices':sum(bool(v.get('index.plugins.index_state_management.policy_id') or v.get('policy_id')) for v in entries)}
        policy = get_json('jp_dev-opensearch-1', 'http://127.0.0.1:9200/_plugins/_ism/policies/application-logs-retention')['policy']
        result['checks']['opensearch_retention_policy'] = {'min_index_ages':[
            t.get('conditions',{}).get('min_index_age') for state in policy['states'] for t in state.get('transitions',[])]}
        stats = get_json('jp_dev-opensearch-1', 'http://127.0.0.1:9200/_stats/store,docs?filter_path=_all.total.store.size_in_bytes,_all.total.docs.count')
        result['checks']['opensearch_stats'] = stats.get('_all',{}).get('total',{})
    except Exception:
        result['checks']['opensearch_remaining'] = 'UNVERIFIED: read-only API unavailable'
    for name, url in [('tempo_ready','http://tempo:3200/ready'),('prometheus_ready','http://prometheus:9090/-/ready')]:
        try:
            raw = command(['docker','exec','jp_dev-grafana-1','wget','-q','-O','-', '-T','5',url])
            result['checks'][name] = {'reachable_from_grafana_container': True, 'ready': b'ready' in raw.lower()}
        except Exception:
            result['checks'][name] = {'status':'UNVERIFIED: existing container client unavailable or backend not ready'}
    try:
        raw = command(['docker','exec','jp_dev-grafana-1','wget','-q','-O','-','-T','5','http://tempo:3200/metrics']).decode()
        selected = {}
        for name in ('tempo_distributor_spans_received_total','tempo_ingester_traces_created_total',
                     'tempo_discarded_spans_total','tempo_distributor_ingester_append_failures_total'):
            values = re.findall(r'^' + name + r'(?:\{[^\n]*\})?\s+([0-9.eE+\-]+)$',raw,re.M)
            selected[name] = sum(map(float,values)) if values else 'NOT_EMITTED'
        result['checks']['tempo_counters'] = selected
    except Exception:
        result['checks']['tempo_counters'] = {'status':'UNVERIFIED'}
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open('http://127.0.0.1:9091/api/v1/status/flags',timeout=5) as response:
            flags = json.load(response)['data']
        expected = {'query.timeout':'15s','query.max-concurrency':'4','query.max-samples':'5000000','rules.max-concurrent-evals':'2'}
        result['checks']['prometheus_active_flags'] = {k:{'active':flags.get(k),'matches':flags.get(k)==v} for k,v in expected.items()}
    except Exception:
        result['checks']['prometheus_active_flags'] = {'status':'UNVERIFIED'}
    # Diagnostic bodies stay in memory. Do not retain messages or credentials in evidence.
    for name in ('fluent-bit','otel-collector','tempo'):
        r = subprocess.run(['docker','logs','--since','15m','--tail','200','jp_dev-'+name+'-1'],capture_output=True,timeout=15)
        text = (r.stdout+r.stderr).decode(errors='replace') if r.returncode==0 else ''
        result['checks'][name+'_diagnostic_window'] = {'read_success':r.returncode==0,'window':'15m/max200lines',
            'lines':len(text.splitlines()),'error_or_failure_lines':sum(bool(re.search(r'\berror\b|\bfailed\b|\bfatal\b',x,re.I)) for x in text.splitlines()),
            'payloads_retained':False,'limits':'Bounded diagnostic classification, not full lifetime/error-free proof'}
    (HERE/'evidence/active-acceptance-checks.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
