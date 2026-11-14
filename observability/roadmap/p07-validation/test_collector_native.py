"""Synthetic native Windows Collector pipeline on private loopback; no Docker/backend use."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import importlib.metadata
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[3]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / '.local/p07-pipeline-tools'))
import grpc
from opentelemetry.proto.collector.trace.v1 import trace_service_pb2 as service
from opentelemetry.proto.collector.trace.v1 import trace_service_pb2_grpc as rpc
from opentelemetry.proto.trace.v1 import trace_pb2
from opentelemetry.proto.resource.v1 import resource_pb2
from opentelemetry.proto.common.v1 import common_pb2 as common


def attr(key, value):
    return common.KeyValue(key=key, value=common.AnyValue(string_value=value))


def main():
    captured = []
    event = threading.Event()
    class Sink(rpc.TraceServiceServicer):
        def Export(self, request, context):
            captured.append(request)
            event.set()
            return service.ExportTraceServiceResponse()
    server = grpc.server(ThreadPoolExecutor(max_workers=1))
    rpc.add_TraceServiceServicer_to_server(Sink(), server)
    sink_port = server.add_insecure_port('127.0.0.1:0')
    assert sink_port
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        input_port = sock.getsockname()[1]
    original = json.loads((ROOT / 'observability/p07/collector.yml').read_text())
    config = json.loads(json.dumps(original))
    config['receivers']['otlp']['protocols']['grpc']['endpoint'] = f'127.0.0.1:{input_port}'
    config['exporters']['otlp/tempo']['endpoint'] = f'127.0.0.1:{sink_port}'
    config['service']['telemetry'] = {'logs': {'level': 'warn'}, 'metrics': {'level': 'none', 'readers': []}}
    sentinel = 'P07_SYNTHETIC_SECRET_SENTINEL'
    now = time.time_ns()
    def resource(service_name):
        normal = trace_pb2.Span(trace_id=bytes.fromhex('11' * 16), span_id=bytes.fromhex('22' * 8),
            name=sentinel, kind=trace_pb2.Span.SPAN_KIND_SERVER, start_time_unix_nano=now,
            end_time_unix_nano=now + 1000,
            attributes=[attr('http.request.method', 'GET'), attr('http.route', '/' + sentinel),
                        attr('db.statement', sentinel), attr('authorization', sentinel)],
            status=trace_pb2.Status(code=trace_pb2.Status.STATUS_CODE_ERROR, message=sentinel),
            events=[trace_pb2.Span.Event(name=sentinel, time_unix_nano=now)])
        linked = trace_pb2.Span()
        linked.CopyFrom(normal)
        linked.span_id = bytes.fromhex('33' * 8)
        linked.links.add(trace_id=bytes.fromhex('44' * 16), span_id=bytes.fromhex('55' * 8))
        return trace_pb2.ResourceSpans(
            resource=resource_pb2.Resource(attributes=[attr('service.name', service_name),
                attr('service.namespace', 'japanese-learning'), attr('user.id', sentinel)]),
            scope_spans=[trace_pb2.ScopeSpans(scope=common.InstrumentationScope(name=sentinel,
                attributes=[attr('secret', sentinel)]), spans=[normal, linked])])
    binary = ROOT / '.local/p06-tools/otelcol-contrib.exe'
    process = None
    channel = None
    server.start()
    try:
        with tempfile.TemporaryDirectory(prefix='p07_collector_native_') as folder:
            path = Path(folder) / 'collector.json'
            path.write_text(json.dumps(config))
            validate = subprocess.run([str(binary), 'validate', '--config=' + str(path)],
                                      capture_output=True, text=True, timeout=15)
            assert validate.returncode == 0, validate.stderr
            process = subprocess.Popen([str(binary), '--config=' + str(path)],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            channel = grpc.insecure_channel(f'127.0.0.1:{input_port}')
            grpc.channel_ready_future(channel).result(timeout=15)
            request = service.ExportTraceServiceRequest(resource_spans=[resource('user-api'),
                resource('vocabulary-api'), resource('unapproved-service')])
            rpc.TraceServiceStub(channel).Export(request, timeout=5)
            assert event.wait(10), 'No export received by synthetic sink'
            spans = [(r, s) for batch in captured for r in batch.resource_spans
                     for scope in r.scope_spans for s in scope.spans]
            assert len(spans) == 2, len(spans)
            assert {dict((a.key, a.value.string_value) for a in r.resource.attributes)['service.name']
                    for r, _ in spans} == {'user-api', 'vocabulary-api'}
            for r, span in spans:
                assert not span.events and not span.links and not span.status.message
                assert span.trace_id == bytes.fromhex('11' * 16)
                assert span.span_id == bytes.fromhex('22' * 8)
                assert span.status.code == trace_pb2.Status.STATUS_CODE_ERROR
                assert sentinel.encode() not in r.SerializeToString()
            process.terminate()
            stdout, stderr = process.communicate(timeout=10)
            assert sentinel not in stdout + stderr, 'Sentinel appeared in Collector diagnostics'
            process = None
        report = {'status': 'PASS', 'scope': 'Actual native Windows0.145.0 Collector with synthetic '
            'loopback OTLP ingress/egress. No Docker, Tempo or stored-data validation.',
            'production_config_sha256': hashlib.sha256((ROOT/'observability/p07/collector.yml').read_bytes()).hexdigest(),
            'temporary_changes': 'Receiver/exporter endpoints to127.0.0.1; self-telemetry disabled; pipeline/processors unchanged',
            'input_spans': 6, 'exported_spans': 2,
            'assertions': ['both API resources retained', 'unknown service rejected', 'linked spans rejected',
                'events removed', 'sentinels absent from serialized output and diagnostics',
                'trace/span identity and error status preserved'],
            'dependencies': {x: importlib.metadata.version(x) for x in ('grpcio', 'protobuf', 'opentelemetry-proto')}}
        (Path(__file__).parent / 'evidence/collector-native-pipeline.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report))
    finally:
        if channel:
            channel.close()
        if process is not None:
            process.terminate()
            process.communicate(timeout=10)
        server.stop(0).wait()


if __name__ == '__main__':
    main()
