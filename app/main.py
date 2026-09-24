"""
Ponto de entrada da API — Plataforma de Vídeo Educacional.

Além de registrar as rotas dos módulos (upload, status, recomendações), este
arquivo resolve a INTEGRAÇÃO com o frontend (player adaptativo):

  1. CORS liberado para desenvolvimento — sem isso, quando o player é aberto
     de outra origem (Live Server na :5500, `python -m http.server`, etc.), o
     navegador BLOQUEIA todos os `fetch` para a API e o front só mostra os
     vídeos de demonstração.
  2. `/videos` serve os arquivos gerados pela transcodificação (master.m3u8,
     playlists, segmentos .ts e thumbnails). A API devolve `hls_url` e
     `thumbnail_url` apontando para cá — antes esses arquivos existiam só no
     disco e nenhuma rota os entregava, então o player nunca dava play.
  3. `/player` serve o frontend direto do backend (mesma origem — a forma mais
     simples de rodar tudo: `uvicorn app.main:app` e abrir
     http://localhost:8000/player/).
"""
import mimetypes
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.upload.router import router as upload_router
from app.status.router import router as status_router
from app.recommendations.router import router as recommendations_router

# O Starlette descobre o Content-Type pelo módulo `mimetypes` do Python, que
# não conhece .m3u8/.ts em todas as versões. Sem o tipo correto alguns players
# se recusam a carregar a playlist — registramos explicitamente.
mimetypes.add_type("application/vnd.apple.mpegurl", ".m3u8")
mimetypes.add_type("video/mp2t", ".ts")

# Mesmas variáveis usadas pelos módulos de upload/transcodificação.
VIDEOS_DIR = Path(os.getenv("VIDEOS_DIR", "videos"))
PLAYER_DIR = Path(os.getenv("PLAYER_DIR", "player-adaptativo/player-adaptativo"))

app = FastAPI(
    title="Plataforma de Vídeo Educacional",
    description="API para upload, processamento e recomendação de vídeos educacionais.",
)

# CORS permissivo: o projeto é educacional e roda em localhost. Se um dia for
# publicado, troque allow_origins pelos domínios reais do front.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router)
app.include_router(status_router)
app.include_router(recommendations_router)


@app.get("/")
def health():
    return {
        "status": "ok",
        "rotas": ["/upload", "/status/{video_id}", "/videos/{video_id}/relacionados",
                  "/recomendacoes/{user_id}", "/trending", "/watch"],
        "player": "/player/",
    }


# ---------------------------------------------------------------------------
# Arquivos estáticos — registrados DEPOIS das rotas para não engolir
# /videos/{video_id}/relacionados (no Starlette a ordem de registro importa).
# ---------------------------------------------------------------------------

# Garante que a pasta exista: StaticFiles levanta erro na inicialização se o
# diretório não existir (e em dev ela só é criada na primeira transcodificação).
VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/videos", StaticFiles(directory=str(VIDEOS_DIR)), name="midia")

# O player vem junto no repositório; se a pasta não estiver presente (ex: o
# backend foi copiado para outro lugar), a API continua funcionando sem o mount.
if PLAYER_DIR.is_dir():
    app.mount("/player", StaticFiles(directory=str(PLAYER_DIR), html=True), name="player")
