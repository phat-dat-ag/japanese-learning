'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { classify, inspect } = require('./manifest.cjs');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
test('strict integrity remains byte-sensitive with diagnostic LF/mixed-tail classification', () => {
  assert.equal(classify(Buffer.from('body\n'), sha('body\n')).strictPass, true);
  for (const [current, historical] of [['body\r\n', 'body\n'], ['body\n', 'body\r\n'], ['body\r\n\r\n\r\n', 'body\n\r\n\r\n']]) {
    const r = classify(Buffer.from(current), sha(historical));
    assert.equal(r.kind, 'LINE_ENDINGS');
    assert.equal(r.strictPass, false);
  }
});
test('substantive changes, removed lines and binary changes cannot be normalized to PASS', () => {
  for (const [current, expected] of [['changed\n', 'original\n'], ['body\n', 'body\n\n'], [Buffer.from([0, 255]), Buffer.from([0, 254])]]) {
    const r = classify(Buffer.from(current), sha(expected));
    assert.equal(r.kind, 'CONTENT');
    assert.equal(r.strictPass, false);
  }
});
test('missing files and escaping paths have independent fail-closed dispositions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p11-manifest-'));
  const file = path.join(root, 'manifest.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ artifacts: [{ file: 'missing', sha256: sha('') }, { file: '../outside', sha256: sha('') }] }));
    const r = inspect(root, 'manifest.json');
    assert.equal(r.strictPass, false);
    assert.deepEqual(r.artifacts.map(a => a.kind), ['MISSING', 'INVALID_PATH']);
  } finally {
    fs.unlinkSync(file);
    fs.rmdirSync(root);
  }
});
