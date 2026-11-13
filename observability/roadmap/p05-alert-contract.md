# P05 alert contract and runbooks

Extends [P01 contract](p01-observability-contract.md) and [quality gates](p01-quality-gates.md).
Thresholds are provisional operating signals, not approved business SLOs. Runtime and
notification acceptance have not passed. Source implementation does not enable notifications.

## Common contract

Every alert has `severity`, `service`, `owner`, `signal`, `monitoring_project=jp_dev`, summary,
description and runbook reference. Outputs retain only bounded `job` plus these fixed labels;
they aggregate away route/status/pool/identity labels. Jobs are `user-api`, `vocabulary-api`,
`prometheus`; owners are logical roles `jp-application`, `jp-security`, `jp-operations`.
Real responders, escalation contacts, on-call schedules and threshold approval remain unassigned.
No JWT, user/session/correlation/trace identifier, SQL text, request body or exception text is
used in labels or alert annotations. Scraped source privacy, including exemplars, is a separate gate.

Warning requests investigation during the team's agreed operating window. Critical identifies
sustained loss/pressure requiring an approved responder. Both severity rules may fire together;
the optional Alertmanager candidate inhibits warning for matching critical project/service/signal.
No Alertmanager service or Prometheus alerting destination is configured. The configuration-only
candidate has an empty receiver and sends nothing. Future grouping uses project/service/signal,
15s initial wait, 1m group interval, 4h warning/1h critical repeats. Receiver assignment and
delivery tests require separate approval; no email/Slack/webhook credentials exist here.

Evaluate/scrape every 15s, timeout 5s. Rules use explicit sustained `for` durations, 1–15 minutes.
Critical alerts retain firing for 2m after recovery; warnings clear on the next evaluation.
Recording groups can introduce one evaluation of lag across groups; rule execution timing must
be checked on the actual engine. Restarting Prometheus can affect pending-state restoration.
Startup suppression is not a guarantee: targets down longer than the availability pending window
will fire. Approved maintenance should use scoped, expiring silences after routing exists, not
permanent disabling or a globally false availability expression.

The P01 two-minute critical detection/notification objective is **NOT VERIFIED**: a conservative
15s scheduling +5s timeout +15s evaluation +60s pending +15s grouping +15s delivery allowance
already reaches 125s, before recording lag. No notification path is installed. Acceptance must
measure timing and approve a shorter pending/grouping budget or another documented change.

No-traffic ratios remain absent/NaN and do not fire; this is unknown reliability, not zero errors.
Minimum traffic and absolute count guards reduce low-volume noise. Missing `up` is explicitly
checked for every expected job. Missing runtime families are checked only when `up=1`; optional
HTTP/security/dependency counters can legitimately be absent at idle. Missing 2s buckets are
checked only with >=1 request/second. Positive JVM maxima guard unsupported values.

## Availability

Inspect the target error, Docker DNS/network membership, listener, readiness and scrape access.
`up=0` means scrape failure, not proof of process death; `absent(up)` can mean config/discovery
loss or staleness. Brief deploy/startup and deliberate maintenance can cause false positives.
Do not change authentication or restart a container as an automatic response. Confirm owner and
protected-resource boundaries before any remediation. Recovery: sustained successful samples
followed by the 2m critical hold; verify application behavior separately.

## Integrity

Inspect target scrape duration/size/error, expected instrumentation, label/sample limits,
Prometheus rule status and timestamp freshness. A retained stale timestamp can disappear after
lookback; availability absence is the subsequent signal. A dead Prometheus cannot alert itself.
Long GC pauses and transient CPU starvation can delay scraping. Do not raise limits before
measuring sample growth and checking privacy. Recovery requires fresh expected samples.

## HTTP

Compare request counts, 5xx fraction and >2s tail fraction with safe route-level investigation.
Warning/critical error fractions are >2%/>10% for 5m with >=1 request/second; slow fractions
>1%/>5% for 10m/5m. Fifty failures/5m sustained 2m is an independent burst warning. Batch import
is excluded from interactive latency only. Startup, load tests, long imports and caller misuse
need context; do not attach raw URLs/identities to alerts. Recovery follows rolling windows and holds.

## Security

Authentication needs >=20 failures/5m and >=50% rejected outcomes for 5m. Authorization needs
>=20 denials/5m and >=10% of total HTTP requests for 10m. Check configuration/expiry and synthetic
reproduction without exporting credentials or identities. Authentication operation counters can
represent multiple stages of one request; this is an event ratio, not unique-user probability.
Legitimate expiry waves, blocked automation or new clients can trigger warnings. No automatic
account blocking or JWT/JWKS changes are authorized.

## Dependencies

JWKS observed failure warning/critical: >=3/>20% or >=10/>80% in 10m, sustained 5m.
Slow JWKS: >20% above 2s with >=3 observations/10m for 10m. Check network/timeouts and observed
outcomes, preserving shared key publication. More than three unmatched Quarkus initiations in
10m for 10m is an accounting gap; in-flight calls, restarts and sample loss can explain it.
It is not a transport-failure counter. SQL connect/classified Learning DB failures need >=5/5m
for 5m. Request-boundary classification misses some background/recovered errors. Investigate
using approved read-only diagnostics, never migrations or credential dumps.

## Capacity

User memory uses the source 512MiB envelope (80%/95%); heap uses positive reported heap maxima
(85%/95%). Heap does not include native/container overhead. User CPU >1.6 core-seconds/second
assumes a source two-vCPU envelope; Quarkus CPU >0.8 is framework-native fraction, not proven
cgroup utilization. Reactive pool >85%/>95% requires queued work. SqlClient >90% busy of >=10
allocated connections can grow further and is not max-pool saturation. Scrape samples >4000/4750
warn against a 5000 limit; this does not measure TSDB churn or disk pressure. GC cycles, quota
differences and legitimate load bursts are false-positive risks. Validate actual limits before
changing resources. See [capacity budget](p05-capacity-budget.md) for measurement procedures.
