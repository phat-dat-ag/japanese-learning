"""Audit secret exclusions and optionally test safe API startup failures.
Never prints resolved configuration, key contents, tokens or container logs.
"""
import argparse
import copy
import json
from pathlib import Path
import re
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[1]


def run(args, **kwargs):
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True, **kwargs)


def configuration():
    result = run(["docker", "compose", "config", "--format", "json"])
    assert result.returncode == 0, "Compose configuration is invalid (output withheld)."
    return json.loads(result.stdout)


def sensitive_values(config):
    return {str(value) for service in config["services"].values()
            for key, value in service.get("environment", {}).items()
            if "PASSWORD" in key.upper() and value and len(str(value)) >= 8}


def audit(config, check_compose=True):
    values = sensitive_values(config)
    count = 0
    for repo in (".", "dotnet", "quarkus", "angular"):
        # Include pending new source files; ignored local secrets are never enumerated.
        paths = run(["git", "-C", repo, "ls-files", "-z", "--cached", "--others", "--exclude-standard"])
        assert paths.returncode == 0
        for name in paths.stdout.split("\0"):
            file = ROOT / repo / name
            if not name or not file.is_file():
                continue
            assert not (file.name.startswith(".env") and file.name != ".env.example"), "Tracked local environment file: " + repo + "/" + name
            assert file.suffix.lower() not in (".pem", ".key", ".pfx", ".p12", ".jks"), "Tracked key file: " + repo + "/" + name
            content = file.read_bytes()
            assert not re.search(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", content), "Private key in source: " + repo + "/" + name
            assert not any(value.encode() in content for value in values), "Local database secret in source: " + repo + "/" + name
            count += 1
        if repo != "angular":
            for name in (".env", ".env.production", "secrets/jwt/private.pem", "private.pem", "private.PEM", "private.key", "local.pfx", "appsettings.Local.json", "application-local.properties"):
                result = run(["git", "-C", repo, "check-ignore", "--quiet", name])
                assert result.returncode == 0, "Secret path is not ignored: " + repo + "/" + name
            assert run(["git", "-C", repo, "check-ignore", "--quiet", ".env.example"]).returncode == 1
    for example in (ROOT / ".env.example", ROOT / "deployment/production.env.example"):
        if example.is_file():
            for line in example.read_text().splitlines():
                if re.match(r"[A-Z_]*PASSWORD=", line):
                    assert not line.split("=", 1)[1].strip(), "Example password must remain blank."
    if check_compose:
        # Empty required Compose settings must fail without revealing any other setting.
        import os
        env = os.environ.copy()
        env["MYSQL_PASSWORD"] = ""
        result = run(["docker", "compose", "config", "--quiet"], env=env)
        assert result.returncode != 0 and "MYSQL_PASSWORD" in result.stderr
        assert not any(value in result.stdout + result.stderr for value in values)
    print(f"PASS: {count} source files audited; local DB secrets/private key blocks absent; secret paths ignored; example safe.", flush=True)


def startup_checks(config):
    project = "jp-config-check-" + uuid.uuid4().hex[:10]
    cases = [
        ("mysql", {"MYSQL_PASSWORD": "synthetic-secret'"}, "Invalid MYSQL_PASSWORD"),
        ("mysql", {"MYSQL_ROOT_PASSWORD": "synthetic-secret\\"}, "Invalid MYSQL_ROOT_PASSWORD"),
        ("mysql", {"MYSQL_DATABASE": "synthetic-secret;bad"}, "Invalid MYSQL_DATABASE"),
        ("user-api", {"Database__Password": ""}, "Database configuration"),
        ("user-api", {"Database__Server": "", "Database__Name": "", "Database__User": "", "Database__Password": "",
                      "Database__ConnectionString": "Server=test;Database=test;synthetic-secret=invalid"}, "Database configuration"),
        ("user-api", {"Jwt__AccessTokenExpirationMinutes": "synthetic-secret"}, "Jwt configuration"),
        ("user-api", {"Jwt__PrivateKeyPath": "/dev/null"}, "JWT private key file"),
        ("vocabulary-api", {"DB_REACTIVE_URL": "mysql://user:synthetic-secret@mysql/test"}, "Invalid required configuration"),
        ("vocabulary-api", {"DB_PASSWORD": ""}, "Invalid required configuration"),
        ("vocabulary-api", {"AUTH_SERVER_URL": "http://user:synthetic-secret@user-api:8080"}, "Invalid required configuration"),
    ]
    secrets = sensitive_values(config) | {"synthetic-secret"}
    for index, (name, changes, expected) in enumerate(cases):
        service = copy.deepcopy(config["services"][name])
        for key in ("build", "container_name", "depends_on", "ports", "restart"):
            service.pop(key, None)
        service["image"] = service.get("image", config["name"] + "-" + name + ":latest")
        service["ulimits"]["core"] = 0
        service["environment"].update(changes)
        if name == "mysql":
            # Even a failed guard must never initialize or change existing data.
            service.pop("volumes", None)
            service["tmpfs"].append("/var/lib/mysql:rw,nosuid,nodev,size=1g,uid=999,gid=999,mode=0750")
        probe = {"name": project, "services": {name: service}, "networks": {
            "default": {"external": True, "name": config["networks"]["default"]["name"]}}}
        service["environment"] = {key: value.replace("$", "$$") if isinstance(value, str) else value
                                  for key, value in service["environment"].items()}
        encoded = json.dumps(probe)
        args = ["docker", "compose", "-p", project, "-f", "-"]
        try:
            # stdin keeps resolved credentials out of files and process arguments.
            result = run(args + ["run", "--rm", "--no-deps", "-T", name], input=encoded, timeout=90)
            output = result.stdout + result.stderr
            assert result.returncode != 0, name + ": invalid configuration was accepted"
            assert not any(value in output for value in secrets), name + ": startup diagnostic leaked a rejected value"
            assert expected in output, name + ": expected safe validation diagnostic missing in case " + str(index + 1)
            print(f"PASS: startup rejection {index + 1}/{len(cases)} ({name}); no secret values in diagnostics.", flush=True)
        finally:
            cleanup = run(args + ["down", "--timeout", "10"], input=encoded)
            assert cleanup.returncode == 0, "Could not clean up disposable configuration probe."


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--startup", action="store_true")
    args = parser.parse_args()
    config = configuration()
    audit(config)
    if args.startup:
        startup_checks(config)
