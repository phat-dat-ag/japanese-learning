"""Two bounded read-only API GET probes, synthetic context, private Tempo/log retrieval.

No credentials, business writes, deployment or faults. Normal telemetry from GETs is
expected; existing stored data is not altered. Raw responses never leave process memory.
"""
from datetime import datetime, timezone
import base64
import json
from pathlib import Path
import secrets
import subprocess
import time
import urllib.error
import urllib.request

HERE = Path(__file__).resolve().parent
helpers = {'__name__':'readonly_helpers','__file__':str(HERE/'audit_active.py')}
exec(compile((HERE/'audit_active.py').read_text(),str(HERE/'audit_active.py'),'exec'),helpers)
command = helpers['command']


def strings(value):
    if isinstance(value,dict):
        for key,item in value.items():
            yield str(key)
            yield from strings(item)
    elif isinstance(value,list):
        for item in value:
            yield from strings(item)
    elif isinstance(value,str):
        yield value


def main():
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    report={'captured_utc':datetime.now(timezone.utc).isoformat(), 'scope':'Read-only GET probes using synthetic context; normal new telemetry only; no business writes', 'probes':[]}
    sentinel='P07_SYNTHETIC_PRIVATE'
    for name,url in [('user-api','http://127.0.0.1:8880/api/auth/me'),
                     ('vocabulary-api','http://127.0.0.1:8880/api/v1/jlpt-levels')]:
        # Both public-boundary samplers apply the configured10% threshold even to a sampled remote parent.
        # Prefix01 lies below that threshold; this changes no sampler configuration.
        trace_id='01'+secrets.token_hex(15)
        parent_id=secrets.token_hex(8)
        correlation='p07-probe-'+secrets.token_hex(6)
        request=urllib.request.Request(url+'?p07_private='+sentinel,headers={
            'traceparent':'00-'+trace_id+'-'+parent_id+'-01', 'X-Correlation-ID':correlation,
            'X-P07-Privacy-Probe':sentinel},method='GET')
        try:
            with opener.open(request,timeout=8) as response:
                code=response.status
        except urllib.error.HTTPError as ex:
            code=ex.code
        except OSError:
            code='UNVERIFIED: request unavailable'
        item={'service':name,'http_status':code,'trace_id':trace_id,'parent_id':parent_id,
              'correlation_id':correlation,'via_gateway':True,'sampling_fixture':'Below configured0.1 public-boundary threshold; remote flag01', 'tempo_retrieval':'NOT_FOUND_WITHIN_WINDOW'}
        for _ in range(8):
            time.sleep(2)
            try:
                payload=command(['docker','exec','jp_dev-grafana-1','wget','-q','-O','-', '-T','4',
                    '--header=Accept: application/json', 'http://tempo:3200/api/traces/'+trace_id])
                data=json.loads(payload)
                text=list(strings(data))
                item['tempo_retrieval']='PASS'
                item['private_sentinel_present']=any(sentinel in value for value in text)
                item['parent_id_present']=any(value.lower()==parent_id or value==base64.b64encode(bytes.fromhex(parent_id)).decode() for value in text)
                item['service_identity_present']=name in text and 'japanese-learning' in text
                # Store only counts and comparisons, never arbitrary attribute/event/SQL values.
                spans=[]
                def collect(obj):
                    if isinstance(obj,dict):
                        if 'spanId' in obj:spans.append(obj)
                        for value in obj.values():collect(value)
                    elif isinstance(obj,list):
                        for value in obj:collect(value)
                collect(data)
                item['spans']=len(spans)
                item['span_ids_unique']=len({s['spanId'] for s in spans})==len(spans)
                item['server_spans']=sum(s.get('kind') in (2,'SPAN_KIND_SERVER') for s in spans)
                item['events']=sum(len(s.get('events',[])) for s in spans)
                item['links']=sum(len(s.get('links',[])) for s in spans)
                break
            except Exception:
                continue
        try:
            query=json.dumps({'size':10,'query':{'term':{'correlation_id':correlation}}})
            data=json.loads(command(['docker','exec','jp_dev-opensearch-1','curl','--silent','--fail',
                '--max-time','5','-X','GET','-H','Content-Type: application/json','--data-binary',query,
                'http://127.0.0.1:9200/application-logs-*/_search']))
            hits=data['hits']['hits']
            item['correlated_log_documents']=len(hits)
            item['logs_matching_trace_id']=sum(h.get('_source',{}).get('trace_id')==trace_id for h in hits)
            item['log_private_sentinel_present']=any(sentinel in value for h in hits for value in strings(h.get('_source',{})))
            item['log_original_present']=any('original' in h.get('_source',{}) for h in hits)
        except Exception:
            item['log_correlation']='UNVERIFIED'
        report['probes'].append(item)
    (HERE/'evidence/live-trace-probes.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))


if __name__=='__main__':
    main()
