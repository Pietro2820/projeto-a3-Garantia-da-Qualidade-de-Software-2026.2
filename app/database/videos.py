from app.database.client import get_client

TABLE = "videos"


def criar_video(titulo: str, descricao: str = None, tags: str = None,
                 categoria: str = None, autor: str = None) -> dict:
    """
    Insere um novo registro na tabela videos.
    status e criado_em usam os valores default definidos no banco
    (status='pending', criado_em=now()).
    Retorna o registro criado (incluindo o video_id gerado).
    """
    client = get_client()
    payload = {
        "titulo": titulo,
        "descricao": descricao,
        "tags": tags,
        "categoria": categoria,
        "autor": autor,
    }
    response = client.table(TABLE).insert(payload).execute()
    return response.data[0]


def buscar_video(video_id: str) -> dict | None:
    """
    Busca um vídeo pelo video_id. Retorna None se não encontrar.
    """
    client = get_client()
    response = client.table(TABLE).select("*").eq("video_id", video_id).execute()
    if not response.data:
        return None
    return response.data[0]


def atualizar_status(video_id: str, status: str) -> dict:
    """
    Atualiza o status de um vídeo (pending, processing, completed, failed).
    Usada pelas tasks do Celery para refletir o progresso do processamento.
    """
    client = get_client()
    response = (
        client.table(TABLE)
        .update({"status": status})
        .eq("video_id", video_id)
        .execute()
    )
    return response.data[0]


def listar_videos(status: str = None) -> list[dict]:
    """
    Lista vídeos, opcionalmente filtrando por status.
    """
    client = get_client()
    query = client.table(TABLE).select("*")
    if status:
        query = query.eq("status", status)
    response = query.execute()
    return response.data