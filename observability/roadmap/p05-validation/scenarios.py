"""Synthetic scenarios shared by the limited model and genuine promtool fixtures.

Expected outcomes are explicit, independently authored assertions, not model outputs.
"""
import copy
import json
from pathlib import Path
from promql_model import RuleModel

HERE = Path(__file__).resolve().parent
RULE_PATH = HERE.parents[1]/'p05-candidate/prometheus/rules/p05.rules.yml'
RULES = json.loads(RULE_PATH.read_text())
ALERTS = [r for g in RULES['groups'] for r in g['rules'] if 'alert' in r]
CASES = []

def series(metric, job='user-api', value=0, slope=None, **labels):
    return {'metric':metric,'labels':{'job':job, **labels},
        'points':[(i*60, value+i*slope if slope is not None else value) for i in range(41)]}

def base():
    data=[]
    for job in ('user-api','vocabulary-api','prometheus'):
        data += [series('up',job,1),series('scrape_duration_seconds',job,.1),
                 series('scrape_samples_post_metric_relabeling',job,120)]
    data += [series('process_working_set_bytes',value=100*1024**2),
        series('process_cpu_seconds_total',slope=6),
        series('jvm_memory_used_bytes','vocabulary-api',100*1024**2,area='heap',id='synthetic'),
        series('jvm_memory_max_bytes','vocabulary-api',512*1024**2,area='heap',id='synthetic'),
        series('process_cpu_usage','vocabulary-api',.1)]
    for job in ('user-api','vocabulary-api'):
        data += http(job)
    return data

def http(job, status='200', count=60, fast=None):
    native = job == 'user-api'
    labels = {'route':'me' if native else 'flashcard', 'method':'GET'}
    labels['code' if native else 'status'] = status
    if native:
        labels['http_method'] = labels.pop('method')
    prefix = 'http_request_duration_seconds' if native else 'http_server_requests_seconds'
    result = [series(prefix+'_count',job,slope=count,**labels),
              series(prefix+'_bucket',job,slope=count if fast is None else fast,le='2.0',**labels)]
    if native:
        result.append(series('http_requests_received_total',job,slope=count,**labels))
    return result

def alter(data, metric, job='user-api', value=None, slope=None, remove=False):
    selected = [s for s in data if s['metric']==metric and s['labels']['job']==job]
    for s in selected:
        if remove:
            data.remove(s)
        else:
            s['points']=[(i*60, value if slope is None else i*slope) for i in range(41)]

def add(name, mutate=lambda d:None, expected=(), at=1800):
    data=base()
    mutate(data)
    CASES.append({'name':name,'series':data,'expected':set(expected),'at':at})

def expects(*names, job='user-api'):
    return [(name,job) for name in names]

add('healthy baseline')
for job in ('user-api','vocabulary-api','prometheus'):
    add('unavailable '+job,lambda d,j=job:alter(d,'up',j,0),expects('JpServiceScrapeUnavailable',job=job))
for job, part in [('user-api','User'),('vocabulary-api','Learning'),('prometheus','Prometheus')]:
    add('missing '+job,lambda d,j=job:alter(d,'up',j,remove=True),expects('JpExpected'+part+'TargetMissing',job=job))
add('slow scrape',lambda d:alter(d,'scrape_duration_seconds',value=4.5),expects('JpScrapeSlow'))
for job, metric, part in [('user-api','process_working_set_bytes','User'),('vocabulary-api','jvm_memory_used_bytes','Learning')]:
    add('missing core '+job,lambda d,j=job,m=metric:alter(d,m,j,remove=True),expects('Jp'+part+'CoreMetricsMissing',job=job))
add('missing latency bucket',lambda d:alter(d,'http_request_duration_seconds_bucket',remove=True),expects('JpHttpLatencyBucketMissing'))
add('HTTP warning',lambda d:d.extend(http('user-api','500',3)),expects('JpHttp5xxWarning'))
add('HTTP critical',lambda d:d.extend(http('vocabulary-api','500',60)),expects('JpHttp5xxWarning','JpHttp5xxCritical','JpHttpFailuresBurst',job='vocabulary-api'))
add('latency warning',lambda d:alter(d,'http_request_duration_seconds_bucket',slope=58.8),expects('JpHttpSlowWarning'))
add('latency critical',lambda d:alter(d,'http_server_requests_seconds_bucket','vocabulary-api',slope=54),expects('JpHttpSlowWarning','JpHttpSlowCritical',job='vocabulary-api'))
add('authentication rejection',lambda d:d.extend([
    series('app_security_events_total',slope=20,operation='login',outcome='success'),
    series('app_security_events_total',slope=60,operation='login',outcome='unauthenticated')]),expects('JpAuthenticationFailureSpike'))
add('authorization denial',lambda d:d.append(series('app_security_events_total','vocabulary-api',slope=20,operation='authorization',outcome='denied')),expects('JpAuthorizationDenialSpike',job='vocabulary-api'))

def jwks(data, job, success, failure, fast=None, attempts=None):
    for outcome,count in [('success',success),('failure',failure)]:
        if count:
            labels={'dependency':'jwks-api','operation':'jwks.fetch','outcome':outcome}
            data.extend([series('app_dependency_duration_seconds_count',job,slope=count,**labels),
                series('app_dependency_duration_seconds_bucket',job,slope=count if fast is None else fast,le='2.0',**labels)])
    if attempts is not None:
        data.append(series('app_dependency_requests_total',job,slope=attempts,dependency='jwks-api',operation='jwks.fetch'))

add('JWKS warning',lambda d:jwks(d,'user-api',3,1),expects('JpJwksDependencyWarning'))
add('JWKS critical',lambda d:jwks(d,'vocabulary-api',0,20,attempts=20),expects('JpJwksDependencyWarning','JpJwksDependencyCritical',job='vocabulary-api'))
add('JWKS slow',lambda d:jwks(d,'user-api',6,0,fast=0),expects('JpJwksResponseSlow'))
add('JWKS unanswered',lambda d:jwks(d,'vocabulary-api',0,0,attempts=1),expects('JpJwksAttemptsUnresolved',job='vocabulary-api'))
add('SQL connect failures',lambda d:d.append(series('app_database_operations_total',slope=2,dependency='sqlserver',operation='connect',outcome='failure')),expects('JpSqlConnectFailures'))
add('learning database failures',lambda d:d.append(series('app_database_failures_total','vocabulary-api',slope=2,dependency='mysql',category='database')),expects('JpLearningDatabaseFailures',job='vocabulary-api'))
add('SQL allocated pool busy',lambda d:d.extend([series('app_database_pool_connections',value=19,state='active'),series('app_database_pool_connections',value=20,state='pooled')]),expects('JpSqlPoolBusy'))
for ratio,names in [(.9,['JpReactivePoolWarning']),(.98,['JpReactivePoolWarning','JpReactivePoolCritical'])]:
    add('reactive pool '+str(ratio),lambda d,r=ratio:d.extend([series('sql_pool_ratio','vocabulary-api',r,pool='default'),series('sql_pool_queue_size','vocabulary-api',1,pool='default')]),expects(*names,job='vocabulary-api'))
for ratio,names in [(.85,['JpUserMemoryWarning']),(.98,['JpUserMemoryWarning','JpUserMemoryCritical'])]:
    add('user memory '+str(ratio),lambda d,r=ratio:alter(d,'process_working_set_bytes',value=r*512*1024**2),expects(*names))
for ratio,names in [(.9,['JpLearningHeapWarning']),(.98,['JpLearningHeapWarning','JpLearningHeapCritical'])]:
    add('learning heap '+str(ratio),lambda d,r=ratio:alter(d,'jvm_memory_used_bytes','vocabulary-api',value=r*512*1024**2),expects(*names,job='vocabulary-api'))
add('user CPU',lambda d:alter(d,'process_cpu_seconds_total',slope=120),expects('JpUserCpuBudget'))
add('learning CPU',lambda d:alter(d,'process_cpu_usage','vocabulary-api',value=.9),expects('JpLearningCpuBusy',job='vocabulary-api'))
for size,names in [(4500,['JpScrapeSampleWarning']),(4900,['JpScrapeSampleWarning','JpScrapeSampleCritical'])]:
    add('scrape cardinality '+str(size),lambda d,v=size:alter(d,'scrape_samples_post_metric_relabeling',value=v),expects(*names))
add('no traffic',lambda d:[alter(d,m,j,slope=0) for j in ('user-api','vocabulary-api') for m in ('http_requests_received_total','http_request_duration_seconds_count','http_request_duration_seconds_bucket','http_server_requests_seconds_count','http_server_requests_seconds_bucket')])
def low(d):
    for m in ('http_requests_received_total','http_request_duration_seconds_count','http_request_duration_seconds_bucket'):
        alter(d,m,slope=.4)
    d.extend(http('user-api','500',.1))
add('low traffic error guard',low)
add('unknown heap maximum',lambda d:alter(d,'jvm_memory_max_bytes','vocabulary-api',value=-1))
def stale(d):
    for s in d:
        if s['metric']=='up' and s['labels']['job']=='user-api':
            s['points']=s['points'][:2]
add('stale sample',stale,expects('JpScrapeDataStale'),at=210)
def reset(d):
    for s in d:
        if s['metric']=='process_cpu_seconds_total':
            s['points']=[(i*60,(i%10)*6) for i in range(41)]
add('counter resets',reset)
def recovery(d):
    for s in d:
        if s['metric']=='up' and s['labels']['job']=='user-api':
            s['points']=[(i*60,0 if i<5 else 1) for i in range(41)]
add('critical recovery held',recovery,expects('JpServiceScrapeUnavailable'),at=390)
add('critical recovery clears',recovery,at=420)
add('startup pending',lambda d:alter(d,'up',value=0),at=30)

def run(case):
    model=RuleModel(RULES,case['series'])
    result=[]
    for at in range(0,case['at']+1,15):
        result=model.step(at)
    return result

def generate_promtool():
    tests=[]
    for case in CASES:
        inputs=[]
        for s in case['series']:
            labels=','.join(k+'='+json.dumps(v) for k,v in s['labels'].items())
            points=dict(s['points'])
            values=' '.join(str(points.get(i*60,'_')) for i in range(41))
            inputs.append({'series':s['metric']+'{'+labels+'}','values':values})
        expectations=[]
        for rule in ALERTS:
            wanted=[]
            for name,job in sorted(case['expected']):
                if name!=rule['alert']:
                    continue
                labels={'job':job, **{k:v.replace('{{ $labels.job }}',job) for k,v in rule['labels'].items()}}
                wanted.append({'exp_labels':labels,'exp_annotations':rule['annotations']})
            expectations.append({'eval_time':str(case['at'])+'s','alertname':rule['alert'],'exp_alerts':wanted})
        tests.append({'name':case['name'],'interval':'1m','input_series':inputs,'alert_rule_test':expectations})
    fixture={'rule_files':['../../p05-candidate/prometheus/rules/p05.rules.yml'],
        'evaluation_interval':'15s','group_eval_order':[g['name'] for g in RULES['groups']], 'tests':tests}
    (HERE/'promtool.tests.yml').write_text(json.dumps(fixture,indent=2)+'\n')

if __name__=='__main__':
    generate_promtool()
    print(json.dumps({'scenarios':len(CASES),'alerts':len(ALERTS)}))
