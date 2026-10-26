/**
 * A watch page aberta pela home: index.html?video={id}.
 *
 * O `@jest-environment-options` fixa a URL do jsdom com o query string — é o
 * que o js/player.js lê para saber qual vídeo tocar. O fetch dublado responde
 * em GET /catalogo/{id} e o HLS.js é um dublê que grava as URLs de loadSource.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost:8000/player/index.html?video=v-param"}
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const indexHtml = readFileSync(
  fileURLToPath(new URL("../index.html", import.meta.url)),
  "utf8"
);

let urlsCarregadas;

class FakeHls {
  constructor() {
    this.levels = [{ height: 360, bitrate: 464000 }];
    this.currentLevel = -1;
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

beforeEach(() => {
  urlsCarregadas = [];
  global.Hls = FakeHls;
  window.Hls = FakeHls;
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
});

async function subirWatchPage() {
  jest.resetModules();

  const pagina = new DOMParser().parseFromString(indexHtml, "text/html");
  document.body.innerHTML = pagina.body.innerHTML;

  await import("../js/player.js");

  for (let i = 0; i < 6; i += 1) {
    await new Promise((resolver) => setTimeout(resolver, 0));
  }
}

test("toca exatamente o vídeo pedido na URL", async () => {
  global.fetch = jest.fn(async (url) => {
    const alvo = String(url);
    if (alvo.includes("/catalogo/v-param")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          video_id: "v-param",
          titulo: "Vídeo escolhido na home",
          views: 2,
          hls_url: "http://localhost:8000/videos/v-param/master.m3u8",
          thumbnail_url: "http://localhost:8000/videos/v-param/thumbnail.jpg",
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });

  await subirWatchPage();

  expect(urlsCarregadas.at(-1)).toBe(
    "http://localhost:8000/videos/v-param/master.m3u8"
  );
  expect(document.querySelector("#videoTitle").textContent).toBe(
    "Vídeo escolhido na home"
  );
});

test("vídeo da URL que não existe mais: erro legível, sem spinner infinito", async () => {
  global.fetch = jest.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));

  await subirWatchPage();

  expect(document.querySelector("#playerError").classList.contains("hidden")).toBe(false);
  expect(document.querySelector("#playerErrorMessage").textContent).toContain(
    "não está pronto"
  );
  expect(document.querySelector("#playerLoading").classList.contains("hidden")).toBe(true);
});
