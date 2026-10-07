# Player Adaptativo — EduStream

Módulo `feature/player-adaptativo` da plataforma de streaming de vídeo educacional.

## O que já está implementado

- Player HTML5.
- HLS.js **vendalizado** (`vendor/hls.min.js`, versão fixada 1.6.13) — funciona offline, sem depender de CDN.
- Reprodução de `.m3u8`.
- Adaptive Bitrate Streaming.
- Modo automático de qualidade.
- Seleção manual de qualidade.
- Play/pause.
- Volume/mute.
- Barra de progresso.
- Fullscreen.
- Picture-in-Picture.
- Velocidade de reprodução.
- Atalhos de teclado.
- Tratamento de erros HLS.
- Tentativa automática em erro de rede.
- Alerta de conexão instável.
- Layout responsivo.
- Página de vídeo estilo plataforma de streaming.
- Cards de vídeos relacionados.
- Integração com a API FastAPI (`js/api.js` + `js/catalog.js`): o catálogo e a
  URL de cada stream (`hls_url`) vêm do **banco de dados** — não existe URL de
  vídeo escrita no JavaScript.
- Diagnóstico de reprodução: quando o play falha o player consulta
  `GET /status/{id}` e `GET /media/{id}` e explica o motivo (ainda
  transcodificando / processamento falhou / master.m3u8 ausente / API fora do
  ar) em vez de ficar repetindo a requisição.
- Tentativas de rede limitadas (3) — sem loop infinito de retry em 404.
- Busca funcional nas duas páginas (`home.html?q=...` ⇄ `index.html?video=...`).
- Menu de perfil (👤): identifica quem assiste (nome em `localStorage`, ou
  anônimo estável) e lista as recomendações personalizadas de
  `GET /recomendacoes/{user_id}`.
- Selo de duração no card vindo do banco (`duracao_segundos`, medido pelo
  ffprobe na transcodificação) e thumbnail padrão quando a do vídeo não existe.
- Upload acompanhado por **SSE** (`GET /status/{id}/stream`), com volta
  automática ao polling se o stream não estiver disponível.

## Testes automatizados

```bash
npm install     # primeira vez
npm test        # 266 testes (Jest + jsdom)
npm test -- --coverage
```

Não é preciso backend, Redis nem servidor HLS no ar: o `fetch` é dublado e o
`<video>` é substituído por um dublê (jsdom não decodifica mídia).

**Exceção:** `tests/e2e.player-api.test.js` fala com a API **de verdade** (e usa
o `vendor/hls.min.js` real). Ele se auto-ignora quando o backend está fora do
ar. Para exercitá-lo:

```bash
# terminal 1 — na raiz do repositório
uvicorn app.main:app --reload
python scripts/seed_e2e.py          # publica o cenário (1 pronto, 1 sem mídia, 1 processando)

# terminal 2 — nesta pasta
npm test -- tests/e2e.player-api.test.js
```

| Arquivo | O que cobre |
|---|---|
| `tests/controls.test.js` | play/pause, seek com limite nas bordas, volume, atalhos, fullscreen/PiP, `formatTime` |
| `tests/catalog.test.js` | tradução API → card e o fallback quando o backend falha |
| `tests/quality.manager.test.js` | troca de qualidade, níveis inválidos, detecção de travamento |
| `tests/api.test.js` | rotas do contrato, encode de parâmetros, erro por status HTTP |
| `tests/recommendations.render.test.js` | renderização dos cards e escaping de HTML (XSS) |
| `tests/player.bootstrap.test.js` | carrega o `index.html` real e verifica que a página sobe |
| `tests/vendor.test.js` | HLS.js local: hash fixado, licença, e que a lib carrega sem internet |
| `tests/usuario.test.js` · `perfil.test.js` | identidade do usuário (localStorage, anônimo estável, storage bloqueado) e o menu 👤 |
| `tests/upload-stream.test.js` | acompanhamento por SSE e o fallback para polling |
| `tests/player.resiliencia.test.js` | 404 sem loop de retry, vídeo transcodificando, limite de tentativas de rede, card sem stream, `/watch` só para vídeo real |
| `tests/config-real.test.js` | evalua o `config.js` e o `vendor/hls.min.js` **de verdade** (pega erro de sintaxe/config que os dublês escondem) |
| `tests/config-outra-origem.test.js` | `config.js` com o front em `:5500` (Live Server) apontando a API para `:8000` |
| `tests/e2e.player-api.test.js` | integração real: API FastAPI no ar + HLS.js vendalizado (ignora sem backend) |
| `tests/home.busca-url.test.js` | home aberta já com `?q=` aplicado |
| `tests/player.test.js` · `quality.test.js` · `recommendations.test.js` | testes de referência originais do módulo |

## Biblioteca de terceiros

O HLS.js fica em `vendor/`, versionado no repositório. Antes vinha de
`cdn.jsdelivr.net` — sem internet, ou com a rede da instituição bloqueando CDN,
o player não carregava.

Detalhes de versão, licença (Apache-2.0), checksum SHA-256 e como atualizar:
[`vendor/README.md`](./vendor/README.md).

## Como testar

A página usa módulos JavaScript. Não abra `index.html` diretamente com `file://`.

No VS Code, uma opção simples é usar a extensão Live Server.

Ou, com Python:

```bash
python -m http.server 5500
```

e acesse http://localhost:5500 (o `config.js` aponta a API para
`http://localhost:8000` automaticamente nesse caso).

**Recomendado**, porém, é deixar o próprio backend servir o player — mesma
origem, sem CORS e sem servidor extra:

```bash
uvicorn app.main:app --reload
# home:     http://localhost:8000/player/home.html
# player:   http://localhost:8000/player/
```

## De onde vem o vídeo (importante)

**Nenhuma URL de vídeo fica no JavaScript.** A ordem de resolução em
`js/player.js` é:

| Prioridade | Fonte | Quando acontece |
| --- | --- | --- |
| 1 | `index.html?video={id}` → `GET /catalogo/{id}` | clique num card da home |
| 2 | `PLAYER_CONFIG.VIDEO_ID` (config.js) | override de desenvolvimento |
| 3 | `PLAYER_CONFIG.HLS_URL` (config.js) | só para testar o player isolado do backend |
| 4 | primeiro vídeo de `GET /catalogo?prontos=1` | abertura direta de `/player/` |

`USER_ID` (quem assiste, enviado no `POST /watch`) vem de `js/usuario.js`: o
nome salvo no menu 👤, ou `PLAYER_CONFIG.USER_ID`, ou um anônimo estável por
navegador.

Em todos os casos quem diz a URL do stream é a **API**, que monta
`videos/{video_id}/master.m3u8` a partir do registro do banco (Supabase ou
`data/videos.json`) e ainda informa `media_pronta` — se o arquivo HLS existe
mesmo no disco.

`config.js` só configura a **origem da API** (e o `USER_ID` do `/watch`). Ele
detecta sozinho quando o player está sendo servido pelo próprio backend
(`/player/`) e usa a mesma origem — zero CORS, zero configuração.

### Vídeo não toca? A resposta está em duas rotas

```bash
curl http://localhost:8000/status/{video_id}   # pending | processing | completed | failed
curl http://localhost:8000/media/{video_id}    # media_pronta, master_playlist, segmentos, thumbnail
```

O player consulta as duas automaticamente quando o play falha e mostra o
motivo na tela (por isso o antigo "loop de retry num 404" não acontece mais).

### Publicar vídeos para testar

```bash
python scripts/demo_completo.py   # fluxo completo: upload → fila → FFmpeg → HLS
python scripts/seed_e2e.py        # cenário de teste do player (não precisa de Redis/worker)
```

Ou pela interface: home → **Enviar vídeo** (modal faz o `POST /upload` e
acompanha o `GET /status/{id}` até concluir).

## Contratos do projeto

O backend do projeto possui os seguintes contratos documentados:

- `GET /status/{video_id}` — pending · processing · completed · failed
- `GET /status/{video_id}/stream` — **novo**: o mesmo progresso via SSE (usado
  pelo modal de upload; o front cai em polling se não houver EventSource)
- `GET /media/{video_id}` — **novo**: `media_pronta`, `master_playlist`,
  `thumbnail`, `segmentos` (o que existe no disco para o vídeo)
- `GET /catalogo?q=&prontos=1` — **novo**: grade da home; `prontos=1` filtra os
  vídeos que têm master.m3u8 (os que tocam de verdade)
- `GET /catalogo/{video_id}` — metadado de um vídeo (a watch page abre com ele)
- `GET /videos/{id}/relacionados`
- `GET /recomendacoes/{user_id}`
- `GET /trending`
- `POST /watch`

Toda resposta de vídeo vem enriquecida com o que o card precisa:

```jsonc
{
  "video_id": "…", "titulo": "…", "tags": ["…"], "autor": "…", "criado_em": "…",
  "views": 12,
  "media_pronta": true,                                  // ← existe master.m3u8?
  "hls_url": "http://host:8000/videos/{id}/master.m3u8",  // absoluta (CORS/Live Server)
  "thumbnail_url": "http://host:8000/videos/{id}/thumbnail.jpg"
}
```

Os vídeos processados seguem a estrutura:

```text
/videos/{video_id}/master.m3u8
/videos/{video_id}/{resolucao}/playlist.m3u8
/videos/{video_id}/{resolucao}/segment_NNN.ts
/videos/{video_id}/thumbnail.jpg
```

## Próximas integrações

Já feitas:

1. ~~Substituir o mock de recomendações pelo endpoint do Gustavo.~~ ✅ `js/catalog.js`
   consome `/videos/{id}/relacionados`, `/trending` e `/catalogo`.
2. ~~Registrar visualizações com `/watch`.~~ ✅ chamado quando um vídeo real
   entra em reprodução (nunca para ids de demonstração — poluiria o `/trending`).
3. ~~Consultar `/status/{video_id}` antes de carregar o player.~~ ✅ o player
   consulta `/status` e `/media` ao falhar e reaproveita a resposta para
   reconsultar sozinho enquanto o vídeo transcodifica.
4. ~~Consumir o `master.m3u8` real gerado pela transcodificação.~~ ✅ o
   `hls_url` vem da API (banco), e o `CONFIG.HLS_URL` fixo deixou de existir.
5. ~~Busca do topo da watch page.~~ ✅ manda para `home.html?q=...`, que é quem
   consulta `/catalogo?q=`.

Faltando:

1. Autenticação de verdade (login/sessão). Hoje a identidade é local:
   `js/usuario.js` guarda o nome no navegador e gera um anônimo estável — para
   trocar por login, basta fazer `usuarioAtual()` devolver o id da sessão.
2. Publicar as thumbnails no fluxo de upload (o FFmpeg já gera
   `thumbnail.jpg`; em produção, com `ENABLE_S3=true`, elas vão para o bucket e
   o card cai na imagem padrão).
3. Notificação push do fim do processamento (o SSE cobre o upload feito pela
   própria página; falta avisar outras abas — `notificar_status` já existe como
   placeholder no Celery).

## Branch

```text
feature/player-adaptativo
```
