"""Verify the real gateway config with isolated upstreams; optionally check Compose APIs.

Requires Docker and Python's standard library. Uses only synthetic credentials,
never reads keys/.env, and creates no application data. Temporary containers and
network are removed in finally. Run from anywhere with --live for Compose checks.
"""
import argparse
import http.client
import json
import re
import socket
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMAGE = "nginx:stable-alpine"
ID = "gateway-security-check"
SENTINEL = "synthetic-security-sentinel"
HEADERS = {"x-content-type-options": "nosniff", "x-frame-options": "DENY",
           "referrer-policy": "no-referrer", "cache-control": "no-store"}

# Return booleans, never echo Authorization, URLs, or arbitrary request headers.
# Deliberately conflicting upstream headers exercise the edge's single policy.
UPSTREAM = r'''
events {}
http {
    access_log off;
    error_log /dev/null;
    map $http_authorization $auth_ok {
        default false;
        "Bearer synthetic-security-sentinel" true;
    }
    map "$http_forwarded|$http_x_forwarded_host|$http_x_forwarded_port|$http_proxy|$http_upgrade|$http_te|$http_trailer|$http_x_test_underscore" $stripped {
        default false;
        "|||||||" true;
    }
    map "$http_x_forwarded_for|$http_x_real_ip|$http_x_forwarded_proto" $edge_ok {
        default false;
        "~^([0-9.]+)\|\1\|http$" true;
    }
    server {
        listen 8080;
        client_max_body_size 10m;
        default_type application/json;
        add_header X-Powered-By test-platform always;
        add_header X-Content-Type-Options incorrect-upstream always;
        add_header X-Frame-Options SAMEORIGIN always;
        add_header Referrer-Policy unsafe-url always;
        add_header Cache-Control "public, max-age=3600" always;
        add_header Expires "Thu, 31 Dec 2037 23:55:55 GMT" always;
        add_header X-Correlation-ID $http_x_correlation_id always;
        location = /api/auth/denied {
            return 401 '{"error":"unauthorized"}';
        }
        location / {
            return 200 '{"authorizationPreserved":$auth_ok,"untrustedHeadersRemoved":$stripped,"edgeHeadersValid":$edge_ok,"correlationId":"$http_x_correlation_id"}';
        }
    }
}
'''


def docker(*args):
    result = subprocess.run(["docker", *args], cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        # Commands contain no secrets, but avoid dumping arbitrary container output.
        raise RuntimeError("Docker command failed: " + " ".join(args[:3]))
    return (result.stdout + (result.stderr if args[0] == "logs" else "")).strip()


def request(port, path, method="GET", headers=(), body=None):
    if port == 8080:
        time.sleep(0.06)  # Ordinary smoke traffic stays below the 20 requests/second budget.
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=15)
    try:
        connection.putrequest(method, path)
        for name, value in headers:
            connection.putheader(name, value)
        if body is not None:
            connection.putheader("Content-Length", str(len(body)))
        connection.endheaders(body)
        response = connection.getresponse()
        return response.status, response.getheaders(), response.read()
    finally:
        connection.close()


def check_response(result, expected, correlation=ID):
    status, headers, body = result
    assert status == expected, f"Expected HTTP {expected}, received {status}"
    for name, value in HEADERS.items():
        assert [v for k, v in headers if k.lower() == name] == [value], f"Incorrect {name}"
    ids = [v for k, v in headers if k.lower() == "x-correlation-id"]
    assert len(ids) == 1, "Expected a single correlation ID"
    if correlation is not None:
        assert ids[0] == correlation, "Correlation ID changed"
    else:
        assert re.fullmatch("[a-f0-9]{32}", ids[0]), "Unsafe generated correlation ID"
    server = [v for k, v in headers if k.lower() == "server"]
    assert server == ["nginx"], "Server version or upstream server leaked"
    assert not any(k.lower() in {"x-powered-by", "expires"} for k, _ in headers)
    assert b"nginx/" not in body, "NGINX version leaked in error body"
    return body


def gateway_runtime_args():
    # Exercise the actual Compose security/resource policy without exposing resolved credentials.
    gateway = json.loads(docker("compose", "config", "--format", "json"))["services"]["gateway"]
    args = ["--user", gateway["user"], "--read-only", "--init",
            "--memory", str(gateway["mem_limit"]), "--memory-swap", str(gateway["memswap_limit"]),
            "--cpus", str(gateway["cpus"]), "--pids-limit", str(gateway["pids_limit"]),
            "--ulimit", "core=0:0", "--stop-signal", "SIGQUIT", "--entrypoint", "nginx"]
    for capability in gateway["cap_drop"]:
        args += ["--cap-drop", capability]
    for option in gateway["security_opt"]:
        args += ["--security-opt", option]
    for mount in gateway["tmpfs"]:
        args += ["--tmpfs", mount]
    return args + [gateway["image"], "-g", "daemon off;"]


def isolated_checks():
    name = "jp-gateway-security-" + uuid.uuid4().hex[:12]
    upstream, gateway = name + "-upstream", name + "-gateway"
    created = []
    network_created = False
    with tempfile.TemporaryDirectory(prefix="jp-gateway-security-") as directory:
        stub = Path(directory) / "upstream.conf"
        stub.write_text(UPSTREAM, encoding="utf-8")
        try:
            docker("network", "create", name)
            network_created = True
            docker("run", "-d", "--name", upstream, "--network", name,
                   "--network-alias", "user-api", "--network-alias", "vocabulary-api",
                   "--mount", f"type=bind,source={stub},target=/etc/nginx/nginx.conf,readonly", IMAGE)
            created.append(upstream)
            docker("run", "-d", "--name", gateway, "--network", name, "-p", "127.0.0.1::8080",
                   "--mount", f"type=bind,source={ROOT / 'gateway/nginx.conf'},target=/etc/nginx/nginx.conf,readonly", *gateway_runtime_args())
            created.append(gateway)
            docker("exec", gateway, "nginx", "-t")
            port = int(docker("port", gateway, "8080/tcp").rsplit(":", 1)[1])
            for attempt in range(30):
                try:
                    if request(port, "/health")[0] == 200:
                        break
                except (OSError, http.client.HTTPException):
                    pass
                time.sleep(0.1)
            common = [("X-Correlation-ID", ID)]
            for path, status in [("/health", 200), ("/unknown", 404), ("/api/auth/denied", 401),
                                 ("/.well-known/jwks.json", 404), ("/q/health", 404),
                                 ("/api/authentication", 404), ("/api/v1/flashcards-extra", 404)]:
                check_response(request(port, path, headers=common), status)
            for method in ("HEAD", "OPTIONS"):
                check_response(request(port, "/health", method, common), 200)
            for method in ("TRACE", "TRACK", "PROPFIND", "BREW"):
                result = request(port, "/api/auth/me", method, common)
                check_response(result, 405)
                assert "OPTIONS" in dict(result[1]).get("Allow", ""), "405 missing Allow"

            spoofed = common + [("Authorization", "Bearer " + SENTINEL),
                                ("Connection", "Authorization, X-Correlation-ID, upgrade"),
                                ("Forwarded", "for=203.0.113.1;proto=https"),
                                ("X-Forwarded-For", "203.0.113.1"), ("X-Real-IP", "203.0.113.2"),
                                ("X-Forwarded-Proto", "https"), ("X-Forwarded-Host", "spoof.invalid"),
                                ("X-Forwarded-Port", "443"), ("Proxy", SENTINEL),
                                ("Upgrade", "websocket"), ("TE", "trailers"), ("Trailer", "X-Test"),
                                ("X_Test_Underscore", "unsafe")]
            for path in ("/api/auth/me", "/api/v1/flashcards", "/api/v1/jlpt-levels",
                         "/api/v1/lessons", "/api/vocabularies/import"):
                data = json.loads(check_response(request(port, path, headers=spoofed), 200))
                assert data == {"authorizationPreserved": True, "untrustedHeadersRemoved": True,
                                "edgeHeadersValid": True, "correlationId": ID}, "Proxy header policy mismatch"
            for method in ("POST", "PUT", "PATCH", "DELETE", "OPTIONS"):
                check_response(request(port, "/api/auth/probe", method, common, b"{}"), 200)
            for value in (None, "bad value", "a" * 65):
                headers = [] if value is None else [("X-Correlation-ID", value)]
                data = json.loads(check_response(request(port, "/api/auth/me", headers=headers), 200, None))
                assert re.fullmatch("[a-f0-9]{32}", data["correlationId"])

            # Preserve the existing upload boundary; this upstream cannot write application data.
            check_response(request(port, "/api/vocabularies/import", "POST", common,
                                   b"x" * (10 * 1024 * 1024)), 200)
            # Fail on declared oversize without uploading the oversized body.
            check_response(request(port, "/api/auth/" + SENTINEL + "?token=" + SENTINEL, "POST",
                                   common + [("Content-Length", str(10 * 1024 * 1024 + 1))]), 413)
            check_response(request(port, "/api/auth/me", headers=common + [("X-Large", "a" * 9000)]), 400)
            check_response(request(port, "/api/auth/me", headers=common + [("Host", "duplicate.invalid")]), 400)
            check_response(request(port, "/api/auth/login", "POST",
                                   common + [("Content-Length", "0"), ("Transfer-Encoding", "chunked")]), 400)
            check_response(request(port, "/api/auth/login", "POST",
                                   common + [("Content-Length", "0"), ("Content-Length", "1")]), 400)

            # NGINX may close an incomplete request without writing an HTTP response.
            started = time.monotonic()
            with socket.create_connection(("127.0.0.1", port), timeout=15) as connection:
                connection.sendall(b"GET /api/auth/me HTTP/1.1\r\nHost: localhost\r\n")
                response = http.client.HTTPResponse(connection)
                try:
                    response.begin()
                    assert response.status == 408, "Expected header-read timeout"
                    response.read()
                except http.client.RemoteDisconnected:
                    pass
            assert 8 <= time.monotonic() - started < 15, "Header timeout did not enforce the 10s deadline"
            docker("stop", "--time", "1", upstream)
            unavailable = request(port, "/api/auth/me", headers=common)
            assert unavailable[0] in (502, 504), "Expected an upstream connection failure"
            check_response(unavailable, unavailable[0])
            check_response(request(port, "/health", headers=common), 200)
            logs = docker("logs", gateway)
            assert " 408 " in logs, "Missing timeout access-log entry"
            assert SENTINEL not in logs, "Sensitive request details leaked to gateway logs"
            assert ID in logs and "upstream_status=" in logs, "Sanitized request logs missing"
            print("PASS: isolated NGINX routing, Authorization forwarding, header sanitization, security headers,")
            print("      correlation, method/framing/size rejection, header timeout, and safe logs.")
        finally:
            for container in reversed(created):
                docker("rm", "-f", container)
            if network_created:
                docker("network", "rm", name)


def live_checks():
    docker("compose", "config", "--quiet")
    docker("compose", "exec", "-T", "gateway", "nginx", "-t")
    common = [("X-Correlation-ID", ID)]
    check_response(request(8080, "/health", headers=common), 200)
    for port, path, method in ((8081, "/api/auth/me", "GET"),
                               (8081, "/api/auth/admin-test", "GET"),
                               (8082, "/api/v1/flashcards", "GET"),
                               (8082, "/api/v1/jlpt-levels", "GET"),
                               (8082, "/api/v1/lessons?level=N5", "GET"),
                               (8082, "/api/vocabularies/import", "POST")):
        for authorization in ([], [("Authorization", "Bearer " + SENTINEL)]):
            headers = common + authorization
            direct = request(port, path, method, headers)
            assert direct[0] == 401, "Unexpected direct authentication behavior"
            check_response(request(8080, path, method, headers), direct[0])
    # OPTIONS remains the backend's decision; no new CORS policy or preflight shortcut.
    for port, path in ((8081, "/api/auth/me"), (8082, "/api/v1/jlpt-levels")):
        expected = request(port, path, "OPTIONS", common)[0]
        check_response(request(8080, path, "OPTIONS", common), expected)
    result = subprocess.run([sys.executable, str(ROOT / "scripts/verify-correlation.py")], cwd=ROOT)
    assert result.returncode == 0, "Existing correlation regression failed"
    print("PASS: live Compose routes, authentication rejection, OPTIONS, and correlation regression.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Also check the running local Compose stack")
    args = parser.parse_args()
    isolated_checks()
    if args.live:
        live_checks()
