"""Regenerate P07 component files. Root Compose is the sole Compose source; no lifecycle actions."""
import json
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[3]
DEST = ROOT / 'observability/p07'


def write(name, value):
    path = DEST / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + '\n')


def prepare():
    DEST.mkdir(parents=True, exist_ok=True)
    # Compile static metadata registries from reviewed source, never from incoming records.
    events = {'http.request.completed', 'http.request.failed', 'operation.completed',
              'dependency.completed', 'job.started', 'job.completed', 'log.message'}
    errors = {'INTERNAL_SERVER_ERROR', 'REQUEST_INTERRUPTED', 'VALIDATION_ERROR',
              'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT'}
    error_types = {'System.InvalidOperationException','System.TimeoutException',
        'System.OperationCanceledException','System.ArgumentException',
        'Microsoft.Data.SqlClient.SqlException','java.sql.SQLException',
        'java.lang.IllegalArgumentException','java.lang.IllegalStateException',
        'java.util.concurrent.CancellationException','io.vertx.mysqlclient.MySQLException',
        'validation','authentication','authorization','database','dependency','transport','http','timeout','internal'}
    routes = {'/unmatched'} | {'/api/auth/' + route for route in
                              ('login','register','refresh','logout','me','admin-test')}
    for folder in ('dotnet/src', 'quarkus/src/main/java', 'springboot-jwks-api/src/main/java'):
        for path in (ROOT / folder).rglob('*'):
            if path.suffix not in ('.java', '.cs'):
                continue
            text = path.read_text(encoding='utf-8-sig')
            package = re.search(r'(?:package|namespace)\s+([A-Za-z0-9_.]+)', text)
            for name in re.findall(r'class\s+([A-Za-z0-9_]*Exception)\b', text):
                error_types.add(name)
                if package:
                    error_types.add(package.group(1) + '.' + name)
            paths = re.findall(r'@Path\("([A-Za-z0-9_/{}/-]+)"\)', text)
            if paths and paths[0].startswith('/api/'):
                routes.add(paths[0])
                routes.update(paths[0].rstrip('/') + '/' + sub.lstrip('/') for sub in paths[1:]
                              if not sub.startswith('/api/'))
            for item in re.findall(r'"([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)"', text):
                if item.split('.')[0] in {'http', 'auth', 'security', 'operation', 'dependency',
                                         'quiz', 'flashcard', 'vocabulary', 'lesson', 'jlpt', 'job', 'log'}:
                    events.add(item)
            errors.update(re.findall(r'"([A-Z][A-Z0-9_]{2,79})"', text))
    operations = events | {'LoginCommand','RegisterCommand','RefreshTokenCommand','LogoutCommand','jwks.fetch'}
    terminal = {'started', 'completed', 'failed', 'rejected', 'cancelled', 'slow'}
    for operation in tuple(events):
        if operation.rsplit('.', 1)[-1] not in terminal:
            events.update(operation + '.' + suffix for suffix in terminal)
    registry = {'events': sorted(events), 'error_codes': sorted(errors),
                'error_types': sorted(error_types), 'operations': sorted(operations), 'routes': sorted(routes),
                'policy': 'Exact static values only; review before regeneration/adoption'}
    write('fluent-bit/registry.json', registry)
    base = (ROOT / 'observability/roadmap/p03-validation/normalize.p03.lua').read_text()
    base = base.replace('-- INACTIVE P03 candidate.', '-- INACTIVE P07 candidate based on P03.')
    tables = '\nlocal approved_events = {' + ','.join('[' + json.dumps(e) + ']=true' for e in sorted(events)) + '}\n'
    tables += 'local approved_errors = {' + ','.join('[' + json.dumps(e) + ']=true' for e in sorted(errors)) + '}\n'
    for label, values in [('types',error_types),('operations',operations),('routes',routes)]:
        tables += 'local approved_' + label + ' = {' + ','.join('[' + json.dumps(e) + ']=true' for e in sorted(values)) + '}\n'
    wrapper = '''
-- Reconstruct output again: no native/raw copies, free-form errors or dynamic routes.
local p03_normalize = normalize
local families = {auth=true,quiz=true,quiz_admin=true,vocabulary=true,vocabulary_admin=true,
    flashcard=true,grammar=true,lessons=true,jlpt_levels=true,jwks=true,infrastructure=true,
    static=true,other=true}
local output_keys = {'service_name','index_prefix','environment','level','service_version',
    'service_instance_id','correlation_id','trace_id','span_id','parent_span_id','http_method',
    'http_status','duration_ms','outcome','error_category','dependency_name','dependency_type',
    'is_slow','authenticated','total','count','created','updated','succeeded','failed','skipped',
    'dueCount','studiedCount','masteredCount','@timestamp'}
local function valid_date(value)
    if type(value) ~= 'string' then return false end
    local y,m,d,h,minute,s = value:match('^(%d%d%d%d)%-(%d%d)%-(%d%d)T(%d%d):(%d%d):(%d%d)')
    y,m,d,h,minute,s = tonumber(y),tonumber(m),tonumber(d),tonumber(h),tonumber(minute),tonumber(s)
    if not y or y < 1970 or m < 1 or m > 12 or h > 23 or minute > 59 or s > 59 then return false end
    local days = {31,28,31,30,31,30,31,31,30,31,30,31}
    if y % 4 == 0 and (y % 100 ~= 0 or y % 400 == 0) then days[2] = 29 end
    local zone_h,zone_m = value:match('[+-](%d%d):(%d%d)$')
    if zone_h and (tonumber(zone_h) > 14 or tonumber(zone_m) > 59) then return false end
    return d >= 1 and d <= days[m]
end
local function secure(tag, timestamp, record)
    if type(tag) ~= 'string' or type(record) ~= 'table' then return nil end
    local service = tag:match('^apps%.(.+)$')
    if not ({['user-api']=true,['vocabulary-api']=true,['jwks-api']=true,
        gateway=true,frontend=true})[service] then return nil end
    local code, _, adapted = p03_normalize(tag, timestamp, record)
    if code ~= 2 or adapted.collector_diagnostic == 'adapter_rejected' then return nil end
    local result = {collector_adapter='p07-candidate',telemetry_incomplete=true}
    for _, key in ipairs(output_keys) do result[key] = adapted[key] end
    local version = result.service_version
    if version and version ~= 'unknown' and not version:match('^v?%d+%.%d+%.%d+[A-Za-z0-9+.-]*$')
        and not (#version >= 7 and #version <= 40 and version:match('^[0-9a-f]+$')) then
        result.service_version = nil
    end
    local instance = result.service_instance_id
    if instance and not ((#instance == 32 and instance:match('^[0-9a-f]+$'))
        or (#instance == 36 and instance:match('^[0-9a-f]+%-[0-9a-f]+%-[0-9a-f]+%-[0-9a-f]+%-[0-9a-f]+$'))) then
        result.service_instance_id = nil
    end
    for _, key in ipairs({'total','count','created','updated','succeeded','failed','skipped',
        'dueCount','studiedCount','masteredCount'}) do
        if result[key] and result[key] > 9007199254740991 then result[key] = nil end
    end
    if result.duration_ms and result.duration_ms > 86400000 then result.duration_ms = nil end
    if not valid_date(result['@timestamp']) then
        local seconds = type(timestamp) == 'table' and timestamp.sec or timestamp
        result['@timestamp'] = os.date('!%Y-%m-%dT%H:%M:%SZ', seconds)
        result.timestamp_source = 'collector'
    else
        result.timestamp_source = 'producer'
    end
    local props = type(record.Properties) == 'table' and record.Properties or {}
    local event = record.event_name or record['event.name'] or record.event or props.EventName
    if event == 'HttpRequestCompleted' then event = 'http.request.completed' end
    result.event_name = approved_events[event] and event or 'log.message'
    result.message = result.event_name -- a static diagnostic, never producer free text
    result.error_code = approved_errors[adapted.error_code] and adapted.error_code or nil
    result.error_type = approved_types[adapted.error_type] and adapted.error_type or nil
    result.route_family = families[record.route_family] and record.route_family or nil
    if result.http_method then
        result.http_route = approved_routes[adapted.http_route] and adapted.http_route or '/unmatched'
    end
    -- Preserve approved field meanings, omitting unknown metadata instead of repurposing it.
    result.operation = approved_operations[adapted.operation] and adapted.operation or nil
    if result.dependency_name == 'jwks-api' then result.dependency_operation = 'jwks.fetch' end
    return result
end
function normalize(tag, timestamp, record)
    local ok, result = pcall(secure, tag, timestamp, record)
    if not ok or not result then return -1, timestamp, {} end
    return 2, timestamp, result
end
'''
    (DEST / 'fluent-bit/normalize.lua').write_text(base + tables + wrapper)
    config = '''# Root Compose P07 profile (deployment pending). Existing SQLite offsets/state retained; no legacy chunk replay.
[SERVICE]
    Flush 2
    Grace 10
    Log_Level warn
    Parsers_File /fluent-bit/etc/parsers-app.conf
    HTTP_Server On
    HTTP_Listen 0.0.0.0
    HTTP_Port 2020
    Health_Check On
'''
    for service, folder, pattern, db in [
            ('jwks-api', 'jwks/spool', '*.log', 'jwks'),
            ('user-api', 'user', 'user-api-*.json', 'user'),
            ('vocabulary-api', 'vocabulary', 'application.json.log', 'vocabulary')]:
        config += f'''
[INPUT]
    Name tail
    Tag apps.{service}
    Path /logs/{folder}/{pattern}
    Parser application_json
    DB /state/{db}.db
    DB.Sync Full
    Read_from_Head Off
    Refresh_Interval 2
    Rotate_Wait 30
    Buffer_Max_Size 1M
    Skip_Long_Lines On
    Mem_Buf_Limit 8M
    storage.type memory
'''
    config += '''
[FILTER]
    Name lua
    Match apps.*
    script /fluent-bit/etc/normalize.lua
    call normalize
    protected_mode On
    time_as_table On
    type_int_key http_status total count created updated succeeded failed skipped dueCount studiedCount masteredCount

[OUTPUT]
    Name opensearch
    Match apps.*
    Host opensearch
    Port 9200
    Suppress_Type_Name On
    Logstash_Format On
    Logstash_Prefix application-logs
    Logstash_Prefix_Key $index_prefix
    Current_Time_Index On
    Time_Key collected_at
    Generate_ID On
    Write_Operation index
    Retry_Limit 3
    Trace_Error Off
    Trace_Output Off
'''
    (DEST / 'fluent-bit/fluent-bit.conf').write_text(config)
    shutil.copyfile(ROOT / 'observability/logging/parsers-app.conf', DEST / 'fluent-bit/parsers-app.conf')
    dockerfile = (ROOT / 'observability/logging/Dockerfile.fluent-bit').read_text()
    (DEST / 'fluent-bit/Dockerfile').write_text(dockerfile)
    prom = json.loads((ROOT / 'observability/p05-candidate/prometheus/prometheus.yml').read_text())
    for job in prom['scrape_configs']:
        forbidden = ['authorization','Authorization','cookie','Cookie','password','api_key',
            'user_id','userid','UserId','username','email','session_id','trace_id','span_id',
            'correlation_id','db_statement','db_query','db_query_text','url','url_full','uri','query']
        job['metric_relabel_configs'] = [{'action': 'drop', 'source_labels': [label],
                                          'regex': '.+'} for label in forbidden]
        if job['job_name'] != 'prometheus':
            job['scrape_protocols'] = ['PrometheusText0.0.4']
        job['label_name_length_limit'] = 80
    prom['storage'] = {'exemplars': {'max_exemplars': 0}}
    write('prometheus/prometheus.yml', prom)
    (DEST / 'prometheus/rules').mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / 'observability/p05-candidate/prometheus/rules/p05.rules.yml', DEST / 'prometheus/rules/p05.rules.yml')
    shutil.copytree(ROOT / 'observability/p06/grafana/provisioning', DEST / 'grafana/provisioning', dirs_exist_ok=True)
    # Native store auth/TLS remains approval-gated: no insecure in-place plugin migration.
    write('opensearch/index-template.json', {
        'index_patterns': ['application-logs-*'], 'priority': 101,
        '_meta': {'phase': 'P07', 'status': 'INACTIVE; approve compatible future-index adoption first'},
        'template': {'settings': {'number_of_shards': 1, 'number_of_replicas': 0,
            'index.mapping.total_fields.limit': 64, 'index.max_result_window': 1000},
            'mappings': {'dynamic': False, '_source': {'excludes': ['original', 'Properties', 'log',
                'RenderedMessage', 'MessageTemplate', 'Exception', 'authorization', 'cookie', 'body', 'headers']},
                'properties': {'@timestamp': {'type': 'date'}, 'collected_at': {'type': 'date'},
                    **{key: {'type': 'keyword', 'ignore_above': 256} for key in
                    ['service_name','environment','level','event_name','correlation_id','trace_id','span_id',
                     'parent_span_id','http_method','http_route','route_family','operation','outcome',
                     'error_code','error_type','error_category','dependency_name','dependency_type',
                     'dependency_operation','service_version','service_instance_id']},
                    'http_status': {'type': 'integer'}, 'duration_ms': {'type': 'double'},
                    'message': {'type': 'text'}, 'is_slow': {'type': 'boolean'},
                    'authenticated': {'type': 'boolean'}}}}})
    template_path = DEST / 'opensearch/index-template.json'
    template = json.loads(template_path.read_text())
    properties = template['template']['mappings']['properties']
    for key in ['total','count','created','updated','succeeded','failed','skipped',
                'dueCount','studiedCount','masteredCount']:
        properties[key] = {'type': 'long'}
    properties['timestamp_source'] = {'type': 'keyword'}
    properties['collector_adapter'] = {'type': 'keyword'}
    properties['telemetry_incomplete'] = {'type': 'boolean'}
    template['template']['mappings']['_source']['includes'] = sorted(properties)
    write('opensearch/index-template.json', template)
    write('opensearch/cluster-settings.json', {'persistent': {
        'cluster.routing.allocation.disk.threshold_enabled': True,
        'cluster.routing.allocation.disk.watermark.low': '70%',
        'cluster.routing.allocation.disk.watermark.high': '80%',
        'cluster.routing.allocation.disk.watermark.flood_stage': '90%',
        'search.max_buckets': 10000}})
    collector = {
        'receivers': {'otlp': {'protocols': {'grpc': {'endpoint': '0.0.0.0:4317',
            'max_recv_msg_size_mib': 1, 'max_concurrent_streams': 16}}}},
        'processors': {
            'memory_limiter': {'check_interval': '1s', 'limit_mib': 192, 'spike_limit_mib': 32},
            'filter/privacy': {'error_mode': 'propagate', 'traces': {'span': [
                'resource.attributes["service.namespace"] != "japanese-learning"',
                'resource.attributes["service.name"] != "user-api" and resource.attributes["service.name"] != "vocabulary-api"',
                'Len(links) > 0'], 'spanevent': ['true']}},
            'transform/privacy': {'error_mode': 'propagate', 'trace_statements': [
                {'context': 'resource', 'statements': [
                    'keep_keys(attributes, ["service.name", "service.namespace", "deployment.environment.name"])',
                    'set(attributes["deployment.environment.name"], "unknown") where attributes["deployment.environment.name"] != "development" and attributes["deployment.environment.name"] != "test" and attributes["deployment.environment.name"] != "staging" and attributes["deployment.environment.name"] != "production"',
                    'truncate_all(attributes, 80)']},
                {'context': 'span', 'statements': [
                    'keep_keys(attributes, ["http.request.method", "http.route", "http.response.status_code", "db.system.name", "error.type"])',
                    'keep_keys(instrumentation_scope.attributes, [])',
                    'set(instrumentation_scope.name, "japanese-learning")',
                    'set(instrumentation_scope.version, "")',
                    'set(status.message, "")', 'set(name, "operation")',
                    'set(name, "HTTP server") where kind == SPAN_KIND_SERVER',
                    'set(name, "HTTP dependency") where kind == SPAN_KIND_CLIENT',
                    'set(name, "database.command") where attributes["db.system.name"] != nil',
                    'delete_key(attributes, "http.request.method") where attributes["http.request.method"] != nil and not IsString(attributes["http.request.method"])',
                    'set(attributes["http.request.method"], "OTHER") where IsString(attributes["http.request.method"]) and not IsMatch(attributes["http.request.method"], "^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|OTHER)$")',
                    'delete_key(attributes, "db.system.name") where attributes["db.system.name"] != "mysql" and attributes["db.system.name"] != "microsoft.sql_server"',
                    'delete_key(attributes, "http.response.status_code") where attributes["http.response.status_code"] != nil and not IsInt(attributes["http.response.status_code"])',
                    'delete_key(attributes, "http.route")',
                    'delete_key(attributes, "error.type")',
                    'set(attributes["error.type"], "operation_failed") where status.code == STATUS_CODE_ERROR',
                    'truncate_all(attributes, 160)']}]},
            'batch': {'timeout': '1s', 'send_batch_size': 128, 'send_batch_max_size': 128}},
        'exporters': {'otlp/tempo': {'endpoint': 'tempo:4317', 'tls': {'insecure': True},
            'timeout': '3s', 'sending_queue': {'enabled': True, 'num_consumers': 2, 'queue_size': 64},
            'retry_on_failure': {'enabled': True, 'initial_interval': '1s', 'max_interval': '5s', 'max_elapsed_time': '30s'}}},
        'service': {'telemetry': {'logs': {'level': 'warn'}}, 'pipelines': {'traces': {
            'receivers': ['otlp'], 'processors': ['memory_limiter', 'filter/privacy', 'transform/privacy', 'batch'],
            'exporters': ['otlp/tempo']}}}}
    write('collector.yml', collector)
    tempo = (ROOT / 'observability/p06/tempo.yml').read_text()
    tempo += '''
# P07 candidate: bound query work without changing 24-hour trace retention.
querier:
  max_concurrent_queries: 4
  search:
    query_timeout: 10s
  trace_by_id:
    query_timeout: 10s
query_frontend:
  api_timeout: 15s
  max_query_expression_size_bytes: 16384
  max_retries: 1
  multi_tenant_queries_enabled: false
  mcp_server:
    enabled: false
'''
    (DEST / 'tempo.yml').write_text(tempo)



if __name__ == '__main__':
    prepare()
