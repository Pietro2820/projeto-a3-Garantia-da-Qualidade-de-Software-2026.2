/**
 * Player tocando mídia que está no BUCKET público (Supabase Storage / S3).
 *
 * O backend devolve `hls_url` ABSOLUTO apontando para o bucket quando o
 * master.m3u8 do vídeo mora lá (campo `origem_midia: "s3"`) — é o caso de
 * quem transcodifica com ENABLE_S3=true e não tem os arquivos no disco da API.
 *
 * O que estes testes blindam:
 *  1. a URL do bucket passa INTACTA pelo resolveMediaUrl (não é prefixada com
 *     a origem da API — isso geraria http://localhost:8000/https://... e 404);
 *  2. `temStream` reconhece o vídeo do bucket como pronto (media_pronta true);
 *  3. auto-seleção, watch page (?video=) e clique em card tocam a URL do bucket;
 *  4. thumbnail do bucket vai para o <img> do card;
 *  5. 404 vindo do BUCKET (bucket privado, CORS bloqueado, chave errada) não
 *     entra em loop de retry: o player consulta /status + /media e explica.
 *
 * A página real (index.html) é carregada no jsdom; o HLS.js é um dublê que
 * grava as URLs passadas a loadSource() e o fetch é dublado por rota.
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

// URL pública real de um bucket do Supabase Storage (formato documentado).
const BUCKET = "https://projeto.supabase.co/storage/v1/object/public/streaming";
const HLS_BUCKET = `${BUCKET}/videos/v-bucket/master.m3u8`;
const THUMB_BUCKET = `${BUCKET}/videos/v-bucket/thumbnail.jpg`;

let urlsCarregadas;
let instancias;

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

  emitir(evento, dados) {
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
FakeHls.ErrorDetails = { MANIFEST_LOAD_ERROR: "manifestLoadError" };

let fakeTimers = false;

function ligarFakeTimers() {
  jest.useFakeTimers();
  fakeTimers = true;
}

function mockarFetch({ trechos = {}, exatas = {} } = {}) {
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

/**
 * Drena microtarefas e timers (mesmo mecanismo de player.resiliencia.test.js).
 *
 * Com fake timers um `setTimeout` comum nunca dispara e o teste pendura até o
 * timeout — por isso a alternativa é adiantar o relógio do Jest.
 */
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

/** Avança o relógio (fake ou real) entregando as promises no caminho. */
async function avancar(ms) {
  if (fakeTimers) {
    await jest.advanceTimersByTimeAsync(ms);
  } else {
    await new Promise((resolver) => setTimeout(resolver, ms));
  }
  await flush(4);
}

async function subirPlayer(query = "") {
  jest.resetModules();
  window.history.replaceState({}, "", `${window.location.pathname}${query}`);

  const pagina = new DOMParser().parseFromString(indexHtml, "text/html");
  document.body.innerHTML = pagina.body.innerHTML;

  global.Hls = FakeHls;
  window.Hls = FakeHls;

  await import("../js/player.js");
  await flush();
}

function mensagemDeErro() {
  return document.querySelector("#playerErrorMessage").textContent;
}

function erroVisivel() {
  return !document.querySelector("#playerError").classList.contains("hidden");
}

/** Vídeo como o /catalogo devolve quando a mídia está só no bucket. */
const VIDEO_DO_BUCKET = {
  video_id: "v-bucket",
  titulo: "Aula gravada no Supabase Storage",
  descricao: "Transcodificada pelo worker com ENABLE_S3=true.",
  autor: "Rafael",
  criado_em: "2026-10-01T12:00:00+00:00",
  status: "completed",
  views: 7,
  media_pronta: true,
  origem_midia: "s3",
  hls_url: HLS_BUCKET,
  thumbnail_url: THUMB_BUCKET,
};

function rotasDoBucket(overrides = {}) {
  return mockarFetch({
    trechos: {
      "/catalogo": { videos: [VIDEO_DO_BUCKET], total: 1 },
      "/trending": { trending: [VIDEO_DO_BUCKET] },
      "/relacionados": { relacionados: [] },
      "/watch": { registrado: true },
      "/status/v-bucket": { video_id: "v-bucket", status: "completed", origem: "banco" },
      "/media/v-bucket": {
        video_id: "v-bucket",
        media_pronta: true,
        origem: "s3",
        segmentos: 0,
        s3_master_url: HLS_BUCKET,
        s3_master_existe: true,
      },
      ...overrides.trechos,
    },
    exatas: { "/catalogo/v-bucket": VIDEO_DO_BUCKET, ...overrides.exatas },
  });
}

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
  window.history.replaceState({}, "", window.location.pathname);
  delete window.PLAYER_CONFIG;
});

// ---------------------------------------------------------------------------
// resolveMediaUrl: a URL do bucket não pode ser mexida
// ---------------------------------------------------------------------------

describe("api.js — URL de mídia vinda do bucket", () => {
  test("URL https do bucket passa intacta (sem prefixar a origem da API)", async () => {
    const { resolveMediaUrl } = await import("../js/api.js");

    expect(resolveMediaUrl(HLS_BUCKET)).toBe(HLS_BUCKET);
    expect(resolveMediaUrl(THUMB_BUCKET)).toBe(THUMB_BUCKET);
  });

  test("caminho relativo da API continua prefixado com a origem do backend", async () => {
    const { resolveMediaUrl } = await import("../js/api.js");

    expect(resolveMediaUrl("/videos/v-local/master.m3u8"))
      .toBe(`${API_BASE}/videos/v-local/master.m3u8`);
  });
});

// ---------------------------------------------------------------------------
// catalog.js: vídeo do bucket é reconhecido como pronto
// ---------------------------------------------------------------------------

describe("catalog.js — vídeo com origem no bucket", () => {
  test("paraCard mantém a URL do bucket e marca como pronta", async () => {
    const { paraCard, temStream } = await import("../js/catalog.js");
    const card = paraCard(VIDEO_DO_BUCKET);

    expect(card.id).toBe("v-bucket");
    expect(card.hlsUrl).toBe(HLS_BUCKET);
    expect(card.thumbnail).toBe(THUMB_BUCKET);
    expect(card.pronta).toBe(true);
    expect(temStream(card)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// player.js: os três caminhos de reprodução com a mídia no bucket
// ---------------------------------------------------------------------------

describe("player.js — reprodução a partir do bucket", () => {
  test("auto-seleção toca a URL do bucket sem alterar nada nela", async () => {
    rotasDoBucket();

    await subirPlayer();

    expect(urlsCarregadas).toEqual([HLS_BUCKET]);
    expect(erroVisivel()).toBe(false);
  });

  test("watch page (?video=) busca o metadado e toca o bucket", async () => {
    rotasDoBucket();

    await subirPlayer("?video=v-bucket");

    expect(urlsCarregadas).toEqual([HLS_BUCKET]);
    expect(document.querySelector("#videoTitle").textContent)
      .toBe("Aula gravada no Supabase Storage");
  });

  test("clique num card do bucket troca a reprodução para a URL dele", async () => {
    const fetchMock = rotasDoBucket();

    await subirPlayer();

    window.dispatchEvent(new CustomEvent("video-selected", {
      detail: {
        id: "v-bucket",
        title: "Aula gravada no Supabase Storage",
        pronta: true,
        hlsUrl: HLS_BUCKET,
      },
    }));
    await flush();

    // Toda reprodução registrada aponta para o bucket — nenhuma para a API.
    expect(urlsCarregadas.length).toBeGreaterThanOrEqual(1);
    expect(urlsCarregadas.at(-1)).toBe(HLS_BUCKET);
    expect(urlsCarregadas.every((url) => url === HLS_BUCKET)).toBe(true);
    // A visualização é registrada na API, não no bucket.
    const watch = fetchMock.mock.calls.filter(([url, options]) =>
      String(url).includes("/watch") && options?.method === "POST");
    expect(watch.length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(watch.at(-1)[1].body).video_id).toBe("v-bucket");
  });

  test("thumbnail do bucket entra no card de relacionados", async () => {
    rotasDoBucket({
      trechos: {
        "/relacionados": {
          video_id: "v-bucket",
          relacionados: [VIDEO_DO_BUCKET],
        },
      },
    });

    await subirPlayer();

    const imagens = [...document.querySelectorAll("#relatedVideos img")]
      .map((img) => img.getAttribute("src"));
    expect(imagens).toContain(THUMB_BUCKET);
  });
});

// ---------------------------------------------------------------------------
// Falha no bucket: bucket privado / CORS / chave errada não podem virar loop
// ---------------------------------------------------------------------------

describe("player.js — stream do bucket que falha", () => {
  test("404 no bucket não entra em loop e explica que a mídia não está lá", async () => {
    ligarFakeTimers();
    rotasDoBucket({
      trechos: {
        // O metadado diz pronto, mas o /media (que reflete o disco E o bucket)
        // mostra que o master sumiu do Storage.
        "/media/v-bucket": {
          video_id: "v-bucket",
          media_pronta: false,
          origem: null,
          segmentos: 0,
          s3_master_url: HLS_BUCKET,
          s3_master_existe: false,
        },
      },
    });

    await subirPlayer();

    expect(urlsCarregadas).toEqual([HLS_BUCKET]);

    instancias[0].emitir(FakeHls.Events.ERROR, {
      fatal: true,
      type: FakeHls.ErrorTypes.NETWORK_ERROR,
      response: { code: 404 },
    });
    await flush();

    expect(erroVisivel()).toBe(true);
    expect(mensagemDeErro()).toContain("arquivos HLS não foram encontrados");
    // Com bucket configurado, o diagnóstico aponta para o Storage — não para
    // a pasta local videos/ (que nem existe na máquina da API).
    expect(mensagemDeErro()).toContain("bucket");
    expect(mensagemDeErro()).toContain("projeto.supabase.co");

    // Esperar 30s não pode gerar nova tentativa (era o loop infinito).
    await avancar(30_000);

    expect(urlsCarregadas).toHaveLength(1);
  });

  test("erro de rede no bucket tenta no máximo 3 vezes e para", async () => {
    ligarFakeTimers();
    rotasDoBucket();

    await subirPlayer();

    for (let i = 0; i < 5; i += 1) {
      instancias.at(-1).emitir(FakeHls.Events.ERROR, {
        fatal: true,
        type: FakeHls.ErrorTypes.NETWORK_ERROR,
        response: { code: 500 },
      });
      await avancar(3_000);
    }

    expect(urlsCarregadas).toHaveLength(3);
    expect(mensagemDeErro()).toContain("após 3 tentativas");
    expect(instancias.at(-1).destruido).toBe(true);
  });
});
