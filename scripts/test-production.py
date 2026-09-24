"""Deployment failure safety tests. No Docker calls or database writes."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('production', Path(__file__).with_name('production.py'))
production = importlib.util.module_from_spec(spec)
spec.loader.exec_module(production)


class DeploymentSafetyTests(unittest.TestCase):
    def setUp(self):
        self.cmd = ['docker', 'compose']
        self.config = {'services': {name: {'image': 'test/' + name + ':release'}
                                   for name in ('frontend', 'user-api', 'vocabulary-api')}}

    def test_missing_release_image_does_not_stop_running_application(self):
        with patch.object(production, 'run', side_effect=RuntimeError('missing image')) as run:
            with self.assertRaises(RuntimeError):
                production.deploy(self.cmd, self.config, 'isolated-test')
        self.assertTrue(all(call.args[0][:3] == ['docker', 'image', 'inspect'] for call in run.call_args_list))

    def test_failed_migration_keeps_application_stopped(self):
        calls = []
        def execute(args):
            calls.append(args)
            if '--exit-code-from' in args and args[-1] == 'flyway-user':
                raise RuntimeError('migration failed')
            return ''
        with patch.object(production, 'run', side_effect=execute), patch.object(production, 'verify') as verify:
            with self.assertRaises(RuntimeError):
                production.deploy(self.cmd, self.config, 'isolated-test')
        self.assertFalse(any('up' in args and args[-1] in production.APPS for args in calls))
        self.assertEqual(calls[-1], self.cmd + ['stop', 'frontend', 'gateway'])
        verify.assert_not_called()

    def test_verification_failure_closes_public_entry(self):
        with patch.object(production, 'run', return_value='') as run, patch.object(production, 'verify', side_effect=RuntimeError('unhealthy')):
            with self.assertRaises(RuntimeError):
                production.deploy(self.cmd, self.config, 'isolated-test')
        self.assertEqual(run.call_args.args[0], self.cmd + ['stop', 'frontend', 'gateway'])

    def test_each_deployment_reruns_completed_migrations(self):
        with patch.object(production, 'run', return_value='') as run, patch.object(production, 'verify'):
            production.deploy(self.cmd, self.config, 'isolated-test')
            production.deploy(self.cmd, self.config, 'isolated-test')
        jobs = [call.args[0] for call in run.call_args_list if '--exit-code-from' in call.args[0]]
        self.assertEqual([args[-1] for args in jobs], list(production.JOBS) * 2)
        self.assertTrue(all('--force-recreate' in args and '--no-deps' in args for args in jobs))


if __name__ == '__main__':
    unittest.main()
