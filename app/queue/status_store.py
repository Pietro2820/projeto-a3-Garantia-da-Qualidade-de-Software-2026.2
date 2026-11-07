import os
import json
import redis

STATUS_REDIS_URL = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")

_redis_client = redis.Redis.from_url(STATUS_REDIS_URL, decode_responses=True)

STATUS_KEY_PREFIX = "video_status:"

# TTL das chaves de status: sem expiração, o Redis acumula UMA chave
# `video_status:{id}` POR VÍDEO para sempre — vazamento de memória em
# produção (o status é transiente: o estado definitivo de cada vídeo mora
# no banco, aqui ele só alimenta o /status em tempo real). 7 dias cobre
# qualquer investigação pós-incidente sem estourar a memória do container.
STATUS_TTL_SEGUNDOS = int(os.getenv("STATUS_TTL_SEGUNDOS", str(7 * 24 * 60 * 60)))


def set_status(video_id: str, status: str, extra: dict | None = None):
    """status esperado: pending | processing | completed | failed"""
    data = {"video_id": video_id, "status": status}
    if extra:
        data.update(extra)
    # `ex=` aplica o TTL na própria escrita (SETEX) — a chave expira sozinha
    # mesmo se a task morrer no meio (é justamente o caso que precisava disso).
    _redis_client.set(
        f"{STATUS_KEY_PREFIX}{video_id}",
        json.dumps(data),
        ex=STATUS_TTL_SEGUNDOS,
    )


def get_status(video_id: str) -> dict | None:
    raw = _redis_client.get(f"{STATUS_KEY_PREFIX}{video_id}")
    if raw is None:
        return None
    return json.loads(raw)