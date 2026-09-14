# Projeto A3 — Streaming de Vídeo Educacional

Plataforma de streaming de vídeo com processamento assíncrono e qualidade adaptativa, desenvolvida para a disciplina de Garantia e Gestão da Qualidade de Software (ODS 4 — Educação de Qualidade).

## Stack

| Camada | Tecnologia |
| --- | --- |
| API / Backend | Python + FastAPI |
| Processamento assíncrono | Redis + Celery |
| Transcodificação | FFmpeg |
| Streaming | HLS (HTTP Live Streaming) |
| Player | HLS.js + HTML5 Video |
| Banco de dados | Supabase (Postgres gerenciado) |
| Testes | Pytest |
| CI/CD | GitHub Actions |

## Pré-requisitos

**Opção A — via Docker (recomendado):**
- Docker Desktop
- Git

**Opção B — rodando localmente com Python:**
- Python 3.10+
- Docker Desktop (para rodar o Redis)
- FFmpeg instalado no sistema e disponível no PATH — [instruções aqui](https://ffmpeg.org/download.html)
- Git

## Como rodar o projeto — Opção A: via Docker (recomendado)

Essa é a forma mais simples: não precisa instalar Python, criar venv nem instalar nada manualmente — só o Docker.

### 1. Clonar o repositório

```bash
git clone https://github.com/Pietro2820/projeto-a3-Garantia-da-Qualidade-de-Software-2026.2
cd projeto-a3-Garantia-da-Qualidade-de-Software-2026.2
```

### 2. Criar o arquivo `.env`

```bash
cp .env.example .env
```

> **Status atual:** o projeto no Supabase ainda vai ser criado. Por enquanto pode deixar o `.env` vazio mesmo — assim que as credenciais forem compartilhadas com o time, é só preencher `SUPABASE_URL` e `SUPABASE_KEY` nele. **Nunca commite o `.env`**, só o `.env.example` (sem valores) vai pro Git.

### 3. Subir tudo com um comando

Com o Docker Desktop aberto:

```bash
docker compose up --build
```

Isso sobe o Redis e o worker do Celery juntos, dentro de containers. Se der tudo certo, você vai ver nos logs as filas (`uploads`, `transcode`, `notifications`), as tasks disponíveis e uma linha `celery@... ready.`

Pra parar, aperte `Ctrl+C` nesse terminal. Pra rodar em segundo plano (sem travar o terminal), use `docker compose up --build -d`.

## Como rodar o projeto — Opção B: localmente com Python

Use essa opção se quiser rodar o código diretamente na sua máquina (sem container), por exemplo pra debugar mais de perto.

### 1. Clonar o repositório

```bash
git clone https://github.com/Pietro2820/projeto-a3-Garantia-da-Qualidade-de-Software-2026.2
cd projeto-a3-Garantia-da-Qualidade-de-Software-2026.2
```

### 2. Criar e ativar o ambiente virtual

**Windows:**
```bash
python -m venv venv
venv\Scripts\activate
```

**Linux/Mac:**
```bash
python -m venv venv
source venv/bin/activate
```

Você saberá que o ambiente está ativo quando o prompt do terminal começar com `(venv)`.

### 3. Instalar as dependências

```bash
pip install -r requirements.txt
```

### 4. Configurar as variáveis de ambiente

> **Status atual:** o projeto no Supabase ainda vai ser criado. Por enquanto o `.env.example` está vazio — assim que o projeto Supabase existir e as credenciais forem compartilhadas com o time, esse passo passa a valer:

```bash
cp .env.example .env
```

Preencha no `.env`:
```
SUPABASE_URL=...
SUPABASE_KEY=...
```

**Nunca commite o arquivo `.env`** — apenas o `.env.example` (sem valores) vai pro Git.

### 5. Subir o Redis

Com o Docker Desktop aberto:

```bash
docker compose up -d redis
```

Confirme que subiu:
```bash
docker ps
```

### 6. Rodar o worker do Celery

Em um terminal **separado** (com o venv ativado):

```bash
celery -A app.queue.celery_app worker --loglevel=info --pool=solo
```

> ⚠️ **Importante para quem está no Windows:** o Celery usa por padrão um pool de processos (`prefork`) que **não funciona no Windows** rodando localmente — ele trava com erros como `PermissionError: [WinError 5] Acesso negado` e fica derrubando processos filhos em loop. A flag `--pool=solo` faz o worker rodar em um único processo, o que resolve o problema. **Sempre use essa flag no Windows ao rodar localmente.** Dentro do Docker (Opção A) isso não é necessário, porque o container roda em Linux.

Se subiu certo, você deve ver as filas listadas (`uploads`, `transcode`, `notifications`) e as tasks disponíveis, terminando com uma linha `celery@... ready.`

### 7. Rodar a API

Em outro terminal (venv ativado):

```bash
uvicorn app.main:app --reload
```

### 8. Rodar os testes

```bash
pytest -v
```

## Testando se o Celery está funcionando (task de exemplo)

Com o worker rodando (seja pela Opção A ou B), abra **outro terminal**. Se estiver na Opção B, ative o venv nele também. Entre no shell do Python:

```bash
python
```

Dentro do shell:

```python
from app.queue.tasks import hello_world
resultado = hello_world.delay()
resultado.get(timeout=10)
```

Se tudo estiver certo, isso retorna `'pong'` e o terminal do worker (seja o log do `docker compose up` ou o terminal local) mostra a task sendo recebida e concluída (`received` → `succeeded`).

## Problemas comuns

| Erro | Causa provável | Solução |
| --- | --- | --- |
| `'celery' não é reconhecido como um comando` | O ambiente virtual não está ativado nesse terminal (Opção B) | Rode `venv\Scripts\activate` (Windows) ou `source venv/bin/activate` (Linux/Mac) antes |
| `O sistema não pode encontrar o caminho especificado` ao ativar o venv | A pasta `venv` não existe ainda | Rode `python -m venv venv` primeiro |
| `PermissionError: [WinError 5] Acesso negado` ao subir o worker localmente | Pool `prefork` do Celery não funciona no Windows | Suba o worker com `--pool=solo` (só necessário na Opção B) |
| Worker sobe mas a task nunca retorna | Redis não está rodando, ou está numa porta diferente | Confirme com `docker ps` que o Redis está ativo na porta 6379 |
| `env file ... not found` ao rodar `docker compose up` | Falta o arquivo `.env` na raiz do projeto | Rode `cp .env.example .env` (pode ficar vazio por enquanto) |
| `Cannot connect to redis://localhost:6379` dentro do container | Dentro do Docker, `localhost` aponta para o próprio container, não para o serviço do Redis | Já está resolvido no `docker-compose.yml` (usa `redis://redis:6379`); se acontecer de novo, confira se as variáveis `CELERY_BROKER_URL`/`CELERY_RESULT_BACKEND` do serviço `celery-worker` apontam para `redis`, não `localhost` |

## Estrutura de pastas

**Planejada** (destino final, conforme a documentação técnica do projeto — cada branch vai preenchendo a sua parte):

```
projeto-a3/
├── .github/workflows/ci.yml      # Pipeline de testes (Pietro) — ainda não criado
├── app/
│   ├── upload/                   # feature/upload-videos (Rafael) — ainda não criado
│   ├── transcoding/               # feature/transcodificacao (João) — ainda não criado
│   ├── queue/                     # feature/processamento-assincrono (Pietro)
│   ├── recommendations/           # feature/recomendacoes (Gustavo) — ainda não criado
│   └── database/                  # cliente Supabase e queries (Pietro) — ainda não criado
├── frontend/player/               # feature/player-adaptativo (Pedro) — ainda não criado
├── uploads/                        # arquivos originais (dev local) — ainda não criado
├── videos/                         # arquivos processados/HLS (dev local) — ainda não criado
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
├── .env.example
└── README.md
```

**O que existe hoje no repo:** a pasta `app/queue/` (celery_app.py, tasks.py e tests/), com o Celery+Redis já funcionando localmente e via Docker, e a pasta `app/database/` já criada (com `__init__.py`, ainda vazia — aguardando a conexão com o Supabase). Também já existem `docker-compose.yml`, `Dockerfile` e `requirements.txt` na raiz. O resto da estrutura ainda vai sendo criado conforme cada branch avança.

## Equipe

| Integrante | Módulo (branch) |
| --- | --- |
| Rafael | feature/upload-videos |
| Pietro | feature/processamento-assincrono |
| João | feature/transcodificacao |
| Gustavo | feature/recomendacoes |
| Pedro | feature/player-adaptativo |