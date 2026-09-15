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