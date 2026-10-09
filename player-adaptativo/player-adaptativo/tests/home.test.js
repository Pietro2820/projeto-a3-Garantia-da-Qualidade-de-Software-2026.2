/**
 * Testes da home estilo YouTube (home.html + js/home.js).
 *
 * O fetch é dublado por rota (nenhum teste faz rede): o catálogo vem de
 * GET /catalogo e a página precisa renderizar a grade, a contagem, o estado
 * vazio com o passo a passo da demo e a busca com ?q=.
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const homeHtml = readFileSync(
  fileURLToPath(new URL("../home.html", import.meta.url)),
  "utf8"
);

const V1 = {
  video_id: "v1",
  titulo: "Frações — introdução",
  views: 3,
  hls_url: "http://localhost:8000/videos/v1/master.m3u8",
  thumbnail_url: "http://localhost:8000/videos/v1/thumbnail.jpg",
};

const V2 = {
  video_id: "v2",
  titulo: "Geometria básica",
  views: 1,
  hls_url: "http://localhost:8000/videos/v2/master.m3u8",
  thumbnail_url: "http://localhost:8000/videos/v2/thumbnail.jpg",
};

/** Dubla GET /catalogo; com `porTermo` dá para responder diferente por busca. */
function mockarCatalogo(videos, porTermo = {}) {
  global.fetch = jest.fn(async (url) => {
    const alvo = String(url);
    if (!alvo.includes("/catalogo")) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    for (const [termo, lista] of Object.entries(porTermo)) {
      if (alvo.includes(`q=${termo}`)) {
        return { ok: true, status: 200, json: async () => ({ videos: lista, total: lista.length }) };
      }
    }
    return { ok: true, status: 200, json: async () => ({ videos, total: videos.length }) };
  });
  return global.fetch;
}

async function subirHome() {
  jest.resetModules();

  const pagina = new DOMParser().parseFromString(homeHtml, "text/html");
  document.body.innerHTML = pagina.body.innerHTML;

  await import("../js/home.js");

  for (let i = 0; i < 4; i += 1) {
    await new Promise((resolver) => setTimeout(resolver, 0));
  }
}

function flush(times = 3) {
  let promise = Promise.resolve();
  for (let i = 0; i < times; i += 1) {
    promise = promise.then(() => new Promise((resolver) => setTimeout(resolver, 0)));
  }
  return promise;
}

beforeEach(() => {
  jest.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("home — grade do catálogo", () => {
  test("renderiza um card linkado para a watch page por vídeo", async () => {
    mockarCatalogo([V1, V2]);

    await subirHome();

    const cards = document.querySelectorAll("#homeGrid a.home-card");
    expect(cards).toHaveLength(2);
    expect(cards[0].getAttribute("href")).toBe("index.html?video=v1");
    expect(cards[0].textContent).toContain("Frações — introdução");
  });

  test("mostra a contagem de vídeos no cabeçalho da seção", async () => {
    mockarCatalogo([V1, V2]);

    await subirHome();

    expect(document.querySelector("#homeCount").textContent).toBe("2 vídeos");
  });

  test("thumbnail vem da URL absoluta devolvida pela API", async () => {
    mockarCatalogo([V1]);

    await subirHome();

    const img = document.querySelector("#homeGrid img");
    expect(img.getAttribute("src")).toBe(V1.thumbnail_url);
  });

  test("catálogo vazio mostra o estado vazio com o passo a passo da demo", async () => {
    mockarCatalogo([]);

    await subirHome();

    const vazio = document.querySelector("#homeEmpty");
    expect(vazio.classList.contains("hidden")).toBe(false);
    expect(vazio.textContent).toContain("demo_completo.py");
  });

  test("backend fora do ar não quebra a página (estado vazio explicativo)", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    await subirHome();

    const vazio = document.querySelector("#homeEmpty");
    expect(vazio.classList.contains("hidden")).toBe(false);
    expect(document.querySelectorAll("#homeGrid a.home-card")).toHaveLength(0);
    // Diz qual origem tentou e o que fazer — não apenas "lista vazia".
    expect(vazio.textContent).toContain("API não respondeu");
    expect(vazio.textContent).toContain("uvicorn app.main:app");
  });
});

describe("home — busca", () => {
  test("submit do formulário consulta /catalogo?q= e atualiza o título", async () => {
    const fetchMock = mockarCatalogo([V1, V2], { fra: [V1] });

    await subirHome();

    document.querySelector("#searchInput").value = "fra";
    document.querySelector("#searchForm")
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();

    // prontos=1: a home só lista o que já tem master.m3u8 no disco (dá play).
    expect(String(fetchMock.mock.calls.at(-1)[0])).toContain("/catalogo?prontos=1&q=fra");
    expect(document.querySelector("#homeTitle").textContent).toContain("fra");
    expect(document.querySelectorAll("#homeGrid a.home-card")).toHaveLength(1);
  });

  test("busca sem resultado esconde o passo a passo de upload", async () => {
    mockarCatalogo([V1], { xyz: [] });

    await subirHome();

    document.querySelector("#searchInput").value = "xyz";
    document.querySelector("#searchForm")
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();

    const vazio = document.querySelector("#homeEmpty");
    expect(vazio.classList.contains("hidden")).toBe(false);
    expect(vazio.classList.contains("hide-details")).toBe(true);
    expect(vazio.querySelector("strong").textContent).toContain("xyz");
  });
});
