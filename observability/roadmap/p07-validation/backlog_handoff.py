"""Offline, read-only snapshot inventory and fail-closed handoff assessment. No Docker calls.

Never use this on live state. Copy/snapshot creation, replay and cutover require separate
operator approval. Inventory hashes/lengths are evidence, not record/acknowledgement counts.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(part)
    return h.hexdigest()


def inventory(root):
    root = Path(root)
    if root.is_symlink() or getattr(root.lstat(), 'st_file_attributes', 0) & 0x400 or not root.is_dir():
        raise ValueError('Expected an operator-provided offline state snapshot directory')
    files = []
    paths = []

    def denied(error):
        raise ValueError('Incomplete snapshot traversal; access failure') from error

    for directory, dirs, names in os.walk(root, onerror=denied, followlinks=False):
        for name in dirs + names:
            path = Path(directory) / name
            if path.is_symlink() or getattr(path.lstat(), 'st_file_attributes', 0) & 0x400:
                raise ValueError('Symlinks/reparse points are forbidden')
        for name in names:
            path = Path(directory) / name
            if not path.is_file():
                raise ValueError('Unsupported snapshot entry')
            paths.append(path)
    for path in sorted(paths):
        relative = path.relative_to(root)
        before = path.stat()
        value = digest(path)
        after = path.stat()
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise ValueError('Snapshot changed while reading; reject inconsistent inventory')
        category = ('legacy_buffer' if relative.parts[0] == 'buffer' else
                    'offset_state' if path.name in {n + s for n in ('jwks.db', 'user.db', 'vocabulary.db')
                                                       for s in ('', '-wal', '-shm')} else 'other_state')
        # No log bodies, SQL rows, physical paths or filenames leave the snapshot.
        files.append({'path_sha256': hashlib.sha256(relative.as_posix().encode()).hexdigest(),
                      'content_sha256': value, 'bytes': before.st_size, 'category': category})
    return {'schema': 1, 'scope': 'Offline snapshot metadata only; no live queue/record/ack proof',
            'files': files, 'total_bytes': sum(f['bytes'] for f in files),
            'legacy_buffer_files': sum(f['category'] == 'legacy_buffer' for f in files),
            'legacy_buffer_bytes': sum(f['bytes'] for f in files if f['category'] == 'legacy_buffer'),
            'source_consistency': 'Requires independently reviewed quiesce/snapshot proof',
            'record_count': None, 'delivery_ack_count': None}


def assess(inv, ledger):
    reasons = []
    for key in ('snapshot_consistency_ref', 'protected_backup_restore_ref', 'operator_approval_ref',
                'image_config_identity_ref', 'producer_rotation_offsets_ref',
                'memory_inflight_reconciliation_ref', 'duplicate_reconciliation_ref',
                'privacy_safe_replay_or_quarantine_ref'):
        if not isinstance(ledger.get(key), str) or not ledger[key].strip():
            reasons.append('Missing independently reviewed evidence: ' + key)
    if ledger.get('snapshot_inventory_sha256') != hashlib.sha256(
            json.dumps(inv, sort_keys=True, separators=(',', ':')).encode()).hexdigest():
        reasons.append('Inventory identity mismatch')
    if ledger.get('pending_inflight_records') != 0 or type(ledger.get('pending_inflight_records')) is not int:
        reasons.append('Memory/inflight count is not confirmed zero')
    entries = ledger.get('chunks', [])
    expected = {(f['path_sha256'], f['content_sha256']) for f in inv['files'] if f['category'] == 'legacy_buffer'}
    observed = [(x.get('path_sha256'), x.get('content_sha256')) for x in entries]
    if len(observed) != len(set(observed)) or set(observed) != expected:
        reasons.append('Missing/duplicate/unrecognized chunk ledger entries')
    for item in entries:
        if item.get('disposition') == 'retained_quarantine':
            if not all(item.get(k) for k in ('custody_ref', 'data_owner_deferred_delivery_approval_ref')):
                reasons.append('Quarantine lacks custody/deferred-delivery approval')
        elif item.get('disposition') == 'reconciled_delivery':
            if not all(item.get(k) for k in ('record_count_ref', 'backend_receipts_ref', 'stable_id_index_dedup_ref')):
                reasons.append('Delivery lacks record/receipt/dedup reconciliation')
        else:
            reasons.append('Unapproved chunk disposition; loss/discard is forbidden')
    return {'status': 'BLOCKED' if reasons else 'HANDOFF EVIDENCE READY FOR HUMAN REVIEW',
            'reasons': sorted(set(reasons)), 'deployment_authorized': False,
            'limits': 'References are not authenticated by this offline tool. A reviewer must inspect them. '
                      'Quarantine preserves bytes but defers delivery; no exactly-once guarantee.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--ledger', type=Path)
    args = parser.parse_args()
    result = inventory(args.snapshot)
    result['inventory_sha256'] = hashlib.sha256(json.dumps(result, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    if args.ledger:
        identity = result.pop('inventory_sha256')
        assessment = assess(result, json.loads(args.ledger.read_text()))
        result['inventory_sha256'] = identity
        result['assessment'] = assessment
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
