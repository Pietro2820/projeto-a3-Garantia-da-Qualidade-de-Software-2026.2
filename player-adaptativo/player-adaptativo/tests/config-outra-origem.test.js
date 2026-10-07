/**
 * config.js quando o player é aberto por OUTRO servidor (Live Server, http.server).
 *
 * A URL do jsdom é fixa por arquivo de teste, por isso este cenário mora num
 * arquivo próprio: aqui a origem é http://localhost:5500 (típico do Live
 * Server) e o config.js precisa apontar a API para http://localhost:8000 —
 * senão o front chama a si mesmo e nada funciona (o navegador ainda bloquearia
 * por CORS se a API não estivesse no ar).
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost:5500/index.html"}
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const requireCjs = createRequire(import.meta.url);
const { evaluarScript } = requireCjs("./hls-real.cjs");
const caminhoConfig = fileURLToPath(new URL("../config.js", import.meta.url));

afterEach(() => {
  delete window.PLAYER_CONFIG;
});

test("aponta a API para http://localhost:8000 quando a origem não é o backend", () => {
  delete window.PLAYER_CONFIG;

  evaluarScript(window, caminhoConfig);

  expect(window.location.port).toBe("5500");
  expect(window.PLAYER_CONFIG.API_BASE_URL).toBe("http://localhost:8000");
});

test("respeita um API_BASE_URL definido antes (config local do dev)", () => {
  window.PLAYER_CONFIG = { API_BASE_URL: "https://api.exemplo.com" };

  evaluarScript(window, caminhoConfig);

  expect(window.PLAYER_CONFIG.API_BASE_URL).toBe("https://api.exemplo.com");
});
