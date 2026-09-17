from fastapi import FastAPI

from app.upload.router import router as upload_router
from app.status.router import router as status_router

app = FastAPI(
    title="Plataforma de Vídeo Educacional",
    description="API para upload, processamento e recomendação de vídeos educacionais.",
)

app.include_router(upload_router)
app.include_router(status_router)


@app.get("/")
def health():
    return {
        "status": "ok",
        "modulo": "upload"
    }