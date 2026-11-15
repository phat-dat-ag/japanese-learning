'use strict';
// Exit code zero is insufficient: require the exact nonzero executed test cohort.
function counts(text, format, expected) {
  const tag = text.match(format === 'trx' ? /<Counters\s[^>]+>/ : /<testsuite\s[^>]+>/)?.[0] || '';
  const get = name => {
    const value = tag.match(new RegExp('\\b' + name + '="(\\d+)"'))?.[1];
    return value === undefined ? null : Number(value);
  };
  const tests = get(format === 'trx' ? 'executed' : 'tests');
  const failed = get(format === 'trx' ? 'failed' : 'failures');
  const errors = format === 'trx' ? get('error') : get('errors');
  const skipped = get(format === 'trx' ? 'notExecuted' : 'skipped');
  const passed = format === 'trx' ? get('passed') : tests === null ? null : tests - (failed || 0) - (errors || 0) - (skipped || 0);
  return { expected, tests, passed, failed, errors, skipped,
    pass: expected > 0 && tests === expected && passed === expected && failed === 0 && errors === 0 && skipped === 0 };
}
module.exports = { counts };
