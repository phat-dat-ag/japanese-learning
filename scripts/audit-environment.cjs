/* Non-destructive environment contract checks. Never prints assignment values. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repos = ['.', 'angular', 'quarkus', 'dotnet', 'springboot-jwks-api'];
const baseline = path.join(root, '.local/environment-audit-baseline.json');
function assignments(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).flatMap(line => {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_.]*)=(.*)$/);
    return m ? [{ name: m[1], value: m[2], line }] : [];
  });
}
function pairs() {
  return repos.flatMap(repo => fs.readdirSync(path.join(root, repo))
    .filter(n => n.startsWith('.env') && n.endsWith('.example'))
    .map(n => path.posix.join(repo === '.' ? '' : repo, n)));
}
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function snapshot() {
  const result = {};
  for (const example of pairs()) {
    const local = example.slice(0, -8);
    result[local] = assignments(path.join(root, local)).map(v => ({ name: v.name, hash: digest(v.line) }));
  }
  return result;
}
function sync() {
  for (const example of pairs()) {
    // This file is a generated credential receipt, not an input template.
    if (example === '.env.logging.example') continue;
    const local = example.slice(0, -8), file = path.join(root, local);
    const old = assignments(file), map = new Map(old.map(v => [v.name, v.line]));
    if (map.size !== old.length) throw Error('Duplicate local names: ' + local);
    let template = fs.readFileSync(path.join(root, example), 'utf8');
    const names = new Set(assignments(path.join(root, example)).map(v => v.name));
    const extras = old.filter(v => !names.has(v.name));
    if (extras.length) throw Error('Undocumented local names in ' + local + ': ' + extras.map(v => v.name).join(', '));
    const newline = fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes('\r\n') ? '\r\n' : '\n';
    template = template.replace(/\r\n/g, '\n').split('\n').map(line => {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_.]*)=/);
      return m && map.has(m[1]) ? map.get(m[1]) : line;
    }).join(newline);
    fs.writeFileSync(file, template);
  }
}
function git(repo, args) {
  const r = cp.spawnSync('git', ['-C', path.join(root, repo), ...args], { encoding: 'utf8' });
  if (r.status !== 0 && !(args[0] === 'check-ignore' && r.status === 1)) throw Error('Git check failed: ' + repo);
  return r.stdout.trim();
}
function check() {
  let count = 0;
  for (const example of pairs()) {
    const a = assignments(path.join(root, example)), local = example.slice(0, -8);
    const b = assignments(path.join(root, local));
    for (const [label, values] of [[example, a], [local, b]]) {
      if (new Set(values.map(v => v.name)).size !== values.length) throw Error('Duplicate: ' + label);
    }
    const names = new Set(b.map(v => v.name));
    if (a.some(v => !names.has(v.name)) || a.length !== b.length) throw Error('Inventory mismatch: ' + local);
    const repo = local.includes('/') ? local.split('/')[0] : '.';
    const relative = path.basename(local);
    if (git(repo, ['ls-files', '--', relative])) throw Error('Tracked local file: ' + local);
    if (!git(repo, ['check-ignore', '--', relative])) throw Error('Unignored local file: ' + local);
    if (git(repo, ['check-ignore', '--', path.basename(example)])) throw Error('Ignored example: ' + example);
    count += a.length;
    console.log(example + ': ' + a.length + ' names; pair synchronized and local ignored');
  }
  if (fs.existsSync(baseline)) {
    const before = JSON.parse(fs.readFileSync(baseline, 'utf8')), now = snapshot();
    for (const [file, values] of Object.entries(before)) {
      const current = new Map((now[file] || []).map(v => [v.name, v.hash]));
      if (values.some(v => current.get(v.name) !== v.hash)) throw Error('Existing value changed: ' + file);
    }
    console.log('PASS: every original assignment preserved byte-for-byte');
  }
  console.log('PASS: ' + count + ' documented assignments');
  for (const repo of ['quarkus', 'springboot-jwks-api']) {
    const source = fs.readFileSync(path.join(root, repo, 'src/main/resources/application.properties'), 'utf8');
    const names = new Set(assignments(path.join(root, repo, '.env.example')).map(v => v.name));
    // Optional instance identity falls back to container HOSTNAME; neither is an operator default.
    const platform = new Set(['APP_INSTANCE_ID', 'HOSTNAME']);
    for (const m of source.matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)) {
      if (!names.has(m[1]) && !platform.has(m[1])) throw Error('Undocumented source placeholder: '+repo+'/'+m[1]);
    }
  }
  const quarkusNames = new Set(assignments(path.join(root,'quarkus/.env.example')).map(v=>v.name));
  const files = git('quarkus',['ls-files','src/main/java']).split('\n').filter(v=>v.endsWith('.java'));
  for (const file of files) {
    const source = fs.readFileSync(path.join(root,'quarkus',file),'utf8');
    for (const m of source.matchAll(/@ConfigProperty\(\s*name\s*=\s*"([^"]+)"/g)) {
      if (/^(flashcard\.|quiz\.import\.|lesson\.content\.import\.)/.test(m[1])) {
        const name=m[1].toUpperCase().replaceAll(/[.-]/g,'_');
        if(!quarkusNames.has(name)) throw Error('Undocumented implicit MicroProfile binding: '+name);
      }
    }
  }
  console.log('PASS: Spring/Quarkus placeholders and implicit import/SRS bindings documented');
  const rootNames = new Set(assignments(path.join(root,'.env.example')).map(v=>v.name));
  for (const file of fs.readdirSync(root).filter(v=>/compose.*\.yml$/.test(v))) {
    const source=fs.readFileSync(path.join(root,file),'utf8');
    for(const m of source.matchAll(/(?<!\$)\$\{([A-Z][A-Z0-9_]*)/g)) {
      if(!rootNames.has(m[1]))throw Error('Undocumented Compose input: '+file+'/'+m[1]);
    }
  }
  console.log('PASS: every Compose interpolation input, including fallbacks, is in root template');
}
if (process.argv[2] === 'snapshot') {
  fs.mkdirSync(path.dirname(baseline), { recursive: true });
  if (fs.existsSync(baseline)) throw Error('Baseline exists; refusing replacement');
  fs.writeFileSync(baseline, JSON.stringify(snapshot()));
  console.log('Private assignment-hash baseline saved');
} else if (process.argv[2] === 'sync') sync();
else check();
