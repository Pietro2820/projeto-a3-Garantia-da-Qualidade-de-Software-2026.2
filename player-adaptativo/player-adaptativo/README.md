# Player Adaptativo — EduStream

Módulo `feature/player-adaptativo` da plataforma de streaming de vídeo educacional.

## O que já está implementado

- Player HTML5.
- HLS.js.
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
- Cards de vídeos relacionados em modo mock.
- Camada separada para futura integração com FastAPI.

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

1. Substituir o mock de recomendações pelo endpoint do Gustavo.
2. Consultar `/status/{video_id}` antes de carregar o player.
3. Consumir o `master.m3u8` real gerado pelo módulo de transcodificação.
4. Registrar visualizações com `/watch`.
5. Adicionar autenticação quando o backend estiver definido.

## Branch

```text
feature/player-adaptativo
```
