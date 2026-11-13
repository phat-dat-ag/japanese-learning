"""Offline P02 fixtures only. Does not import apps, connect to services or alter collectors."""
from datetime import datetime, timezone
from pathlib import Path
import json
import math
import re
import unittest

ROOT = Path(__file__).resolve().parent
SCHEMA = json.loads((ROOT / "canonical.schema.json").read_text(encoding="utf-8"))
CASES = json.loads((ROOT / "requests.json").read_text(encoding="utf-8"))["cases"]


def normalize_fixture(source, native):
    """Reference fixture mapping; not installed or imported by the production log pipeline."""
    p = native.get("Properties", {})
    service = {"dotnet": "user-api", "quarkus": "vocabulary-api", "jwks": "jwks-api",
               "gateway": "gateway", "frontend": "frontend"}[source]
    stamp = native.get("@timestamp", native.get("Timestamp"))
    result = {"schema_version": 1, "@timestamp": datetime.fromisoformat(stamp.replace("Z", "+00:00"))
              .astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
              "level": {"Information": "INFO", "Warning": "WARN"}.get(native.get("Level"), native.get("level", "INFO")),
              "service_name": service,
              "service_version": native.get("service_version", native.get("serviceVersion", native.get("service.version", p.get("ServiceVersion", "unknown")))),
              "service_instance_id": native.get("service_instance_id", native.get("service.instance.id", p.get("ServiceInstanceId", "unknown"))),
              "environment": native.get("environment", native.get("deployment.environment", p.get("Environment", "unknown"))).lower(),
              "event_name": "http.request.completed"}
    if result["environment"] == "testing": result["environment"] = "test"
    for target, keys in {
        "http_method": ("http_method", "http.request.method", "RequestMethod"),
        "http_route": ("http_route", "http.route", "RequestRoute"),
        "http_status": ("http_status", "http.response.status_code", "StatusCode"),
        "duration_ms": ("duration_ms", "durationMs", "ElapsedMilliseconds"),
        "correlation_id": ("correlation_id", "correlationId", "CorrelationId"),
    }.items():
        value = next((d[k] for k in keys for d in (native, p) if k in d), None)
        if value is not None: result[target] = value
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", result.get("correlation_id", "")):
        result.pop("correlation_id", None)
    status = result["http_status"]
    result["outcome"] = "server_error" if status >= 500 else "client_error" if status >= 400 else "success"
    # An invalid record is not quarantined raw; allowlisted output deliberately has no original.
    return result


def validate(record):
    for name in SCHEMA["required"]: assert name in record, name
    for key, rule in SCHEMA["properties"].items():
        if key not in record: continue
        value = record[key]
        kind = rule["type"]
        assert ((kind == "string" and isinstance(value, str)) or
                (kind == "integer" and type(value) is int) or
                (kind == "number" and type(value) in (int, float) and math.isfinite(value))), key
        if "minimum" in rule: assert value >= rule["minimum"], key
        if "maximum" in rule: assert value <= rule["maximum"], key
        if "enum" in rule: assert value in rule["enum"], key
        if "const" in rule: assert value == rule["const"], key
    assert "original" not in record


class ContractFixtures(unittest.TestCase):
    def test_fifty_cross_component_cases(self):
        for case in CASES:
            with self.subTest(source=case["source"], scenario=case["scenario"]):
                record = normalize_fixture(case["source"], case["native"])
                validate(record)
                for key, expected in case["expected"].items():
                    if key == "correlation_present": self.assertEqual(expected, "correlation_id" in record)
                    else: self.assertEqual(expected, record[key])
                text = json.dumps(record)
                self.assertNotIn("SENTINEL", text)
                self.assertNotIn("trace_id", record)
                self.assertNotIn("span_id", record)

    def test_nginx_json_template_and_duration_maps(self):
        repo = ROOT.parents[2]
        for source in ("gateway/nginx.p02.conf", "angular/nginx.conf"):
            content = (repo / source).read_text(encoding="utf-8")
            block = re.search(r"log_format (?:gateway|frontend) escape=json(.*?);", content, re.S).group(1)
            template = "".join(re.findall(r"'([^']*)'", block))
            for seconds in ("0.000", "0.001", "0.010", "0.100", "1.001", "123.456"):
                milliseconds = int(seconds.replace(".", ""))
                mapping = re.search(r"map \$request_time \$log_duration_ms \{(.*?)\n    \}", content, re.S).group(1)
                actual = None
                for pattern, output in re.findall(r'"~([^"\n]+)" ([^;]+);', mapping):
                    pattern = re.sub(r"\(\?<([a-z_]+)>", r"(?P<\1>", pattern)
                    match = re.fullmatch(pattern, seconds)
                    if match:
                        actual = re.sub(r"\$([a-z_]+)", lambda m: match[m[1]], output.strip('"'))
                        break
                self.assertEqual(milliseconds, int(actual))
                values = {"time_iso8601": "2026-11-12T00:00:00+00:00", "log_level": "WARN",
                          "hostname": "test-host", "log_method": "GET", "log_route": "quiz_admin",
                          "status": "403", "log_duration_ms": str(milliseconds),
                          "correlation_id": "safe-id", "log_outcome": "client_error",
                          "upstream_status": "502", "upstream_response_time": "0.001"}
                rendered = re.sub(r"\$([a-zA-Z_][a-zA-Z_0-9]*)", lambda m: values[m[1]], template)
                record = json.loads(rendered)
                self.assertEqual(milliseconds, record["duration_ms"])
                self.assertEqual("/family/quiz_admin", record["http_route"])
            for forbidden in ("$http_authorization", "$http_cookie", "$args", "$request_uri", "$remote_addr"):
                self.assertNotIn(forbidden, template)

    def test_schema_rejects_numeric_strings(self):
        record = normalize_fixture("dotnet", CASES[0]["native"])
        record["duration_ms"] = "12.5"
        with self.assertRaises(AssertionError): validate(record)


if __name__ == "__main__": unittest.main(verbosity=2)
