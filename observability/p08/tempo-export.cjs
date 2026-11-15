'use strict';
// Complete, bounded, sequential Tempo export. No silent skips and no partial success.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function options(value = {}) {
  const result = { timeoutSeconds: 60, maxAttempts: 3, deadlineSeconds: 600, ...value };
  if (!Number.isInteger(result.timeoutSeconds) || result.timeoutSeconds < 16 || result.timeoutSeconds > 90 ||
      !Number.isInteger(result.maxAttempts) || result.maxAttempts < 1 || result.maxAttempts > 3 ||
      !Number.isInteger(result.deadlineSeconds) || result.deadlineSeconds < 60 || result.deadlineSeconds > 900) throw Error('Tempo export limits out of bounds');
  return result;
}
async function acquire({ directory, cutoff, request, limits, evidence, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const config = options(limits), began = now();
  const stats = { limits: config, startedUtc: new Date(began).toISOString(), searches: 0, traceGets: 0, attempts: 0, retries: 0, transientFailures: 0, longestRequestMs: 0, events: [], complete: false };
  const emit = () => { if (evidence) evidence({ ...stats, elapsedMs: now() - began }); };
  async function get(operation, url, id) {
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      if (now() - began + (config.timeoutSeconds + 5) * 1000 > config.deadlineSeconds * 1000) throw Error('Tempo export deadline exhausted');
      const started = now(); stats.attempts++;
      try {
        const data = await request(url, { timeoutSeconds: config.timeoutSeconds });
        const elapsedMs = now() - started;
        stats.longestRequestMs = Math.max(stats.longestRequestMs, elapsedMs);
        if (attempt > 1 && stats.events.length < 64) stats.events.push({ operation, endpoint: operation === 'search' ? '/api/search' : '/api/traces/{traceId}', targetSha256: id ? hash(id) : null, attempt, outcome: 'recovered', elapsedMs });
        return data;
      } catch (error) {
        const elapsedMs = now() - started;
        stats.longestRequestMs = Math.max(stats.longestRequestMs, elapsedMs);
        if (stats.events.length < 64) stats.events.push({ operation, endpoint: operation === 'search' ? '/api/search' : '/api/traces/{traceId}', targetSha256: id ? hash(id) : null, attempt, elapsedMs, transient: error.transient === true, httpStatus: error.httpStatus || null, code: error.code || null });
        if (error.transient) stats.transientFailures++;
        emit();
        if (!error.transient || attempt === config.maxAttempts) throw Error('Tempo ' + operation + ' failed after ' + attempt + ' attempt(s); see sanitized request evidence');
        stats.retries++;
        await sleep(attempt === 1 ? 250 : 1000);
      }
    }
  }
  const found = new Set(), windows = [];
  async function search(start, end) {
    stats.searches++;
    const q = await get('search', 'http://tempo:3200/api/search?' + new URLSearchParams({ start: String(start), end: String(end), limit: '1000' }));
    if (!Array.isArray(q.traces) || !Number.isInteger(q.metrics?.completedJobs) || !Number.isInteger(q.metrics?.totalJobs) || q.metrics.completedJobs !== q.metrics.totalJobs) throw Error('Incomplete Tempo search; no partial success');
    if (q.traces.length >= 1000) {
      if (end - start <= 1) throw Error('Tempo search saturated at one second; no truncation allowed');
      const mid = Math.floor((start + end) / 2);
      await search(start, mid); await search(mid, end); return;
    }
    for (const t of q.traces) {
      if (!/^[a-f0-9]{1,32}$/i.test(t.traceID || '') || /^0+$/.test(t.traceID)) throw Error('Invalid Tempo trace identity');
      found.add(t.traceID.padStart(32, '0').toLowerCase());
    }
    windows.push({ start, end, count: q.traces.length });
  }
  try {
    await search(Math.floor(cutoff / 1000) - 86400, Math.floor(cutoff / 1000));
    if (!found.size) throw Error('No actual Tempo traces exported');
    const payloads = [];
    for (const id of [...found].sort()) {
      stats.traceGets++;
      const trace = await get('trace', 'http://tempo:3200/api/traces/' + id, id);
      if (!(trace.batches || trace.resourceSpans || []).length) throw Error('Missing Tempo payload; no partial success');
      const spans = (trace.batches || trace.resourceSpans).flatMap(b => b.scopeSpans || b.instrumentationLibrarySpans || []).flatMap(s => s.spans || []);
      const identities = spans.map(span => {
        const value = span.traceId || span.traceID;
        if (typeof value !== 'string') return null;
        if (/^[a-f0-9]{32}$/i.test(value)) return value.toLowerCase();
        const bytes = Buffer.from(value, 'base64');
        return bytes.length === 16 ? bytes.toString('hex') : null;
      });
      if (!identities.length || identities.some(value => value !== id)) throw Error('Tempo payload trace identity mismatch');
      const bytes = Buffer.from(JSON.stringify(trace));
      fs.writeFileSync(path.join(directory, id + '.json'), bytes, { flag: 'wx', mode: 0o600 });
      payloads.push({ id, bytes: bytes.length, sha256: hash(bytes) });
      await sleep(100);
    }
    if (payloads.length !== found.size) throw Error('Tempo export completeness mismatch');
    stats.complete = true; stats.expected = found.size; stats.exported = payloads.length; emit();
    return { ids: [...found].sort(), windows, pointUtc: new Date(cutoff).toISOString(), payloads, acquisition: { ...stats, elapsedMs: now() - began } };
  } catch (error) { stats.complete = false; emit(); throw error; }
}
module.exports = { acquire, options };
