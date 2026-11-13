# P06 tracing contract

Only W3C traceparent establishes lineage. Installed SDK parsers reject malformed/zero
contexts; .NET also rejects separate duplicate values, and the Quarkus propagator rejects
duplicate Vert.x HTTP carrier headers before SDK extraction. Combined duplicate values
fail SDK parsing. No regex is used to parse W3C context. No baggage is extracted/injected.
No vendor tracestate is approved, so APIs strip it; the proxies may transparently pass it
to the API boundary. Future vendor support requires an explicit allowlist and tests.

X-Correlation-ID remains independent. Existing X-Trace-Id and X-Distributed-Trace-Id response
semantics remain. Neither legacy header creates a parent. Valid active trace/span IDs can
appear in JSON logs even for unsampled requests; missing Tempo results can mean unsampled,
rate-limited, filtered, dropped, expired or unavailable, rather than an authentication fault.

| Boundary | Span contract |
|---|---|
| Inbound HTTP | One SERVER child of valid inbound context; otherwise a root. Probes/scrapes are suppressed by existing Quarkus defaults and .NET filters. |
| Outbound HTTP | One CLIENT per actual managed transport call. Its context is injected; remote SERVER uses that client span as parent. No URL/body/header attributes. |
| Database | One supported driver CLIENT per actual command, parented to current context. Generic database.command name; fixed db.system.name only, no SQL/parameters/database/user names. |
| Exceptions | Export status has no description, exception event, stack or message. Controlled error.type is database or transport_or_http. Detailed safe classifications remain in P02 logs. |
| HTTP status | SERVER 5xx is error; SERVER 4xx is not automatically error. CLIENT failures/4xx/5xx follow native instrumentation and .NET final classification. |

.NET uses method plus an explicit known auth-route template allowlist; unknown routes become
/unmatched. Quarkus exports a constrained matched-template/static-route allowlist, falling
back to /unmatched. Collector replaces free-form names with HTTP server, HTTP dependency or
database.command; normalized http.route remains available. This intentionally loses detail
for unregistered static routes. Extend the source registry with route tests, never raw paths.

Application export attributes are allowlisted: bounded method, safe route, numeric HTTP
status, fixed database system and controlled error type. Java removes events, links and
status descriptions from the exported snapshot and allowlists resource metadata. .NET
removes all native tags before adding approved ones, clears status descriptions/state and
fails closed on immutable Activity events/links. This can reduce trace completeness.

Do not add user/session/JWT IDs, email, bearer tokens, credentials, cookies, bodies, SQL,
query values or dynamic personal data. Resource configuration is trusted operator input;
do not encode secrets in deployment/version/instance metadata. Collector filtering is a
second boundary, not permission to emit sensitive telemetry from applications.

Both stacks use the same first-63-bit probability threshold, preserving SDK-generated
trace IDs. Local sampled children follow their parent; remote unsampled parents stay
unsampled. All remote sampled parents are treated as untrusted and pass the probability
and fixed-window budget. No diagnostic caller header establishes trust. See
[sampling/privacy](p06-sampling-privacy.md) for completeness and capacity limits.
