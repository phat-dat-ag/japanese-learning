-- Run with Lua 5.1+ from repository root. Tests the actual candidate, not a translation.
dofile('observability/roadmap/p03-validation/normalize.p03.lua')
local count = 0
local function check(value, name)
    assert(value, name)
    count = count + 1
end
local function run(tag, record)
    local code, timestamp, output = normalize(tag, {sec=1, nsec=123}, record)
    check(code == 2 and timestamp.sec == 1 and timestamp.nsec == 123, 'timestamp unchanged')
    check(output.original == nil and output.Properties == nil and output.log == nil, 'no raw copy')
    return output
end
local net = run('apps.user-api', {Timestamp='2026-11-13T00:00:00.000Z',
    Level='Information', RenderedMessage='Bearer SENTINEL_TOKEN',
    Properties={EventName='HttpRequestCompleted', CorrelationId='test_1',
        StatusCode=200, ElapsedMilliseconds=1.5, IsSlow=false, Environment='Test',
        Password='SENTINEL_PASSWORD', RequestPath='/raw?token=SENTINEL_QUERY'}})
check(net.duration_ms == 1.5 and net.http_status == 200, 'dotnet numeric')
check(net.is_slow == false and net.environment == 'test', 'dotnet boolean/environment')
check(net.message == nil and net.http_route == nil, 'no message/path fallback')
check(net.correlation_id == 'test_1' and net.level == 'INFO', 'dotnet correlation/level')
local q = run('apps.vocabulary-api', {['@timestamp']='2026-11-13T00:00:00.001Z',
    ['event.name']='operation.completed', durationMs=0, isSlow='true',
    ['security.authenticated']='false', trace_id=string.rep('a',32), span_id=string.rep('b',16),
    outcome='partial_failure', error_category='database', ['error.type']='SafeDatabaseException'})
check(q.duration_ms == 0 and q.is_slow and q.authenticated == false, 'quarkus types')
check(q.trace_id and q.span_id and q.error_category == 'database', 'canonical trace/error')
check(q.outcome == 'partial_failure' and q.schema_version == nil, 'native outcome/incomplete')
local boot = run('apps.jwks-api', {environment='test', serviceVersion='fixture-v1',
    durationMs=3.25, status='200', event='http.request.completed', uri='/secret/path',
    traceId=string.rep('a',32), spanId=string.rep('b',16)})
check(boot.environment == 'test' and boot.service_version == 'fixture-v1', 'jwks metadata')
check(boot.duration_ms == 3.25 and boot.http_status == 200, 'jwks numbers')
check(boot.trace_id == nil and boot.http_route == nil, 'legacy provenance/path')
local nginx = run('apps.gateway', {http_status=499, duration_ms=10, correlation_id='nginx_1',
    http_route='/family/auth', route_family='auth', event_name='http.request.completed',
    ['@timestamp']='2026-11-13T07:00:00+07:00', outcome='cancelled'})
check(nginx.duration_ms == 10 and nginx.outcome == 'cancelled', 'nginx numeric/outcome')
check(nginx.schema_version == nil and nginx.telemetry_incomplete, 'nginx incomplete')
for _, tag in ipairs({'apps.user-api', 'apps.vocabulary-api', 'apps.jwks-api',
                      'apps.frontend', 'apps.gateway'}) do
    for _, field in ipairs({'original', 'password', 'refreshToken', 'cookie',
                            'authorization', 'connectionString', 'privateKey', 'message', 'log'}) do
        local r = run(tag, {[field]={nested='SENTINEL_SECRET'},
            event_name='http.request.completed', duration_ms=2})
        check(r[field] == nil, 'nested sentinel removed: ' .. field)
        check(r.duration_ms == 2, 'useful record retained')
    end
end
local malformed = run('apps.user-api', {log='Bearer SENTINEL_MALFORMED'})
check(malformed.collector_diagnostic == 'unclassified_or_malformed', 'fallback diagnostic')
local invalid = run('apps.user-api', {trace_id=string.rep('0',32), span_id=string.rep('a',16),
    duration_ms=-1, http_status=200.5, correlation_id='invalid value', ['@timestamp']='bad'})
check(invalid.trace_id == nil and invalid.span_id == nil, 'zero/orphan context')
check(invalid.duration_ms == nil and invalid.http_status == nil, 'invalid numbers')
check(invalid.correlation_id == nil and invalid['@timestamp'] == nil, 'invalid metadata')
for _, value in ipairs({'Bearer SENTINEL', 'password=SENTINEL', 'cookie=SENTINEL',
                        'https://host/?token=SENTINEL', '%53ENTINEL', '-----BEGIN PRIVATE KEY-----'}) do
    local r = run('apps.user-api', {error_type=value, operation=value, service_version=value})
    check(r.error_type == nil and r.operation == nil and r.service_version == nil, 'unsafe scalar removed')
end
local broken = run('invalid', nil)
check(broken.collector_diagnostic == 'adapter_rejected', 'fail closed')
print('PASS: ' .. count .. ' Lua assertions (candidate adapter only; no Fluent Bit/OpenSearch)')
