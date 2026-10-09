"""Run the unmodified product against a task-owned database, with redacted logs."""
import json
import os
from pathlib import Path
import re
import sys
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[3]
config = dotenv_values(ROOT / 'backend/.env')
key = config['LLM_MODEL_CONFIG_DEEPSEEK_DEMO'].split(',')[2]


class RedactedStream:
    def __init__(self, stream):
        self.stream = stream

    def write(self, value):
        return self.stream.write(re.sub(r'sk-[A-Za-z0-9_-]{20,}', '[REDACTED]', value.replace(key, '[REDACTED]')))

    def __getattr__(self, name):
        return getattr(self.stream, name)


sys.stdout = RedactedStream(sys.stdout)
sys.stderr = RedactedStream(sys.stderr)
os.chdir(ROOT / 'backend')
sys.path.insert(0, str(ROOT / 'backend'))
import score

# score loads the original local .env; override only database routing afterward.
os.environ.update(NEO4J_URI='bolt://127.0.0.1:17687', NEO4J_USERNAME='neo4j',
                  NEO4J_PASSWORD='localdemo1234', NEO4J_DATABASE='neo4j')
from src.shared.common_fn import _get_sentence_transformer_embedding
embedding = _get_sentence_transformer_embedding('all-MiniLM-L6-v2')
vector = embedding.embed_query('测评预热')
print(json.dumps({'warm_embedding_dimensions': len(vector)}, ensure_ascii=False), flush=True)
import uvicorn
uvicorn.run(score.app, host='127.0.0.1', port=19000)
