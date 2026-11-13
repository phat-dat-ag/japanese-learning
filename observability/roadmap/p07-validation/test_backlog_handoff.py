"""Synthetic snapshots only; no live buffers, Docker or migration operations."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
ns = {'__name__': 'offline_handoff', '__file__': str(HERE / 'backlog_handoff.py')}
exec(compile((HERE / 'backlog_handoff.py').read_text(), str(HERE / 'backlog_handoff.py'), 'exec'), ns)
inventory, assess = ns['inventory'], ns['assess']


class HandoffTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='p07_handoff_')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'buffer/tail.0').mkdir(parents=True)
        (self.root / 'buffer/tail.0/chunk.flb').write_bytes(b'P07_SYNTHETIC_SECRET_ONLY')
        (self.root / 'user.db').write_bytes(b'P07_SYNTHETIC_OFFSET_ONLY')
        self.inv = inventory(self.root)
        self.ledger = {k: 'synthetic-review-reference' for k in (
            'snapshot_consistency_ref', 'protected_backup_restore_ref', 'operator_approval_ref',
            'image_config_identity_ref', 'producer_rotation_offsets_ref',
            'memory_inflight_reconciliation_ref', 'duplicate_reconciliation_ref',
            'privacy_safe_replay_or_quarantine_ref')}
        self.ledger['snapshot_inventory_sha256'] = hashlib.sha256(json.dumps(
            self.inv, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        self.ledger['pending_inflight_records'] = 0
        chunk = next(f for f in self.inv['files'] if f['category'] == 'legacy_buffer')
        self.ledger['chunks'] = [dict(chunk, disposition='retained_quarantine',
                                     custody_ref='synthetic', data_owner_deferred_delivery_approval_ref='synthetic')]

    def test_inventory_hashes_bytes_without_exporting_bodies_or_names(self):
        text = json.dumps(self.inv)
        self.assertNotIn('P07_SYNTHETIC_SECRET', text)
        self.assertNotIn('chunk.flb', text)
        self.assertEqual(self.inv['legacy_buffer_files'], 1)
        self.assertEqual(self.inv['legacy_buffer_bytes'], 25)
        self.assertIsNone(self.inv['record_count'])

    def test_reading_snapshot_does_not_change_any_file(self):
        before = {str(p): (p.read_bytes(), p.stat().st_mtime_ns) for p in self.root.rglob('*') if p.is_file()}
        inventory(self.root)
        after = {str(p): (p.read_bytes(), p.stat().st_mtime_ns) for p in self.root.rglob('*') if p.is_file()}
        self.assertEqual(before, after)

    def test_unapproved_handoff_is_blocked(self):
        self.assertEqual(assess(self.inv, {})['status'], 'BLOCKED')

    def test_inventory_mismatch_is_blocked(self):
        self.ledger['snapshot_inventory_sha256'] = '0' * 64
        self.assertEqual(assess(self.inv, self.ledger)['status'], 'BLOCKED')

    def test_missing_or_duplicate_chunk_accounting_is_blocked(self):
        for chunks in ([], self.ledger['chunks'] * 2):
            self.assertEqual(assess(self.inv, dict(self.ledger, chunks=chunks))['status'], 'BLOCKED')

    def test_delivery_without_backend_receipts_is_blocked(self):
        self.ledger['chunks'][0]['disposition'] = 'reconciled_delivery'
        self.assertEqual(assess(self.inv, self.ledger)['status'], 'BLOCKED')

    def test_unaccounted_memory_or_noninteger_zero_is_blocked(self):
        for count in (None, 1, False, '0'):
            self.assertEqual(assess(self.inv, dict(self.ledger, pending_inflight_records=count))['status'], 'BLOCKED')

    def test_discard_or_unsupported_disposition_is_blocked(self):
        self.ledger['chunks'][0]['disposition'] = 'discard'
        self.assertEqual(assess(self.inv, self.ledger)['status'], 'BLOCKED')

    def test_approved_quarantine_only_requests_review_never_authorizes_deployment(self):
        result = assess(self.inv, self.ledger)
        self.assertEqual(result['status'], 'HANDOFF EVIDENCE READY FOR HUMAN REVIEW')
        self.assertFalse(result['deployment_authorized'])


if __name__ == '__main__':
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(HandoffTests))
    (HERE / 'evidence/backlog-tests.json').write_text(json.dumps({
        'tests': result.testsRun, 'failures': len(result.failures), 'errors': len(result.errors),
        'scope': 'Synthetic offline snapshots only; real backlog inventory and migration NOT EXECUTED'}, indent=2) + '\n')
    raise SystemExit(not result.wasSuccessful())
