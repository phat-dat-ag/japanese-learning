"""Verify metrics and an isolated Prometheus/Grafana stack against the running APIs.
Uses generated Grafana credentials and tmpfs data; never prints credentials or full metrics/logs.
Does not modify .env, existing containers, named volumes or database rows.
"""
import base64
import copy
import http.client
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time
import urllib.parse
import uuid

ROOT = Path(__file__).resolve().parents[1]


def command(args, **kwargs):
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, **kwargs)
    assert result.returncode == 0, "Command failed (diagnostics withheld): " + " ".join(args[:2])
    return result.stdout + (result.stderr if args[:2] == ["docker", "logs"] else "")


def request(port, path, headers=None, method="GET", body=None):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=15)
    try:
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        return response.status, response.read().decode(), dict(response.getheaders())
    finally:
        connection.close()


def metrics_checks():
    marker = "metrics-sentinel-" + uuid.uuid4().hex
    for port, path, http_metric, runtime_metric in (
            (8081, "/metrics", "http_requests_received_total", "dotnet_collection_count_total"),
            (8082, "/q/metrics", "http_server_requests_seconds_count", "jvm_memory_used_bytes")):
        for i in range(12):
            status, _, _ = request(port, "/unknown-" + marker + "/" + str(i) + "?secret=" + marker,
                                   {"Authorization": "Bearer " + marker, "Host": marker + ".invalid",
                                    "X-Correlation-ID": marker}, method="PROBE" + str(i))
            assert status in (401, 404, 405)
        status, metrics, _ = request(port, path, {"Accept": "application/openmetrics-text; version=1.0.0"} if port == 8081 else {"Accept": "text/plain"})
        assert status == 200 and http_metric in metrics and runtime_metric in metrics
        assert marker not in metrics
        for forbidden in ("trace_id=", "span_id=", "user_id=", "correlation", "uri=", "clientName=", "PROBE"):
            assert forbidden not in metrics, "Unsafe or unbounded metric label"
        http_lines = [line for line in metrics.splitlines() if line.startswith(("http_requests_", "http_request_duration_", "http_server_requests_"))]
        allowed = {"http_method", "method", "route", "code", "status", "le"}
        for line in http_lines:
            assert set(re.findall(r'([a-zA-Z_]+)=', line)) <= allowed, "Unexpected HTTP metric label"
        print(f"PASS: backend port {port} exports bounded HTTP/runtime metrics without sensitive probe values.", flush=True)
    for path in ("/metrics", "/q/metrics"):
        assert request(8080, path)[0] == 404, "Gateway exposed backend metrics"
    for service in ("user-api", "vocabulary-api", "gateway"):
        logs = command(["docker", "compose", "logs", "--no-color", "--since", "2m", service])
        # Correlation IDs intentionally belong in logs, so only check tokens sent separately below.
        assert "Bearer " + marker not in logs and "secret=" + marker not in logs
    print("PASS: Gateway blocks scrape routes; request secrets are absent from logs.", flush=True)


def stack_check():
    password = "Aa1!" + secrets.token_hex(24)
    environment = os.environ.copy()
    environment["GRAFANA_ADMIN_PASSWORD"] = password
    config = json.loads(command(["docker", "compose", "-f", "docker-compose.yml", "-f",
                                 "compose.observability.yml", "config", "--format", "json"], env=environment))
    project = "jp-metrics-check-" + uuid.uuid4().hex[:10]
    app_network = config["networks"]["default"]["name"]
    config["name"] = project
    config["services"] = {name: copy.deepcopy(config["services"][name]) for name in ("prometheus", "grafana")}
    config.pop("volumes", None)
    config["networks"] = {"default": {}, "applications": {"external": True, "name": app_network}}
    for name, service in config["services"].items():
        service.pop("depends_on", None)
        service["ulimits"]["core"] = 0
        service["networks"] = {"default": {}}
        if name == "prometheus":
            service["networks"]["applications"] = {}
        service["volumes"] = [mount for mount in service["volumes"] if mount["type"] == "bind"]
        data = "/prometheus:rw,noexec,nosuid,nodev,size=256m,uid=65534,gid=65534,mode=0700" if name == "prometheus" else "/var/lib/grafana:rw,noexec,nosuid,nodev,size=128m,uid=472,gid=472,mode=0700"
        service["tmpfs"].append(data)
        port = 9090 if name == "prometheus" else 3000
        service["ports"] = [f"127.0.0.1::{port}"]
    encoded = json.dumps(config)
    compose = ["docker", "compose", "-p", project, "-f", "-"]
    try:
        command(compose + ["up", "-d", "--wait", "--wait-timeout", "150"], input=encoded)
        ids = command(["docker", "ps", "-aq", "--filter", "label=com.docker.compose.project=" + project]).split()
        state = json.loads(command(["docker", "inspect", *ids]))
        ports = {}
        for item in state:
            name = item["Config"]["Labels"]["com.docker.compose.service"]
            host = item["HostConfig"]
            assert host["ReadonlyRootfs"] and not host["Privileged"] and host["Memory"] > 0
            assert "ALL" in host["CapDrop"] and not host.get("CapAdd")
            assert any(value.startswith("no-new-privileges") for value in host["SecurityOpt"])
            assert item["Config"]["User"] not in ("", "0", "root")
            assert not any(mount["Type"] == "volume" for mount in item["Mounts"])
            target = "9090/tcp" if name == "prometheus" else "3000/tcp"
            binding = item["NetworkSettings"]["Ports"][target][0]
            assert binding["HostIp"] == "127.0.0.1"
            ports[name] = int(binding["HostPort"])
        for _ in range(20):
            status, body, _ = request(ports["prometheus"], "/api/v1/targets")
            targets = json.loads(body)["data"]["activeTargets"]
            if status == 200 and len(targets) == 2 and all(target["health"] == "up" for target in targets):
                break
            time.sleep(2)
        else:
            raise AssertionError("Prometheus did not scrape both APIs")
        assert request(ports["grafana"], "/api/datasources")[0] == 401
        auth = {"Authorization": "Basic " + base64.b64encode(("admin:" + password).encode()).decode()}
        status, body, _ = request(ports["grafana"], "/api/dashboards/uid/japanese-learning-overview", auth)
        assert status == 200 and json.loads(body)["dashboard"]["panels"]
        # Query every provisioned panel through Grafana's Prometheus datasource proxy.
        dashboard = json.loads((ROOT / "observability/grafana/dashboards/apis.json").read_text())
        for panel in dashboard["panels"]:
            query = urllib.parse.urlencode({"query": panel["targets"][0]["expr"]})
            status, body, _ = request(ports["grafana"],
                "/api/datasources/proxy/uid/japanese-learning-prometheus/api/v1/query?" + query, auth)
            assert status == 200 and json.loads(body)["status"] == "success", "Dashboard query failed"
        query = urllib.parse.urlencode({"query": "up"})
        _, body, _ = request(ports["grafana"],
            "/api/datasources/proxy/uid/japanese-learning-prometheus/api/v1/query?" + query, auth)
        samples = json.loads(body)["data"]["result"]
        assert len(samples) == 2 and all(sample["value"][1] == "1" for sample in samples)
        for item in state:
            logs = command(["docker", "logs", item["Id"]])
            assert password not in logs, "Grafana credential entered logs"
        print("PASS: hardened Prometheus/Grafana healthy; two scrape targets UP; Grafana authenticated, dashboard provisioned and all panel queries succeed.", flush=True)
    finally:
        command(compose + ["down", "--timeout", "30"], input=encoded)


if __name__ == "__main__":
    metrics_checks()
    stack_check()
