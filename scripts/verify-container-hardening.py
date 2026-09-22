"""Check Compose runtime restrictions; --fresh tests initialization with isolated tmpfs databases.

Fresh checks create no Docker volumes, use separate container/network names and generated DB
credentials, and never touch existing application data. Existing JWT files are mounted read-only.
Build both API images first. No resolved environment, tokens, or database rows are printed.
"""
import argparse
import hashlib
import http.client
import json
from pathlib import Path
import secrets
import re
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
RUNNING = ("mysql", "sqlserver", "user-api", "vocabulary-api", "gateway")
JOBS = ("sqlserver-init", "flyway-user", "flyway-vocabulary")


def docker(*args, input=None):
    result = subprocess.run(["docker", *args], cwd=ROOT, input=input, capture_output=True, text=True)
    if result.returncode:
        # Docker/driver failures can contain resolved credentials; print only the operation.
        message = "Docker operation failed: " + " ".join(args[:2])
        if input is not None:
            diagnostic = result.stderr
            values = [str(value) for service in json.loads(input)["services"].values()
                      for value in service.get("environment", {}).values() if value is not None]
            for value in sorted(values, key=len, reverse=True):
                if len(value) >= 4:
                    diagnostic = diagnostic.replace(value, "[redacted]").replace(value.replace("$$", "$"), "[redacted]")
            message += "\n" + diagnostic[-1800:]
        raise RuntimeError(message)
    return (result.stdout + (result.stderr if args[0] == "logs" else "")).strip()


def configuration():
    return json.loads(docker("compose", "config", "--format", "json"))


def containers(project):
    ids = docker("ps", "-aq", "--filter", "label=com.docker.compose.project=" + project).split()
    return {item["Config"]["Labels"]["com.docker.compose.service"]: item
            for item in json.loads(docker("inspect", *ids))} if ids else {}


def check_runtime(project):
    services = containers(project)
    for name in RUNNING + JOBS:
        item = services[name]
        host = item["HostConfig"]
        assert host["ReadonlyRootfs"], name + ": writable root filesystem"
        assert "ALL" in [cap.upper() for cap in host["CapDrop"]], name + ": capabilities not dropped"
        expected_caps = ["NET_BIND_SERVICE"] if name == "sqlserver" else []
        assert [cap.removeprefix("CAP_") for cap in (host.get("CapAdd") or [])] == expected_caps, name + ": unexpected added capabilities"
        assert any(opt.startswith("no-new-privileges") for opt in host["SecurityOpt"])
        assert host["Init"] and not host["Privileged"]
        assert host["Memory"] > 0 and host["MemorySwap"] == host["Memory"]
        assert host["NanoCpus"] > 0 and host["PidsLimit"] > 0
        assert item["Config"]["User"] not in ("", "0", "0:0", "root")
        assert all("size=" in options and "nosuid" in options and "nodev" in options
                   for options in host["Tmpfs"].values())
        if name in JOBS:
            assert item["State"]["Status"] == "exited" and item["State"]["ExitCode"] == 0, name + ": job failed"
            assert host["RestartPolicy"]["Name"] == "no"
        else:
            assert item["State"]["Health"]["Status"] == "healthy", name + ": unhealthy"
            status = docker("exec", item["Id"], "cat", "/proc/1/status")
            fields = dict(line.split(":", 1) for line in status.splitlines() if ":" in line)
            assert int(fields["Uid"].split()[0]) != 0
            allowed = 1 << 10 if name == "sqlserver" else 0
            assert int(fields["CapEff"].strip(), 16) & ~allowed == 0
            assert int(fields["CapBnd"].strip(), 16) == allowed
            assert fields["NoNewPrivs"].strip() == "1"
            assert host["RestartPolicy"]["Name"] == "unless-stopped"
            for bindings in (host.get("PortBindings") or {}).values():
                if name != "gateway":
                    assert all(binding["HostIp"] == "127.0.0.1" for binding in bindings)
    print("PASS: all 8 services use non-root, read-only, bounded runtimes with only the documented SQL capability; jobs succeeded.", flush=True)


def persistence_snapshot():
    # Aggregate fingerprints only; no account data, password hashes, or tokens leave either database.
    mysql = docker("compose", "exec", "-T", "mysql", "sh", "-c",
                   'MYSQL_PWD="$MYSQL_PASSWORD" mysql --protocol=TCP -h 127.0.0.1 -u "$MYSQL_USER" "$MYSQL_DATABASE" -N -B -e "CHECKSUM TABLE vocabulary, jlpt_levels, lessons, lesson_vocabulary;"')
    sql = docker("compose", "exec", "-T", "sqlserver", "sh", "-c",
                 'SQLCMDPASSWORD="$MSSQL_SA_PASSWORD" /opt/mssql-tools18/bin/sqlcmd -S 127.0.0.1 -U sa -C -b -h -1 -W -d JapaneseLearningUser -Q "SET NOCOUNT ON; SELECT COUNT_BIG(*), CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM dbo.Users; SELECT COUNT_BIG(*), CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM dbo.RefreshTokens;"')
    state = containers(configuration()["name"])
    volumes = {name: sorted(mount["Name"] for mount in state[name]["Mounts"] if mount["Type"] == "volume")
               for name in ("mysql", "sqlserver")}
    return {"fingerprint": hashlib.sha256((mysql + "\n" + sql).encode()).hexdigest(), "volumes": volumes}


def api(port, path, status, body=None, token=None):
    headers = {"X-Correlation-ID": "container-hardening-check"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if body is not None:
        body = json.dumps(body)
        headers["Content-Type"] = "application/json"
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=15)
    try:
        connection.request("POST" if body is not None else "GET", path, body, headers)
        response = connection.getresponse()
        content = response.read()
        assert response.status == status, f"{path}: expected {status}, received {response.status}"
        assert response.getheader("X-Correlation-ID") == "container-hardening-check"
        assert response.getheader("X-Content-Type-Options") == "nosniff"
        assert response.getheader("Cache-Control") == "no-store"
        return json.loads(content) if content and response.getheader("Content-Type", "").startswith("application/json") else None
    finally:
        connection.close()
        time.sleep(0.1)


def fresh_check():
    config = configuration()
    original_project = config["name"]
    project = "jp-container-check-" + uuid.uuid4().hex[:10]
    config["name"] = project
    config.pop("volumes", None)
    config["networks"] = {"default": {}}
    db_password = "Aa1!;\"'$;" + secrets.token_hex(20)
    mysql_password = "Aa1!;$;" + secrets.token_hex(20)
    for name, service in config["services"].items():
        # Compose 5 serializes a zero core limit as {}, which cannot be read back as input.
        service["ulimits"]["core"] = 0
        service.pop("container_name", None)
        service.pop("ports", None)
        if "build" in service:
            service.pop("build")
            service["image"] = original_project + "-" + name + ":latest"
        env = service.get("environment", {})
        for key in ("MYSQL_ROOT_PASSWORD", "MYSQL_PASSWORD", "MSSQL_SA_PASSWORD", "SQLCMDPASSWORD", "FLYWAY_PASSWORD"):
            if key in env:
                env[key] = mysql_password if name in ("mysql", "flyway-vocabulary") else db_password
        if name == "user-api":
            env["Database__Password"] = db_password
        if name in ("mysql", "sqlserver"):
            service.pop("volumes", None)
            mount = "/var/lib/mysql:rw,nosuid,nodev,size=1g,uid=999,gid=999,mode=0750" if name == "mysql" else "/var/opt/mssql:rw,nosuid,nodev,size=1g,uid=10001,gid=10001,mode=0770"
            service["tmpfs"].append(mount)
        if name == "vocabulary-api":
            env["DB_PASSWORD"] = mysql_password
    config["services"]["gateway"]["ports"] = ["127.0.0.1::8080"]
    # Resolved environment values are literal; healthcheck commands already retain
    # Compose's $$ escaping and must not be escaped a second time.
    for service in config["services"].values():
        service["environment"] = {key: value.replace("$", "$$") if isinstance(value, str) else value
                                  for key, value in service.get("environment", {}).items()}
    encoded = json.dumps(config)
    try:
        # Configuration travels over stdin, not a credential-bearing temporary file or argv.
        docker("compose", "-p", project, "-f", "-", "up", "-d", "--no-build", "--wait", "--wait-timeout", "180", input=encoded)
        check_runtime(project)
        state = containers(project)
        assert not any(mount["Type"] == "volume" for item in state.values() for mount in item["Mounts"])
        port = int(state["gateway"]["NetworkSettings"]["Ports"]["8080/tcp"][0]["HostPort"])
        account = {"username": "hardeningprobe", "email": "hardening@example.invalid", "password": "Aa1!" + secrets.token_hex(20)}
        api(port, "/api/auth/register", 201, account)
        login = api(port, "/api/auth/login", 200, {"email": account["email"], "password": account["password"]})
        token = login["accessToken"]
        api(port, "/api/auth/me", 200, token=token)
        api(port, "/api/v1/jlpt-levels", 200, token=token)
        api(port, "/api/auth/admin-test", 403, token=token)
        api(port, "/api/v1/jlpt-levels", 401, token="synthetic-invalid-token")
        refreshed = api(port, "/api/auth/refresh", 200, {"refreshToken": login["refreshToken"]})
        api(port, "/api/v1/jlpt-levels", 200, token=refreshed["accessToken"])
        api(port, "/health", 200)
        # Prove that environment credentials and issued tokens never enter service logs.
        sensitive = (db_password, mysql_password, account["password"], token, login["refreshToken"],
                     refreshed["accessToken"], refreshed["refreshToken"])
        for item in state.values():
            logs = docker("logs", item["Id"])
            assert not any(value in logs for value in sensitive), "A service log contains a credential or token"
        # A real account in the isolated database remains usable after stateless API recreation.
        docker("compose", "-p", project, "-f", "-", "up", "-d", "--no-build", "--no-deps", "--force-recreate", "--wait", "user-api", "vocabulary-api", input=encoded)
        # Allow the gateway's existing 10-second Docker DNS cache to refresh.
        time.sleep(11)
        api(port, "/api/auth/login", 200, {"email": account["email"], "password": account["password"]})
        print("PASS: fresh database initialization, all migrations, register/login/refresh, JWKS, roles, errors, and API recreation.", flush=True)
    except Exception:
        for name, item in containers(project).items():
            print(f"{name}: {item['State']['Status']}, exit={item['State']['ExitCode']}, OOM={item['State']['OOMKilled']}", flush=True)
            logs = docker("logs", item["Id"])
            # Extract only filesystem paths from permission errors, never arbitrary application logs.
            for line in logs.splitlines():
                if "Permission denied" in line or "Read-only file system" in line:
                    paths = re.findall(r"/(?:tmp|var|home|opt|deployments|flyway)/[A-Za-z0-9_./-]+", line)
                    print(name + ": filesystem permission failure " + ", ".join(paths), flush=True)
        raise
    finally:
        # Never remove volumes; this isolated project uses tmpfs database storage only.
        docker("compose", "-p", project, "-f", "-", "down", "--timeout", "75", input=encoded)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--fresh", action="store_true")
    group.add_argument("--snapshot", type=Path, help="Save aggregate fingerprints before recreating existing DB containers")
    group.add_argument("--compare", type=Path, help="Compare existing volume identities and aggregate data fingerprints")
    args = parser.parse_args()
    if args.fresh:
        fresh_check()
    elif args.snapshot:
        args.snapshot.write_text(json.dumps(persistence_snapshot()), encoding="utf-8")
        print("Saved aggregate persistence fingerprint; no row data or credentials recorded.")
    elif args.compare:
        assert persistence_snapshot() == json.loads(args.compare.read_text(encoding="utf-8")), "Persistence fingerprint changed"
        print("PASS: named volume identities and persisted data fingerprints survived container recreation.")
    else:
        check_runtime(configuration()["name"])
