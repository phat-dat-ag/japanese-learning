local function text(...)
    for index = 1, select("#", ...) do
        local value = select(index, ...)
        if type(value) == "string" and value ~= "" then return value end
    end
end

local function number(value)
    local result = tonumber(value)
    if result and result == result and math.abs(result) ~= math.huge then return result end
end

local function flag(value)
    if value == true or value == "true" then return true end
    if value == false or value == "false" then return false end
end

function normalize(tag, timestamp, record)
    local p = type(record.Properties) == "table" and record.Properties or {}
    local event_id = type(p.EventId) == "table" and p.EventId or {}
    local service = tag:match("^apps%.(.+)$") or "unknown"
    local result = {
        ["@timestamp"] = text(record["@timestamp"], record.Timestamp) or os.date("!%Y-%m-%dT%H:%M:%SZ", timestamp),
        service_name = service,
        index_prefix = "application-logs-" .. service,
        environment = text(record["deployment.environment"], p.Environment, os.getenv("LOG_ENVIRONMENT")) or "unknown",
        level = text(record.level, record.Level) or "INFO",
        event_name = text(record["event.name"], record.event, p.EventName, event_id.Name),
        message = text(record.message, record.RenderedMessage, record.MessageTemplate, record.log),
        correlation_id = text(record.correlationId, p.CorrelationId),
        trace_id = text(record.traceId, p.TraceId, record.TraceId),
        span_id = text(record.spanId, p.SpanId, record.SpanId),
        parent_span_id = text(record.parentSpanId, p.ParentSpanId),
        http_method = text(record["http.request.method"], record.httpMethod, p.RequestMethod),
        http_route = text(record["http.route"], record.uri, p.RequestRoute, p.RequestPath),
        http_status = number(record["http.response.status_code"] or record.status or p.StatusCode),
        duration_ms = number(record.durationMs or record.elapsed_ms or p.ElapsedMilliseconds),
        caller_service = text(record["caller.service.claimed"], record.callerService, p.ClaimedCallerService),
        peer_address = text(record["network.peer.address"], record.peerAddress, p.PeerAddress),
        peer_port = number(record["network.peer.port"] or p.PeerPort),
        handler_class = text(record["handler.class"], p.HandlerType),
        handler_method = text(record["handler.method"], p.HandlerMethod),
        operation = text(record.operation, p.OperationName, p.Operation),
        operation_class = text(record["operation.class"], p.RequestType),
        operation_method = text(record["operation.method"]),
        outcome = text(record.outcome, p.Outcome),
        error_code = text(record["error.code"], record.errorCode, p.ErrorCode),
        error_type = text(record["error.type"], record.exception_type, p.ExceptionType),
        original = record
    }
    result.level = result.level:upper()
    if result.level == "INFORMATION" then result.level = "INFO" end
    if result.level == "WARNING" then result.level = "WARN" end
    if result.level == "FATAL" then result.level = "ERROR" end
    result.is_slow = flag(record.isSlow)
    if result.is_slow == nil then result.is_slow = flag(p.IsSlow) end
    result.authenticated = flag(record["security.authenticated"])
    if result.authenticated == nil then result.authenticated = flag(p.IsAuthenticated) end
    return 2, timestamp, result
end
