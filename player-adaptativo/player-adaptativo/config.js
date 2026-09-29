window.PLAYER_CONFIG = window.PLAYER_CONFIG || {};

(function () {
  // Backend FastAPI (uvicorn roda na 8000). Se um dia a API passar a servir
  // o player junto (mesma origem), troque por window.location.origin.
  window.PLAYER_CONFIG.API_BASE_URL =
    window.PLAYER_CONFIG.API_BASE_URL || "http://localhost:8000";

  // Vídeo que o HLS.js vai tocar.
  // FASE 1 (testar o player): stream público de teste.
  // FASE 2 (vídeo de vocês): troque pela URL do master.m3u8 no bucket,
  //   .../object/public/streaming/videos/<VIDEO_ID>/master.m3u8
  window.PLAYER_CONFIG.HLS_URL =
    window.PLAYER_CONFIG.HLS_URL ||
    "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

  // Mesmo id da pasta videos/<id>/ no bucket (UUID do upload).
  window.PLAYER_CONFIG.VIDEO_ID =
    window.PLAYER_CONFIG.VIDEO_ID || "demo-video";

  // Quem assiste (histórico p/ recomendações e /watch).
  window.PLAYER_CONFIG.USER_ID =
    window.PLAYER_CONFIG.USER_ID || "rafael";
})();vwindow.PLAYER_CONFIG = window.PLAYER_CONFIG || {};

(function () {
  // Backend FastAPI (uvicorn roda na 8000). Se um dia a API passar a servir
  // o player junto (mesma origem), troque por window.location.origin.
  window.PLAYER_CONFIG.API_BASE_URL =
    window.PLAYER_CONFIG.API_BASE_URL || "http://localhost:8000";

  // Vídeo que o HLS.js vai tocar.
  // FASE 1 (testar o player): stream público de teste.
  // FASE 2 (vídeo de vocês): troque pela URL do master.m3u8 no bucket,
  //   .../object/public/streaming/videos/<VIDEO_ID>/master.m3u8
  window.PLAYER_CONFIG.HLS_URL =
    window.PLAYER_CONFIG.HLS_URL ||
    "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

  // Mesmo id da pasta videos/<id>/ no bucket (UUID do upload).
  window.PLAYER_CONFIG.VIDEO_ID =
    window.PLAYER_CONFIG.VIDEO_ID || "demo-video";

  // Quem assiste (histórico p/ recomendações e /watch).
  window.PLAYER_CONFIG.USER_ID =
    window.PLAYER_CONFIG.USER_ID || "rafael";
})();