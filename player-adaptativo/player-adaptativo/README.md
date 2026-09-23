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
- Integração com a API FastAPI (`js/api.js` + `js/catalog.js`), com fallback
  para os vídeos de demonstração quando o backend está fora do ar.

## Testes automatizados

```bash
npm install     # primeira vez
npm test        # 178 testes (Jest + jsdom)
npm test -- --coverage
```

Não é preciso backend, Redis nem servidor HLS no ar: o `fetch` é dublado e o
`<video>` é substituído por um dublê (jsdom não decodifica mídia).

| Arquivo | O que cobre |
|---|---|
| `tests/controls.test.js` | play/pause, seek com limite nas bordas, volume, atalhos, fullscreen/PiP, `formatTime` |
| `tests/catalog.test.js` | tradução API → card e o fallback quando o backend falha |
| `tests/quality.manager.test.js` | troca de qualidade, níveis inválidos, detecção de travamento |
| `tests/api.test.js` | rotas do contrato, encode de parâmetros, erro por status HTTP |
| `tests/recommendations.render.test.js` | renderização dos cards e escaping de HTML (XSS) |
| `tests/player.bootstrap.test.js` | carrega o `index.html` real e verifica que a página sobe |
| `tests/vendor.test.js` | HLS.js local: hash fixado, licença, e que a lib carrega sem internet |
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

Depois abra:

http://localhost:5500/frontend/player/

Se você estiver dentro da pasta `frontend/player`:

```bash
python -m http.server 5500
```

e acesse:

http://localhost:5500

## Configurar o HLS

Em `js/player.js`:

```javascript
const CONFIG = {
  HLS_URL: "http://localhost:8000/videos/SEU_VIDEO_ID/master.m3u8",
  VIDEO_ID: "SEU_VIDEO_ID",
  USER_ID: "SEU_USUARIO"
};
```

O ideal é depois mover essa configuração para o backend ou para um arquivo de configuração do ambiente.

## Contratos do projeto

O backend do projeto possui os seguintes contratos documentados:

- `GET /status/{video_id}`
- `GET /videos/{id}/relacionados`
- `GET /recomendacoes/{user_id}`
- `GET /trending`
- `POST /watch`

Os vídeos processados seguem a estrutura:

```text
/videos/{video_id}/master.m3u8
/videos/{video_id}/{resolucao}/playlist.m3u8
```

## Próximas integrações

Já feitas:

1. ~~Substituir o mock de recomendações pelo endpoint do Gustavo.~~ ✅ `js/catalog.js`
   consome `/videos/{id}/relacionados` e `/trending`, mantendo o mock como fallback.
2. ~~Registrar visualizações com `/watch`.~~ ✅ chamado na carga e a cada troca de vídeo.

Faltando:

1. Consultar `/status/{video_id}` antes de carregar o player (hoje só avisa se
   a transcodificação ainda não terminou quem chama a API na mão).
2. Consumir o `master.m3u8` real gerado pelo módulo de transcodificação —
   hoje `CONFIG.HLS_URL` aponta para `./videos/master.m3u8`.
3. Adicionar autenticação quando o backend estiver definido.

## Branch

```text
feature/player-adaptativo
```
