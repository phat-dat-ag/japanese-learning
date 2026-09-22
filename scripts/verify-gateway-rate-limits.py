"""Exercise the exact gateway limits with isolated, disposable Docker upstreams.

Uses nginx:stable-alpine and python:3.14-alpine (test client only). The client
shares the gateway network namespace and binds distinct loopback addresses to
test independent IP budgets and aggregate concurrency without spoofed headers.
No keys, credentials, real APIs, or application data are used.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import http.client
import importlib.util
from pathlib import Path
import socket
import tempfile
import time
import uuid

SCRIPTS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("security_checks", SCRIPTS / "verify-gateway-security.py")
security = importlib.util.module_from_spec(spec)
spec.loader.exec_module(security)
ID = "gateway-rate-check"


def request(ip, path, method="GET", headers=(), body=None):
    connection = http.client.HTTPConnection("127.0.0.1", 8080, timeout=5, source_address=(ip, 0))
    try:
        connection.request(method, path, body=body,
                           headers={"X-Correlation-ID": ID, **dict(headers)})
        response = connection.getresponse()
        return response.status, response.getheaders(), response.read()
    finally:
        connection.close()


def check(result, status):
    return security.check_response(result, status, ID)


def rate_case(ip, path, burst, rate, interval):
    started = time.monotonic()
    accepted = 0
    for attempt in range(4 * burst + 30):
        result = request(ip, path + "?attempt=" + str(attempt), "POST", body=b"{}")
        if result[0] == 429:
            check(result, 429)
            break
        check(result, 200)
        accepted += 1
    else:
        raise AssertionError("Rate limit never rejected requests")
    elapsed = time.monotonic() - started
    assert burst + 1 <= accepted <= burst + 2 + int(elapsed * rate), "Unexpected burst/rate budget"
    # Query strings, correlation IDs, Authorization, and forwarded IPs cannot buy a new budget.
    check(request(ip, path + "?different=1", "POST", headers=[
        ("Authorization", "Bearer synthetic-rate-sentinel"),
        ("X-Forwarded-For", "203.0.113.123"), ("Forwarded", "for=203.0.113.124")], body=b"{}"), 429)
    rotated = request(ip, path, "POST", headers=[("X-Correlation-ID", "rotated-rate-id")], body=b"{}")
    security.check_response(rotated, 429, "rotated-rate-id")
    invalid = request(ip, path, "POST", headers=[("X-Correlation-ID", "bad value")], body=b"{}")
    security.check_response(invalid, 429, None)
    # A distinct TCP peer gets a fresh budget while this peer is still rejected.
    fresh_ip = ip.replace("127.10.0.", "127.11.0.")
    check(request(fresh_ip, path, "POST", body=b"{}"), 200)
    if "/login" in path:
        for variant in ("/api/auth/register", "/api/auth/Login/", "/api/auth/%6cogin"):
            check(request(ip, variant, "POST", body=b"{}"), 429)
        # Sensitive-endpoint throttling does not lock out ordinary reads or refresh.
        check(request(ip, "/api/auth/me"), 200)
        check(request(ip, "/api/auth/refresh", "POST", body=b"{}"), 200)
    for _ in range(50):
        check(request(ip, "/health"), 200)
        check(request(ip, path, "OPTIONS"), 200)
    print(f"PASS: {path} burst/rejection, spoof resistance, health and OPTIONS exemptions", flush=True)
    time.sleep(interval + 0.2)
    check(request(ip, path, "POST", body=b"{}"), 200)
    print(f"PASS: {path} recovered after its refill interval", flush=True)


def hold_request(ip, path):
    connection = socket.create_connection(("127.0.0.1", 8080), timeout=5, source_address=(ip, 0))
    try:
        connection.sendall((f"POST {path} HTTP/1.1\r\nHost: localhost\r\n"
                            f"X-Correlation-ID: {ID}\r\nContent-Length: 1\r\n"
                            "Expect: 100-continue\r\nConnection: close\r\n\r\n").encode())
        data = b""
        while b"\r\n\r\n" not in data:
            chunk = connection.recv(4096)
            assert chunk, "Connection closed before request admission"
            data += chunk
            assert len(data) < 16384
        assert data.startswith(b"HTTP/1.1 100 "), "Request was not admitted within the concurrency budget"
        return connection
    except BaseException:
        connection.close()
        raise


def concurrency_case(sources, per_source, path, rejected_ip, label, options_status=429):
    held = []
    try:
        for ip in sources:
            for _ in range(per_source):
                held.append(hold_request(ip, path))
        check(request(rejected_ip, path, "POST", body=b"x"), 429)
        check(request(rejected_ip, "/health"), 200)
        check(request(rejected_ip, path, "OPTIONS"), options_status)
    finally:
        for connection in held:
            connection.close()
    # Allow the event loop to observe disconnects; do not wait for the body timeout.
    for _ in range(20):
        result = request(rejected_ip, path, "POST", body=b"x")
        if result[0] == 200:
            check(result, 200)
            break
        check(result, 429)
        time.sleep(0.05)
    else:
        raise AssertionError("Concurrency budget was not released after disconnect")
    check(request(rejected_ip, path, "OPTIONS"), 200)
    print(f"PASS: {label} concurrency cap, health, OPTIONS policy, and release", flush=True)


def inside_checks():
    for _ in range(50):
        try:
            if request("127.0.0.2", "/health")[0] == 200:
                break
        except (OSError, http.client.HTTPException):
            pass
        time.sleep(0.1)
    cases = [("127.10.0.1", "/api/auth/login", 5, 10 / 60, 6),
             ("127.10.0.2", "/api/auth/refresh", 10, 1, 1),
             ("127.10.0.3", "/api/vocabularies/import", 1, 2 / 60, 30),
             ("127.10.0.4", "/api/v1/flashcards", 40, 20, 0.05)]
    # Recover independent buckets concurrently, including the real 30s import interval.
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(rate_case, *case) for case in cases]
        for future in futures:
            future.result()
    # Fresh source IP has its own budget even while other IPs have used theirs.
    check(request("127.10.0.5", "/api/auth/login", "POST", body=b"{}"), 200)
    concurrency_case(["127.20.0.1"], 20, "/api/auth/probe", "127.20.0.1", "20 per-IP")
    concurrency_case([f"127.21.0.{i}" for i in range(1, 11)], 20,
                     "/api/auth/probe", "127.21.0.11", "200 gateway-wide")
    concurrency_case(["127.22.0.1", "127.22.0.2"], 1,
                     "/api/vocabularies/import", "127.22.0.3", "2 gateway-wide imports", options_status=200)
    print("PASS: all production rate and concurrency limits", flush=True)


def isolated_checks():
    name = "jp-gateway-rates-" + uuid.uuid4().hex[:12]
    upstream, gateway, client = name + "-upstream", name + "-gateway", name + "-client"
    created = []
    network_created = False
    with tempfile.TemporaryDirectory(prefix="jp-gateway-rates-") as directory:
        stub = Path(directory) / "upstream.conf"
        stub.write_text(security.UPSTREAM, encoding="utf-8")
        try:
            security.docker("network", "create", name)
            network_created = True
            security.docker("run", "-d", "--name", upstream, "--network", name,
                            "--network-alias", "user-api", "--network-alias", "vocabulary-api",
                            "--mount", f"type=bind,source={stub},target=/etc/nginx/nginx.conf,readonly", security.IMAGE)
            created.append(upstream)
            security.docker("run", "-d", "--name", gateway, "--network", name,
                            "--mount", f"type=bind,source={security.ROOT / 'gateway/nginx.conf'},target=/etc/nginx/nginx.conf,readonly",
                            *security.gateway_runtime_args())
            created.append(gateway)
            security.docker("exec", gateway, "nginx", "-t")
            # Only test scripts are mounted; the test client cannot read repository secrets.
            created.append(client)
            import subprocess
            result = subprocess.run(["docker", "run", "--name", client, "--network", "container:" + gateway,
                                     "--mount", f"type=bind,source={SCRIPTS},target=/checks,readonly",
                                     "python:3.14-alpine", "python", "-B", "/checks/verify-gateway-rate-limits.py", "--inside"])
            assert result.returncode == 0, "Isolated rate-limit checks failed"
            logs = security.docker("logs", gateway)
            assert "rate=REJECTED" in logs and "connections=REJECTED" in logs, "Limit outcomes missing from safe logs"
            assert "synthetic-rate-sentinel" not in logs, "Synthetic credential leaked to logs"
        finally:
            for container in reversed(created):
                security.docker("rm", "-f", container)
            if network_created:
                security.docker("network", "rm", name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inside", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.inside:
        inside_checks()
    else:
        isolated_checks()
