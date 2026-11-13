"""Generate NEW inactive P05 artifacts only. No Docker/network/application/Git mutation."""
import json
from pathlib import Path
from promql_model import Parser, selectors

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT/'observability/p05-candidate'
HERE = Path(__file__).resolve().parent
JOBS = 'user-api|vocabulary-api|prometheus'
API = 'user-api|vocabulary-api'
GROUPS = {}
RECORDS = []
ALERTS = []


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2)+'\n', encoding='utf-8')


def record(name, expression):
    RECORDS.append({'record':'jp_p05:'+name, 'expr':expression})
    return 'jp_p05:'+name


def aggregate(metric, matchers, function=None, window='5m', operation='sum'):
    source = metric+'{'+matchers+'}'
    if function:
        source = function+'('+source+'['+window+'])'
    return operation+' by (job) ('+source+')'


def http_union(dotnet, quarkus, function='rate', extra='', window='5m'):
    return aggregate(dotnet, 'job="user-api"'+extra, function, window)+' or '+aggregate(
        quarkus, 'job="vocabulary-api"'+extra.replace('code=', 'status='), function, window)


def alert(name, expression, group, severity, pending, signal, summary, description,
          owner='jp-application', service='{{ $labels.job }}', evidence='P04 local app export'):
    rule = {'alert':name, 'expr':expression, 'for':pending,
        'labels':{'severity':severity, 'service':service, 'owner':owner,
                  'signal':signal, 'monitoring_project':'jp_dev'},
        'annotations':{'summary':summary, 'description':description,
            'runbook_ref':'observability/roadmap/p05-alert-contract.md#'+group}}
    if severity == 'critical':
        rule['keep_firing_for'] = '2m'
    GROUPS.setdefault(group, []).append(rule)
    ALERTS.append({'name':name, 'group':group, 'severity':severity, 'for':pending,
        'expr':expression, 'metric_dependencies':sorted({s[1] for s in selectors(Parser(expression).parse())}),
        'evidence':evidence, 'runtime_acceptance':'NOT VERIFIED', 'notifications':'disabled',
        'owner_role':owner, 'signal':signal, 'threshold_rationale':description})


requests = record('http_requests:rate5m', http_union('http_requests_received_total', 'http_server_requests_seconds_count'))
errors = record('http_5xx:rate5m', http_union('http_requests_received_total', 'http_server_requests_seconds_count', extra=',code=~"5.."'))
error_count = record('http_5xx:increase5m', http_union('http_requests_received_total', 'http_server_requests_seconds_count', 'increase', ',code=~"5.."'))
request_count = record('http_requests:increase5m', http_union('http_requests_received_total', 'http_server_requests_seconds_count', 'increase'))
duration = record('http_duration:rate5m', http_union('http_request_duration_seconds_count', 'http_server_requests_seconds_count', extra=',route!="import"'))
fast = record('http_fast2s:rate5m', http_union('http_request_duration_seconds_bucket', 'http_server_requests_seconds_bucket', extra=',route!="import",le=~"2([.]0)?"'))
slow = record('http_slow2s:ratio5m', '1 - ('+fast+' / '+duration+')')
jwks_match = 'job=~"'+API+'",dependency="jwks-api",operation="jwks.fetch"'
observed = record('jwks_observed:increase10m', aggregate('app_dependency_duration_seconds_count', jwks_match, 'increase', '10m'))
jwks_failed = record('jwks_failed:increase10m', aggregate('app_dependency_duration_seconds_count', jwks_match+',outcome=~"failure|timeout"', 'increase', '10m'))
jwks_fast = record('jwks_fast2s:increase10m', aggregate('app_dependency_duration_seconds_bucket', jwks_match+',le=~"2([.]0)?"', 'increase', '10m'))
jwks_slow = record('jwks_slow2s:ratio10m', '1 - ('+jwks_fast+' / '+observed+')')
security = 'job=~"'+API+'",operation=~"login|refresh|authentication"'
auth_total = record('auth_events:increase5m', aggregate('app_security_events_total', security, 'increase'))
auth_failed = record('auth_failed:increase5m', aggregate('app_security_events_total', security+',outcome=~"unauthenticated|denied|failure"', 'increase'))
denied = record('authorization_denied:increase5m', aggregate('app_security_events_total', 'job=~"'+API+'",operation="authorization",outcome="denied"', 'increase'))
attempts = record('jwks_attempts:increase10m', aggregate('app_dependency_requests_total', 'job="vocabulary-api",dependency="jwks-api",operation="jwks.fetch"', 'increase', '10m'))

alert('JpServiceScrapeUnavailable', 'max by (job) (up{job=~"'+JOBS+'"}) == 0', 'availability', 'critical', '1m', 'availability',
      'A Japanese Learning target cannot be scraped', 'All configured instances of this job failed scraping for one minute; this is not proof the application process is down.', 'jp-operations', evidence='Prometheus documented scrape-generated up contract')
for job, name in [('user-api','User'), ('vocabulary-api','Learning'), ('prometheus','Prometheus')]:
    alert('JpExpected'+name+'TargetMissing', 'absent(up{job="'+job+'"})', 'availability', 'critical', '1m', 'availability',
          'An expected Japanese Learning target is absent', 'Expected configured job has no current up series; inspect config, discovery and staleness before treating this as application failure.', 'jp-operations', job, 'Prometheus documented up/absent contracts')
alert('JpScrapeDataStale', 'max by (job) (time() - timestamp(up{job=~"'+JOBS+'"})) > 45', 'integrity', 'warning', '1m', 'scrape',
      'Japanese Learning scrape samples are stale', 'Newest retained up sample is older than three proposed scrape intervals; a stopped evaluator cannot detect itself.', 'jp-operations', evidence='Prometheus scrape timestamp contract')
alert('JpScrapeSlow', 'max by (job) (scrape_duration_seconds{job=~"'+JOBS+'"}) > 4', 'integrity', 'warning', '10m', 'scrape',
      'Scraping approaches its timeout', 'Scrapes exceed 80 percent of the proposed five-second timeout for ten minutes.', 'jp-operations', evidence='Prometheus documented scrape_duration_seconds contract')
for job, metric, name in [('user-api','process_working_set_bytes','User'), ('vocabulary-api','jvm_memory_used_bytes','Learning')]:
    alert('Jp'+name+'CoreMetricsMissing', '(max by (job) (up{job="'+job+'"}) == 1) unless on (job) (count by (job) ('+metric+'{job="'+job+'"}) > 0)',
          'integrity', 'warning', '10m', 'metrics_contract', 'A healthy scrape lacks expected runtime metrics',
          'An always-registered native runtime family is missing despite successful scrapes; optional or idle HTTP families are not assumed present.', 'jp-operations')
alert('JpHttpLatencyBucketMissing', '('+duration+' >= 1) unless on (job) ('+fast+' >= 0)', 'integrity', 'warning', '10m', 'metrics_contract',
      'HTTP latency coverage is incomplete', 'Observed interactive duration volume lacks the required two-second bucket. Missing data is not treated as fast traffic.')
for severity, threshold, pending in [('warning',0.02,'5m'), ('critical',0.10,'5m')]:
    alert('JpHttp5xx'+severity.title(), '('+errors+' / '+requests+' > '+str(threshold)+') and on (job) ('+requests+' >= 1)',
          'http', severity, pending, 'http_errors', 'Sustained HTTP server failures',
          'Provisional '+str(int(threshold*100))+' percent five-minute 5xx fraction with at least one request per second; not an approved business SLO.')
for severity, threshold, pending in [('warning',0.01,'10m'), ('critical',0.05,'5m')]:
    alert('JpHttpSlow'+severity.title(), '('+slow+' > '+str(threshold)+') and on (job) ('+duration+' >= 1)',
          'http', severity, pending, 'http_latency', 'Sustained interactive HTTP latency',
          'Provisional fraction above two seconds exceeds '+str(int(threshold*100))+' percent at one request per second; import route excluded, no per-instance percentile averaging.')
alert('JpHttpFailuresBurst', error_count+' >= 50', 'http', 'warning', '2m', 'http_errors', 'A material HTTP failure burst occurred',
      'At least fifty 5xx responses in a rolling five-minute window; intentionally catches material low-volume bursts excluded by ratio guards.')
alert('JpAuthenticationFailureSpike', '('+auth_failed+' >= 20) and on (job) ('+auth_failed+' / '+auth_total+' >= 0.5)', 'security', 'warning', '5m', 'authentication',
      'Authentication rejection volume increased', 'At least twenty failures and half of observed login/refresh/authentication outcomes in five minutes; no account, token or failure message is included.', 'jp-security')
alert('JpAuthorizationDenialSpike', '('+denied+' >= 20) and on (job) ('+denied+' / '+request_count+' >= 0.1)', 'security', 'warning', '10m', 'authorization',
      'Authorization denial volume increased', 'At least twenty denials and ten percent of total HTTP requests in five minutes; the denominator is requests, not denial-only security events.', 'jp-security')
for severity, count, ratio in [('warning',3,0.2), ('critical',10,0.8)]:
    alert('JpJwksDependency'+severity.title(), '('+jwks_failed+' >= '+str(count)+') and on (job) ('+jwks_failed+' / '+observed+' > '+str(ratio)+')',
          'dependencies', severity, '5m', 'jwks_errors', 'Observed JWKS fetches are failing',
          'Provisional '+str(count)+' failed/timeout observations in ten minutes and failure fraction above '+str(ratio)+'; cached keys and unanswered Quarkus attempts are not counted as responses.')
alert('JpJwksResponseSlow', '('+jwks_slow+' > 0.2) and on (job) ('+observed+' >= 3)', 'dependencies', 'warning', '10m', 'jwks_latency',
      'Observed JWKS retrieval latency is high', 'At least three observed attempts/responses, with more than one fifth above two seconds; .NET and Quarkus completion boundaries differ.')
completion = aggregate('app_dependency_duration_seconds_count', 'job="vocabulary-api",dependency="jwks-api",operation="jwks.fetch"', 'increase', '10m')
alert('JpJwksAttemptsUnresolved', '('+attempts+' - ('+completion+' or on (job) (0 * '+attempts+'))) > 3', 'dependencies', 'warning', '10m', 'jwks_gap',
      'JWKS attempt and response accounting diverge', 'More than three unmatched initiations over ten minutes; missing completion series means unresolved, not a fabricated transport failure. In-flight work, lost samples and resets can contribute.')
alert('JpSqlConnectFailures', aggregate('app_database_operations_total', 'job="user-api",dependency="sqlserver",operation="connect",outcome="failure"', 'increase')+' >= 5',
      'dependencies', 'warning', '5m', 'database', 'SqlClient connection failures increased', 'At least five observed provider connection failures per five minutes; passive adapter availability needs real-provider acceptance.', evidence='P04 synthetic SqlClient provider fixture')
alert('JpLearningDatabaseFailures', aggregate('app_database_failures_total', 'job="vocabulary-api",dependency="mysql",category="database"', 'increase')+' >= 5',
      'dependencies', 'warning', '5m', 'database', 'Request-boundary database failures increased', 'At least five classified unexpected database failures per five minutes; not every recovered or background failure is covered.', evidence='P04 typed exception/provider fixture')
active = aggregate('app_database_pool_connections', 'job="user-api",state="active"')
pooled = aggregate('app_database_pool_connections', 'job="user-api",state="pooled"')
alert('JpSqlPoolBusy', '('+active+' / '+pooled+' > 0.9) and on (job) ('+pooled+' >= 10)', 'capacity', 'warning', '15m', 'pool',
      'Allocated SqlClient connections remain busy', 'More than ninety percent of at least ten allocated connections are active. The pool can grow: this is not proof of configured-maximum saturation.', evidence='P04 synthetic provider sample fixture; runtime max unverified')
for severity, ratio, pending in [('warning',0.85,'10m'), ('critical',0.95,'5m')]:
    alert('JpReactivePool'+severity.title(), '('+aggregate('sql_pool_ratio','job="vocabulary-api",pool="default"','',operation='max')+' > '+str(ratio)+') and on (job) ('+aggregate('sql_pool_queue_size','job="vocabulary-api",pool="default"','',operation='max')+' > 0)',
          'capacity', severity, pending, 'pool', 'Reactive SQL pool pressure persists', 'Native SQL pool ratio above '+str(ratio)+' with queued work; verify actual reactive datasource collection and max size before adoption.', evidence='P04 actual native SQL SPI fixture/local idle application export')
for severity, ratio, pending in [('warning',0.8,'10m'), ('critical',0.95,'5m')]:
    alert('JpUserMemory'+severity.title(), aggregate('process_working_set_bytes','job="user-api"',operation='max')+' / 536870912 > '+str(ratio),
          'capacity', severity, pending, 'memory', 'User API exceeds a proposed memory budget', 'Working set exceeds '+str(ratio)+' of the source-declared 512MiB envelope; actual container cap and overhead are NOT VERIFIED.', 'jp-operations')
heap_used = aggregate('jvm_memory_used_bytes', 'job="vocabulary-api",area="heap"')
heap_max = 'sum by (job) (jvm_memory_max_bytes{job="vocabulary-api",area="heap"} > 0)'
for severity, ratio, pending in [('warning',0.85,'10m'), ('critical',0.95,'5m')]:
    alert('JpLearningHeap'+severity.title(), '('+heap_used+' / '+heap_max+' > '+str(ratio)+') and on (job) ('+heap_max+' > 0)',
          'capacity', severity, pending, 'memory', 'Learning API heap occupancy persists', 'Used heap exceeds '+str(ratio)+' of positive native heap maxima; this excludes native/off-heap/container memory and requires GC/max semantics acceptance.', 'jp-operations')
alert('JpUserCpuBudget', aggregate('process_cpu_seconds_total','job="user-api"','rate')+' > 1.6', 'capacity', 'warning', '10m', 'cpu',
      'User API CPU consumption is sustained', 'More than 1.6 CPU-seconds per second against a provisional source two-vCPU budget; verify actual quota before adoption.', 'jp-operations')
alert('JpLearningCpuBusy', aggregate('process_cpu_usage','job="vocabulary-api"',operation='max')+' > 0.8', 'capacity', 'warning', '15m', 'cpu',
      'Learning API native process CPU usage is high', 'Native process CPU fraction exceeds 0.8; this is not a verified cgroup/quota utilization ratio.', 'jp-operations')
for severity, count, pending in [('warning',4000,'10m'), ('critical',4750,'5m')]:
    alert('JpScrapeSample'+severity.title(), aggregate('scrape_samples_post_metric_relabeling','job=~"'+JOBS+'"',operation='max')+' > '+str(count),
          'capacity', severity, pending, 'samples', 'A scrape approaches its sample budget', 'More than '+str(count)+' post-relabel samples against 5000 per-target limit; not TSDB active-head cardinality or disk-free capacity.', 'jp-operations', evidence='Prometheus documented per-scrape sample metric contract')


def build():
    save(OUT/'prometheus/rules/p05.rules.yml', {'groups':[
        {'name':'jp_p05.recording','interval':'15s','rules':RECORDS},
        *[{'name':'jp_p05.'+name, 'interval':'15s','rules':rules} for name,rules in GROUPS.items()]]})
    jobs=[]
    for job, target, path in [('user-api','user-api:8080','/metrics'),
            ('vocabulary-api','vocabulary-api:8080','/q/metrics'),
            ('prometheus','prometheus:9090','/metrics')]:
        jobs.append({'job_name':job,'metrics_path':path,'honor_labels':False,
            'sample_limit':5000,'body_size_limit':'5MB','label_limit':16,
            'label_value_length_limit':128,'static_configs':[{'targets':[target]}]})
    save(OUT/'prometheus/prometheus.yml', {'global':{'scrape_interval':'15s','scrape_timeout':'5s',
        'evaluation_interval':'15s','external_labels':{'monitoring_project':'jp_dev','monitoring_role':'p05-candidate'}},
        'rule_files':['rules/p05.rules.yml'],'scrape_configs':jobs})
    save(OUT/'alertmanager/alertmanager.candidate.yml', {'global':{'resolve_timeout':'5m'},
        'route':{'receiver':'review-only','group_by':['monitoring_project','service','signal'],
            'group_wait':'15s','group_interval':'1m','repeat_interval':'4h',
            'routes':[{'receiver':'review-only','matchers':['severity="critical"'],'repeat_interval':'1h'}]},
        'inhibit_rules':[{'source_matchers':['severity="critical"'],'target_matchers':['severity="warning"'],
                          'equal':['monitoring_project','service','signal']}],
        'receivers':[{'name':'review-only'}]})
    save(OUT/'grafana/provisioning/datasources/prometheus.yml', {'apiVersion':1,'datasources':[{
        'name':'JP Dev P05 Prometheus','uid':'jp-dev-prometheus','type':'prometheus','access':'proxy',
        'url':'http://prometheus:9090','orgId':1,'isDefault':True,'editable':False,
        'jsonData':{'httpMethod':'POST','timeInterval':'15s'}}]})
    save(OUT/'grafana/provisioning/dashboards/health.yml', {'apiVersion':1,'providers':[{
        'name':'jp-dev-p05-health','orgId':1,'folder':'JP Dev P05','type':'file',
        'disableDeletion':True,'allowUiUpdates':False,'updateIntervalSeconds':60,
        'options':{'path':'/etc/grafana/p05-dashboards'}}]})
    save(OUT/'grafana/dashboards/monitoring-health.json', {'uid':'jp-dev-p05-health',
        'title':'JP Dev P05 Monitoring Health (candidate)','schemaVersion':39,'version':1,
        'editable':False,'refresh':'15s','time':{'from':'now-30m','to':'now'},
        'panels':[{'id':1,'title':'Scrape availability; absent is unknown','type':'timeseries',
            'gridPos':{'x':0,'y':0,'w':24,'h':8},'datasource':{'type':'prometheus','uid':'jp-dev-prometheus'},
            'targets':[{'refId':'A','expr':'max by (job) (up{job=~"'+JOBS+'"})','legendFormat':'{{job}}'}],
            'fieldConfig':{'defaults':{'unit':'short','min':0,'max':1},'overrides':[]}}]})
    labels={'jp.observability.phase':'P05','jp.observability.owner':'japanese-learning',
            'jp.observability.role':'monitoring'}
    security={'init':True,'read_only':True,'cap_drop':['ALL'],
        'security_opt':['no-new-privileges:true'],'mem_limit':'512m','memswap_limit':'512m',
        'cpus':1,'pids_limit':128,'restart':'unless-stopped','stop_grace_period':'30s',
        'tmpfs':['/tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777'],
        'logging':{'driver':'local','options':{'max-size':'10m','max-file':'3'}},'labels':labels}
    def bind(source, target):
        return {'type':'bind','source':source,'target':target,'read_only':True,'bind':{'create_host_path':False}}
    save(HERE/'evidence/compose-transfer-target.json', {'name':'jp_dev','services':{
        'prometheus':{**security,
            'image':'prom/prometheus:v3.14.0@sha256:5ce7540c3c00ef4ab0c9d2c995c6a5b9c421f44b4a115d97a2c7af3b1c21cbb0',
            'user':'65534:65534','command':['--config.file=/etc/prometheus/prometheus.yml',
                '--storage.tsdb.path=/prometheus','--storage.tsdb.retention.time=2d',
                '--storage.tsdb.retention.size=512MB','--web.listen-address=0.0.0.0:9090'],
            'ports':['127.0.0.1:9091:9090'], 'networks':['default','p05-monitoring'],
            'volumes':['prometheus_data:/prometheus',bind('./prometheus','/etc/prometheus')],
            'healthcheck':{'test':['CMD','wget','-q','-O','/dev/null','http://127.0.0.1:9090/-/ready'],
                'interval':'15s','timeout':'5s','retries':6,'start_period':'30s'}},
        'grafana':{**security,
            'image':'grafana/grafana:13.2.2@sha256:ac461fb352abc50da10a51c7d02462e9c05488f11f53f14b3ad79a8145f638a0',
            'user':'472:472','ports':['127.0.0.1:3001:3000'],'networks':['default','p05-monitoring'],
            'environment':{'GF_SECURITY_ADMIN_USER':'${GRAFANA_ADMIN_USER:?Set a dedicated jp_dev Grafana admin name}',
                'GF_SECURITY_ADMIN_PASSWORD':'${GRAFANA_ADMIN_PASSWORD:?Set a dedicated jp_dev Grafana password}',
                'GF_AUTH_ANONYMOUS_ENABLED':'false','GF_USERS_ALLOW_SIGN_UP':'false',
                'GF_ANALYTICS_REPORTING_ENABLED':'false','GF_ANALYTICS_CHECK_FOR_UPDATES':'false',
                'GF_ANALYTICS_CHECK_FOR_PLUGIN_UPDATES':'false','GF_PLUGINS_PREINSTALL_DISABLED':'true',
                'GF_LOG_MODE':'console','GF_LOG_LEVEL':'warn','GF_PATHS_LOGS':'/tmp/grafana-logs'},
            'volumes':['grafana_data:/var/lib/grafana',
                bind('./grafana/provisioning','/etc/grafana/provisioning'),
                bind('./grafana/dashboards','/etc/grafana/p05-dashboards')],
            'depends_on':{'prometheus':{'condition':'service_healthy'}},
            'healthcheck':{'test':['CMD','wget','-q','-O','/dev/null','http://127.0.0.1:3000/api/health'],
                'interval':'15s','timeout':'5s','retries':6,'start_period':'30s'}}},
        'networks':{'p05-monitoring':{'internal':True,'labels':labels}, 'default':{}},
        'volumes':{'prometheus_data':{'labels':labels},'grafana_data':{'labels':labels}}})
    save(HERE/'evidence/alert-manifest.json', {'scope':'inactive candidates; all runtime acceptance NOT VERIFIED',
        'recordings':RECORDS, 'alerts':ALERTS,
        'deferred':['JWKS server scrape/availability: endpoint not enabled/verified',
            'Fluent Bit drops/retries/backlog/oldest age and log loss: no captured exporter contracts',
            'OpenSearch ingestion/disk/index/cluster: no verified exporter',
            'Host/volume free bytes and forecast exhaustion: no verified filesystem exporter',
            'TSDB head/WAL/evaluation/self-metric counters: no actual pinned-image samples',
            'Grafana metrics/errors: endpoint auth and names not captured',
            'Nginx gateway/frontend status/upstream pressure: no exporter',
            'SQL Server/MySQL server health/max pool/waits/query metrics: missing scoped exporter',
            'Prometheus/Grafana total-outage external watchdog and notification delivery: no approved receiver',
            'Low-traffic dependency/readiness canaries: no approved isolated probe']})
    print(json.dumps({'alerts':len(ALERTS),'recording_rules':len(RECORDS),'groups':len(GROUPS)+1}))


if __name__ == '__main__':
    build()
