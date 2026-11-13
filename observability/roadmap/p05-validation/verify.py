"""Offline validation; the reference model does NOT substitute for promtool."""
import copy
import json
from pathlib import Path
import shutil
import subprocess
import unittest
from compose_check import model, validate_p05
from promql_model import Evaluator, Parser, selectors
from scenarios import ALERTS, CASES, RULES, generate_promtool, run, series

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
OUT=ROOT/'observability/p05-candidate'

class Verification(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.compose=model()
        cls.results=[]

    def test_01_scenarios(self):
        for case in CASES:
            with self.subTest(case=case['name']):
                actual=run(case)
                wanted={(a['name'],a['labels']['service']) for a in actual}
                self.assertEqual(case['expected'],wanted)
                self.results.append({'name':case['name'],'result':'PASS','firing':sorted(wanted)})

    def test_02_every_alert_has_positive_case(self):
        covered={name for case in CASES for name,job in case['expected']}
        self.assertEqual({r['alert'] for r in ALERTS},covered)

    def test_03_metric_contracts_and_recording_order(self):
        inventory=json.loads((ROOT/'observability/roadmap/p04-validation/evidence/metrics-inventory.json').read_text())
        known=set().union(*(set(row['labels']) for row in inventory))
        label_keys={}
        for row in inventory:
            for metric,labels in row['labels'].items():
                label_keys.setdefault(metric,set()).update(labels)
        # P04's label inventory omits unlabeled samples; family metadata still records them.
        for row in inventory:
            for name,kind in row['families'].items():
                known.add(name+'_total' if kind=='counter' else name)
        known |= {'up','scrape_duration_seconds','scrape_samples_post_metric_relabeling'}
        for group in RULES['groups']:
            for rule in group['rules']:
                for selector in selectors(Parser(rule['expr']).parse()):
                    self.assertIn(selector[1],known)
                    for label,operation,value in selector[2]:
                        self.assertIn(label,label_keys.get(selector[1],set())|{'job'})
                if 'record' in rule:
                    known.add(rule['record'])

    def test_04_bounded_alert_metadata(self):
        for rule in ALERTS:
            self.assertIn(rule['labels']['severity'],('warning','critical'))
            self.assertIn(rule['labels']['owner'],('jp-application','jp-operations','jp-security'))
            self.assertEqual(rule['labels']['monitoring_project'],'jp_dev')
            self.assertTrue(rule['annotations']['runbook_ref'].startswith('observability/roadmap/p05-alert-contract.md#'))
            self.assertNotIn('$labels.',json.dumps(rule['annotations']))

    def test_05_sensitive_input_labels_aggregate_away(self):
        raw=[series('process_working_set_bytes',value=100,user_id='synthetic-'+str(i),
            authorization='Bearer P05_SENTINEL',email='p05@example.invalid',trace_id=str(i)) for i in range(10000)]
        result=Evaluator(raw).evaluate(Parser('max by (job) (process_working_set_bytes)').parse(),60)
        self.assertEqual(len(result),1)
        self.assertEqual(dict(next(iter(result))),{'job':'user-api'})
        self.assertNotIn('P05_SENTINEL',repr(result))

    def test_06_counter_reset(self):
        s=series('counter',slope=6)
        s['points']=[(0,0),(60,6),(120,12),(180,0),(240,6),(300,12)]
        result=Evaluator([s]).evaluate(Parser('rate(counter[5m])').parse(),300)
        self.assertGreater(next(iter(result.values())).value,0)
        self.assertLessEqual(next(iter(result.values())).value,.1)

    def test_07_unsupported_syntax_rejected(self):
        for source in ('histogram_quantile(.9, counter)','sum without (user) (counter)','counter @ 3'):
            with self.assertRaises(ValueError):
                Parser(source).parse()

    def test_08_compose_and_original_services(self):
        validate_p05(self.compose)
        from compose_check import summary
        before=json.loads((HERE/'evidence/compose-before.json').read_text())
        after=summary(self.compose)
        for name,digest in before['services'].items():
            self.assertEqual(after['services'][name],digest,name)
        for kind in ('volumes','networks'):
            for name,value in before[kind].items():
                self.assertEqual(after[kind][name],value)

    def test_09_unsafe_compose_rejected(self):
        mutations=[lambda d:d.update(name='springboot_project'),
            lambda d:d['services']['grafana']['ports'][0].update(host_ip='0.0.0.0'),
            lambda d:d['services']['prometheus'].update(profiles=['p05']),
            lambda d:d['services']['prometheus'].update(read_only=False),
            lambda d:d['networks']['p05-monitoring'].update(external=True),
            lambda d:d['services']['grafana'].update(networks={'p05-monitoring':{}}),
            lambda d:d['volumes']['grafana_data'].update(name='springboot_project_grafana_data')]
        for mutate in mutations:
            d=copy.deepcopy(self.compose)
            mutate(d)
            with self.assertRaises(AssertionError):
                validate_p05(d)

    def test_10_scrape_targets_and_limits(self):
        p=json.loads((OUT/'prometheus/prometheus.yml').read_text())
        self.assertNotIn('alerting',p)
        targets=[]
        for job in p['scrape_configs']:
            targets.extend(t for group in job['static_configs'] for t in group['targets'])
            self.assertEqual(job['sample_limit'],5000)
            self.assertEqual(job['label_limit'],16)
        self.assertEqual(set(targets),{'user-api:8080','vocabulary-api:8080','prometheus:9090'})
        self.assertEqual(len(targets),len(set(targets)))

    def test_11_grafana_provisioning(self):
        ds=json.loads((OUT/'grafana/provisioning/datasources/prometheus.yml').read_text())['datasources']
        self.assertEqual(len(ds),1)
        self.assertEqual(ds[0]['url'],'http://prometheus:9090')
        dash=json.loads((OUT/'grafana/dashboards/monitoring-health.json').read_text())
        self.assertEqual(dash['panels'][0]['datasource']['uid'],ds[0]['uid'])
        env=self.compose['services']['grafana']['environment']
        self.assertEqual(env['GF_AUTH_ANONYMOUS_ENABLED'],'false')
        self.assertNotEqual(env['GF_SECURITY_ADMIN_PASSWORD'],'')

    def test_12_notification_disabled(self):
        am=json.loads((OUT/'alertmanager/alertmanager.candidate.yml').read_text())
        self.assertEqual(am['receivers'],[{'name':'review-only'}])
        self.assertNotIn('alertmanager',self.compose['services'])
        self.assertEqual(am['route']['group_by'],['monitoring_project','service','signal'])

    def test_13_no_overlay_or_profiles(self):
        self.assertFalse((OUT/'compose.p05.yml').exists())
        for name in ('prometheus','grafana'):
            self.assertNotIn('profiles',self.compose['services'][name])
        self.assertEqual(self.compose['services']['grafana']['depends_on']['prometheus']['condition'],'service_healthy')
        self.assertNotIn('depends_on',self.compose['services']['prometheus'])

    def test_14_port_collisions(self):
        # Existing services may deliberately share different bind addresses. New ports must be unique.
        for port in ('9091','3001'):
            bindings=[p for s in self.compose['services'].values() for p in s.get('ports',[]) if str(p.get('published'))==port]
            self.assertEqual(len(bindings),1)

    def test_15_fixture_is_promtool_shaped(self):
        generate_promtool()
        fixture=json.loads((HERE/'promtool.tests.yml').read_text())
        self.assertEqual(len(fixture['tests']),len(CASES))
        self.assertTrue((HERE/fixture['rule_files'][0]).resolve().is_file())
        for case in fixture['tests']:
            self.assertEqual(len(case['alert_rule_test']),len(ALERTS))

def official_tools():
    results={}
    commands=[('rule syntax',['promtool','check','rules',str(OUT/'prometheus/rules/p05.rules.yml')]),
        ('Prometheus config',['promtool','check','config',str(OUT/'prometheus/prometheus.yml')]),
        ('engine scenarios',['promtool','test','rules','promtool.tests.yml']),
        ('Alertmanager config',['amtool','check-config',str(OUT/'alertmanager/alertmanager.candidate.yml')])]
    for name, command in commands:
        if not shutil.which(command[0]):
            results[name]={'status':'NOT VERIFIED','reason':command[0]+' unavailable on PATH'}
        else:
            p=subprocess.run(command,cwd=HERE,text=True,capture_output=True)
            results[name]={'status':'PASS' if p.returncode==0 else 'FAIL','output':p.stdout+p.stderr}
    return results

if __name__=='__main__':
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(Verification)
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    report={'unit_tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),
        'reference_model_scenarios':Verification.results,'official_tools':official_tools(),
        'limitation':'Limited independent float-vector reference model; NOT Prometheus engine correctness or runtime acceptance.'}
    (HERE/'evidence/test-results.json').write_text(json.dumps(report,indent=2)+'\n')
    raise SystemExit(0 if result.wasSuccessful() and not any(r['status']=='FAIL' for r in report['official_tools'].values()) else 1)
