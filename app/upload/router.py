import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

router = APIRouter()

ALLOWED_EXTENSIONS = {".mp4", ".avi", ".mov", ".webm"}

# 500MB
MAX_SIZE = 500 * 1024 * 1024

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))


def parse_tags(tags: str) -> list[str]:
    """
    Recebe uma string separada por vírgula e transforma em lista.

    Exemplo:
    "educação, matemática" vira ["educação", "matemática"]
    """
    if not tags:
        return []

    return [tag.strip() for tag in tags.split(",") if tag.strip()]


def save_metadata(metadata: dict):
    """
    Por enquanto apenas simula o salvamento no Supabase.

    Depois vamos trocar isso por:
    supabase.table("videos").insert(metadata).execute()
    """
    return metadata


@router.post("/upload")
async def upload_video(
    file: UploadFile = File(...),
    titulo: str = Form(...),
    autor: str = Form(...),
    descricao: str = Form(""),
    tags: str = Form(""),
    categoria: str = Form(""),
):
    filename = file.filename or ""
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Formato inválido. Use mp4, avi, mov ou webm.",
        )

    # Verifica tamanho do arquivo
    file.file.seek(0, os.SEEK_END)
    size = file.file.tell()
    file.file.seek(0)

    if size > MAX_SIZE:
        raise HTTPException(
            status_code=400,
            detail="Arquivo excede o tamanho máximo de 500MB.",
        )

    if not titulo.strip():
        raise HTTPException(
            status_code=400,
            detail="O título é obrigatório.",
        )

    if not autor.strip():
        raise HTTPException(
            status_code=400,
            detail="O autor é obrigatório.",
        )

    video_id = str(uuid.uuid4())

    video_folder = UPLOAD_DIR / video_id
    video_folder.mkdir(parents=True, exist_ok=True)

    file_path = video_folder / f"original{extension}"

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    metadata = {
        "video_id": video_id,
        "titulo": titulo.strip(),
        "descricao": descricao.strip(),
        "tags": parse_tags(tags),
        "categoria": categoria.strip(),
        "autor": autor.strip(),
        "criado_em": datetime.now(timezone.utc).isoformat(),
        "status": "pending",
    }

    save_metadata(metadata)

    return {
        "video_id": video_id,
        "status": "pending",
        "message": "Upload recebido com sucesso",
        "file_path": str(file_path),
    }