import io

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.upload import router

client = TestClient(app)


@pytest.fixture(autouse=True)
def configurar_testes(tmp_path, monkeypatch):
    monkeypatch.setattr(router, "UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(router, "MAX_SIZE", 1024 * 1024)
    monkeypatch.setattr(router, "save_metadata", lambda metadata: metadata)
    # Isola a fila: testes unitários não publicam tasks no broker real.
    monkeypatch.setattr(router, "_enfileirar_processamento",
                        lambda video_id, file_path: "enfileirado")


def dados_validos():
    return {
        "titulo": "Introdução à Matemática",
        "autor": "Rafael",
        "descricao": "Vídeo sobre frações",
        "tags": "educação, matemática, frações",
        "categoria": "Ensino Fundamental",
    }


def test_upload_formato_valido():
    arquivo = io.BytesIO(b"conteudo falso de video")

    response = client.post(
        "/upload",
        files={"file": ("video.mp4", arquivo, "video/mp4")},
        data=dados_validos(),
    )

    assert response.status_code == 200

    body = response.json()
    assert "video_id" in body
    assert body["status"] == "pending"
    assert body["message"] == "Upload recebido com sucesso"


def test_arquivo_e_salvo_na_pasta_correta(tmp_path):
    arquivo = io.BytesIO(b"conteudo falso de video")

    response = client.post(
        "/upload",
        files={"file": ("video.mp4", arquivo, "video/mp4")},
        data=dados_validos(),
    )

    assert response.status_code == 200

    video_id = response.json()["video_id"]
    caminho_esperado = tmp_path / video_id / "original.mp4"

    assert caminho_esperado.exists()


def test_upload_formato_invalido():
    arquivo = io.BytesIO(b"texto simples")

    response = client.post(
        "/upload",
        files={"file": ("texto.txt", arquivo, "text/plain")},
        data=dados_validos(),
    )

    assert response.status_code == 400


def test_upload_acima_do_tamanho_maximo(monkeypatch):
    monkeypatch.setattr(router, "MAX_SIZE", 10)

    arquivo = io.BytesIO(b"0123456789123456789")

    response = client.post(
        "/upload",
        files={"file": ("video.mp4", arquivo, "video/mp4")},
        data=dados_validos(),
    )

    assert response.status_code == 400


def test_upload_sem_titulo():
    dados = dados_validos()
    dados.pop("titulo")

    arquivo = io.BytesIO(b"conteudo falso de video")

    response = client.post(
        "/upload",
        files={"file": ("video.mp4", arquivo, "video/mp4")},
        data=dados,
    )

    assert response.status_code == 422


def test_upload_sem_autor():
    dados = dados_validos()
    dados.pop("autor")

    arquivo = io.BytesIO(b"conteudo falso de video")

    response = client.post(
        "/upload",
        files={"file": ("video.mp4", arquivo, "video/mp4")},
        data=dados,
    )

    assert response.status_code == 422


def test_upload_com_titulo_vazio():
    dados = dados_validos()
    dados["titulo"] = "   "

    arquivo = io.BytesIO(b"conteudo falso de video")

    response = client.post(
        "/upload",
        files={"file": ("video.mp4", arquivo, "video/mp4")},
        data=dados,
    )

    assert response.status_code == 400


def test_upload_com_autor_vazio():
    dados = dados_validos()
    dados["autor"] = "   "

    arquivo = io.BytesIO(b"conteudo falso de video")

    response = client.post(
        "/upload",
        files={"file": ("video.mp4", arquivo, "video/mp4")},
        data=dados,
    )

    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Integração upload → fila → status (a "conversa" com o frontend)
# ---------------------------------------------------------------------------

def test_resposta_inclui_fila_e_status_url():
    """O front usa status_url para acompanhar o processamento via polling."""
    arquivo = io.BytesIO(b"conteudo falso de video")

    response = client.post(
        "/upload",
        files={"file": ("video.mp4", arquivo, "video/mp4")},
        data=dados_validos(),
    )

    body = response.json()
    assert body["fila"] == "enfileirado"
    assert body["status_url"] == f"/status/{body['video_id']}"


def test_processamento_e_enfileirado_com_video_id_e_caminho(tmp_path, monkeypatch):
    chamadas = []
    monkeypatch.setattr(
        router, "_enfileirar_processamento",
        lambda video_id, file_path: chamadas.append((video_id, file_path)) or "enfileirado",
    )

    arquivo = io.BytesIO(b"conteudo falso de video")
    response = client.post(
        "/upload",
        files={"file": ("video.mp4", arquivo, "video/mp4")},
        data=dados_validos(),
    )

    video_id = response.json()["video_id"]
    assert chamadas == [(video_id, str(tmp_path / video_id / "original.mp4"))]


def test_broker_fora_do_ar_nao_derruba_o_upload(monkeypatch):
    """Fila indisponível: o upload continua válido, só avisa em 'fila'."""
    def _fila_indisponivel(video_id, file_path):
        return "indisponivel"

    monkeypatch.setattr(router, "_enfileirar_processamento", _fila_indisponivel)

    arquivo = io.BytesIO(b"conteudo falso de video")
    response = client.post(
        "/upload",
        files={"file": ("video.mp4", arquivo, "video/mp4")},
        data=dados_validos(),
    )

    assert response.status_code == 200
    assert response.json()["fila"] == "indisponivel"


def test_banco_indisponivel_devolve_503_com_orientacao(monkeypatch):
    """Tabela 'videos' não criada (ou credencial errada) não pode virar 500."""
    def _boom(metadata):
        raise Exception("relation public.videos does not exist")

    monkeypatch.setattr(router, "save_metadata", _boom)

    arquivo = io.BytesIO(b"conteudo falso de video")
    response = client.post(
        "/upload",
        files={"file": ("video.mp4", arquivo, "video/mp4")},
        data=dados_validos(),
    )

    assert response.status_code == 503
    assert "schema.sql" in response.json()["detail"]


# ---------------------------------------------------------------------------
# _enfileirar_processamento — a ponte REAL entre o upload e a fila Celery
# (correção A1 da avaliação: este era o único trecho novo da branch sem teste
# — linhas 64-79 do router, justamente o código crítico da integração)
#
# A fixture autouse substitui `_enfileirar_processamento` para isolar os
# testes de rota da fila; aqui exercitamos a função ORIGINAL, capturada no
# import do módulo, dublando os pontos de integração (set_status e a task).
# ---------------------------------------------------------------------------

import types  # noqa: E402

from app.upload.router import _enfileirar_processamento as funcao_real  # noqa: E402
from app.upload.router import save_metadata as save_metadata_real  # noqa: E402


def test_enfileirar_publica_a_task_e_devolve_enfileirado(monkeypatch):
    """Caminho feliz: status 'pending' no Redis + task publicada no broker."""
    chamadas = []

    monkeypatch.setattr(
        "app.queue.status_store.set_status",
        lambda video_id, status, **_: chamadas.append(("status", video_id, status)),
    )
    monkeypatch.setattr(
        "app.queue.tasks.processar_upload",
        types.SimpleNamespace(
            delay=lambda video_id, caminho: chamadas.append(("task", video_id, caminho))
        ),
    )

    resultado = funcao_real("abc-123", "/uploads/abc-123/original.mp4")

    assert resultado == "enfileirado"
    assert ("status", "abc-123", "pending") in chamadas
    assert ("task", "abc-123", "/uploads/abc-123/original.mp4") in chamadas
    # A task só é publicada DEPOIS do status pending (o front que pollar no
    # intervalo não vê um vídeo sem estado nenhum).
    assert chamadas[0][0] == "status"


def test_enfileirar_com_broker_fora_devolve_indisponivel(monkeypatch):
    """Broker fora do ar: a função NÃO levanta — devolve 'indisponivel' e a
    rota converte isso na resposta que o front usa para avisar o usuário."""

    def _delay_quebrado(video_id, caminho):
        raise ConnectionError("redis fora do ar")

    monkeypatch.setattr(
        "app.queue.status_store.set_status", lambda *args, **kwargs: None
    )
    monkeypatch.setattr(
        "app.queue.tasks.processar_upload",
        types.SimpleNamespace(delay=_delay_quebrado),
    )

    assert funcao_real("abc-123", "/x.mp4") == "indisponivel"


def test_enfileirar_com_redis_fora_ainda_publica_a_task(monkeypatch):
    """Redis caiu: o status 'pending' não é registrado, mas a publicação da
    task é a parte que IMPORTA — a transcodificação não pode parar por causa
    do contador de status."""

    def _redis_fora(*args, **kwargs):
        raise ConnectionError("redis indisponível")

    publicado = []
    monkeypatch.setattr("app.queue.status_store.set_status", _redis_fora)
    monkeypatch.setattr(
        "app.queue.tasks.processar_upload",
        types.SimpleNamespace(delay=lambda v, p: publicado.append((v, p))),
    )

    resultado = funcao_real("abc-123", "/x.mp4")

    assert resultado == "enfileirado"
    assert publicado == [("abc-123", "/x.mp4")]


def test_enfileirar_nunca_propaga_excecao_para_a_rota(monkeypatch):
    """Se AMBOS os serviços caírem, a função continua devolvendo uma string —
    o upload já salvou o arquivo e os metadados: a fila não derruba a rota."""

    monkeypatch.setattr(
        "app.queue.status_store.set_status",
        lambda *a, **k: (_ for _ in ()).throw(ConnectionError("redis")),
    )
    monkeypatch.setattr(
        "app.queue.tasks.processar_upload",
        types.SimpleNamespace(
            delay=lambda *a, **k: (_ for _ in ()).throw(ConnectionError("broker"))
        ),
    )

    resultado = funcao_real("abc-123", "/x.mp4")

    assert resultado == "indisponivel"


# ---------------------------------------------------------------------------
# Peças auxiliares do router (linhas que a fixture autouse não exercita)
# ---------------------------------------------------------------------------

def test_parse_tags_com_string_vazia_devolve_lista_vazia():
    assert router.parse_tags("") == []
    assert router.parse_tags("   ") == []


def test_parse_tags_remove_espacos_e_vazios():
    assert router.parse_tags(" a , , b ,c") == ["a", "b", "c"]


def test_save_metadata_delega_para_inserir_video(monkeypatch):
    """save_metadata é o ponto único de persistência do upload — ele deve
    repassar o dicionário integralmente (o fallback Supabase→JSON mora em
    inserir_video, não aqui).

    A função ORIGINAL é restaurada aqui: a fixture autouse substitui
    save_metadata para isolar a rota do banco, e este teste exercita ela
    de verdade (dublando apenas inserir_video)."""
    recebido: dict = {}
    monkeypatch.setattr(router, "save_metadata", save_metadata_real)
    monkeypatch.setattr(
        router, "inserir_video",
        lambda metadata: (recebido.update(metadata), metadata)[1],
    )

    metadata = {"video_id": "abc-123", "titulo": "Aula", "tags": ["x"]}
    resultado = router.save_metadata(metadata)

    assert resultado == metadata
    assert recebido == metadata
