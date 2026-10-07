"""
Camada de mídia (arquivos HLS gerados pela transcodificação).

Por que este módulo existe
--------------------------
O player (js/player.js) só consegue dar play num vídeo quando o
`videos/{video_id}/master.m3u8` existe de verdade no disco. Antes, a API
montava o `hls_url` a partir do `video_id` SEM verificar o arquivo: um vídeo
com status "completed" no banco mas sem HLS (transcodificação apagada, pasta
`videos/` fora do git, worker que falhou no meio) entrava no catálogo, o
player tentava carregar e ficava num loop infinito de retry num 404 — o
sintoma que o time descreveu como "só roda vídeo que tem URL dentro do JS".

Aqui ficam:
  * `VIDEOS_DIR`  — fonte única de verdade do diretório de mídia (a mesma
    variável `VIDEOS_DIR` usada por app/main.py e app/transcoding/config.py);
  * `status_midia(video_id)` — o que existe no disco para aquele vídeo;
  * `midia_pronta(video_id)` — atalho booleano usado pelo catálogo.

Nenhuma função faz rede nem levanta exceção por arquivo ausente: mídia que não
existe é informação ("ainda não está pronta"), não erro.
"""
from __future__ import annotations

import os
from pathlib import Path

# Raiz do repositório (este arquivo fica em app/media.py).
RAIZ_PROJETO = Path(__file__).resolve().parent.parent

# Mesmo contrato de app/transcoding/config.py (BASE_VIDEOS) e do mount /videos
# de app/main.py: a pasta que guarda videos/{id}/master.m3u8, playlists,
# segmentos .ts e thumbnail.jpg.
VIDEOS_DIR = Path(os.getenv("VIDEOS_DIR", RAIZ_PROJETO / "videos"))

NOME_MASTER = "master.m3u8"
NOME_THUMBNAIL = "thumbnail.jpg"


def garantir_diretorio() -> Path:
    """Cria a pasta de mídia se ela não existir (StaticFiles exige que exista).

    Em dev ela só é criada na primeira transcodificação — sem isso o mount
    `/videos` derrubava a subida da API.
    """
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    return VIDEOS_DIR


def diretorio_do_video(video_id: str) -> Path:
    """Caminho da pasta `videos/{video_id}/` (não garante que exista)."""
    return garantir_diretorio() / str(video_id)


def caminho_master(video_id: str) -> Path:
    return diretorio_do_video(video_id) / NOME_MASTER


def caminho_thumbnail(video_id: str) -> Path:
    return diretorio_do_video(video_id) / NOME_THUMBNAIL


def master_existe(video_id: str) -> bool:
    """True se o master.m3u8 do vídeo está no disco (é o que o HLS.js toca)."""
    if not video_id:
        return False
    return caminho_master(video_id).is_file()


def contar_segmentos(video_id: str) -> int:
    """Quantos segmentos .ts existem para o vídeo (0 = playlist sem mídia)."""
    pasta = diretorio_do_video(video_id)
    if not pasta.is_dir():
        return 0
    return sum(1 for arquivo in pasta.rglob("*.ts") if arquivo.is_file())


def status_midia(video_id: str) -> dict:
    """Retrato do que existe no disco para um vídeo.

    Usado pelo campo `media_pronta` do catálogo e como base do
    GET /media/{video_id}. O player consulta isso para decidir entre dar play,
    avisar que ainda está transcodificando ou explicar que o arquivo HLS não
    foi encontrado — em vez de ficar tentando um 404 para sempre.

    Barato de propósito (2 `stat`): o /catalogo chama isto para CADA vídeo da
    lista. A contagem de segmentos fica só no detalhe (`status_midia_completo`).
    """
    master = caminho_master(video_id) if video_id else None
    thumbnail = caminho_thumbnail(video_id) if video_id else None
    pronta = bool(master and master.is_file())

    return {
        "video_id": video_id,
        "media_pronta": pronta,
        "master_playlist": pronta,
        "thumbnail": bool(thumbnail and thumbnail.is_file()),
        "diretorio": str(diretorio_do_video(video_id)) if video_id else None,
    }


def status_midia_completo(video_id: str) -> dict:
    """`status_midia` + contagem de segmentos .ts (rota de detalhe/diagnóstico)."""
    status = status_midia(video_id)
    status["segmentos"] = contar_segmentos(video_id)
    return status


def midia_pronta(video_id: str) -> bool:
    """Atalho: o vídeo tem master.m3u8 no disco?"""
    return status_midia(video_id)["media_pronta"]
