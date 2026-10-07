"""
Rota de status do processamento (contrato #5).

    GET /status/{video_id}          -> pending | processing | completed | failed
    GET /status/{video_id}/stream   -> o mesmo, via SSE (Server-Sent Events)

Duas fontes, em ordem de prioridade:
  1. Redis (`status_store`) — gravado pelas tasks do Celery em tempo real;
  2. Banco (Supabase ou fallback local) — usado quando o Redis não tem o
     vídeo ou está fora do ar.

Antes, qualquer falha de Redis virava 500 na cara do frontend; e um vídeo
recém-enviado (fila ainda sem worker) devolvia 404 mesmo existindo no banco.
O fallback mantém o player informado em qualquer cenário.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.database.videos import buscar_video
from app.media import master_existe
from app.queue.status_store import get_status

logger = logging.getLogger(__name__)

router = APIRouter()

# SSE: de quanto em quanto tempo o servidor reconsulta Redis/banco e o limite de
# tempo segurando a conexão aberta. O modal de upload do player usa esta rota
# para acompanhar a transcodificação sem ficar fazendo polling na mão.
INTERVALO_STREAM_SEGUNDOS = float(os.getenv("STATUS_STREAM_INTERVAL", "2"))
LIMITE_STREAM_SEGUNDOS = float(os.getenv("STATUS_STREAM_TIMEOUT", "900"))
ESTADOS_FINAIS = {"completed", "failed"}


@router.get("/status/{video_id}")
def consultar_status(video_id: str):
    status = None
    try:
        status = get_status(video_id)
    except Exception as exc:  # Redis fora do ar não pode derrubar a rota
        logger.warning("Redis indisponível ao consultar status de %s: %s", video_id, exc)

    if status is not None:
        return status

    # Fallback: o banco conhece o vídeo (o upload grava status='pending' lá,
    # e a task atualiza para completed/failed quando o processamento acaba).
    try:
        video = buscar_video(video_id)
    except Exception as exc:
        logger.warning("Banco indisponível ao consultar vídeo %s: %s", video_id, exc)
        video = None

    if video is not None:
        return {
            "video_id": video_id,
            "status": video.get("status", "pending"),
            "origem": "banco",
        }

    raise HTTPException(status_code=404, detail="video_id não encontrado")


def _status_atual(video_id: str) -> dict | None:
    """Mesma resolução de `consultar_status`, sem levantar HTTPException.

    Ordem: Redis (tempo real) → banco (Supabase ou JSON local). `media_pronta`
    entra como informação extra: status "completed" com master.m3u8 ausente é o
    caso que o player precisa distinguir (arquivos apagados/outro machine).
    """
    status = None
    try:
        status = get_status(video_id)
    except Exception as exc:
        logger.warning("Redis indisponível no stream de %s: %s", video_id, exc)

    if status is None:
        try:
            video = buscar_video(video_id)
        except Exception as exc:
            logger.warning("Banco indisponível no stream de %s: %s", video_id, exc)
            video = None

        if video is None:
            return None

        status = {
            "video_id": video_id,
            "status": video.get("status", "pending"),
            "origem": "banco",
        }

    status.setdefault("video_id", video_id)
    status["media_pronta"] = master_existe(video_id)
    return status


def _evento(payload: dict) -> str:
    """Um quadro SSE (comentário de keep-alive sai como linha ":" )."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.get("/status/{video_id}/stream")
async def stream_status(
    video_id: str,
    intervalo: float = Query(default=INTERVALO_STREAM_SEGUNDOS, ge=0.1, le=30),
    timeout: float = Query(default=LIMITE_STREAM_SEGUNDOS, ge=1, le=7200),
):
    """Server-Sent Events com o progresso do processamento.

    Emite `status` a cada mudança e encerra com `fim` quando chega a um estado
    final (completed/failed) ou quando estoura o `timeout`. O player usa
    EventSource; se o navegador/proxy não suportar, ele volta ao polling de
    GET /status/{id} automaticamente (js/upload.js).
    """

    async def gerar():
        inicio = time.monotonic()
        ultimo = None

        while True:
            status = _status_atual(video_id)

            if status is None:
                # O upload ainda não gravou o registro (ou o id não existe):
                # avisa e segue tentando — o front depende disso nos 1ºs segundos.
                if ultimo != "unknown":
                    yield _evento({"video_id": video_id, "status": "unknown"})
                    ultimo = "unknown"
            elif status.get("status") != ultimo:
                ultimo = status.get("status")
                yield _evento(status)

                if ultimo in ESTADOS_FINAIS:
                    yield _evento({"video_id": video_id, "evento": "fim", "status": ultimo})
                    return

            if time.monotonic() - inicio > timeout:
                yield _evento({"video_id": video_id, "evento": "timeout"})
                return

            await asyncio.sleep(intervalo)

    return StreamingResponse(
        gerar(),
        media_type="text/event-stream",
        headers={
            # Sem cache e conexão aberta: intermediários não podem segurar o
            # stream (senão o front acha que travou e volta ao polling).
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )
