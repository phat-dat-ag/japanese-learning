'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { counts } = require('./test-results.cjs');
test('zero executed tests and missing reports cannot pass despite native exit zero', () => {
  assert.equal(counts('<Counters executed="0" passed="0" failed="0" error="0" notExecuted="0"/>', 'trx', 8).pass, false);
  assert.equal(counts('', 'trx', 8).pass, false);
  assert.equal(counts('<testsuite tests="0" failures="0" errors="0" skipped="0">', 'junit', 8).pass, false);
});
test('the complete nonzero cohort must execute without skips, errors or failures', () => {
  assert.equal(counts('<Counters executed="8" passed="8" failed="0" error="0" notExecuted="0"/>', 'trx', 8).pass, true);
  const xml = '<testsuite tests="9" failures="0" errors="0" skipped="0">';
  assert.equal(counts(xml, 'junit', 9).pass, true);
  assert.equal(counts(xml, 'junit', 8).pass, false);
  assert.equal(counts(xml.replace('skipped="0"', 'skipped="1"'), 'junit', 9).pass, false);
  assert.equal(counts(xml.replace('failures="0"', 'failures="1"'), 'junit', 9).pass, false);
  assert.equal(counts(xml.replace('errors="0"', 'errors="1"'), 'junit', 9).pass, false);
});
