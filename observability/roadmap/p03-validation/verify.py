"""Offline P03 source checks and bounded synthetic filesystem/queue experiments.

The reader and queue are deliberately reference models, NOT Fluent Bit emulation.
No Docker, network, app import, existing log, state DB, or credentials are used.
"""
from collections import deque
import gzip
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import time
import unittest
import uuid

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
MEASUREMENTS = {}


def sequences(paths, max_line=1024):
    """Bounded offline NDJSON replay; rejects partial/malformed/oversize records."""
    output, rejected = [], 0
    for path in paths:
        with path.open('rb') as stream:
            while line := stream.readline(max_line + 1):
                if len(line) > max_line:
                    while not line.endswith(b'\n'):
                        line = stream.readline(max_line + 1)
                        if not line:
                            break
                    rejected += 1
                    continue
                try:
                    if not line.endswith(b'\n'):
                        raise ValueError('partial')
                    value = json.loads(line)
                    if type(value) is not dict or type(value.get('seq')) is not int:
                        raise ValueError('non-record')
                    output.append(value['seq'])
                except (ValueError, UnicodeDecodeError):
                    rejected += 1
    return output, rejected


def account(generated, delivered, rejected=0):
    unique = len(set(delivered))
    return dict(generated=generated, delivered=len(delivered), unique=unique,
                rejected=rejected, duplicated=len(delivered)-unique,
                missing=max(0, generated-rejected-unique))


class QueueModel:
    """Record-granularity drop-oldest model, not Fluent Bit's chunk queue."""
    def __init__(self, limit):
        self.limit, self.size, self.dropped = limit, 0, 0
        self.items = deque()

    def put(self, seq):
        item = json.dumps({'seq': seq}, separators=(',', ':')).encode()
        if len(item) > self.limit:
            self.dropped += 1
            return
        while self.items and self.size + len(item) > self.limit:
            self.size -= len(self.items.popleft())
            self.dropped += 1
        self.items.append(item)
        self.size += len(item)

    def persist(self, path):
        path.write_bytes(b'\n'.join(self.items) + b'\n')


class SourceChecks(unittest.TestCase):
    def test_gateway_and_bind_sources_unchanged(self):
        baseline = json.loads((HERE / 'evidence/preflight.json').read_text())
        for path, digest in baseline['protected_source_sha256'].items():
            self.assertEqual(digest, hashlib.sha256((ROOT/path).read_bytes()).hexdigest(), path)

    def test_candidate_not_in_compose(self):
        for path in ROOT.glob('*compose*.yml'):
            source = path.read_text()
            self.assertNotIn('nginx.p02.conf', source)
            self.assertNotIn('p03-validation', source)
        self.assertIn('source: ./gateway/nginx.conf', (ROOT/'docker-compose.yml').read_text())

    def test_candidate_bounded_profile_and_no_overlap(self):
        config = (HERE/'fluent-bit.p03.conf').read_text()
        paths = re.findall(r'^\s+Path\s+(\S+)', config, re.M)
        self.assertEqual(3, len(paths))
        self.assertEqual(3, len(set(p.split('/')[2] for p in paths)))
        for expected in ('storage.max_chunks_up     32', 'storage.backlog.mem_limit 8M',
                         'storage.total_limit_size 64M', 'Retry_Limit              False',
                         'Grace                     30', 'type_int_key  http_status',
                         'time_as_table On', 'storage.metrics           On'):
            self.assertIn(expected, config)
        self.assertNotIn('/state/', config)
        self.assertEqual(3, config.count('Buffer_Max_Size   1M'))

    def test_existing_mapping_types_without_executing_bootstrap(self):
        source = (ROOT/'observability/logging/bootstrap.py').read_text()
        for literal in ("'http_status': {'type': 'integer'}", "'duration_ms': {'type': 'double'}",
                        "'is_slow': {'type': 'boolean'}", "'authenticated': {'type': 'boolean'}",
                        "'original': {'type': 'object', 'enabled': False}", "'dynamic': False"):
            self.assertIn(literal, source)
        self.assertIn('original = record', (ROOT/'observability/logging/normalize.lua').read_text())

    def test_p02_fixture_inventory_and_types(self):
        cases = json.loads((ROOT/'observability/roadmap/p02-fixtures/requests.json').read_text())['cases']
        self.assertEqual(50, len(cases))
        self.assertEqual({'dotnet','quarkus','jwks','gateway','frontend'}, {c['source'] for c in cases})
        for case in cases:
            json.loads(json.dumps(case['native']))


class ReplayExperiments(unittest.TestCase):
    def setUp(self):
        self.directory = (HERE / ('run-' + uuid.uuid4().hex)).resolve()
        self.directory.mkdir()  # Normal inherited workspace ACL; no permission changes.

    def tearDown(self):
        assert self.directory.parent == HERE and self.directory.name.startswith('run-')
        for path in self.directory.iterdir():
            assert path.is_file() and not path.is_symlink()
            path.unlink()
        self.directory.rmdir()  # Exact new, owned flat synthetic directory only.

    def seed(self, name, start, stop):
        path = self.directory/name
        path.write_text(''.join(json.dumps({'seq': n})+'\n' for n in range(start, stop)))
        return path

    def test_rename_stable_readable_spool(self):
        active = self.seed('active.ndjson', 0, 50)
        active.rename(self.directory/'closed-001.ndjson')
        self.seed('active.ndjson', 50, 100)
        delivered, rejected = sequences(sorted(self.directory.glob('*.ndjson')))
        self.assertEqual(set(range(100)), set(delivered))
        MEASUREMENTS['rename_readable_spool'] = account(100, delivered, rejected)

    def test_immediate_compression_gap(self):
        active = self.seed('application.json.log', 0, 100)
        with gzip.open(self.directory/'application.json.log.1.gz', 'wb') as stream:
            stream.write(active.read_bytes())
        active.unlink()  # Synthetic owned file only; never a live log.
        active.write_text('')
        delivered, rejected = sequences(self.directory.glob('application.json.log'))
        self.assertEqual([], delivered)
        MEASUREMENTS['immediate_compression_active_only_gap'] = account(100, delivered, rejected)

    def test_delayed_compression_replay_before_archive(self):
        path = self.seed('closed-001.ndjson', 0, 100)
        delivered, rejected = sequences([path])
        self.assertEqual(100, len(delivered))
        with gzip.open(self.directory/'archive.gz', 'wb') as stream:
            stream.write(path.read_bytes())
        MEASUREMENTS['delayed_compression_replay'] = account(100, delivered, rejected)

    def test_copy_truncate_unread_window(self):
        path = self.seed('active.ndjson', 0, 100)
        shutil.copyfile(path, self.directory/'copy.1')
        path.write_text('')
        delivered, rejected = sequences([path])
        self.assertEqual(0, len(delivered))
        MEASUREMENTS['copy_truncate_active_only_gap'] = account(100, delivered, rejected)

    def test_overlapping_copy_replay_duplicates(self):
        path = self.seed('active.ndjson', 0, 100)
        copy = self.directory/'copy.ndjson'
        shutil.copyfile(path, copy)
        delivered, rejected = sequences([path, copy])
        self.assertEqual(100, len(delivered)-len(set(delivered)))
        MEASUREMENTS['overlapping_copy_duplicate_example'] = account(100, delivered, rejected)

    def test_partial_malformed_and_oversize(self):
        path = self.directory/'bad.ndjson'
        path.write_bytes(b'{"seq":0}\nnot-json\n'+b'x'*2048+b'\n{"seq":1}')
        delivered, rejected = sequences([path])
        self.assertEqual([0], delivered)
        self.assertEqual(3, rejected)
        MEASUREMENTS['replay_rejections'] = account(4, delivered, rejected)
        with path.open('ab') as stream:
            stream.write(b'\n')
        self.assertEqual([0, 1], sequences([path])[0])

    def test_bounded_queue_outage_overflow_and_recovery(self):
        queue = QueueModel(256)
        for seq in range(100):
            queue.put(seq)
            self.assertLessEqual(queue.size, 256)
        queue.persist(self.directory/'model-backlog.ndjson')
        started = time.perf_counter()
        delivered, rejected = sequences([self.directory/'model-backlog.ndjson'])
        elapsed = time.perf_counter()-started
        self.assertEqual(100-queue.dropped, len(delivered))
        MEASUREMENTS['queue_model_only'] = dict(account(100, delivered, rejected),
            overflow_dropped=queue.dropped, backlog_bytes=queue.size,
            capacity_bytes=256, local_read_seconds=elapsed,
            attempted_delivery=0, confirmed_opensearch_delivery=0)

    def test_readable_backlog_process_reopen(self):
        path = self.seed('closed-001.ndjson', 0, 100)
        delivered, rejected = sequences([path])
        second_read, _ = sequences([path])
        self.assertEqual(delivered, second_read)
        MEASUREMENTS['reopen_without_offset_db_duplicates'] = account(100, delivered+second_read, rejected)


if __name__ == '__main__':
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromModule(__import__(__name__)))
    report = {'scope':'offline source and Python reference models; NOT Fluent Bit/OpenSearch',
              'executed':result.testsRun, 'failures':len(result.failures), 'errors':len(result.errors),
              'measurements':MEASUREMENTS, 'lua_runtime':'NOT VERIFIED'}
    lua = shutil.which('lua') or shutil.which('luajit')
    if lua:
        process = subprocess.run([lua, str(HERE/'test_adapter.lua')], cwd=ROOT,
                                 text=True, capture_output=True)
        report['lua_runtime'] = {'exit_code':process.returncode, 'output':process.stdout,
                                 'stderr':process.stderr}
        if process.returncode:
            raise SystemExit('Lua candidate tests failed')
    (HERE/'evidence/test-results.json').write_text(json.dumps(report, indent=2)+'\n')
    raise SystemExit(not result.wasSuccessful())
