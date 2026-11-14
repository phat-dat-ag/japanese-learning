"""Synthetic bounded OS/queue fixture; no application or backend emulation claim."""
import errno, hashlib, json, os, queue, time
start = time.monotonic()
q = queue.Queue(maxsize=16)
accepted, dropped = [], []
for i in range(24):
    try:
        q.put_nowait(i)
        accepted.append(i)
    except queue.Full:
        dropped.append(i)
recovered = []
while not q.empty():
    recovered.append(q.get_nowait())
pressure_start = time.monotonic()
written = 0
rejected = False
try:
    with open('/fixture/pressure', 'wb', buffering=0) as f:
        for _ in range(257):
            written += f.write(b'x' * 65536)
except OSError as exc:
    if exc.errno != errno.ENOSPC:
        raise
    rejected = True
pressure_seconds = time.monotonic() - pressure_start
os.unlink('/fixture/pressure')
restore_start = time.monotonic()
payload = b'p10-synthetic-integrity-marker'
with open('/fixture/recovered', 'wb') as f:
    f.write(payload)
with open('/fixture/recovered', 'rb') as f:
    integrity = f.read() == payload
assert rejected and integrity and accepted == recovered and len(dropped) == 8
print(json.dumps(dict(scope='Synthetic Python queue and Linux tmpfs only; no Fluent Bit/OTel/backend loss claim', enospc=rejected, bytes_written=written, queue_capacity=16, generated=24, recovered=len(recovered), dropped=len(dropped), duplicates=len(recovered)-len(set(recovered)), integrity=integrity, payload_sha256=hashlib.sha256(payload).hexdigest(), pressure_seconds=pressure_seconds, write_recovery_seconds=time.monotonic()-restore_start, total_seconds=time.monotonic()-start)))
