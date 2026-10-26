/**
 * Busca chegando pela URL: home.html?q={termo}.
 *
 * É o caminho que a watch page usa (o formulário de pesquisa do index.html
 * navega para a home com o termo) — antes ele simplesmente não existia e o
 * submit recarregava a página perdendo o vídeo em reprodução.
 *
 * A URL do jsdom é fixa por arquivo de teste, por isso este caso mora num
 * arquivo próprio com `@jest-environment-options`.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost:8000/player/home.html?q=geo"}
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const homeHtml = readFileSync(
  fileURLToPath(new URL("../home.html", import.meta.url)),
  "utf8"
);

const V_GEO = {
  video_id: "v2",
  titulo: "Geometria básica",
  views: 4,
  media_pronta: true,
  hls_url: "http://localhost:8000/videos/v2/master.m3u8",
  thumbnail_url: "http://localhost:8000/videos/v2/thumbnail.jpg",
};

let fetchMock;

beforeEach(() => {
  jest.spyOn(console, "info").mockImplementation(() => {});
  fetchMock = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ videos: [V_GEO], total: 1 }),
  }));
  global.fetch = fetchMock;
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
});

async function subirHome() {
  jest.resetModules();

  const pagina = new DOMParser().parseFromString(homeHtml, "text/html");
  document.body.innerHTML = pagina.body.innerHTML;

  await import("../js/home.js");

  for (let i = 0; i < 4; i += 1) {
    await new Promise((resolver) => setTimeout(resolver, 0));
  }
}

test("o termo da URL já vem aplicado no campo e na consulta ao catálogo", async () => {
  await subirHome();

  expect(document.querySelector("#searchInput").value).toBe("geo");
  expect(String(fetchMock.mock.calls[0][0])).toContain("q=geo");
  expect(document.querySelector("#homeTitle").textContent).toContain("geo");
  expect(document.querySelectorAll("#homeGrid a.home-card")).toHaveLength(1);
});
