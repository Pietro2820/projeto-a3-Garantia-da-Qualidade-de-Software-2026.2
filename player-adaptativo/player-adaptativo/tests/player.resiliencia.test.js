/**
 * Resiliência do player quando a mídia não vem — js/player.js.
 *
 * Estes são os casos que quebravam na prática (o vídeo "só rodava quando a URL
 * estava escrita no JS"):
 *
 *  1. master.m3u8 ausente (404) → o player ANTIGO entrava em loop infinito de
 *     retry. Agora ele para, consulta /status + /media e explica o motivo.
 *  2. Vídeo ainda transcodificando → mensagem de "processando" e nova consulta
 *     automática (sem martelar a API).
 *  3. Erro de rede de verdade → no máximo MAX_TENTATIVAS_REDE tentativas.
 *  4. Card sem stream (demo ou mídia não gerada) → o clique responde com uma
 *     explicação, em vez de ficar em silêncio.
 *  5. POST /watch só é enviado para vídeo real do banco (id de demonstração
 *     poluiria o /trending).
 *
 * Como nos outros testes de player, o index.html real é carregado no jsdom e o
 * HLS.js é um dublê que permite DISPARAR os eventos (inclusive o erro fatal).
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/"}
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const indexHtml = readFileSync(
  fileURLToPath(new URL("../index.html", import.meta.url)),
  "utf8"
);

const API_BASE = "http://localhost:8000";

let urlsCarregadas;
let instancias;

/** Dublê do HLS.js que guarda os handlers para o teste poder dispará-los. */
class FakeHls {
  constructor() {
    this.handlers = {};
    this.levels = [{ height: 360, bitrate: 464000 }];
    this.currentLevel = -1;
    this.destruido = false;
    instancias.push(this);
  }

  loadSource(url) {
    urlsCarregadas.push(url);
  }

  attachMedia() {}

  on(evento, callback) {
    this.handlers[evento] = callback;
  }

  destroy() {
    this.destruido = true;
  }

  recoverMediaError() {
    this.recuperou = true;
  }

  /** Dispara um evento como a lib real faria. */
  emitir(evento, dados = {}) {
    this.handlers[evento]?.(evento, dados);
  }
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

/** Dubla o fetch por caminho exato (rota inteira) e por trecho (fallback). */
function mockarFetch({ exatas = {}, trechos = {} } = {}) {
  const fetchMock = jest.fn(async (url) => {
    const alvo = String(url);

    for (const [caminho, corpo] of Object.entries(exatas)) {
      if (alvo.endsWith(caminho)) {
        return { ok: true, status: 200, json: async () => corpo };
      }
    }
    for (const [trecho, corpo] of Object.entries(trechos)) {
      if (alvo.includes(trecho)) {
        return { ok: true, status: 200, json: async () => corpo };
      }
    }
    return { ok: false, status: 404, json: async () => ({ detail: "não encontrado" }) };
  });

  global.fetch = fetchMock;
  return fetchMock;
}

async function subirPlayer() {
  jest.resetModules();
  window.history.replaceState({}, "", window.location.pathname);

  const pagina = new DOMParser().parseFromString(indexHtml, "text/html");
  document.body.innerHTML = pagina.body.innerHTML;

  global.Hls = FakeHls;
  window.Hls = FakeHls;

  await import("../js/player.js");
  await flush();
}

/**
 * Drena microtarefas e timers.
 *
 * Com fake timers um `setTimeout` comum nunca dispara (o teste penduraria),
 * então alternamos: entrega as promises pendentes e adianta o relógio. O ciclo
 * se repete porque cada timer resolvido agenda novas promises — é exatamente o
 * encadeamento fetch → render → loadVideo do player.
 *
 * (Detalhe: `jest.isMockFunction(global.setTimeout)` devolve false com os fake
 * timers modernos, por isso o controle é explícito via `ligarFakeTimers`.)
 */
let fakeTimers = false;

function ligarFakeTimers() {
  jest.useFakeTimers();
  fakeTimers = true;
}

async function flush(ciclos = 8) {
  for (let i = 0; i < ciclos; i += 1) {
    for (let micro = 0; micro < 4; micro += 1) {
      await Promise.resolve();
    }
    if (fakeTimers) {
      await jest.advanceTimersByTimeAsync(0);
    } else {
      await new Promise((resolver) => setTimeout(resolver, 0));
    }
  }
}

/** Avança o relógio (fake ou real) entregando as promises do caminho. */
async function avancar(ms) {
  if (fakeTimers) {
    await jest.advanceTimersByTimeAsync(ms);
  } else {
    await new Promise((resolver) => setTimeout(resolver, ms));
  }
  await flush(4);
}

function mensagemDeErro() {
  return document.querySelector("#playerErrorMessage").textContent;
}

function erroVisivel() {
  return !document.querySelector("#playerError").classList.contains("hidden");
}

function loadingVisivel() {
  return !document.querySelector("#playerLoading").classList.contains("hidden");
}

const VIDEO_PRONTO = {
  video_id: "v-ok",
  titulo: "Aula pronta",
  views: 3,
  media_pronta: true,
  hls_url: `${API_BASE}/videos/v-ok/master.m3u8`,
  thumbnail_url: `${API_BASE}/videos/v-ok/thumbnail.jpg`,
};

beforeEach(() => {
  urlsCarregadas = [];
  instancias = [];
  delete window.PLAYER_CONFIG;
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  fakeTimers = false;
  jest.useRealTimers();
  document.body.innerHTML = "";
  delete window.PLAYER_CONFIG;
});

// ---------------------------------------------------------------------------
// 1. master.m3u8 inexistente (404)
// ---------------------------------------------------------------------------

describe("player.js — stream que dá 404", () => {
  test("não entra em loop: para, consulta /media e explica que a mídia não existe", async () => {
    ligarFakeTimers();

    mockarFetch({
      trechos: {
        "/catalogo": { videos: [VIDEO_PRONTO], total: 1 },
        "/trending": { trending: [] },
        "/watch": { registrado: true },
        "/status/v-ok": { video_id: "v-ok", status: "completed", origem: "banco" },
        "/media/v-ok": { video_id: "v-ok", media_pronta: false, segmentos: 0 },
      },
      exatas: {
        "/catalogo/v-ok": VIDEO_PRONTO,
      },
    });

    await subirPlayer();

    expect(urlsCarregadas).toEqual([`${API_BASE}/videos/v-ok/master.m3u8`]);

    // O servidor responde 404 para a playlist: erro fatal de rede no HLS.js.
    instancias[0].emitir(FakeHls.Events.ERROR, {
      fatal: true,
      type: FakeHls.ErrorTypes.NETWORK_ERROR,
      response: { code: 404 },
    });
    await flush();

    expect(erroVisivel()).toBe(true);
    expect(mensagemDeErro()).toContain("arquivos HLS não foram encontrados");
    expect(loadingVisivel()).toBe(false);

    // Nenhuma nova tentativa (o loop de retry era o bug).
    await avancar(30_000);

    expect(urlsCarregadas).toHaveLength(1);
  });

  test("404 com vídeo ainda 'processing' avisa que está transcodificando", async () => {
    ligarFakeTimers();

    mockarFetch({
      trechos: {
        "/catalogo": { videos: [VIDEO_PRONTO], total: 1 },
        "/trending": { trending: [] },
        "/watch": { registrado: true },
        "/status/v-ok": { video_id: "v-ok", status: "processing" },
        "/media/v-ok": { video_id: "v-ok", media_pronta: false },
      },
      exatas: { "/catalogo/v-ok": VIDEO_PRONTO },
    });

    await subirPlayer();

    instancias[0].emitir(FakeHls.Events.ERROR, {
      fatal: true,
      type: FakeHls.ErrorTypes.NETWORK_ERROR,
      response: { code: 404 },
    });
    await flush();

    expect(mensagemDeErro()).toContain("transcodificando");
    expect(mensagemDeErro()).toContain("não está pronto");
  });

  test("falha de processamento (status=failed) mostra o erro do servidor", async () => {
    ligarFakeTimers();

    mockarFetch({
      trechos: {
        "/catalogo": { videos: [VIDEO_PRONTO], total: 1 },
        "/trending": { trending: [] },
        "/watch": { registrado: true },
        "/status/v-ok": { video_id: "v-ok", status: "failed", erro: "ffmpeg não encontrado" },
        "/media/v-ok": { video_id: "v-ok", media_pronta: false },
      },
      exatas: { "/catalogo/v-ok": VIDEO_PRONTO },
    });

    await subirPlayer();

    instancias[0].emitir(FakeHls.Events.ERROR, {
      fatal: true,
      type: FakeHls.ErrorTypes.NETWORK_ERROR,
      response: { code: 404 },
    });
    await flush();

    expect(mensagemDeErro()).toContain("FALHOU");
    expect(mensagemDeErro()).toContain("ffmpeg não encontrado");
  });
});

// ---------------------------------------------------------------------------
// 2. Erro de rede de verdade: tentativas limitadas
// ---------------------------------------------------------------------------

describe("player.js — erro de rede (não 404)", () => {
  test("tenta de novo, mas desiste depois do limite com mensagem clara", async () => {
    ligarFakeTimers();

    mockarFetch({
      trechos: {
        "/catalogo": { videos: [VIDEO_PRONTO], total: 1 },
        "/trending": { trending: [] },
        "/watch": { registrado: true },
        "/status/v-ok": { video_id: "v-ok", status: "completed" },
        "/media/v-ok": { video_id: "v-ok", media_pronta: true },
      },
      exatas: { "/catalogo/v-ok": VIDEO_PRONTO },
    });

    await subirPlayer();
    expect(urlsCarregadas).toHaveLength(1);

    const erroDeRede = () =>
      instancias.at(-1).emitir(FakeHls.Events.ERROR, {
        fatal: true,
        type: FakeHls.ErrorTypes.NETWORK_ERROR,
        response: { code: 500 },
      });

    // 1ª falha → agenda retry
    erroDeRede();
    await flush();
    expect(mensagemDeErro()).toContain("Tentando novamente (2/3)");

    await avancar(3000);
    expect(urlsCarregadas).toHaveLength(2);

    // 2ª falha → segunda (e última) repetição automática: 1 carga inicial
    // + 3 tentativas no total.
    erroDeRede();
    await flush();
    await avancar(3000);
    expect(urlsCarregadas).toHaveLength(3);

    // 3ª falha → estourou o limite: desiste e destrói a instância (sem loop)
    erroDeRede();
    await flush();
    await avancar(60_000);

    expect(urlsCarregadas).toHaveLength(3);
    expect(mensagemDeErro()).toContain("após 3 tentativas");
    expect(instancias.at(-1).destruido).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Vídeos sem stream (demo ou mídia não gerada)
// ---------------------------------------------------------------------------

describe("player.js — card sem stream", () => {
  test("clique em card de demonstração explica que não há stream", async () => {
    mockarFetch({ trechos: { "/trending": { trending: [] }, "/catalogo": { videos: [], total: 0 } } });

    await subirPlayer();

    window.dispatchEvent(new CustomEvent("video-selected", {
      detail: { id: "demo-java", title: "Introdução à Programação Java", demo: true, pronta: false },
    }));
    await flush();

    expect(urlsCarregadas).toEqual([]);
    expect(erroVisivel()).toBe(true);
    expect(mensagemDeErro()).toContain("demonstração");
  });

  test("clique em vídeo do banco sem mídia consulta /status e explica", async () => {
    mockarFetch({
      trechos: {
        "/trending": { trending: [] },
        "/catalogo": { videos: [], total: 0 },
        "/status/v-pend": { video_id: "v-pend", status: "pending" },
        "/media/v-pend": { video_id: "v-pend", media_pronta: false },
      },
    });

    await subirPlayer();

    window.dispatchEvent(new CustomEvent("video-selected", {
      detail: {
        id: "v-pend",
        title: "Aula ainda na fila",
        pronta: false,
        hlsUrl: `${API_BASE}/videos/v-pend/master.m3u8`,
      },
    }));
    await flush();

    expect(urlsCarregadas).toEqual([]);
    expect(mensagemDeErro()).toContain("na fila");
  });
});

// ---------------------------------------------------------------------------
// 4. /watch só para vídeo real
// ---------------------------------------------------------------------------

describe("player.js — POST /watch", () => {
  test("registra a visualização do vídeo do banco que entrou em reprodução", async () => {
    const fetchMock = mockarFetch({
      trechos: {
        "/catalogo": { videos: [VIDEO_PRONTO], total: 1 },
        "/trending": { trending: [] },
        "/watch": { registrado: true },
      },
      exatas: { "/catalogo/v-ok": VIDEO_PRONTO },
    });

    await subirPlayer();

    const watch = fetchMock.mock.calls.filter(([url, options]) =>
      String(url).includes("/watch") && options?.method === "POST");

    expect(watch).toHaveLength(1);
    expect(JSON.parse(watch[0][1].body).video_id).toBe("v-ok");
  });

  test("não registra visualização quando nada tocou (catálogo vazio)", async () => {
    const fetchMock = mockarFetch({
      trechos: {
        "/catalogo": { videos: [], total: 0 },
        "/trending": { trending: [] },
        "/watch": { registrado: true },
      },
    });

    await subirPlayer();

    const watch = fetchMock.mock.calls.filter(([url]) => String(url).includes("/watch"));
    expect(watch).toHaveLength(0);
    expect(mensagemDeErro()).toContain("Nenhum vídeo pronto");
  });

  test("não envia id de demonstração para o /watch", async () => {
    const fetchMock = mockarFetch({
      trechos: { "/trending": { trending: [] }, "/catalogo": { videos: [], total: 0 } },
    });

    await subirPlayer();

    window.dispatchEvent(new CustomEvent("video-selected", {
      detail: { id: "demo-git", title: "Git", demo: true, pronta: false },
    }));
    await flush();

    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/watch"))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Metadados reais na página
// ---------------------------------------------------------------------------

describe("player.js — metadados do banco na página", () => {
  test("preenche título, views, autor/data e descrição", async () => {
    mockarFetch({
      trechos: {
        "/catalogo": {
          videos: [{
            ...VIDEO_PRONTO,
            titulo: "Frações — aula 3",
            descricao: "Somando frações com denominadores diferentes.",
            autor: "Rafael",
            categoria: "Matemática",
            criado_em: "2026-09-01T10:00:00+00:00",
            views: 12,
          }],
          total: 1,
        },
        "/trending": { trending: [] },
        "/watch": { registrado: true },
      },
      exatas: {
        "/catalogo/v-ok": {
          ...VIDEO_PRONTO,
          titulo: "Frações — aula 3",
          descricao: "Somando frações com denominadores diferentes.",
          autor: "Rafael",
          categoria: "Matemática",
          criado_em: "2026-09-01T10:00:00+00:00",
          views: 12,
        },
      },
    });

    await subirPlayer();

    expect(document.querySelector("#videoTitle").textContent).toBe("Frações — aula 3");
    expect(document.querySelector("#views").textContent).toBe("12 visualizações");
    expect(document.querySelector("#date").textContent).toContain("Por Rafael");
    expect(document.querySelector("#description").textContent)
      .toContain("Somando frações com denominadores diferentes.");
    expect(document.title).toContain("Frações — aula 3");
  });

  test("o loading some assim que o manifesto é carregado", async () => {
    mockarFetch({
      trechos: { "/catalogo": { videos: [VIDEO_PRONTO], total: 1 }, "/trending": { trending: [] }, "/watch": {} },
      exatas: { "/catalogo/v-ok": VIDEO_PRONTO },
    });

    await subirPlayer();
    expect(loadingVisivel()).toBe(true);

    instancias[0].emitir(FakeHls.Events.MANIFEST_PARSED, { levels: [{ height: 360 }] });
    await flush();

    expect(loadingVisivel()).toBe(false);
    expect(erroVisivel()).toBe(false);
  });
});
