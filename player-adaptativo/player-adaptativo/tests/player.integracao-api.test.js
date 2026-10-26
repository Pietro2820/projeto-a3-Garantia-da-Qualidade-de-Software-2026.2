/**
 * Testes de integração player ↔ API (backend FastAPI).
 *
 * Cobre a lógica acrescentada em js/player.js para a "conversa" com o back:
 *
 *  1. resolveMediaUrl — hls_url relativo ("/videos/...") precisa virar
 *     absoluto contra a origem da API, senão o navegador resolve contra a
 *     origem do front (Live Server) e o vídeo dá 404.
 *  2. Auto-seleção — quando o backend responde com vídeos reais (trending /
 *     relacionados), o primeiro com stream pronto entra em reprodução no
 *     lugar do master.m3u8 de demonstração (que não existe no repo).
 *  3. PLAYER_CONFIG.HLS_URL explícito vence a auto-seleção.
 *  4. Clique em card (evento "video-selected") toca a URL resolvida,
 *     registra a visualização (POST /watch) e recarrega os relacionados.
 *
 * Como no bootstrap test, a página real (index.html) é carregada no jsdom.
 * O HLS.js é um dublê que grava as URLs passadas a loadSource(); o fetch é
 * dublado por rota — nenhum teste faz rede de verdade.
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const indexHtml = readFileSync(
  fileURLToPath(new URL("../index.html", import.meta.url)),
  "utf8"
);

// Mesmo valor padrão de js/api.js quando não há PLAYER_CONFIG (a origem do
// jsdom é http://localhost, então o fallback localhost:8000 se aplica).
const API_BASE = "http://localhost:8000";

let urlsCarregadas;
let instanciasHls;

class FakeHls {
  constructor() {
    this.levels = [{ height: 360, bitrate: 464000 }, { height: 720, bitrate: 2600000 }];
    this.currentLevel = -1;
    instanciasHls.push(this);
  }

  loadSource(url) {
    urlsCarregadas.push(url);
  }

  attachMedia() {}
  on() {}
  destroy() {}
}

FakeHls.isSupported = () => true;
FakeHls.Events = {
  MANIFEST_PARSED: "hlsManifestParsed",
  FRAG_BUFFERED: "hlsFragBuffered",
  LEVEL_SWITCHED: "hlsLevelSwitched",
  ERROR: "hlsError",
};
FakeHls.ErrorTypes = { NETWORK_ERROR: "networkError", MEDIA_ERROR: "mediaError" };
FakeHls.ErrorDetails = { BUFFER_STALLED_ERROR: "bufferStalledError" };

/**
 * Dubla o fetch por trecho de URL; rotas ausentes devolvem 404.
 *
 * `rotasExatas` tem precedência e casa com o caminho inteiro — necessário
 * porque "/catalogo" (lista) e "/catalogo/{id}" (detalhe) compartilham prefixo
 * e a resposta por trecho devolveria a lista para os dois.
 */
function mockarFetch(rotas, rotasExatas = {}) {
  global.fetch = jest.fn(async (url) => {
    const alvo = String(url);

    for (const [caminho, corpo] of Object.entries(rotasExatas)) {
      if (alvo.endsWith(caminho)) {
        return { ok: true, status: 200, json: async () => corpo };
      }
    }

    for (const [trecho, corpo] of Object.entries(rotas)) {
      if (alvo.includes(trecho)) {
        return { ok: true, status: 200, json: async () => corpo };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  return global.fetch;
}

/** Sobe a página real e importa o player.js fresco (módulo com side-effects). */
async function subirPlayer() {
  jest.resetModules();

  const pagina = new DOMParser().parseFromString(indexHtml, "text/html");
  document.body.innerHTML = pagina.body.innerHTML;

  global.Hls = FakeHls;
  window.Hls = FakeHls;

  await import("../js/player.js");

  // Espera a cadeia de promises do catálogo (fetch → render → auto-seleção).
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolver) => setTimeout(resolver, 0));
  }
}

function chamadasDeWatch() {
  return global.fetch.mock.calls.filter(
    ([url, options]) => String(url).includes("/watch") && options?.method === "POST"
  );
}

const VIDEO_TRENDING = {
  video_id: "v-his",
  titulo: "História do Brasil — colônia",
  tags: ["história", "brasil"],
  categoria: "História",
  autor: "Pedro",
  status: "completed",
  views: 5,
};

/**
 * O player atualiza a barra de endereço ao trocar de vídeo (?video={id}) e o
 * jsdom mantém essa URL até o fim do ARQUIVO de teste. Sem este reset, um
 * teste que clica num card contamina o seguinte (que passaria a abrir com
 * ?video=...). 
 */
function resetarUrlDaPagina() {
  window.history.replaceState({}, "", window.location.pathname);
}

beforeEach(() => {
  urlsCarregadas = [];
  instanciasHls = [];
  resetarUrlDaPagina();
  delete window.PLAYER_CONFIG;
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
  resetarUrlDaPagina();
  delete window.PLAYER_CONFIG;
});

describe("player.js — auto-seleção com o catálogo da API", () => {
  test("toca o primeiro vídeo real do trending (hls_url absoluto)", async () => {
    mockarFetch({
      "/trending": {
        trending: [{ ...VIDEO_TRENDING, hls_url: `${API_BASE}/videos/v-his/master.m3u8`,
                     thumbnail_url: `${API_BASE}/videos/v-his/thumbnail.jpg` }],
      },
      "/relacionados": { relacionados: [] },
      "/watch": { registrado: true, views: 6 },
    });

    await subirPlayer();

    expect(urlsCarregadas.at(-1)).toBe(`${API_BASE}/videos/v-his/master.m3u8`);
  });

  test("atualiza o título da página com os metadados reais", async () => {
    mockarFetch({
      "/trending": {
        trending: [{ ...VIDEO_TRENDING, hls_url: `${API_BASE}/videos/v-his/master.m3u8`, views: 5 }],
      },
      "/relacionados": { relacionados: [] },
      "/watch": { registrado: true },
    });

    await subirPlayer();

    expect(document.querySelector("#videoTitle").textContent).toBe(
      "História do Brasil — colônia"
    );
    expect(document.querySelector("#views").textContent).toBe("5 visualizações");
  });

  test("registra a visualização do vídeo auto-selecionado (POST /watch)", async () => {
    mockarFetch({
      "/trending": {
        trending: [{ ...VIDEO_TRENDING, hls_url: `${API_BASE}/videos/v-his/master.m3u8` }],
      },
      "/relacionados": { relacionados: [] },
      "/watch": { registrado: true },
    });

    await subirPlayer();

    const assistidos = chamadasDeWatch().map(([, options]) => JSON.parse(options.body).video_id);
    expect(assistidos).toContain("v-his");
  });

  test("hls_url relativo da API é prefixado com a origem do backend", async () => {
    // Cenário de segurança: API devolve caminho relativo (versões antigas).
    // Sem o prefixo, o navegador resolveria contra a origem do FRONT → 404.
    mockarFetch({
      "/trending": {
        trending: [{ ...VIDEO_TRENDING, hls_url: "/videos/v-his/master.m3u8" }],
      },
      "/relacionados": { relacionados: [] },
      "/watch": { registrado: true },
    });

    await subirPlayer();

    expect(urlsCarregadas.at(-1)).toBe(`${API_BASE}/videos/v-his/master.m3u8`);
  });

  test("clique num card toca o vídeo e passa a usar os relacionados DELE", async () => {
    // É assim que os "relacionados" entram em jogo: a página abre com um vídeo
    // (ou o usuário clica num card) e a sidebar/grade passam a vir de
    // GET /videos/{id}/relacionados — sempre com dados do banco.
    const fetchMock = mockarFetch({
      "/trending": { trending: [] },
      "/relacionados": {
        video_id: "v-rel",
        relacionados: [{ ...VIDEO_TRENDING, video_id: "v-rel",
                         hls_url: `${API_BASE}/videos/v-rel/master.m3u8` }],
      },
      "/watch": { registrado: true },
    });

    await subirPlayer();

    window.dispatchEvent(new CustomEvent("video-selected", {
      detail: {
        id: "v-origem",
        title: "Vídeo de origem",
        pronta: true,
        hlsUrl: `${API_BASE}/videos/v-origem/master.m3u8`,
      },
    }));

    await new Promise((resolver) => setTimeout(resolver, 0));
    await new Promise((resolver) => setTimeout(resolver, 0));

    expect(urlsCarregadas.at(-1)).toBe(`${API_BASE}/videos/v-origem/master.m3u8`);
    expect(fetchMock.mock.calls.some(([url]) =>
      String(url).includes("/videos/v-origem/relacionados"))).toBe(true);
  });

  test("sem ?video= e sem relacionados: toca o primeiro vídeo do CATÁLOGO (banco)", async () => {
    // Cenário real de hoje: /trending vazio (Redis sem visualizações) e nenhum
    // vídeo de referência para pedir /relacionados. A grade inicial vem de
    // GET /catalogo?prontos=1 — só vídeos com master.m3u8 no disco.
    const fetchMock = mockarFetch(
      {
        "/trending": { trending: [], motivo: "nenhuma visualização registrada ainda" },
        "/catalogo": {
          videos: [{ ...VIDEO_TRENDING, video_id: "v-cat", titulo: "Do catálogo",
                     media_pronta: true,
                     hls_url: `${API_BASE}/videos/v-cat/master.m3u8` }],
          total: 1,
        },
        "/watch": { registrado: true },
      },
      {
        "/catalogo/v-cat": { ...VIDEO_TRENDING, video_id: "v-cat", titulo: "Do catálogo",
                             media_pronta: true,
                             hls_url: `${API_BASE}/videos/v-cat/master.m3u8` },
      }
    );

    await subirPlayer();

    expect(urlsCarregadas.at(-1)).toBe(`${API_BASE}/videos/v-cat/master.m3u8`);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/catalogo?prontos=1")))
      .toBe(true);
  });

  test("vídeo com media_pronta=false não entra em reprodução (evita 404 em loop)", async () => {
    mockarFetch(
      {
        "/trending": { trending: [] },
        "/catalogo": {
          videos: [{ ...VIDEO_TRENDING, video_id: "v-sem-midia",
                     media_pronta: false,
                     hls_url: `${API_BASE}/videos/v-sem-midia/master.m3u8` }],
          total: 1,
        },
        "/watch": { registrado: true },
      },
      {
        "/catalogo/v-sem-midia": { ...VIDEO_TRENDING, video_id: "v-sem-midia",
                                   media_pronta: false,
                                   hls_url: `${API_BASE}/videos/v-sem-midia/master.m3u8` },
        "/status/v-sem-midia": { video_id: "v-sem-midia", status: "processing" },
        "/media/v-sem-midia": { video_id: "v-sem-midia", media_pronta: false, segmentos: 0 },
      }
    );

    await subirPlayer();

    expect(urlsCarregadas).toEqual([]);
    expect(document.querySelector("#playerError").classList.contains("hidden")).toBe(false);
    expect(document.querySelector("#playerErrorMessage").textContent)
      .toContain("não está pronto");
  });

  test("PLAYER_CONFIG.HLS_URL explícito vence a auto-seleção", async () => {
    window.PLAYER_CONFIG = { HLS_URL: "./videos/meu-stream.m3u8" };
    mockarFetch({
      "/trending": {
        trending: [{ ...VIDEO_TRENDING, hls_url: `${API_BASE}/videos/v-his/master.m3u8` }],
      },
      "/relacionados": { relacionados: [] },
      "/watch": { registrado: true },
    });

    await subirPlayer();

    expect(urlsCarregadas).toEqual(["./videos/meu-stream.m3u8"]);
  });

  test("backend fora do ar: mantém os cards de demonstração e não inventa URL", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    await subirPlayer();

    // Antes o player tentava "./videos/master.m3u8" (arquivo que não existe no
    // repo) e entrava em loop de retry. Agora nenhuma URL é chutada: a página
    // diz qual origem não respondeu e mantém os cards de exemplo.
    expect(urlsCarregadas).toEqual([]);
    expect(document.querySelectorAll("#sidebarVideos article.video-card").length)
      .toBeGreaterThan(0);
    expect(document.querySelector("#playerErrorMessage").textContent)
      .toContain(API_BASE);
  });
});

describe("player.js — clique em card (video-selected)", () => {
  test("toca a URL resolvida, registra o watch e busca os relacionados do novo vídeo", async () => {
    const fetchMock = mockarFetch({
      "/watch": { registrado: true },
      "/relacionados": { relacionados: [] },
      "/trending": { trending: [] },
    });

    await subirPlayer();

    window.dispatchEvent(new CustomEvent("video-selected", {
      detail: {
        id: "v-clicado",
        title: "Aula clicada",
        hlsUrl: "/videos/v-clicado/master.m3u8",
        views: "3 visualizações",
      },
    }));

    await new Promise((resolver) => setTimeout(resolver, 0));
    await new Promise((resolver) => setTimeout(resolver, 0));

    expect(urlsCarregadas.at(-1)).toBe(`${API_BASE}/videos/v-clicado/master.m3u8`);
    expect(document.querySelector("#videoTitle").textContent).toBe("Aula clicada");

    const assistidos = chamadasDeWatch().map(([, options]) => JSON.parse(options.body).video_id);
    expect(assistidos).toContain("v-clicado");

    const relacionadosBuscados = fetchMock.mock.calls.some(([url]) =>
      String(url).includes("/videos/v-clicado/relacionados")
    );
    expect(relacionadosBuscados).toBe(true);
  });

  test("card de demonstração (sem hlsUrl) não quebra o player", async () => {
    mockarFetch({ "/watch": { registrado: true } });

    await subirPlayer();
    const antes = urlsCarregadas.length;

    window.dispatchEvent(new CustomEvent("video-selected", {
      detail: { id: "demo-java", title: "Introdução à Programação Java" },
    }));

    await new Promise((resolver) => setTimeout(resolver, 0));

    expect(urlsCarregadas.length).toBe(antes);
  });
});
