from fastapi import APIRouter, HTTPException

from app.queue.status_store import get_status

router = APIRouter()

@router.get("/status/{video_id}")
def consultar_status(video_id: str):
    status = get_status(video_id)
    if status is None:
        raise HTTPException(status_code=404, detail="video_id não encontrado")
    return status