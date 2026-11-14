import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("native", Path(__file__).parents[2] / "p08/native-sqlite.py")
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


class NativeIntegrity(unittest.TestCase):
    def test_valid_export_and_no_changes(self):
        with tempfile.TemporaryDirectory() as temp:
            file = Path(temp) / "synthetic.sqlite"
            with sqlite3.connect(file) as db:
                db.execute("CREATE TABLE synthetic (id INTEGER PRIMARY KEY)")
                db.execute("INSERT INTO synthetic VALUES (1)")
            before = file.read_bytes()
            self.assertEqual(native.verify(file)["nativeSQLiteIntegrity"], "PASS")
            self.assertEqual(before, file.read_bytes())

    def test_missing_corrupt_and_truncated(self):
        with tempfile.TemporaryDirectory() as temp:
            file = Path(temp) / "corrupt.sqlite"
            with self.assertRaises(ValueError):
                native.verify(file)
            file.write_bytes(b"corrupt synthetic file")
            with self.assertRaises(ValueError):
                native.verify(file)
            file.write_bytes(b"SQLite format 3\x00")
            with self.assertRaises(sqlite3.DatabaseError):
                native.verify(file)

    def test_empty_and_foreign_key_violation(self):
        with tempfile.TemporaryDirectory() as temp:
            file = Path(temp) / "empty.sqlite"
            file.write_bytes(b"")
            with self.assertRaises(ValueError):
                native.verify(file)
            with sqlite3.connect(file) as db:
                db.execute("CREATE TABLE parent (id INTEGER PRIMARY KEY)")
                db.execute("CREATE TABLE child (parent_id INTEGER REFERENCES parent(id))")
                db.execute("INSERT INTO child VALUES (99)")
            with self.assertRaises(ValueError):
                native.verify(file)


if __name__ == "__main__":
    unittest.main()
