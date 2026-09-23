"""
Rotas de recomendação — contrato #6 da documentação técnica.

    GET  /videos/{video_id}/relacionados   vídeos similares (Jaccard sobre tags)
    GET  /recomendacoes/{user_id}          recomendações personalizadas
    GET  /trending                         mais assistidos
    POST /watch                            registra uma visualização

Antes deste módulo o player (js/api.js) chamava essas quatro rotas e recebia
404 — a sidebar e os "relacionados" só funcionavam com o DEMO_VIDEOS fixo do
frontend. O motor de Jaccard do Gustavo existia, mas não estava ligado na API.

Decisões de projeto:
  * A resposta segue o formato de metadados do contrato #2 (video_id, titulo,
    tags, categoria, autor, criado_em) e acrescenta o que o player precisa para
    desenhar o card: views, score, hls_url e thumbnail_url.
  * Erro de banco vira 503 com mensagem legível, nunca 500 com stacktrace.
    Isso importa porque o projeto ainda roda sem credenciais do Supabase: a
    aplicação continua de pé e diz o que falta.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.database.videos import buscar_video, listar_videos
from app.recommendations import views_store
from app.recommendations.engine import normalizar_tags, ordenar_por_similaridade

logger = logging.getLogger(__name__)

router = APIRouter(tags=["recomendacoes"])

# Corte de similaridade: abaixo disso os vídeos não têm nada em comum de útil.
LIMITE_MINIMO_SIMILARIDADE = 0.1


class WatchRequest(BaseModel):
    """Corpo do POST /watch."""

    video_id: str = Field(min_length=1, description="UUID do vídeo assistido")
    user_id: str | None = Field(
        default=None, description="Opcional — alimenta as recomendações pessoais"
    )


def _executar_no_banco(operacao, *args, **kwargs):
    """Centraliza o tratamento de erro de acesso ao Supabase.

    `get_client()` levanta RuntimeError quando faltam SUPABASE_URL/SUPABASE_KEY.
    Sem este wrapper isso viraria um 500 genérico na cara do usuário.
    """
    try:
        return operacao(*args, **kwargs)
    except RuntimeError as exc:
        logger.error("Banco indisponível: %s", exc)
        raise HTTPException(
            status_code=503,
            detail=(
                "Banco de dados não configurado. Preencha SUPABASE_URL e "
                "SUPABASE_KEY no .env (modelo em .env.example)."
            ),
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:  # rede fora, tabela ausente, resposta inesperada
        logger.exception("Falha inesperada ao consultar vídeos")
        raise HTTPException(
            status_code=502, detail=f"Falha ao consultar o banco: {exc}"
        ) from exc


def _enriquecer(video: dict, score: float | None = None) -> dict:
    """Acrescenta ao metadado do contrato #2 o que o player usa no card."""
    video_id = video.get("video_id")
    resposta = {
        **video,
        "tags": normalizar_tags(video.get("tags")),
        "views": views_store.contar_visualizacoes(video_id) if video_id else 0,
        "hls_url": f"/videos/{video_id}/master.m3u8" if video_id else None,
        "thumbnail_url": f"/videos/{video_id}/thumbnail.jpg" if video_id else None,
    }
    if score is not None:
        resposta["score"] = score
    return resposta


def _catalogo_pronto() -> list[dict]:
    """Vídeos que já terminaram de transcodificar (só esses dão play)."""
    return _executar_no_banco(listar_videos, status="completed")


# ---------------------------------------------------------------------------
# GET /videos/{video_id}/relacionados
# ---------------------------------------------------------------------------

@router.get("/videos/{video_id}/relacionados")
def videos_relacionados(
    video_id: str,
    limite: int = Query(default=5, ge=1, le=50),
):
    """Vídeos com tags parecidas com as do vídeo informado."""
    atual = _executar_no_banco(buscar_video, video_id)
    if atual is None:
        raise HTTPException(status_code=404, detail="video_id não encontrado")

    catalogo = _catalogo_pronto()
    parecidos = ordenar_por_similaridade(
        atual.get("tags"),
        [video for video in catalogo if video.get("video_id") != video_id],
        LIMITE_MINIMO_SIMILARIDADE,
    )

    return {
        "video_id": video_id,
        "relacionados": [
            _enriquecer(video, score=video["score"]) for video in parecidos[:limite]
        ],
    }


# ---------------------------------------------------------------------------
# GET /recomendacoes/{user_id}
# ---------------------------------------------------------------------------

@router.get("/recomendacoes/{user_id}")
def recomendacoes_personalizadas(
    user_id: str,
    limite: int = Query(default=5, ge=1, le=50),
):
    """Recomenda a partir das tags do que o usuário já assistiu."""
    historico = views_store.historico_do_usuario(user_id)

    if not historico:
        return {
            "user_id": user_id,
            "recomendacoes": [],
            "motivo": "usuário ainda não assistiu nenhum vídeo",
        }

    assistidos = []
    for assistido_id in historico:
        video = _executar_no_banco(buscar_video, assistido_id)
        if video is not None:
            assistidos.append(video)

    # O "perfil" do usuário é a união das tags do que ele assistiu.
    tags_do_usuario: list[str] = []
    for video in assistidos:
        tags_do_usuario.extend(normalizar_tags(video.get("tags")))

    ja_vistos = set(historico)
    catalogo = [
        video
        for video in _catalogo_pronto()
        if video.get("video_id") not in ja_vistos
    ]

    sugeridos = ordenar_por_similaridade(
        tags_do_usuario, catalogo, LIMITE_MINIMO_SIMILARIDADE
    )

    return {
        "user_id": user_id,
        "recomendacoes": [
            _enriquecer(video, score=video["score"]) for video in sugeridos[:limite]
        ],
    }


# ---------------------------------------------------------------------------
# GET /trending
# ---------------------------------------------------------------------------

@router.get("/trending")
def trending(limite: int = Query(default=10, ge=1, le=50)):
    """Mais assistidos, segundo o contador em Redis."""
    ranking = views_store.mais_assistidos(limite)

    if not ranking:
        return {"trending": [], "motivo": "nenhuma visualização registrada ainda"}

    videos = []
    for video_id, views in ranking:
        video = _executar_no_banco(buscar_video, video_id)
        if video is None:
            # O vídeo pode ter sido apagado do banco; o ranking não pode quebrar.
            logger.warning("video_id %s no ranking mas não está no banco", video_id)
            continue
        enriquecido = _enriquecer(video)
        enriquecido["views"] = views
        videos.append(enriquecido)

    return {"trending": videos}


# ---------------------------------------------------------------------------
# POST /watch
# ---------------------------------------------------------------------------

@router.post("/watch")
def registrar_watch(payload: WatchRequest):
    """Registra uma visualização (alimenta /trending e /recomendacoes)."""
    try:
        views = views_store.registrar_visualizacao(payload.video_id, payload.user_id)
    except Exception as exc:  # Redis fora do ar não pode derrubar o player
        logger.exception("Falha ao registrar visualização no Redis")
        raise HTTPException(
            status_code=503, detail="Contador de visualizações indisponível"
        ) from exc

    return {
        "video_id": payload.video_id,
        "views": views,
        "registrado": True,
    }
