// Offline syntax parsing using the already-installed Prettier YAML plugin.
// YAML parsing does not validate PromQL, Prometheus schemas, or Grafana runtime behavior.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../..');
const prettier = require(path.join(root, 'angular/node_modules/prettier'));
const plugin = require(path.join(root, 'angular/node_modules/prettier/plugins/yaml'));
const files = ['docker-compose.yml'];
function walk(dir) {
  for (const e of fs.readdirSync(dir, {withFileTypes:true})) {
    const p = path.join(dir,e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.yml')) files.push(path.relative(root,p));
  }
}
walk(path.join(root,'observability/p05-candidate'));
files.push('observability/roadmap/p05-validation/promtool.tests.yml');
(async () => {
  for (const file of files) await prettier.format(fs.readFileSync(path.join(root,file),'utf8'), {parser:'yaml', plugins:[plugin]});
  // Prettier is a syntax parser, not a duplicate-key/schema validator.
  let rejected = false;
  try { await prettier.format('services: [unterminated\n',{parser:'yaml',plugins:[plugin]}); }
  catch { rejected=true; }
  if (!rejected) throw new Error('Malformed YAML was accepted');
  const result={status:'PASS',files,count:files.length,malformed_yaml_negative_fixture:'PASS',
    limitation:'Syntax only; not PromQL or runtime validation'};
  fs.writeFileSync(path.join(__dirname,'evidence/yaml-validation.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
})().catch(e => {console.error(e.message);process.exit(1);});
