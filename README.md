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

## Frontend ↔ Backend (o player conversando com a API)

Com a API no ar (`uvicorn app.main:app --reload`), o backend **também serve o player** — não precisa de outro servidor:

```
http://localhost:8000/player/     ← frontend (player adaptativo)
http://localhost:8000/docs        ← documentação da API (Swagger)
http://localhost:8000/videos/...  ← HLS (master.m3u8, segmentos) e thumbnails
```

### Demo completa de ponta a ponta (recomendado)

Com API + Redis + worker Celery rodando (passos acima), em outro terminal:

```bash
python scripts/demo_completo.py
```

O script gera vídeos de teste com FFmpeg, faz o upload via `POST /upload`, acompanha a transcodificação pelo `GET /status/{video_id}`, registra visualizações e mostra o `/trending` e os `/videos/{id}/relacionados` respondendo com os vídeos reais. No fim, é só abrir **http://localhost:8000/player/** — o player carrega o catálogo da API (seção "Vídeos relacionados" e barra lateral "Próximos vídeos") e **dá play automaticamente no primeiro vídeo transcodificado**.

### Rodando o frontend separado (Live Server, http.server, etc.)

Também funciona: a API tem **CORS liberado para desenvolvimento**, então o player pode ser aberto de outra origem/porta. Nesse caso o `config.js` do player aponta a API para `http://localhost:8000` automaticamente. Para mudar a origem da API, edite `player-adaptativo/player-adaptativo/config.js`.

### Sem Supabase? Sem problema (dev local)

Enquanto o projeto Supabase não existe, o backend cai automaticamente num **banco JSON local** (`data/videos.json`, pasta ignorada pelo Git) — upload, catálogo, status e recomendações funcionam de ponta a ponta sem nenhuma configuração. Quando `SUPABASE_URL`/`SUPABASE_KEY` forem preenchidos no `.env`, o Supabase volta a ser usado sem mudar nenhuma outra linha.

> O Redis continua sendo necessário para a fila do Celery e para o contador de visualizações (`/trending`, `/watch`). `docker compose up -d redis` resolve.

### O fluxo completo da integração

```
POST /upload ──► grava arquivo + metadados (Supabase ou JSON local)
             └─► enfileira processar_upload no Celery (Redis)
                     └─► transcodificar_video (FFmpeg → HLS em videos/{id}/)
                             └─► status completed no Redis E no banco
GET /status/{id} ──► pending → processing → completed   (polling do front)
GET /trending, GET /videos/{id}/relacionados ──► cards do player (hls_url absoluto)
GET /videos/{id}/master.m3u8 ──► HLS.js toca o vídeo adaptativo
POST /watch ──► alimenta o ranking e as recomendações do usuário
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
| O player só mostra os vídeos de demonstração (cards fixos) | A API não está no ar, ou nenhum vídeo foi transcodificado ainda (o catálogo real vem do `/trending` + `/relacionados`) | Suba a API (`uvicorn app.main:app`) e rode `python scripts/demo_completo.py`; abra o console do navegador (F12) para ver os motivos de fallback |
| Player aberto via Live Server não fala com a API | O front está em outra origem (ex: `:5500`) | Já resolvido: a API tem CORS liberado em dev e o `config.js` aponta para `http://localhost:8000`. Confira se o backend está rodando |
| Vídeo tocando mas sem imagem / 404 no `.m3u8` | O arquivo HLS não existe em `videos/{id}/` (transcodificação não terminou ou falhou) | Consulte `GET /status/{video_id}`; se estiver `failed`, veja o log do worker Celery (FFmpeg instalado?) |

## Estrutura de pastas

```
projeto-a3/
├── .github/workflows/ci.yml       # Pipeline: pytest (back) + Jest (player)
├── app/
│   ├── main.py                    # FastAPI: rotas + CORS + /player + /videos
│   ├── upload/                    # POST /upload (salva arquivo e metadados, enfileira)
│   ├── queue/                     # Celery: tasks, broker e status em Redis
│   ├── transcoding/               # FFmpeg: HLS multi-resolução + thumbnail
│   ├── recommendations/           # Jaccard por tags + views (/trending, /relacionados)
│   ├── status/                    # GET /status/{video_id} (Redis, fallback banco)
│   └── database/                  # Supabase + fallback local (data/videos.json)
├── player-adaptativo/player-adaptativo/   # Frontend (HLS.js, servido em /player/)
│   ├── index.html                 # Página do player
│   ├── config.js                  # Origem da API (mesma origem ou localhost:8000)
│   └── js/                        # api.js, catalog.js, player.js, quality.js, ...
├── scripts/
│   ├── demo_completo.py           # Demo E2E: upload → fila → HLS → trending
│   └── gerar_video_teste.py       # Vídeo sintético via FFmpeg
├── uploads/                       # arquivos originais (dev local, fora do git)
├── videos/                        # HLS processado (dev local, fora do git)
├── data/                          # banco JSON local sem Supabase (fora do git)
├── docker-compose.yml             # redis + worker + api
├── Dockerfile
├── requirements.txt
└── .env.example
```

## Equipe

| Integrante | Módulo (branch) |
| --- | --- |
| Rafael | feature/upload-videos |
| Pietro | feature/processamento-assincrono |
| João | feature/transcodificacao |
| Gustavo | feature/recomendacoes |
| Pedro | feature/player-adaptativo |