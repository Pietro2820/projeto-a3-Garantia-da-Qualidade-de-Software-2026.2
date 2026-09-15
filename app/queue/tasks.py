from app.queue.celery_app import celery_app


@celery_app.task(name="app.queue.tasks.hello_world")
def hello_world():
    """Task de exemplo pra validar que Celery + Redis estão funcionando."""
    return "pong"


@celery_app.task(
    name="app.queue.tasks.transcodificar_video",
    bind=True,
    max_retries=3,
    default_retry_delay=60,  # 1 min na primeira tentativa
)
def transcodificar_video(self, video_id: str, caminho_original: str):
    """
    Contrato combinado com o João:
    entrada -> video_id, caminho do arquivo original
    saida   -> status (completed/failed) + caminho dos arquivos HLS gerados
    """
    try:
        # Aqui entra a chamada real pro serviço de transcodificação do João
        # resultado = transcoding_service.processar(video_id, caminho_original)
        resultado = {"status": "completed", "caminho_hls": f"/videos/{video_id}/master.m3u8"}
        return resultado
    except Exception as exc:
        # backoff exponencial: 1min, 5min, 15min
        backoff = [60, 300, 900]
        atraso = backoff[min(self.request.retries, len(backoff) - 1)]
        raise self.retry(exc=exc, countdown=atraso)


@celery_app.task(name="app.queue.tasks.processar_upload")
def processar_upload(video_id: str, caminho_arquivo: str):
    """Dispara a etapa de transcodificação após validar o upload."""
    transcodificar_video.delay(video_id, caminho_arquivo)
    return {"video_id": video_id, "status": "processing"}


@celery_app.task(name="app.queue.tasks.notificar_status")
def notificar_status(video_id: str, status: str):
    """Placeholder para notificações (ex: WebSocket, e-mail) quando o status muda."""
    return {"video_id": video_id, "status": status}