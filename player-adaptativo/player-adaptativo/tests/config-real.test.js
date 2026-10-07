/**
 * Teste de fiação real: config.js + vendor/hls.min.js + js/player.js.
 *
 * Por que existe: os outros testes dublam o HLS.js e ignoram o config.js — foi
 * assim que um `config.js` com o conteúdo duplicado (e um `v` solto que jogava
 * `ReferenceError` no console) passou despercebido, junto com um `HLS_URL`
 * fixo que impedia o player de usar o catálogo do banco.
 *
 * Aqui os dois arquivos são EVALUADOS de verdade no jsdom:
 *   • `config.js` precisa definir `PLAYER_CONFIG.API_BASE_URL` sem erro;
 *   • `config.js` NÃO pode definir URL de vídeo (o vídeo vem do banco);
 *   • o `vendor/hls.min.js` real precisa ser usado pelo player para carregar a
 *     playlist que a API indicou.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost:8000/player/index.html"}
 */
import { jest } from "@jest/globals";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const requireCjs = createRequire(import.meta.url);
const { carregarHlsReal, evaluarScript } = requireCjs("./hls-real.cjs");

const caminhoConfig = fileURLToPath(new URL("../config.js", import.meta.url));
const caminhoHls = fileURLToPath(new URL("../vendor/hls.min.js", import.meta.url));
const indexHtml = readFileSync(
  fileURLToPath(new URL("../index.html", import.meta.url)),
  "utf8"
);

const API = "http://localhost:8000";
let urlsCarregadas = [];

/** Dubla apenas as rotas JSON; o resto devolve 404 (como um backend incompleto). */
function mockarApi() {
  global.fetch = jest.fn(async (url) => {
    const alvo = String(url);
    const video = {
      video_id: "v-real",
      titulo: "Aula publicada no banco",
      autor: "Rafael",
      categoria: "Matemática",
      descricao: "Descrição vinda do banco.",
      criado_em: "2026-09-01T10:00:00+00:00",
      views: 7,
      media_pronta: true,
      hls_url: `${API}/videos/v-real/master.m3u8`,
      thumbnail_url: `${API}/videos/v-real/thumbnail.jpg`,
    };

    if (alvo.endsWith("/catalogo/v-real")) {
      return { ok: true, status: 200, json: async () => video };
    }
    if (alvo.includes("/catalogo")) {
      return { ok: true, status: 200, json: async () => ({ videos: [video], total: 1 }) };
    }
    if (alvo.includes("/trending")) {
      return { ok: true, status: 200, json: async () => ({ trending: [] }) };
    }
    if (alvo.includes("/watch")) {
      return { ok: true, status: 200, json: async () => ({ registrado: true }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
}

function instalarVideoStub() {
  const video = document.querySelector("#video");
  video.canPlayType = () => "";
  video.play = jest.fn(async () => {});
  video.pause = jest.fn(() => {});
}

async function subirPlayerComConfigReal() {
  jest.resetModules();
  window.history.replaceState({}, "", "/player/index.html");
  delete window.PLAYER_CONFIG;

  const pagina = new DOMParser().parseFromString(indexHtml, "text/html");
  document.body.innerHTML = pagina.body.innerHTML;
  instalarVideoStub();

  // 1. o config.js REAL (script clássico, como no HTML)
  evaluarScript(window, caminhoConfig);
  // 2. o HLS.js REAL vendalizado
  urlsCarregadas = carregarHlsReal(window, caminhoHls).urlsCarregadas;
  // 3. o player
  await import("../js/player.js");

  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolver) => setTimeout(resolver, 0));
  }
}

beforeEach(() => {
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockarApi();
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
  delete window.PLAYER_CONFIG;
});

describe("config.js real", () => {
  test("avalia sem erro e define a origem da API", () => {
    delete window.PLAYER_CONFIG;

    expect(() => evaluarScript(window, caminhoConfig)).not.toThrow();
    expect(window.PLAYER_CONFIG.API_BASE_URL).toBe(API);
  });

  test("não define URL de vídeo (o catálogo vem do banco)", () => {
    delete window.PLAYER_CONFIG;
    evaluarScript(window, caminhoConfig);

    expect(window.PLAYER_CONFIG.HLS_URL).toBeUndefined();
    expect(window.PLAYER_CONFIG.VIDEO_ID).toBeUndefined();
    expect(window.PLAYER_CONFIG.USER_ID).toBeTruthy();
  });

  test("não contém um HLS_URL atribuído no fonte (regressão do bug)", () => {
    const fonte = readFileSync(caminhoConfig, "utf8");
    const atribuicoes = fonte.match(/HLS_URL\s*=/g) || [];

    // Só pode aparecer em comentário/exemplo, nunca como atribuição ativa.
    const ativas = fonte
      .split("\n")
      .filter((linha) => !linha.trim().startsWith("//") && !linha.trim().startsWith("*"))
      .filter((linha) => /HLS_URL\s*=/.test(linha));

    expect(atribuicoes.length).toBeGreaterThanOrEqual(0);
    expect(ativas).toEqual([]);
  });

  // O cenário "front em outra origem" (Live Server :5500) mora em
  // tests/config-outra-origem.test.js — a URL do jsdom é fixa por arquivo.
});

describe("player.js + vendor/hls.min.js real", () => {
  test("usa o HLS.js vendalizado para carregar a URL que veio do banco", async () => {
    await subirPlayerComConfigReal();

    expect(window.Hls).toBeDefined();
    expect(urlsCarregadas).toEqual([`${API}/videos/v-real/master.m3u8`]);
    expect(document.querySelector("#playerError").classList.contains("hidden")).toBe(true);
  });

  test("os metadados exibidos são os do banco (não os do HTML estático)", async () => {
    await subirPlayerComConfigReal();

    expect(document.querySelector("#videoTitle").textContent).toBe("Aula publicada no banco");
    expect(document.querySelector("#views").textContent).toBe("7 visualizações");
    expect(document.querySelector("#date").textContent).toContain("Por Rafael");
    expect(document.querySelector("#description").textContent).toContain("Descrição vinda do banco.");
  });

  test("a instância do HLS.js fica acessível para os controles de qualidade", async () => {
    await subirPlayerComConfigReal();

    const hls = window.eduStreamPlayer.getHls();
    expect(hls).toBeInstanceOf(window.Hls);
    expect(window.eduStreamPlayer.getQualityManager()).not.toBeNull();
  });
});
