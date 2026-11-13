"""Read-only current P07 audit. Never mutates Docker, posts telemetry or persists payloads.

Docker cp archives are consumed in memory; no files are extracted. Live state metadata
is NOT a consistent backup or proof of acknowledged delivery. HTTP calls are GET only.
"""
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
E = Path(__file__).parent / 'evidence'


def command(args, timeout=20):
    r = subprocess.run(args, capture_output=True, timeout=timeout)
    if r.returncode:
        raise RuntimeError('Read-only command failed (payload/error text suppressed)')
    return r.stdout


def archive(container, path, limit=64 * 1024 * 1024):
    # Stream and cap archive bytes. Termination below affects only this local docker client.
    process = subprocess.Popen(['docker', 'cp', container + ':' + path, '-'],
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    try:
        data = process.stdout.read(limit + 1)
        if len(data) > limit:
            raise ValueError('Read-only archive size cap exceeded')
        assert process.wait(timeout=20) == 0
        return tarfile.open(fileobj=io.BytesIO(data))
    finally:
        process.stdout.close()
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=5)


def file_bytes(container, path):
    with archive(container, path, 2 * 1024 * 1024) as tar:
        files = [x for x in tar.getmembers() if x.isfile()]
        assert len(files) == 1
        return tar.extractfile(files[0]).read()


def get_json(container, url):
    return json.loads(command(['docker', 'exec', container, 'curl', '--silent', '--show-error',
        '--fail', '--max-time', '8', url]))


def metric_totals(value):
    # No arbitrary label values or raw payload fields are retained.
    if isinstance(value, dict):
        return {k: metric_totals(v) for k, v in value.items()
                if k in {'input', 'output', 'filter', 'records', 'bytes', 'errors', 'retries',
                         'retries_failed', 'dropped_records', 'proc_records', 'proc_bytes',
                         'mem_size', 'mem_chunks', 'fs_chunks', 'up', 'down', 'chunks',
                         'total_chunks', 'busy_chunks', 'busy_bytes', 'storage_layer', 'input_chunks',
                         'status', 'total', 'busy', 'busy_size', 'overlimit', 'fs_chunks_up', 'fs_chunks_down'} or re.fullmatch(r'(?:tail|opensearch|lua)\.\d+', k)}
    if isinstance(value, (int,float,bool)):
        return value
    return value if isinstance(value,str) and re.fullmatch(r'[0-9.]+[kKmMgG]?[bB]?',value) else None


def main():
    report = {'captured_utc': datetime.now(timezone.utc).isoformat(), 'checks': {},
              'scope': 'Current read-only source hashes, metadata, counters and bounded aggregate privacy scan; no ingestion/fault/restart'}
    mapping = {
        'fluent_bit_config': ('jp_dev-fluent-bit-1', '/fluent-bit/etc/fluent-bit.conf', 'fluent-bit/fluent-bit.conf'),
        'fluent_bit_lua': ('jp_dev-fluent-bit-1', '/fluent-bit/etc/normalize.lua', 'fluent-bit/normalize.lua'),
        'fluent_bit_parser': ('jp_dev-fluent-bit-1', '/fluent-bit/etc/parsers-app.conf', 'fluent-bit/parsers-app.conf'),
        'collector_config': ('jp_dev-otel-collector-1', '/etc/otelcol/config.yml', 'collector.yml'),
        'tempo_config': ('jp_dev-tempo-1', '/etc/tempo/config.yml', 'tempo.yml'),
        'prometheus_config': ('jp_dev-prometheus-1', '/etc/prometheus/prometheus.yml', 'prometheus/prometheus.yml'),
        'prometheus_rules': ('jp_dev-prometheus-1', '/etc/prometheus/rules/p05.rules.yml', 'prometheus/rules/p05.rules.yml'),
        'grafana_prometheus': ('jp_dev-grafana-1', '/etc/grafana/provisioning/datasources/prometheus.yml', 'grafana/provisioning/datasources/prometheus.yml'),
        'grafana_tempo': ('jp_dev-grafana-1', '/etc/grafana/provisioning/datasources/tempo.yml', 'grafana/provisioning/datasources/tempo.yml')}
    for key, (container, path, local) in mapping.items():
        try:
            active = file_bytes(container, path)
            intended = (ROOT / 'observability/p07' / local).read_bytes()
            report['checks'][key] = {'status': 'MATCH' if active == intended else 'DIFFERS',
                'active_sha256': hashlib.sha256(active).hexdigest(), 'intended_sha256': hashlib.sha256(intended).hexdigest()}
            if key == 'fluent_bit_config':
                text = active.decode()
                report['checks'][key].update(memory_inputs=len(re.findall(r'storage.type\s+memory', text)),
                    filesystem_inputs=len(re.findall(r'storage.type\s+filesystem', text)),
                    retry_limit=re.findall(r'Retry_Limit\s+(\S+)', text), storage_path_present='storage.path' in text)
        except Exception:
            report['checks'][key] = {'status': 'UNVERIFIED: read-only config archive unavailable'}
    try:
        version = command(['docker', 'exec', 'jp_dev-fluent-bit-1', '/fluent-bit/bin/fluent-bit', '--version']).decode()
        report['checks']['fluent_bit_version'] = {'version': re.search(r'Fluent Bit v?([0-9.]+)', version).group(1)}
    except Exception:
        report['checks']['fluent_bit_version'] = {'status': 'UNVERIFIED'}
    try:
        regular, chunks, sizes, unexpected, chunk_bytes = 0, 0, {}, 0, 0
        with archive('jp_dev-fluent-bit-1', '/state') as tar:
            for member in tar.getmembers():
                if not member.isfile():
                    continue
                regular += 1
                if '/buffer/' in '/' + member.name or member.name.endswith('.flb'):
                    chunks += 1
                    chunk_bytes += member.size
                base = Path(member.name).name
                if base in {n + suffix for n in ('jwks.db', 'user.db', 'vocabulary.db') for suffix in ('', '-wal', '-shm')}:
                    sizes[base] = member.size
                else:
                    unexpected += 1
            total = sum(m.size for m in tar.getmembers() if m.isfile())
        report['checks']['fluent_bit_state'] = {'regular_files': regular, 'regular_buffer_chunk_files': chunks,
            'regular_buffer_chunk_bytes': chunk_bytes,
            'logical_bytes': total, 'tail_db_files_bytes': sizes, 'other_files': unexpected,
            'consistent_backup': False, 'memory_inflight_or_delivery_ack_proof': False}
    except Exception:
        report['checks']['fluent_bit_state'] = {'status': 'UNVERIFIED: live metadata archive unavailable'}
    for stage in ('first', 'second'):
        if stage == 'second':
            time.sleep(5)
        for endpoint in ('metrics', 'storage'):
            try:
                data = get_json('jp_dev-opensearch-1', 'http://fluent-bit:2020/api/v1/' + endpoint)
                report['checks']['fluent_bit_' + endpoint + '_' + stage] = metric_totals(data)
            except Exception:
                report['checks']['fluent_bit_' + endpoint + '_' + stage] = {'status': 'UNVERIFIED: endpoint unavailable'}
    try:
        health = command(['docker', 'exec', 'jp_dev-opensearch-1', 'curl', '--silent', '--fail',
            '--max-time', '8', 'http://fluent-bit:2020/api/v1/health']).decode().strip()
        report['checks']['fluent_bit_health'] = {'healthy': health == 'ok'}
    except Exception:
        report['checks']['fluent_bit_health'] = {'status': 'FAIL_OR_UNAVAILABLE'}
    try:
        # GET body, not POST; bounded latest sample stays in memory. Never retain documents/IDs/values.
        query = json.dumps({'size': 20, 'sort': [{'collected_at': 'desc'}], 'query': {'match_all': {}}})
        raw = json.loads(command(['docker', 'exec', 'jp_dev-opensearch-1', 'curl', '--silent', '--fail',
            '--max-time', '8', '-X', 'GET', '-H', 'Content-Type: application/json', '--data-binary', query,
            'http://127.0.0.1:9200/application-logs-*/_search']))
        hits = raw['hits']['hits']
        forbidden = {'original', 'Properties', 'authorization', 'cookie', 'password', 'user_id',
                     'email', 'body', 'request_body', 'response_body', 'db.statement'}
        def unsafe_keys(obj):
            if isinstance(obj, dict):
                return any(k.lower() in {x.lower() for x in forbidden} or unsafe_keys(v) for k, v in obj.items())
            return isinstance(obj, list) and any(unsafe_keys(v) for v in obj)
        report['checks']['opensearch_latest_privacy_sample'] = {'sampled_documents': len(hits),
            'documents_with_forbidden_keys': sum(unsafe_keys(h.get('_source', {})) for h in hits),
            'documents_with_original': sum('original' in h.get('_source', {}) for h in hits),
            'latest_collected_at': max((h.get('_source', {}).get('collected_at', '') for h in hits), default=''),
            'limits': 'Bounded latest sample/key scan only; no complete value/sentinel/historical privacy proof; no payload retained'}
    except Exception:
        report['checks']['opensearch_latest_privacy_sample'] = {'status': 'UNVERIFIED'}
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for key, path in [('prometheus_targets', 'targets'), ('prometheus_rules', 'rules')]:
        try:
            with opener.open('http://127.0.0.1:9091/api/v1/' + path, timeout=8) as response:
                data = json.load(response)['data']
            if path == 'targets':
                report['checks'][key + '_runtime'] = {'targets': len(data['activeTargets']),
                    'up': sum(x['health'] == 'up' for x in data['activeTargets']),
                    'with_error': sum(bool(x.get('lastError')) for x in data['activeTargets'])}
            else:
                rules = [x for group in data['groups'] for x in group['rules']]
                report['checks'][key + '_runtime'] = {'rules': len(rules), 'healthy': sum(x['health'] == 'ok' for x in rules)}
        except Exception:
            report['checks'][key + '_runtime'] = {'status': 'UNVERIFIED'}
    (E / 'active-runtime-audit.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
