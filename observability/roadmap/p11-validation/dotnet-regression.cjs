'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { counts } = require('./test-results.cjs');
const root = path.resolve(__dirname, '../../..');
const base = path.join(root, '.local/p11-spring-adoption-20261115');
const cwd = path.join(root, '.local/p11-rc-20261115/dotnet-b');
const label = process.argv[2] || 'regression';
if (!/^[a-z-]+$/.test(label)) throw Error('Invalid label');
const log = path.join(base, 'dotnet-' + label + '.log');
const fd = fs.openSync(log, 'wx');
const args = ['test', 'tests/JapaneseLearning.User.UnitTests/JapaneseLearning.User.UnitTests.csproj', '-c', 'Release', '--filter', 'FullyQualifiedName~Security|FullyQualifiedName~Logging.Authentication|FullyQualifiedName~Logging.AuthSuccess|FullyQualifiedName~Logging.Jwks', '-p:UseSharedCompilation=false', '-p:NuGetAudit=false', '-m:1', '--logger', 'trx;LogFileName=p11-adoption.trx', '--nologo'];
const startedUtc = new Date().toISOString();
const q = cp.spawnSync('dotnet', args, { cwd, timeout: 600000, env: { ...process.env, DOTNET_CLI_DO_NOT_USE_MSBUILD_SERVER: '1' }, stdio: ['ignore', fd, fd] });
fs.closeSync(fd);
const trx = path.join(cwd, 'tests/JapaneseLearning.User.UnitTests/TestResults/p11-adoption.trx');
const result = { startedUtc, finishedUtc: new Date().toISOString(), cwd, args, exitCode: q.status, error: q.error?.code || null,
  counts: fs.existsSync(trx) ? counts(fs.readFileSync(trx, 'utf8'), 'trx', 81) : null,
  log, logSha256: crypto.createHash('sha256').update(fs.readFileSync(log)).digest('hex') };
result.pass = result.exitCode === 0 && result.counts?.pass === true;
fs.writeFileSync(path.join(base, 'dotnet-' + label + '.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result));
if (!result.pass) process.exitCode = 1;
