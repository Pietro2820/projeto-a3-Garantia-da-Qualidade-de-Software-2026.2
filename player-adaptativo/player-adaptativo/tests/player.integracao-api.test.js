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

/** Dubla o fetch por trecho de URL; rotas ausentes devolvem 404. */
function mockarFetch(rotas) {
  global.fetch = jest.fn(async (url) => {
    for (const [trecho, corpo] of Object.entries(rotas)) {
      if (String(url).includes(trecho)) {
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

beforeEach(() => {
  urlsCarregadas = [];
  instanciasHls = [];
  delete window.PLAYER_CONFIG;
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
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

  test("usa um relacionado quando o trending vem vazio", async () => {
    mockarFetch({
      "/trending": { trending: [], motivo: "nenhuma visualização registrada ainda" },
      "/relacionados": {
        video_id: "demo-video",
        relacionados: [{ ...VIDEO_TRENDING, video_id: "v-rel",
                         hls_url: `${API_BASE}/videos/v-rel/master.m3u8` }],
      },
      "/watch": { registrado: true },
    });

    await subirPlayer();

    expect(urlsCarregadas.at(-1)).toBe(`${API_BASE}/videos/v-rel/master.m3u8`);
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

  test("backend fora do ar mantém o comportamento de demonstração", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    await subirPlayer();

    // Nenhuma URL da API foi carregada; só a tentativa com o demo local.
    expect(urlsCarregadas).toEqual(["./videos/master.m3u8"]);
    expect(document.querySelectorAll("#sidebarVideos article.video-card").length)
      .toBeGreaterThan(0);
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
