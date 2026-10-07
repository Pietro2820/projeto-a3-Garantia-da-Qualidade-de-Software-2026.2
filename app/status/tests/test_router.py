"""
Testes unitários do endpoint de status (contrato #5 da documentação técnica).

    GET /status/{video_id} -> pending | processing | completed | failed

O teste sobe a aplicação FastAPI real (`app.main`) com o TestClient, mas
troca o `get_status` (que fala com o Redis) por um dublê — assim validamos
HTTP, serialização e tratamento de erro sem depender de infraestrutura.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def responder_com(payload):
    """Cria um dublê de `get_status` que devolve `payload` para qualquer id."""
    def _get_status(video_id: str):
        return payload
    return _get_status


@pytest.fixture
def status_existe(monkeypatch):
    """Faz o endpoint encontrar o vídeo, com o payload gravado pela task."""
    payload = {
        "video_id": "abc-123",
        "status": "completed",
        "caminho_hls": "videos/abc-123/master.m3u8",
    }
    monkeypatch.setattr("app.status.router.get_status", responder_com(payload))
    return payload


# ---------------------------------------------------------------------------
# Caminho feliz
# ---------------------------------------------------------------------------

def test_status_conhecido_retorna_200(status_existe):
    resposta = client.get("/status/abc-123")

    assert resposta.status_code == 200


def test_corpo_da_resposta_e_o_payload_gravado_no_redis(status_existe):
    resposta = client.get("/status/abc-123")

    assert resposta.json() == status_existe


def test_video_id_da_url_e_repassado_ao_store(monkeypatch):
    vistos = []

    def _get_status(video_id: str):
        vistos.append(video_id)
        return {"video_id": video_id, "status": "pending"}

    monkeypatch.setattr("app.status.router.get_status", _get_status)
    client.get("/status/uuid-789")

    assert vistos == ["uuid-789"]


@pytest.mark.parametrize(
    "estado",
    ["pending", "processing", "completed", "failed"],
)
def test_os_quatro_estados_do_contrato_sao_devolvidos(monkeypatch, estado):
    monkeypatch.setattr(
        "app.status.router.get_status",
        responder_com({"video_id": "abc-123", "status": estado}),
    )

    resposta = client.get("/status/abc-123")

    assert resposta.status_code == 200
    assert resposta.json()["status"] == estado


# ---------------------------------------------------------------------------
# Tratamento de erro — vídeo inexistente
# ---------------------------------------------------------------------------

def test_video_id_desconhecido_retorna_404(monkeypatch):
    monkeypatch.setattr("app.status.router.get_status", responder_com(None))

    resposta = client.get("/status/nao-existe")

    assert resposta.status_code == 404


def test_404_traz_mensagem_legivel_em_portugues(monkeypatch):
    monkeypatch.setattr("app.status.router.get_status", responder_com(None))

    resposta = client.get("/status/nao-existe")

    assert resposta.json()["detail"] == "video_id não encontrado"


def test_404_nao_vaza_stacktrace_500(monkeypatch):
    """`get_status` devolvendo None não pode virar erro interno do servidor."""
    monkeypatch.setattr("app.status.router.get_status", responder_com(None))

    resposta = client.get("/status/nao-existe")

    assert resposta.status_code != 500


# ---------------------------------------------------------------------------
# Fallback para o banco (Redis fora do ar ou vídeo ainda sem status na fila)
# ---------------------------------------------------------------------------

def test_redis_fora_do_ar_consulta_o_banco(monkeypatch):
    """ConnectionError do Redis não pode virar 500 — o banco é a 2ª fonte."""
    import redis as modulo_redis

    def _get_status_quebrado(video_id: str):
        raise modulo_redis.ConnectionError("Connection refused")

    monkeypatch.setattr("app.status.router.get_status", _get_status_quebrado)
    monkeypatch.setattr(
        "app.status.router.buscar_video",
        lambda video_id: {"video_id": video_id, "status": "completed"},
    )

    resposta = client.get("/status/abc-123")

    assert resposta.status_code == 200
    assert resposta.json()["status"] == "completed"
    assert resposta.json()["origem"] == "banco"


def test_video_pendente_sem_fila_aparece_pelo_banco(monkeypatch):
    """Upload recém-feito: Redis ainda não tem status, mas o banco tem 'pending'."""
    monkeypatch.setattr("app.status.router.get_status", responder_com(None))
    monkeypatch.setattr(
        "app.status.router.buscar_video",
        lambda video_id: {"video_id": video_id, "status": "pending"},
    )

    resposta = client.get("/status/novo-video")

    assert resposta.status_code == 200
    assert resposta.json()["status"] == "pending"


def test_404_quando_nem_redis_nem_banco_conhecem_o_video(monkeypatch):
    monkeypatch.setattr("app.status.router.get_status", responder_com(None))
    monkeypatch.setattr("app.status.router.buscar_video", lambda video_id: None)

    resposta = client.get("/status/fantasma")

    assert resposta.status_code == 404
    assert resposta.json()["detail"] == "video_id não encontrado"


# ---------------------------------------------------------------------------
# GET /status/{video_id}/stream — SSE (Server-Sent Events)
# ---------------------------------------------------------------------------

def _eventos(corpo: str) -> list[dict]:
    """Converte o corpo SSE em lista de payloads JSON (linhas 'data: ...')."""
    import json

    return [
        json.loads(linha[len("data:"):].strip())
        for linha in corpo.splitlines()
        if linha.startswith("data:")
    ]


def test_stream_emite_o_status_e_encerra_no_completed(monkeypatch):
    monkeypatch.setattr(
        "app.status.router.get_status",
        lambda video_id: {"video_id": video_id, "status": "completed"},
    )

    with client.stream("GET", "/status/v1/stream?intervalo=0.1&timeout=1") as resposta:
        assert resposta.status_code == 200
        assert resposta.headers["content-type"].startswith("text/event-stream")
        corpo = "".join(resposta.iter_text())

    eventos = _eventos(corpo)

    assert eventos[0]["status"] == "completed"
    assert eventos[0]["media_pronta"] is False      # sem master.m3u8 no disco
    assert eventos[-1]["evento"] == "fim"


def test_stream_usa_o_banco_quando_o_redis_nao_tem(monkeypatch):
    # intervalo/timeout mínimos de propósito: "processing" não é estado final,
    # então o stream só encerra pelo limite de tempo — e o teste não pode
    # esperar os 900s padrão.

    monkeypatch.setattr("app.status.router.get_status", lambda video_id: None)
    monkeypatch.setattr(
        "app.status.router.buscar_video",
        lambda video_id: {"video_id": video_id, "status": "processing"},
    )

    with client.stream("GET", "/status/v1/stream?intervalo=0.1&timeout=1") as resposta:
        corpo = "".join(resposta.iter_text())

    eventos = _eventos(corpo)
    assert eventos[0]["origem"] == "banco"
    assert eventos[-1]["evento"] == "timeout"


def test_stream_de_video_desconhecido_avisa_unknown_e_encerra_por_timeout(monkeypatch):
    monkeypatch.setattr("app.status.router.get_status", lambda video_id: None)
    monkeypatch.setattr("app.status.router.buscar_video", lambda video_id: None)

    with client.stream("GET", "/status/fantasma/stream?intervalo=0.1&timeout=1") as resposta:
        corpo = "".join(resposta.iter_text())

    eventos = _eventos(corpo)

    assert eventos[0]["status"] == "unknown"
    assert eventos[-1]["evento"] == "timeout"


def test_stream_emite_cada_mudanca_de_estado_uma_vez(monkeypatch):
    estados = [
        {"video_id": "v1", "status": "pending"},
        {"video_id": "v1", "status": "pending"},   # repetido: não pode re-emitir
        {"video_id": "v1", "status": "processing"},
        {"video_id": "v1", "status": "completed"},
    ]
    posicao = {"i": 0}

    def _get_status(video_id):
        estado = estados[min(posicao["i"], len(estados) - 1)]
        posicao["i"] += 1
        return dict(estado)

    monkeypatch.setattr("app.status.router.get_status", _get_status)

    with client.stream("GET", "/status/v1/stream?intervalo=0.1&timeout=1") as resposta:
        corpo = "".join(resposta.iter_text())

    # O quadro final ("fim") também carrega o status; aqui interessam só as
    # transições de estado emitidas durante o processamento.
    statuses = [
        evento["status"] for evento in _eventos(corpo)
        if "status" in evento and "evento" not in evento
    ]

    assert statuses == ["pending", "processing", "completed"]
    assert _eventos(corpo)[-1]["evento"] == "fim"
