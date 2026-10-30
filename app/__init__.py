"""
Pacote da aplicação.

Efeito colateral proposital no import: carrega o arquivo `.env` da raiz do
projeto (se existir) para o `os.environ`, SEM sobrescrever variáveis já
definidas (Docker/compose/CI/export manual continuam vencendo).

Por que aqui: em dev local (Opção B do README) ninguém exporta variável na
mão no Windows — o `.env` preenchido com as credenciais do Supabase passa a
valer assim que qualquer módulo do pacote `app` é importado (uvicorn, celery
e scripts). Em produção o compose já injeta via `env_file`, e este loader
vira um no-op.

EXCEÇÃO — pytest: sob testes o `.env` real do desenvolvedor NÃO é carregado.
Ele vazava credenciais (SUPABASE_URL, S3_PUBLIC_URL, ENABLE_S3,
AWS_ENDPOINT_URL...) para o `os.environ` e quebrava testes herméticos:
`url_publica` passava a derivar do S3 de produção, `ENABLE_S3=true` fazia o
task_adapter tentar upload REAL (status virava "failed"), e o endpoint com
prefixo de caminho confundia o moto (CreateBucket estourava ClientError).
Teste é teste: ambiente limpo, e cada teste que precisa de variável usa
`monkeypatch.setenv`. O conftest.py da raiz reforça essa blindagem.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


def carregar_dotenv(caminho: Path | None = None) -> int:
    """Lê um .env simples (CHAVE=valor) e devolve quantas variáveis entraram.

    Regras: linhas vazias/comentário são ignoradas; aspas externas removidas;
    variável já presente no ambiente NÃO é sobrescrevida (setdefault).
    """
    arquivo = Path(caminho) if caminho else Path(".env")
    if not arquivo.is_file():
        return 0

    carregadas = 0
    for linha in arquivo.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, _, valor = linha.partition("=")
        chave = chave.strip()
        valor = valor.strip().strip('"').strip("'")
        if not chave:
            continue
        if chave not in os.environ:
            os.environ[chave] = valor
            carregadas += 1
    return carregadas


def rodando_sob_pytest() -> bool:
    """True quando quem importa o pacote é o pytest (testes não usam .env)."""
    return "pytest" in sys.modules


if not rodando_sob_pytest():
    carregar_dotenv()
