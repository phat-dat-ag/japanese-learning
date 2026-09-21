"""Run against the current Docker Compose stack; no credentials or data mutations."""
import http.client
import json
import re
import subprocess
import time
import uuid
from pathlib import Path

HEADER = "X-Correlation-ID"
ROOT = Path(__file__).resolve().parents[1]


def request(port, path, values, method="GET", body=None):
    if port == 8080:
        time.sleep(0.06)  # Ordinary smoke traffic stays below the 20 requests/second budget.
    connection = http.client.HTTPConnection("localhost", port, timeout=15)
    try:
        connection.putrequest(method, path)
        for value in values:
            connection.putheader(HEADER, value)
        if body is not None:
            connection.putheader("Content-Type", "application/json")
            connection.putheader("Content-Length", str(len(body)))
        connection.endheaders(body)
        response = connection.getresponse()
        ids = [value for key, value in response.getheaders() if key.lower() == HEADER.lower()]
        data = response.read()
        assert len(ids) == 1, f"Expected one correlation header on {port}{path}"
        return response.status, ids[0], data
    finally:
        connection.close()


def main():
    marker = "correlation-check-" + uuid.uuid4().hex
    routes = [(8080, "/api/auth/me", 401, "user-api"),
              (8080, "/api/v1/jlpt-levels", 401, "vocabulary-api"),
              (8080, "/health", 200, None), (8080, "/not-a-route", 404, None),
              (8081, "/api/auth/me", 401, "user-api"),
              (8082, "/api/v1/jlpt-levels", 401, "vocabulary-api")]
    expected_logs = {"gateway": set(), "user-api": set(), "vocabulary-api": set()}
    count = 0
    for port, path, status, service in routes:
        for values in ([marker], ["a" * 64], [], [""], ["bad value"], ["a" * 65], ["first", "second"]):
            actual_status, correlation, _ = request(port, path, values)
            assert actual_status == status, f"Unexpected status {actual_status} on {port}{path}"
            if values in ([marker], ["a" * 64]):
                assert correlation == values[0], "Valid correlation ID changed"
            else:
                assert re.fullmatch("[a-f0-9]{32}", correlation), "Invalid generated correlation ID"
            if service:
                expected_logs[service].add(correlation)
            if port == 8080 and path != "/health":
                expected_logs["gateway"].add(correlation)
            count += 1

    # Missing fields exercise MVC automatic validation, which also exposes traceId.
    status, correlation, data = request(8080, "/api/auth/login", [marker], "POST", b"{}")
    assert status == 400
    assert json.loads(data)["traceId"] == correlation == marker
    expected_logs["gateway"].add(correlation)
    expected_logs["user-api"].add(correlation)

    # A malformed email reaches FluentValidation without accessing the database.
    status, correlation, data = request(8080, "/api/auth/login", [marker], "POST",
                                        b'{"email":"not-an-email","password":"correlation-probe-not-a-real-password"}')
    assert status == 400
    assert json.loads(data)["traceId"] == correlation == marker
    assert json.loads(data)["error"]["code"] == "VALIDATION_ERROR"

    # Docker logging can arrive just after response completion; bounded retries only.
    for attempt in range(10):
        missing = []
        for service, ids in expected_logs.items():
            result = subprocess.run(["docker", "compose", "logs", "--since", "2m", "--no-color", service],
                                    cwd=ROOT, capture_output=True, text=True, check=True)
            for correlation in ids:
                if not any(correlation in line and (service == "gateway" or "HTTP request completed" in line)
                           for line in result.stdout.splitlines()):
                    missing.append(service)
            assert "correlation-probe-not-a-real-password" not in result.stdout, "Credential sentinel leaked to logs"
            if service == "user-api" and not any(marker in line and "Exception" in line
                                                  for line in result.stdout.splitlines()):
                missing.append("user-api application error")
        if not missing:
            break
        time.sleep(0.2)
    assert not missing, f"Missing correlated request logs in: {sorted(set(missing))}"
    print(f"PASS: {count + 2} HTTP cases; gateway/backend logs match response IDs.")
    print(f"Verified correlation ID: {marker}")


if __name__ == "__main__":
    main()
