"""Run one real upload on a new task-owned Neo4j volume and preserve all evidence."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import socket
import subprocess
import sys
import time
from uuid import uuid4

from dotenv import dotenv_values
from neo4j import GraphDatabase
import requests

BASE = Path(__file__).resolve().parents[1]
ROOT = Path(__file__).resolve().parents[3]
URL = 'http://127.0.0.1:19000/course_workspace'
SECRET = ''


def redact(value):
    text = str(value)
    if SECRET:
        text = text.replace(SECRET, '[REDACTED]')
    return re.sub(r'sk-[A-Za-z0-9_-]{20,}', '[REDACTED]', text)


def error_summary(exc):
    return {'type': type(exc).__name__, 'message': redact(exc)}


def safe_print(value):
    try:
        print(redact(value), flush=True)
    except OSError:
        # A closed output pipe must not prevent evidence or service cleanup.
        pass


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path, data):
    text = redact(json.dumps(data, ensure_ascii=False, indent=2, default=str))
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(text + '\n', encoding='utf-8')
    temporary.replace(path)


def docker(*args):
    result = subprocess.run(['docker', *args], text=True, capture_output=True, check=True)
    return result.stdout.strip()


def ensure_ports_free():
    for port in (17474, 17687, 19000):
        with socket.socket() as sock:
            if sock.connect_ex(('127.0.0.1', port)) == 0:
                raise RuntimeError(f'Evaluation port {port} is already in use; no existing service will be changed.')


def main():
    global SECRET
    parser = argparse.ArgumentParser()
    parser.add_argument('--format', choices=['txt', 'docx'], required=True)
    args = parser.parse_args()
    model_config = dotenv_values(ROOT / 'backend/.env')['LLM_MODEL_CONFIG_DEEPSEEK_DEMO'].split(',')
    if len(model_config) != 3 or not all(part.strip() for part in model_config):
        raise ValueError('DeepSeek configuration must contain model, endpoint and a nonempty key')
    SECRET = model_config[2]
    source = BASE / f'inputs/Hello算法_第7章树_正文.{args.format}'
    gold = BASE / 'gold/reference.json'
    protocol = BASE / 'protocol.json'
    lock = json.loads((BASE / 'gold/frozen.json').read_text())
    assert sha(gold) == lock['reference_sha256'], 'Reference changed after freezing'
    assert sha(BASE / 'inputs/Hello算法_第7章树_正文.txt') == lock['text_sha256'], 'Input changed after freezing'
    assert sha(protocol) == lock['protocol_sha256'], 'Protocol changed after freezing'
    assert sha(source) == lock['input_sha256'][args.format], 'Selected format input changed after freezing'
    assert sha(BASE / 'scripts/score_graph.py') == lock['scorer_sha256'], 'Scorer changed after freezing'
    source.read_bytes()
    out = BASE / 'runs' / args.format
    out.mkdir(parents=True, exist_ok=False)
    ensure_ports_free()
    unique = uuid4().hex[:8]
    container = f'ckg-eval-tree-{args.format}-{unique}'
    volume = container + '-data'
    meta = {'format': args.format, 'started_at': datetime.now(timezone(timedelta(hours=8))).isoformat(),
            'application_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
            'platform': platform.platform(), 'python': platform.python_version(),
            'model': model_config[0], 'api_endpoint': model_config[1],
            'input_sha256': sha(source), 'reference_sha256': sha(gold), 'protocol_sha256': sha(protocol),
            'database_container': container, 'database_volume': volume,
            'warm_embedding': True, 'attempt': 1, 'harness_automatic_reruns': 0,
            'sdk_max_retries_per_request': 2, 'sdk_retry_configuration': 'Unmodified SDK default',
            'completed': False}
    save(out / 'metadata.json', meta)
    server = None
    driver = None
    log = None
    created = False
    course_id = None
    start = None
    stage_samples = []
    upload_outcome = {}
    snapshot_errors = []
    cleanup_errors = []

    def best_effort(label, action, errors=snapshot_errors):
        """A failed evidence/cleanup operation must not replace the run error."""
        try:
            return action()
        except Exception as exc:
            detail = {'operation': label, **error_summary(exc)}
            errors.append(detail)
            safe_print(json.dumps({'warning': detail}, ensure_ascii=False))
            return None

    def query_rows(statement, field=None, **parameters):
        with driver.session() as session:
            result = session.run(statement, **parameters)
            return [record[field] if field else dict(record) for record in result]

    def fetch_course_graph():
        response = requests.get(URL + f'/courses/{course_id}/graph', timeout=15)
        response.raise_for_status()
        return response.json()

    try:
        docker('volume', 'create', volume)
        docker('run', '-d', '--name', container,
               '-p', '127.0.0.1:17474:7474', '-p', '127.0.0.1:17687:7687',
               '-e', 'NEO4J_AUTH=neo4j/localdemo1234', '-e', 'NEO4J_PLUGINS=["apoc"]',
               '-e', 'NEO4J_server_memory_heap_initial__size=256m',
               '-e', 'NEO4J_server_memory_heap_max__size=512m',
               '-e', 'NEO4J_server_memory_pagecache_size=256m',
               '-v', volume + ':/data', 'neo4j:5.26.0')
        created = True
        driver = GraphDatabase.driver('bolt://127.0.0.1:17687', auth=('neo4j', 'localdemo1234'))
        for _ in range(90):
            try:
                driver.verify_connectivity()
                break
            except Exception:
                time.sleep(1)
        else:
            raise RuntimeError('Fresh evaluation database did not become ready')
        with driver.session() as session:
            meta['initial_database_nodes'] = session.run('MATCH (n) RETURN count(n) AS n').single()['n']
            assert meta['initial_database_nodes'] == 0, 'Database must be empty'
            meta['apoc_version'] = session.run('RETURN apoc.version() AS v').single()['v']
        log = (out / 'server.log').open('w')
        server = subprocess.Popen([sys.executable, str(BASE / 'scripts/serve_isolated.py')], stdout=log, stderr=subprocess.STDOUT)
        for _ in range(180):
            if server.poll() is not None:
                raise RuntimeError('Evaluation backend exited before becoming ready')
            try:
                if requests.get('http://127.0.0.1:19000/health', timeout=2).status_code == 200:
                    break
            except requests.RequestException:
                pass
            time.sleep(1)
        else:
            raise RuntimeError('Evaluation backend readiness timeout')
        response = requests.post(URL + '/courses', json={'title': f'真实教材测评 树 {args.format.upper()}'}, timeout=30)
        response.raise_for_status()
        course_id = response.json()['uid']
        meta['course_id'] = course_id
        save(out / 'metadata.json', meta)
        start = time.perf_counter()

        def upload():
            try:
                with source.open('rb') as file:
                    result = requests.post(URL + f'/courses/{course_id}/upload', files={'file': (source.name, file)}, timeout=1800)
                upload_outcome['response'] = result
                upload_outcome['timing_end'] = 'http_response'
                return result, time.perf_counter() - start
            except Exception as exc:
                upload_outcome['error'] = error_summary(exc)
                upload_outcome['timing_end'] = 'request_exception'
                raise
            finally:
                upload_outcome['elapsed_seconds'] = time.perf_counter() - start

        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(upload)
            last_status = None
            while not future.done():
                # A transient observation failure must not discard the upload
                # response or turn observation into a second upload attempt.
                rows = best_effort('observe_stage', lambda: query_rows('MATCH (j:CourseProcessJob {course_id:$cid}) RETURN j{.*} AS job ORDER BY j.started_ms DESC LIMIT 1', field='job', cid=course_id))
                if rows:
                    job = rows[0]
                    if job.get('status') != last_status:
                        last_status = job.get('status')
                        sample = {'elapsed_seconds': round(time.perf_counter() - start, 3), 'status': last_status, 'job': job}
                        stage_samples.append(sample)
                        best_effort('save_stage_observations', lambda: save(out / 'stage_observations.json', stage_samples))
                        safe_print(json.dumps({'format': args.format, 'elapsed_seconds': sample['elapsed_seconds'], 'status': last_status}))
                time.sleep(1)
            response, upload_seconds = future.result()
        meta['upload_total_seconds'] = round(upload_seconds, 3)
        meta['http_status'] = response.status_code
        try:
            save(out / 'upload_response.json', response.json())
        except ValueError:
            save(out / 'upload_response.json', {'non_json_response': response.text})
        graph = requests.get(URL + f'/courses/{course_id}/graph', timeout=60)
        graph.raise_for_status()
        save(out / 'graph.json', graph.json())
        with driver.session() as session:
            jobs = [r['job'] for r in session.run('MATCH (j:CourseProcessJob {course_id:$cid}) RETURN j{.*} AS job', cid=course_id)]
            docs = [r['doc'] for r in session.run('MATCH (d:Document) RETURN d{.*} AS doc')]
            raw_nodes = [dict(r) for r in session.run('MATCH (:Document)<-[:PART_OF]-(:Chunk)-[:HAS_ENTITY]->(n) RETURN DISTINCT elementId(n) AS id, labels(n) AS labels, properties(n) AS properties')]
            ids = [n['id'] for n in raw_nodes]
            raw_edges = [dict(r) for r in session.run('MATCH (a)-[r:PREREQUISITE_OF|CONTAINS|RELATED_TO]->(b) WHERE elementId(a) IN $ids AND elementId(b) IN $ids RETURN elementId(a) AS source, elementId(b) AS target, type(r) AS kind', ids=ids)]
        save(out / 'jobs.json', jobs)
        save(out / 'documents.json', docs)
        save(out / 'raw_graph.json', {'nodes': raw_nodes, 'edges': raw_edges})
        save(out / 'stage_observations.json', stage_samples)
        data = graph.json()
        meta.update(completed=response.status_code == 200 and any(j.get('status') == 'Completed' for j in jobs),
                    points=len(data['points']), edges=len(data['edges']), relation_types=sorted({e['kind'] for e in data['edges']}))
        meta['finished_at'] = datetime.now(timezone(timedelta(hours=8))).isoformat()
    except (Exception, KeyboardInterrupt) as exc:
        # Keep the original failure separate from subsequent snapshot errors.
        # Never emit a raw traceback that could contain a provider response.
        meta['harness_error'] = error_summary(exc)
        meta['interrupted'] = isinstance(exc, KeyboardInterrupt)
    finally:
        if start is not None:
            meta['upload_total_seconds'] = round(upload_outcome.get('elapsed_seconds', time.perf_counter() - start), 3)
            meta['upload_timing_end'] = upload_outcome.get('timing_end', 'harness_interrupted')
            if 'error' in upload_outcome:
                meta['upload_request_error'] = upload_outcome['error']
        if 'response' in upload_outcome:
            response = upload_outcome['response']
            meta['http_status'] = response.status_code
            try:
                body = response.json()
            except ValueError:
                body = {'non_json_response': response.text}
            best_effort('save_upload_response', lambda: save(out / 'upload_response.json', body))
        best_effort('save_stage_observations', lambda: save(out / 'stage_observations.json', stage_samples))

        # Save each available component independently before stopping services.
        # A failed graph HTTP request must not prevent direct database evidence.
        if driver is not None:
            if course_id is not None:
                jobs = best_effort('snapshot_jobs', lambda: query_rows('MATCH (j:CourseProcessJob {course_id:$cid}) RETURN j{.*} AS job', field='job', cid=course_id))
                if jobs is not None:
                    best_effort('save_jobs', lambda: save(out / 'jobs.json', jobs))
                    meta['completed'] = meta.get('http_status') == 200 and any(job.get('status') == 'Completed' for job in jobs)
            docs = best_effort('snapshot_documents', lambda: query_rows('MATCH (d:Document) RETURN d{.*} AS doc', field='doc'))
            if docs is not None:
                best_effort('save_documents', lambda: save(out / 'documents.json', docs))
            raw_nodes = best_effort('snapshot_raw_nodes', lambda: query_rows('MATCH (:Document)<-[:PART_OF]-(:Chunk)-[:HAS_ENTITY]->(n) RETURN DISTINCT elementId(n) AS id, labels(n) AS labels, properties(n) AS properties'))
            raw_edges = None
            if raw_nodes is not None:
                ids = [node['id'] for node in raw_nodes]
                raw_edges = best_effort('snapshot_raw_edges', lambda: query_rows('MATCH (a)-[r:PREREQUISITE_OF|CONTAINS|RELATED_TO]->(b) WHERE elementId(a) IN $ids AND elementId(b) IN $ids RETURN elementId(a) AS source, elementId(b) AS target, type(r) AS kind', ids=ids))
            if raw_nodes is not None or raw_edges is not None:
                best_effort('save_raw_graph', lambda: save(out / 'raw_graph.json', {'nodes': raw_nodes, 'edges': raw_edges, 'snapshot_complete': raw_nodes is not None and raw_edges is not None}))
        if course_id is not None and not (out / 'graph.json').exists():
            data = best_effort('snapshot_course_graph', fetch_course_graph)
            if data is not None:
                best_effort('save_course_graph', lambda: save(out / 'graph.json', data))
                meta.update(points=len(data.get('points', [])), edges=len(data.get('edges', [])), relation_types=sorted({edge['kind'] for edge in data.get('edges', [])}))
        meta['finished_at'] = datetime.now(timezone(timedelta(hours=8))).isoformat()
        meta['evidence_errors'] = snapshot_errors
        # Preserve metadata before cleanup in case stopping a service fails.
        best_effort('save_metadata_before_cleanup', lambda: save(out / 'metadata.json', meta))

        def stop_server():
            if server.poll() is not None:
                return
            server.terminate()
            try:
                server.wait(timeout=20)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=10)

        if server is not None:
            best_effort('stop_backend', stop_server, cleanup_errors)
        if log:
            best_effort('close_backend_log', log.close, cleanup_errors)
        if driver:
            best_effort('close_database_driver', driver.close, cleanup_errors)
        if created:
            best_effort('stop_database_container', lambda: docker('stop', '-t', '15', container), cleanup_errors)
        meta['cleanup_errors'] = cleanup_errors
        best_effort('save_final_metadata', lambda: save(out / 'metadata.json', meta))
        safe_print(json.dumps(meta, ensure_ascii=False))
        safe_print('Evidence preservation and task-owned service cleanup attempted; database volume retained. Check metadata for any failures.')
    if meta.get('interrupted'):
        return 130
    return 0 if meta['completed'] and not meta.get('harness_error') and not cleanup_errors else 1


if __name__ == '__main__':
    try:
        exit_code = main()
    except (Exception, KeyboardInterrupt) as exc:
        safe_print(json.dumps({'harness_error': error_summary(exc)}, ensure_ascii=False))
        exit_code = 130 if isinstance(exc, KeyboardInterrupt) else 1
    raise SystemExit(exit_code)
