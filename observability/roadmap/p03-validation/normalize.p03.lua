-- INACTIVE P03 candidate. No Compose reference, no schema_version assertion.
-- Rebuild/review required; do not replace a protected collector's mounted files.
local function text(...)
    for i = 1, select('#', ...) do
        local v = select(i, ...)
        if type(v) == 'string' and v ~= '' then return v end
    end
end

local function safe(v, limit)
    if type(v) ~= 'string' or v == '' or #v > limit or v:find('%c') then return nil end
    local lower = v:lower()
    for _, word in ipairs({'bearer', 'password', 'refresh_token', 'access_token',
                           'authorization', 'cookie', 'private key', '://', '?',
                           'pwd=', 'password=', '%', '@'}) do
        if lower:find(word, 1, true) then return nil end
    end
    return v
end

local function numeric(v)
    if type(v) ~= 'number' and type(v) ~= 'string' then return nil end
    local n = tonumber(v)
    if n and n == n and math.abs(n) ~= math.huge then return n end
end

local function flag(v)
    if v == true or v == 'true' then return true end
    if v == false or v == 'false' then return false end
end

local function identifier(v, length)
    if type(v) == 'string' and #v == length and v:match('^[0-9a-f]+$')
       and v:find('[1-9a-f]') then return v end
end

local services = {['user-api']=true, ['vocabulary-api']=true, ['jwks-api']=true,
                  gateway=true, frontend=true}
local environments = {Development='development', Production='production',
    Staging='staging', Test='test', development='development', production='production',
    staging='staging', test='test', unknown='unknown'}
local levels = {DEBUG='DEBUG', TRACE='DEBUG', INFO='INFO', INFORMATION='INFO',
                WARN='WARN', WARNING='WARN', ERROR='ERROR', FATAL='ERROR'}
local events = {['http.request.completed']=true, ['http.request.failed']=true,
    ['operation.completed']=true, ['dependency.completed']=true,
    ['job.started']=true, ['job.completed']=true, ['log.message']=true}
local methods = {GET=true, HEAD=true, POST=true, PUT=true, PATCH=true,
                 DELETE=true, OPTIONS=true, OTHER=true}
local outcomes = {success=true, client_error=true, server_error=true, cancelled=true,
    timeout=true, partial_failure=true, failure=true}
local categories = {validation=true, authentication=true, authorization=true,
    dependency=true, database=true, timeout=true, cancellation=true, internal=true,
    transport=true, unknown=true}

local function adapt(tag, record)
    local service = tag:match('^apps%.(.+)$')
    if not services[service] then return nil end
    local p = type(record.Properties) == 'table' and record.Properties or {}
    local event_id = type(p.EventId) == 'table' and p.EventId or {}
    local result = {service_name=service, index_prefix='application-logs-' .. service,
                    collector_adapter='p03-candidate', telemetry_incomplete=true}
    local stamp = text(record['@timestamp'], record.Timestamp)
    -- Preserve source time including native offset/precision; never replace with ingest time.
    local date = '%d%d%d%d%-%d%d%-%d%dT%d%d:%d%d:%d%d'
    if stamp and #stamp <= 40 and (stamp:match('^' .. date .. 'Z$')
       or stamp:match('^' .. date .. '%.%d+Z$')
       or stamp:match('^' .. date .. '[+-]%d%d:%d%d$')
       or stamp:match('^' .. date .. '%.%d+[+-]%d%d:%d%d$')) then
        result['@timestamp'] = stamp
    end
    result.environment = environments[text(record.environment, record['deployment.environment'],
                                            p.Environment)]
    result.service_version = safe(text(record.service_version, record['service.version'],
                                      record.serviceVersion, p.ServiceVersion), 128)
    result.service_instance_id = safe(text(record.service_instance_id,
                                          record['service.instance.id'], p.ServiceInstanceId), 128)
    local level = text(record.level, record.Level)
    result.level = level and levels[level:upper()] or nil
    local event = text(record.event_name, record['event.name'], record.event,
                       p.EventName, event_id.Name)
    if event == 'HttpRequestCompleted' then event = 'http.request.completed' end
    if events[event] then result.event_name = event end
    local correlation = safe(text(record.correlation_id, record.correlationId, p.CorrelationId), 64)
    if correlation and correlation:match('^[A-Za-z0-9_-]+$') then
        result.correlation_id = correlation
    end
    -- Only producer canonical aliases carry P02 validated context provenance.
    -- Legacy traceId/TraceId are deliberately not promoted to recorded span context.
    result.trace_id = identifier(record.trace_id, 32)
    if result.trace_id then
        result.span_id = identifier(record.span_id, 16)
        result.parent_span_id = identifier(record.parent_span_id, 16)
    end
    local legacy = safe(text(record.legacy_trace_id, record.legacyTraceId), 64)
    if legacy and legacy:match('^[A-Za-z0-9_-]+$') then result.legacy_trace_id = legacy end
    local method = text(record.http_method, record['http.request.method'], record.httpMethod, p.RequestMethod)
    if methods[method] then result.http_method = method end
    -- No uri/RequestPath fallback: legacy raw paths can contain identities and queries.
    local route = safe(text(record.http_route, record['http.route'], p.RequestRoute), 256)
    if route and route:sub(1, 1) == '/' then result.http_route = route end
    result.route_family = safe(record.route_family, 64)
    local status = numeric(record.http_status or record['http.response.status_code'] or record.status or p.StatusCode)
    if status and status % 1 == 0 and status >= 100 and status <= 599 then
        result.http_status = status
    end
    local duration = numeric(record.duration_ms or record.durationMs or record.elapsed_ms or p.ElapsedMilliseconds)
    if duration and duration >= 0 then result.duration_ms = duration end
    local outcome = text(record.outcome, p.Outcome)
    if outcomes[outcome] then result.outcome = outcome end
    result.operation = safe(text(record.operation, p.OperationName, p.Operation), 128)
    result.error_type = safe(text(record.error_type, record['error.type'], record.exception_type, p.ExceptionType), 256)
    local category = text(record.error_category, record['error.category'], p.ErrorCategory)
    if categories[category] then result.error_category = category end
    result.error_code = safe(text(record.error_code, record['error.code'], record.errorCode, p.ErrorCode), 96)
    local dependency = text(record.dependency_name, p.DependencyName)
    if dependency == 'jwks-api' or dependency == 'mysql' or dependency == 'sqlserver' then
        result.dependency_name = dependency
    end
    local dependency_type = text(record.dependency_type, p.DependencyType)
    if dependency_type == 'http' or dependency_type == 'database' then
        result.dependency_type = dependency_type
    end
    result.dependency_operation = safe(text(record.dependency_operation, p.DependencyOperation), 128)
    result.is_slow = flag(record.is_slow)
    if result.is_slow == nil then result.is_slow = flag(record.isSlow) end
    if result.is_slow == nil then result.is_slow = flag(p.IsSlow) end
    result.authenticated = flag(record.authenticated)
    if result.authenticated == nil then result.authenticated = flag(record['security.authenticated']) end
    if result.authenticated == nil then result.authenticated = flag(p.IsAuthenticated) end
    -- Explicit typed aggregate extensions; never copy arbitrary nested producer payloads.
    for _, key in ipairs({'total', 'count', 'created', 'updated', 'succeeded', 'failed',
                           'skipped', 'dueCount', 'studiedCount', 'masteredCount'}) do
        local value = numeric(record[key] or p[key])
        if value and value >= 0 and value % 1 == 0 then result[key] = value end
    end
    -- Fail-closed free-text policy: no original, log, rendered message, exception payload,
    -- arbitrary nested extensions, peer/caller identity, or raw quarantine is returned.
    if not result.event_name then
        result.event_name = 'log.message'
        result.message = 'Unclassified telemetry; raw content omitted'
        result.collector_diagnostic = 'unclassified_or_malformed'
    end
    return result
end

function normalize(tag, timestamp, record)
    local ok, result = pcall(adapt, tag, record)
    if not ok or not result then
        -- A filter exception must never forward the unsanitized original record.
        return 2, timestamp, {event_name='log.message',
            message='Collector adapter rejected telemetry',
            collector_diagnostic='adapter_rejected', telemetry_incomplete=true}
    end
    return 2, timestamp, result
end
