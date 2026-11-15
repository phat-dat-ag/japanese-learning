'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

function classify(bytes, expected) {
  const actual = sha(bytes);
  if (actual === expected) return { kind: 'EXACT', actual, strictPass: true };
  const text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes) || text.includes('\0')) return { kind: 'CONTENT', actual, strictPass: false };
  const lf = text.replace(/\r\n/g, '\n');
  if (sha(lf) === expected) return { kind: 'LINE_ENDINGS', actual, strictPass: false, reconstruction: 'LF' };
  if (sha(lf.replace(/\n/g, '\r\n')) === expected) return { kind: 'LINE_ENDINGS', actual, strictPass: false, reconstruction: 'CRLF' };
  // Historical P09 files had LF bodies plus CRLF trailing blank lines.
  // Reconstruct only the bounded trailing newline run and require the original hash.
  const tail = lf.match(/\n*$/)[0].length;
  if (tail > 0 && tail <= 8) {
    for (let mask = 1; mask < 2 ** tail; mask++) {
      const suffix = Array.from({ length: tail }, (_, i) => (mask >> i) & 1 ? '\r\n' : '\n').join('');
      if (sha(lf.slice(0, -tail) + suffix) === expected) {
        return { kind: 'LINE_ENDINGS', actual, strictPass: false, reconstruction: 'LF body with mixed trailing newlines', tail, mask };
      }
    }
  }
  return { kind: 'CONTENT', actual, strictPass: false };
}

function inspect(root, file) {
  const m = JSON.parse(fs.readFileSync(path.resolve(root, file)));
  const artifacts = m.artifacts.map(a => {
    const resolved = path.resolve(root, a.file);
    const relative = path.relative(root, resolved);
    if (path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) {
      return { file: a.file, kind: 'INVALID_PATH', strictPass: false };
    }
    if (!fs.existsSync(resolved)) return { file: a.file, kind: 'MISSING', strictPass: false };
    return { file: a.file, expected: a.sha256, ...classify(fs.readFileSync(resolved), a.sha256) };
  });
  return { file, strictPass: artifacts.every(a => a.strictPass), artifacts };
}
module.exports = { classify, inspect };
