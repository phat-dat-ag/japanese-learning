'use strict';
// Pure boundary tests: never opens Docker, modifies a manifest or starts a workload.
const assert=require('node:assert/strict'),{validateSample}=require('./full-recovery-safety.cjs'),M=1048576;
const safe={windowsAvailableBytes:1024*M,nodeBytes:768*M,dockerRamBytes:3424*M,cpuCores:6,storageBytes:4096*M,hostStagingBytes:192*M};
assert.doesNotThrow(()=>validateSample(safe,Date.now()+60000));let passed=1;
for(const patch of [{windowsAvailableBytes:1024*M-1},{nodeBytes:768*M+1},{dockerRamBytes:3424*M+1},{cpuCores:6.001},{storageBytes:4096*M+1},{hostStagingBytes:192*M+1},{windowsAvailableBytes:NaN},{dockerRamBytes:undefined},{storageBytes:-1}]){assert.throws(()=>validateSample({...safe,...patch},Date.now()+60000));passed++;}
assert.throws(()=>validateSample(safe,Date.now()-1));passed++;
assert.throws(()=>validateSample(safe,NaN));passed++;
console.log(JSON.stringify({scope:'Pure P10 full-recovery safety boundaries',passed,failed:0,dockerOperations:0}));
