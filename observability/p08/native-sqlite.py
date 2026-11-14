"""Read-only native integrity check for an OFFLINE exported telemetry SQLite database.

Never point at live Grafana/Fluent Bit volumes. Create the export with SQLite's backup
API (not cp of an active DB/WAL), then restore the authenticated package to a new path.
No database content or schema is printed.
"""
import argparse
import json
from pathlib import Path
import sqlite3


def verify(file):
    file = Path(file)
    if file.is_symlink() or not file.is_file():
        raise ValueError("Expected regular offline database export")
    with file.open("rb") as stream:
        if stream.read(16) != b"SQLite format 3\x00":
            raise ValueError("Missing SQLite header")
    with sqlite3.connect(file.resolve().as_uri() + "?mode=ro&immutable=1", uri=True) as db:
        db.execute("PRAGMA query_only=ON")
        if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise ValueError("Native SQLite integrity failure")
        if db.execute("PRAGMA foreign_key_check").fetchone() is not None:
            raise ValueError("Native SQLite foreign-key failure")
    return {"nativeSQLiteIntegrity": "PASS", "scope": "offline export only"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database")
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.database)))
    except (ValueError, sqlite3.Error, OSError):
        print(json.dumps({"nativeSQLiteIntegrity": "FAIL"}))
        raise SystemExit(1)
