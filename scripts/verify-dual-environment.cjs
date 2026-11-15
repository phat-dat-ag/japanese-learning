'use strict';
// Resolves credentials in memory only. No daemon mutation or resolved-config output.
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function config(args) {
  const result = cp.spawnSync('docker', ['compose', ...args, 'config', '--format', 'json'],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, 'Compose resolution failed; output withheld to protect credentials');
  return JSON.parse(result.stdout);
}
const base = ['--env-file', '.env', '-f', 'docker-compose.yml'];
const production = ['--env-file', '.env', '--env-file', '.env.db.production',
  '-f', 'docker-compose.yml', '-f', 'compose.local-production.yml'];
const dev = config(base), prod = config(production);
assert.equal(dev.name, 'jp_learning_dev', 'DEV project must retain current storage identity');
assert.equal(prod.name, 'jp_learning_prod', 'Use the documented isolated production-like identity');
const provider = config([...base, '-f', 'compose.shared-provider.yml']);
const consumer = config([...production, '-f', 'compose.shared-consumer.yml']);
assert.notEqual(dev.name, prod.name);
const active = c => Object.entries(c.services).filter(([,s]) => !s.profiles?.length);
const ports = c => active(c).flatMap(([name,s]) => (s.ports || []).map(p => ({name, port:p.published})));
for (const p of ports(prod)) assert(!ports(dev).some(d => d.port === p.port), 'Cross-environment host port collision');
for (const c of [dev, prod, provider, consumer]) {
  for (const [,s] of active(c)) assert(!s.container_name, 'Fixed container name');
}
for (const key of ['mysql_data','sqlserver_data','user_api_logs','vocabulary_api_logs','jwks_api_logs']) {
  assert.notEqual(dev.volumes[key].name, prod.volumes[key].name, 'Mutable volume collision');
}
assert.notEqual(dev.volumes.fluent_bit_state.name,consumer.volumes.fluent_bit_state.name);
for (const [key,n] of Object.entries(prod.networks)) {
  assert(!Object.values(dev.networks).some(d => d.name === n.name), 'Unexpected base network sharing: ' + key);
}
for (const c of [dev,prod]) {
  const m = c.services.mysql.environment, sql = c.services.sqlserver.environment;
  const user = c.services['user-api'].environment, vocabulary = c.services['vocabulary-api'].environment;
  assert.equal(user.Database__Password, sql.MSSQL_SA_PASSWORD);
  assert.equal(user.Database__Name, c.services['flyway-user'].environment.FLYWAY_URL.match(/databaseName=([^;]+)/)[1]);
  assert.equal(vocabulary.DB_USERNAME,m.MYSQL_USER);
  assert.equal(vocabulary.DB_PASSWORD,m.MYSQL_PASSWORD);
  assert.equal(vocabulary.DB_REACTIVE_URL,'mysql://mysql:3306/'+m.MYSQL_DATABASE);
  assert.equal(user.Jwt__Issuer,vocabulary.AUTH_JWT_ISSUER);
  assert.equal(user.Jwt__Audience,vocabulary.AUTH_JWT_AUDIENCE);
  assert.equal(user.Jwt__JwksUrl,'http://jwks-api:8080/api/v1/jwks/user');
  assert.equal(vocabulary.AUTH_JWKS_URL,user.Jwt__JwksUrl);
  for (const key of ['QUIZ_IMPORT_MAX_ITEMS','FLASHCARD_SRS_MAX_DAYS','ROOT_LOG_LEVEL']) assert(vocabulary[key], 'Missing service propagation: '+key);
}
assert.notEqual(dev.services.mysql.environment.MYSQL_DATABASE,prod.services.mysql.environment.MYSQL_DATABASE);
assert.notEqual(dev.services['user-api'].environment.Database__Name,prod.services['user-api'].environment.Database__Name);
for (const [c, environment] of [[dev,'development'],[prod,'production']]) {
  assert.equal(c.services['jwks-api'].environment.DEPLOYMENT_ENVIRONMENT,environment);
  assert.equal(c.services['user-api'].environment.Tracing__Environment,environment);
  assert.equal(c.services['vocabulary-api'].environment.APP_ENVIRONMENT,environment);
}
const fs = require('node:fs');
for (const [service, template] of [['user-api','.env.user-api.example'],['jwks-api','.env.jwks-api.example'],['vocabulary-api','.env.vocabulary-api.example']]) {
  const names = [...fs.readFileSync(path.join(root,template),'utf8').matchAll(/^([A-Za-z_][A-Za-z0-9_.]*)=/gm)].map(m=>m[1]);
  for (const c of [dev,prod]) for (const name of names) {
    assert(Object.hasOwn(c.services[service].environment,name),'Unpropagated service variable: '+name);
  }
}
// Inheritance deliberately retains signing identity, paths, and private/public mounts.
for (const name of ['user-api','jwks-api']) {
  assert.deepEqual(dev.services[name].volumes.filter(v=>v.type==='bind'),prod.services[name].volumes.filter(v=>v.type==='bind'));
}
assert(!active(prod).some(([n]) => ['opensearch','tempo','prometheus','grafana','fluent-bit','otel-collector'].includes(n)));
assert(active(consumer).some(([n])=>n==='fluent-bit'));
assert(active(consumer).some(([n])=>n==='otel-collector'));
assert.equal(provider.networks['dual-metrics'].name,consumer.networks['dual-metrics'].name);
assert.equal(dev.networks['log-storage'].name,consumer.networks['shared-log-storage'].name);
assert.equal(dev.networks['p06-tracing'].name,consumer.networks['shared-tracing'].name);
const prom = JSON.parse(require('node:fs').readFileSync(path.join(root,'observability/dual/prometheus.yml'),'utf8'));
for (const name of ['user-api','vocabulary-api']) {
  const developmentJob=prom.scrape_configs.find(j=>j.job_name===name);
  assert.equal(developmentJob.static_configs[0].targets[0],'jp_learning_dev-'+name+'-1:8080');
  const job=prom.scrape_configs.find(j=>j.job_name==='production-'+name);
  assert.equal(job.static_configs[0].labels.environment,'production');
  assert(job.metric_relabel_configs.length>0, 'Privacy rules must be retained');
  assert(consumer.services[name].networks['dual-metrics'].aliases.includes('production-'+name));
}
console.log('PASS: DEV, local production, shared provider and shared consumer resolve');
console.log('PASS: two-file precedence, application propagation, database/JWKS compatibility, telemetry labels');
console.log('PASS: isolated projects, host ports, mutable volumes and private application networks');
console.log('PASS: shared metrics aliases, privacy filters and lightweight-only consumer');
console.log('Host ports: ' + JSON.stringify({development:ports(dev),production:ports(prod)}));
console.log('NOT TESTED: startup, capacity, live databases, shared collection and dashboard queries');
