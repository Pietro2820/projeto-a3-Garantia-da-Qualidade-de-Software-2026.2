"""Configuração global do pytest — isolamento de serviços externos.

Camada extra de blindagem (a primeira é o `app/__init__.py`, que não carrega
o `.env` sob pytest): mesmo sem `.env`, variáveis exportadas no SHELL do
desenvolvedor ou herdadas de outra ferramenta (ex.: `AWS_ENDPOINT_URL` de um
MinIO local, `SUPABASE_URL` de outro projeto) vazariam para `os.environ` e
mudariam o comportamento de módulos que leem `os.getenv` — storage S3,
client Supabase, task_adapter (ENABLE_S3) — além de confundir o moto.

A fixture abaixo é `autouse`: remove essas variáveis ANTES de cada teste.
Quem precisa de um valor usa `monkeypatch.setenv` dentro do próprio teste —
a ordem de execução do pytest garante que o setenv do teste vence a limpeza.
"""
import pytest

VARIAIS_SERVICOS_EXTERNOS = (
    # Supabase (banco/storage)
    "SUPABASE_URL",
    "SUPABASE_KEY",
    # S3 / MinIO / Supabase Storage
    "ENABLE_S3",
    "S3_BUCKET",
    "S3_PUBLIC_URL",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_ENDPOINT_URL",
    "AWS_REGION",
    "AWS_DEFAULT_REGION",
)


@pytest.fixture(autouse=True)
def isolar_servicos_externos(monkeypatch):
    """Nenhum teste herda credenciais/endpoints reais do ambiente."""
    for variavel in VARIAIS_SERVICOS_EXTERNOS:
        monkeypatch.delenv(variavel, raising=False)
