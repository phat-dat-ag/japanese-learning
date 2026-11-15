'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const dir = path.resolve('.local', 'p11-wrapper-tests-' + crypto.randomBytes(6).toString('hex'));
fs.mkdirSync(dir, { recursive: true });
for (const mode of ['backup', 'drill']) {
  for (const [name, code, stderr] of [['success', 0, false], ['warning', 0, true], ['failure', 7, true], ['quiet-failure', 7, false]]) {
    test(mode + ' propagates native ' + name + ' without truncating stdout/stderr', () => {
      const stub = path.join(dir, mode + '-' + name + '.cmd');
      fs.writeFileSync(stub, '@echo p11-stdout-before\r\n' + (stderr ? '@echo p11-stderr-marker 1>&2\r\n' : '') + '@echo p11-stdout-after\r\n@exit /b ' + code + '\r\n');
      const result = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
        'observability/p08/Invoke-P08Local.ps1', '-Mode', mode, '-Config', path.join(dir, 'config.json'), '-Node', stub], { encoding: 'utf8', timeout: 15000 });
      assert.equal(result.status, code, result.stderr);
      const logs = fs.readdirSync(path.join(dir, 'logs')).filter(n => n.endsWith('-' + mode + '.log'));
      const newest = logs.sort().at(-1);
      const text = fs.readFileSync(path.join(dir, 'logs', newest), 'utf16le');
      assert.ok(text.includes('p11-stdout-before'));
      assert.ok(text.includes('p11-stdout-after'));
      if (stderr) assert.ok(text.includes('p11-stderr-marker'));
    });
  }
}
test('missing executable fails closed before native invocation', () => {
  const q = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
    'observability/p08/Invoke-P08Local.ps1', '-Config', path.join(dir, 'config.json'), '-Node', path.join(dir, 'missing.exe')], { encoding: 'utf8', timeout: 15000 });
  assert.equal(q.status, 1);
});
