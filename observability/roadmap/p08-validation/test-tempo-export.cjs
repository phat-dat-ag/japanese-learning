'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const tempo = require('../../p08/tempo-export.cjs');
const local = require('../../p08/local-backup.cjs');
const backup = require('../../p08/backup.cjs');
const one = '1'.repeat(32), two = '2'.repeat(32);
const search = ids => ({ traces: ids.map(traceID => ({ traceID })), metrics: { completedJobs: 1, totalJobs: 1 } });
const payload = id => ({ batches: [{ scopeSpans: [{ spans: [{ traceId: id, name: 'synthetic fixture' }] }] }] });
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld09-tempo-'));
  t.after(() => {
    const absolute = path.resolve(dir);
    if (path.dirname(absolute) !== path.resolve(os.tmpdir()) || !path.basename(absolute).startsWith('ld09-tempo-')) throw Error('Fixture cleanup containment failed');
    fs.rmSync(absolute, { recursive: true, force: true });
  });
  return dir;
}
function run(directory, request, extra = {}) {
  return tempo.acquire({ directory, cutoff: 1700000000000, request, sleep: async () => {}, ...extra });
}
test('complete export deduplicates identities and records every payload hash', async t => {
  const directory = fixture(t);
  const result = await run(directory, url => url.includes('/search?') ? search([one, two, one]) : payload(url.split('/').pop()));
  assert.equal(result.ids.length, 2); assert.equal(result.acquisition.complete, true);
  for (const f of result.payloads) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, f.id + '.json'))).digest('hex'), f.sha256);
});
test('transient timeout gets bounded retry/backoff, preserves same GET and sanitized timing evidence', async t => {
  const directory = fixture(t), pauses = [], events = [], urls = [];
  let attempt = 0;
  const result = await run(directory, (url, options) => {
    assert.equal(options.timeoutSeconds, 60);
    if (url.includes('/search?')) return search([one]);
    urls.push(url);
    if (++attempt < 3) throw Object.assign(Error('fixture-only'), { transient: true, code: 'ETIMEDOUT' });
    return payload(one);
  }, { sleep: async ms => pauses.push(ms), evidence: value => events.push(value) });
  assert.deepEqual(pauses, [250, 1000, 100]); assert.equal(new Set(urls).size, 1);
  assert.equal(result.acquisition.retries, 2); assert.equal(events.at(-1).complete, true);
  assert.equal(JSON.stringify(result.acquisition.events).includes(one), false);
});
test('retry exhaustion is a failure, never a missing-trace success', async t => {
  const directory = fixture(t); let attempts = 0, last;
  await assert.rejects(run(directory, url => {
    if (url.includes('/search?')) return search([one]);
    attempts++; throw Object.assign(Error('timeout'), { transient: true });
  }, { evidence: e => { last = e; } }), /failed after 3/);
  assert.equal(attempts, 3); assert.equal(last.complete, false); assert.equal(fs.readdirSync(directory).length, 0);
});
test('permanent404 or malformed JSON is not retried', async t => {
  for (const error of [Object.assign(Error('missing'), { httpStatus: 404 }), new SyntaxError('invalid JSON')]) {
    let attempts = 0;
    await assert.rejects(run(fixture(t), () => { attempts++; throw error; }));
    assert.equal(attempts, 1);
  }
});
test('incomplete search jobs, invalid identities and empty payload fail closed', async t => {
  for (const response of [{ ...search([one]), metrics: { completedJobs: 0, totalJobs: 1 } }, { traces: [] }, search(['bad-id']), search([])]) {
    await assert.rejects(run(fixture(t), () => response));
  }
  await assert.rejects(run(fixture(t), url => url.includes('/search?') ? search([one]) : { batches: [] }), /Missing Tempo/);
});
test('wrong trace payload cannot be published under a requested identity', async t => {
  await assert.rejects(run(fixture(t), url => url.includes('/search?') ? search([one]) : payload(two)), /identity mismatch/);
});
test('full search windows split, overlap deduplicates, unsplittable saturation rejects', async t => {
  let searches = 0;
  const saturated = { ...search([one]), traces: Array.from({ length: 1000 }, () => ({ traceID: one })) };
  const result = await run(fixture(t), url => url.includes('/search?') ? ++searches === 1 ? saturated : search([one]) : payload(one));
  assert.equal(searches, 3); assert.equal(result.ids.length, 1);
  await assert.rejects(run(fixture(t), () => saturated), /saturated at one second/);
});
test('overall deadline and unsafe configuration stop before another request', async t => {
  let clock = 0, requests = 0;
  await assert.rejects(run(fixture(t), () => { requests++; clock = 59000; return search([one]); }, { now: () => clock, limits: { deadlineSeconds: 60, timeoutSeconds: 20 } }), /deadline/);
  assert.equal(requests, 1);
  for (const config of [{ timeoutSeconds: 10 }, { timeoutSeconds: 91 }, { maxAttempts: 4 }, { deadlineSeconds: 901 }]) assert.throws(() => tempo.options(config));
});
test('base64 OTLP identity works and existing payload file is never overwritten', async t => {
  const directory = fixture(t), p = payload(one);
  p.batches[0].scopeSpans[0].spans[0].traceId = Buffer.from(one, 'hex').toString('base64');
  await run(directory, url => url.includes('/search?') ? search([one]) : p);
  const original = fs.readFileSync(path.join(directory, one + '.json'));
  await assert.rejects(run(directory, url => url.includes('/search?') ? search([one]) : payload(one)), /EEXIST/);
  assert.deepEqual(fs.readFileSync(path.join(directory, one + '.json')), original);
});
test('atomic authenticated publication is create-only and removes only its own pending file', t => {
  const dir = fixture(t), native = path.join(dir, 'native'), key = path.join(dir, 'key');
  fs.mkdirSync(native); fs.writeFileSync(path.join(native, 'fixture.json'), '{}'); fs.writeFileSync(key, crypto.randomBytes(32));
  const spec = { artifacts: [{ id: 'traces', type: 'tempo-otlp', root: native, consistency: 'immutable-native-export', classification: 'reviewed-telemetry' }], newestRecoverableUtc: new Date().toISOString() };
  const output = path.join(dir, 'generation.enc');
  local.publish(spec, key, output); assert.equal(backup.verify(output, key).manifest.inventory.length, 1);
  const bytes = fs.readFileSync(output);
  assert.throws(() => local.publish(spec, key, output), /EEXIST/);
  assert.deepEqual(fs.readFileSync(output), bytes); assert.equal(fs.readdirSync(dir).some(n => n.includes('.pending-')), false);
  fs.writeFileSync(path.join(native, 'fixture.json'), '-----BEGIN PRIVATE KEY-----');
  const denied = path.join(dir, 'denied.enc'); assert.throws(() => local.publish(spec, key, denied));
  assert.equal(fs.existsSync(denied), false); assert.equal(fs.readdirSync(dir).some(n => n.includes('.pending-')), false);
});
test('isolated six-store acquisition/package covers every trace and never publishes a failed export', async t => {
  const dir = fixture(t), key = path.join(dir, 'key'); fs.writeFileSync(key, crypto.randomBytes(32));
  const types = { logs: 'opensearch-logical', metrics: 'prometheus-series', traces: 'tempo-otlp', dashboards: 'grafana-dashboards', offsets: 'fluentbit-sqlite', recovery: 'opensearch-logical' };
  const artifacts = Object.entries(types).map(([id, type]) => {
    const root = path.join(dir, id); fs.mkdirSync(root);
    if (id !== 'traces') fs.writeFileSync(path.join(root, 'fixture.json'), '{}');
    return { id, type, root, consistency: 'immutable-native-export', classification: 'reviewed-telemetry' };
  });
  let transient = true;
  const exported = await run(path.join(dir, 'traces'), url => {
    if (url.includes('/search?')) return search([one, two]);
    if (transient) { transient = false; throw Object.assign(Error('temporary fixture timeout'), { transient: true }); }
    return payload(url.split('/').pop());
  });
  const output = path.join(dir, 'complete.enc');
  local.publish({ artifacts, newestRecoverableUtc: new Date().toISOString() }, key, output);
  const verified = backup.verify(output, key);
  assert.equal(verified.manifest.inventory.length, 6);
  assert.equal(verified.entries.filter(e => e.name.startsWith('traces/')).length, exported.ids.length);
  for (const p of exported.payloads) assert.equal(verified.entries.find(e => e.name === 'traces/' + p.id + '.json').sha256, p.sha256);
  const failedDir = path.join(dir, 'failed'); fs.mkdirSync(failedDir);
  const partialOutput = path.join(dir, 'partial.enc');
  await assert.rejects((async () => {
    await run(failedDir, url => url.includes('/search?') ? search([one, two]) : url.endsWith(one) ? payload(one) : (() => { throw Object.assign(Error('unavailable fixture'), { transient: true }); })());
    local.publish({ artifacts, newestRecoverableUtc: new Date().toISOString() }, key, partialOutput);
  })());
  assert.equal(fs.existsSync(partialOutput), false);
  assert.equal(fs.readdirSync(failedDir).length, 1); // A partial private staging tree is not a backup.
});
test('transport keeps default timeout and aligns explicit client/process bounds without leaking diagnostics', () => {
  const calls = [], captured = [];
  const source = fs.readFileSync(path.resolve(__dirname, '../../p08/runtime.cjs'), 'utf8');
  const sandbox = { module: { exports: {} }, require: name => name === 'node:child_process' ? { spawnSync: (bin, args, options) => {
    calls.push({ args, timeout: options.timeout });
    return { status: 0, stdout: args[0] === 'ps' ? 'a'.repeat(12) : '{}', stderr: '' };
  } } : name === 'node:fs' ? { writeFileSync: (...args) => captured.push(args) } : require(name) };
  vm.runInNewContext(source, sandbox);
  sandbox.module.exports.internal('http://tempo:3200/api/search');
  sandbox.module.exports.internal('http://tempo:3200/api/search', { timeoutSeconds: 20 });
  assert.equal(calls[1].args[calls[1].args.indexOf('-T') + 1], '10'); assert.equal(calls[1].timeout, 15000);
  assert.equal(calls[3].args[calls[3].args.indexOf('-T') + 1], '20'); assert.equal(calls[3].timeout, 25000);
  assert.equal(captured.length, 0);
});
test('transport classifies timeout and transient HTTP errors but not permanent404 or buffer overflow', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../p08/runtime.cjs'), 'utf8');
  for (const [stderr, error, expected] of [['wget: download timed out', null, true], ['wget: HTTP/1.1 503 Unavailable', null, true], ['', { code: 'ETIMEDOUT' }, true], ['wget: HTTP/1.1 404 Not Found', null, false], ['', { code: 'ENOBUFS' }, false]]) {
    const sandbox = { module: { exports: {} }, require: name => name === 'node:child_process' ? { spawnSync: () => ({ status: 1, stdout: '', stderr, error }) } : name === 'node:fs' ? { writeFileSync: () => {} } : require(name) };
    vm.runInNewContext(source, sandbox);
    assert.throws(() => sandbox.module.exports.docker(['exec', 'fixture', 'wget', '-T']), e => e.transient === expected && !e.message.includes('503 Unavailable'));
  }
});
