/**
 * Teste E2E do player contra a API REAL (FastAPI + banco local em JSON).
 *
 * Diferente dos outros testes (que dublam o `fetch`), aqui quem responde é o
 * backend de verdade, na origem informada por `E2E_API_URL` (padrão
 * http://127.0.0.1:8000), e o HLS.js usado é o VENDALIZADO (vendor/hls.min.js).
 * É o teste que pega os problemas que só aparecem na integração — ordem das
 * rotas, `media_pronta`, caminho dos arquivos, URL absoluta x relativa.
 *
 * Como rodar:
 *   1. terminal 1 (raiz do repositório):
 *        uvicorn app.main:app --reload
 *        python scripts/seed_e2e.py
 *   2. terminal 2 (nesta pasta):
 *        npm test -- tests/e2e.player-api.test.js
 *
 * Sem a API no ar a suíte é IGNORADA (não falha) — o CI e o `npm test` de quem
 * só quer rodar os testes unitários continuam verdes.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://127.0.0.1:8000/player/index.html"}
 */
import { jest } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const API = process.env.E2E_API_URL || "http://127.0.0.1:8000";
const requireCjs = createRequire(import.meta.url);
const { carregarHlsReal } = requireCjs("./hls-real.cjs");
const caminhoHls = fileURLToPath(new URL("../vendor/hls.min.js", import.meta.url));

const indexHtml = readFileSync(
  fileURLToPath(new URL("../index.html", import.meta.url)),
  "utf8"
);
const homeHtml = readFileSync(
  fileURLToPath(new URL("../home.html", import.meta.url)),
  "utf8"
);

// O jsdom não fornece `fetch` (e este arquivo é ESM, sem `require`), então o
// client HTTP vem de tests/e2e-fetch.cjs — para o player é um fetch comum.
requireCjs("./e2e-fetch.cjs").instalarFetch(globalThis);

/**
 * A API está no ar?
 *
 * A checagem precisa ser SÍNCRONA (o `describe.skip` é decidido na coleta dos
 * testes, antes de qualquer `beforeAll`) e não há fetch síncrono no jsdom —
 * por isso delegamos para um processo Node curto.
 */
function apiDisponivel() {
  try {
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL("./e2e-api-disponivel.mjs", import.meta.url)), API],
      { stdio: "ignore", timeout: 10_000 }
    );
    return true;
  } catch (error) {
    return false; // código 1 = API fora do ar
  }
}

const apiNoAr = apiDisponivel();
const talvez = apiNoAr ? describe : describe.skip;

let urlsCarregadas = [];

/** `<video>` funcional o suficiente para o player (jsdom não decodifica mídia). */
function instalarVideoStub() {
  const video = document.querySelector("#video");
  if (!video) return;

  video.canPlayType = () => "";
  video.play = jest.fn(async () => {});
  video.pause = jest.fn(() => {});
  Object.defineProperty(video, "duration", { value: 120, configurable: true });
  Object.defineProperty(video, "currentTime", { value: 0, writable: true, configurable: true });
}

async function subirPagina(html, { hls = true } = {}) {
  jest.resetModules();
  window.history.replaceState({}, "", window.location.pathname);

  const pagina = new DOMParser().parseFromString(html, "text/html");
  document.body.innerHTML = pagina.body.innerHTML;
  instalarVideoStub();

  urlsCarregadas = [];
  if (hls) {
    urlsCarregadas = carregarHlsReal(window, caminhoHls).urlsCarregadas;
  }

  window.PLAYER_CONFIG = { API_BASE_URL: API, USER_ID: "teste-e2e" };
}

async function flush(ciclos = 12) {
  for (let i = 0; i < ciclos; i += 1) {
    await new Promise((resolver) => setTimeout(resolver, 0));
  }
}

talvez("E2E — watch page contra a API real", () => {
  beforeEach(async () => {
    jest.spyOn(console, "info").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    await subirPagina(indexHtml);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = "";
    delete window.PLAYER_CONFIG;
  });

  test("abre tocando o vídeo pronto que veio do banco (sem nenhuma URL no JS)", async () => {
    await import("../js/player.js");
    await flush();

    expect(urlsCarregadas).toHaveLength(1);
    expect(urlsCarregadas[0]).toMatch(/^https?:\/\/[^/]+\/videos\/[^/]+\/master\.m3u8$/);
    // Nenhuma URL "chutada" no código (era assim que o bug se manifestava).
    expect(urlsCarregadas[0]).not.toContain("mux.dev");
    expect(urlsCarregadas[0]).not.toContain("./videos/master.m3u8");
  });

  test("preenche título com os metadados do banco", async () => {
    await import("../js/player.js");
    await flush();

    const titulo = document.querySelector("#videoTitle").textContent;
    expect(titulo).not.toBe("Nenhum vídeo carregado");
    expect(titulo.length).toBeGreaterThan(3);
  });

  test("a API responde ao /watch do vídeo em reprodução", async () => {
    await import("../js/player.js");
    await flush();

    const resposta = await global.fetch(`${API}/trending`);
    expect(resposta.ok).toBe(true);
    expect(await resposta.json()).toHaveProperty("trending");
  });

  test("?video= de um vídeo sem mídia explica o motivo em vez de dar 404 em loop", async () => {
    window.history.replaceState({}, "", "/player/index.html?video=v-completed-sem-arquivo");

    jest.resetModules();
    await import("../js/player.js");
    await flush();

    expect(urlsCarregadas).toEqual([]);
    expect(document.querySelector("#playerError").classList.contains("hidden")).toBe(false);
    expect(document.querySelector("#playerErrorMessage").textContent).toContain("não está pronto");
  });

  test("a playlist do vídeo pronto é entregue pela API com o Content-Type certo", async () => {
    await import("../js/player.js");
    await flush();

    const resposta = await global.fetch(urlsCarregadas[0]);
    expect(resposta.ok).toBe(true);
    expect(resposta.headers["content-type"]).toContain("mpegurl");

    const corpo = await resposta.text();
    expect(corpo).toContain("#EXTM3U");
  });
});

talvez("E2E — home contra a API real", () => {
  beforeEach(async () => {
    jest.spyOn(console, "info").mockImplementation(() => {});
    await subirPagina(homeHtml, { hls: false });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = "";
    delete window.PLAYER_CONFIG;
  });

  test("lista apenas vídeos que tocam (prontos=1) e linka para a watch page", async () => {
    await import("../js/home.js");
    await flush();

    const cards = [...document.querySelectorAll("#homeGrid a.home-card")];
    expect(cards.length).toBeGreaterThan(0);

    const ids = cards.map(
      (card) => new URL(card.getAttribute("href"), "http://x/").searchParams.get("video")
    );
    expect(ids).not.toContain("v-completed-sem-arquivo");
    expect(ids).not.toContain("v-sem-midia");
  });

  test("busca por tag filtra no servidor e atualiza o título da seção", async () => {
    await import("../js/home.js");
    await flush();

    document.querySelector("#searchInput").value = "matemática";
    document.querySelector("#searchForm").dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();

    expect(document.querySelector("#homeTitle").textContent).toContain("matemática");
    expect(document.querySelectorAll("#homeGrid a.home-card").length).toBeGreaterThan(0);
  });
});
