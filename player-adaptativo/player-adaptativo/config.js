/**
 * Configuração do player — carregado pelo index.html ANTES de js/player.js.
 *
 * Este arquivo existia só como exemplo (config.example.js) e a página não o
 * carregava: qualquer ajuste de API exigia editar o código do player. Agora a
 * configuração tem um lugar só, com padrões inteligentes:
 *
 *   • Se a página foi servida pelo próprio backend
 *     (http://localhost:8000/player/), a API está na MESMA origem — usamos
 *     `window.location.origin` e tudo funciona sem CORS, em qualquer host/porta.
 *   • Se a página foi aberta de outro servidor (Live Server :5500,
 *     `python -m http.server`, etc.), usamos http://localhost:8000 (o backend
 *     tem CORS liberado para desenvolvimento).
 *
 * Para apontar para outra API (ex: backend na nuvem), defina API_BASE_URL
 * antes deste script ou edite a linha abaixo:
 *
 *   window.PLAYER_CONFIG = { API_BASE_URL: "https://api.exemplo.com" };
 */
window.PLAYER_CONFIG = window.PLAYER_CONFIG || {};

(function () {
  var origem = window.location && window.location.origin;
  var servidaPorHttp = typeof origem === "string" && /^https?:/.test(origem);

  window.PLAYER_CONFIG.API_BASE_URL =
    window.PLAYER_CONFIG.API_BASE_URL ||
    (servidaPorHttp ? origem : "http://localhost:8000");
})();
