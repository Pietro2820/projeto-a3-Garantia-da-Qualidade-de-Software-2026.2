/**
 * Testes do adaptador API ↔ cards (js/catalog.js).
 *
 * O `fetch` é dublado — nenhum teste faz HTTP de verdade. O ponto central aqui
 * é a RESILIÊNCIA: com o backend fora do ar, sem credenciais (503) ou com a
 * rota inexistente (404), o player tem que continuar de pé mostrando os vídeos
 * de demonstração. É isso que garante que a apresentação não depende de o
 * Supabase estar configurado no dia.
 */
import { jest } from "@jest/globals";

import {
  atualizarCatalogoDaApi,
  buscarEmAlta,
  buscarRelacionados,
  formatarVisualizacoes,
  paraCard,
  registrarVisualizacao,
} from "../js/catalog.js";

const VIDEO_DA_API = {
  video_id: "v-fra",
  titulo: "Frações",
  descricao: "Aula sobre frações",
  tags: ["matemática", "frações"],
  categoria: "Matemática",
  autor: "Rafael",
  criado_em: "2026-01-01T00:00:00+00:00",
  status: "completed",
  views: 42,
  hls_url: "/videos/v-fra/master.m3u8",
  thumbnail_url: "/videos/v-fra/thumbnail.jpg",
  score: 0.5,
};

function responderJson(mapaDeRotas) {
  global.fetch = jest.fn(async (url) => {
    for (const [trecho, corpo] of Object.entries(mapaDeRotas)) {
      if (url.includes(trecho)) {
        return { ok: true, status: 200, json: async () => corpo };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  return global.fetch;
}

function falharFetch(mensagem = "Failed to fetch") {
  global.fetch = jest.fn(async () => {
    throw new TypeError(mensagem);
  });
}

beforeEach(() => {
  jest.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
});

// ---------------------------------------------------------------------------
// formatarVisualizacoes
// ---------------------------------------------------------------------------

describe("formatarVisualizacoes", () => {
  test.each([
    [842, "842 visualizações"],
    [1, "1 visualização"],
    [0, "0 visualizações"],
    [1100, "1,1 mil visualizações"],
    [2300, "2,3 mil visualizações"],
    [15000, "15 mil visualizações"],
  ])("%p -> %p", (entrada, esperado) => {
    expect(formatarVisualizacoes(entrada)).toBe(esperado);
  });

  test.each([
    ["texto", "0 visualizações"],
    [null, "0 visualizações"],
    [undefined, "0 visualizações"],
    [NaN, "0 visualizações"],
    [-5, "0 visualizações"],
  ])("valor inválido (%p) não quebra o card", (entrada, esperado) => {
    expect(formatarVisualizacoes(entrada)).toBe(esperado);
  });
});

// ---------------------------------------------------------------------------
// paraCard — tradução contrato #2 (português) -> card (inglês)
// ---------------------------------------------------------------------------

describe("paraCard", () => {
  test("traduz os campos do backend para o formato do card", () => {
    const card = paraCard(VIDEO_DA_API);

    expect(card).toEqual({
      id: "v-fra",
      title: "Frações",
      views: "42 visualizações",
      duration: "",
      thumbnail: "/videos/v-fra/thumbnail.jpg",
      hlsUrl: "/videos/v-fra/master.m3u8",
      score: 0.5,
    });
  });

  test("deixa passar um vídeo que já está no formato do card", () => {
    const demo = { id: "d1", title: "Demo", views: "842 visualizações", duration: "12:32", thumbnail: "./t.svg" };

    expect(paraCard(demo)).toMatchObject({ id: "d1", title: "Demo", views: "842 visualizações" });
  });

  test.each([
    ["null", null],
    ["undefined", undefined],
    ["string", "texto"],
    ["número", 42],
  ])("devolve null para entrada inválida: %s", (_descricao, entrada) => {
    expect(paraCard(entrada)).toBeNull();
  });

  test("vídeo sem nenhum campo recebe valores padrão seguros", () => {
    const card = paraCard({});

    expect(card.title).toBe("Vídeo sem título");
    expect(card.id).toBe("");
    expect(card.hlsUrl).toBeNull();
    expect(card.score).toBeNull();
  });

  test("views vindo como texto não é reformatado", () => {
    expect(paraCard({ video_id: "x", titulo: "X", views: "1,1 mil visualizações" }).views).toBe(
      "1,1 mil visualizações"
    );
  });

  test("score que não é número vira null", () => {
    expect(paraCard({ video_id: "x", score: "alto" }).score).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buscarRelacionados / buscarEmAlta
// ---------------------------------------------------------------------------

describe("buscarRelacionados", () => {
  test("traz os relacionados convertidos para card", async () => {
    responderJson({ "/relacionados": { video_id: "v-geo", relacionados: [VIDEO_DA_API] } });

    const resultado = await buscarRelacionados("v-geo");

    expect(resultado).toHaveLength(1);
    expect(resultado[0].title).toBe("Frações");
    expect(global.fetch.mock.calls[0][0]).toContain("/videos/v-geo/relacionados");
  });

  test("lista vazia do backend devolve lista vazia", async () => {
    responderJson({ "/relacionados": { video_id: "v-geo", relacionados: [] } });

    expect(await buscarRelacionados("v-geo")).toEqual([]);
  });

  test("backend fora do ar devolve lista vazia em vez de lançar", async () => {
    falharFetch();

    await expect(buscarRelacionados("v-geo")).resolves.toEqual([]);
  });

  test("HTTP 503 (banco sem credenciais) devolve lista vazia", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));

    await expect(buscarRelacionados("v-geo")).resolves.toEqual([]);
  });

  test("resposta fora do formato esperado não quebra", async () => {
    responderJson({ "/relacionados": { inesperado: true } });

    await expect(buscarRelacionados("v-geo")).resolves.toEqual([]);
  });

  test("descarta itens inválidos vindos na lista", async () => {
    responderJson({ "/relacionados": { relacionados: [VIDEO_DA_API, null, "lixo"] } });

    const resultado = await buscarRelacionados("v-geo");

    expect(resultado).toHaveLength(1);
  });
});

describe("buscarEmAlta", () => {
  test("traz o trending convertido para card", async () => {
    responderJson({ "/trending": { trending: [VIDEO_DA_API] } });

    const resultado = await buscarEmAlta();

    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe("v-fra");
  });

  test("sem visualizações o backend manda lista vazia com motivo", async () => {
    responderJson({ "/trending": { trending: [], motivo: "nenhuma visualização" } });

    await expect(buscarEmAlta()).resolves.toEqual([]);
  });

  test("backend fora do ar devolve lista vazia", async () => {
    falharFetch();

    await expect(buscarEmAlta()).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// registrarVisualizacao
// ---------------------------------------------------------------------------

describe("registrarVisualizacao", () => {
  test("devolve true quando a API aceita", async () => {
    responderJson({ "/watch": { video_id: "v-fra", views: 1, registrado: true } });

    expect(await registrarVisualizacao("v-fra", "gustavo")).toBe(true);
  });

  test("envia video_id e user_id no corpo do POST", async () => {
    responderJson({ "/watch": { registrado: true } });

    await registrarVisualizacao("v-fra", "gustavo");

    const [, options] = global.fetch.mock.calls.at(-1);
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ video_id: "v-fra", user_id: "gustavo" });
  });

  test.each([
    ["sem id", "", "gustavo"],
    ["id nulo", null, "gustavo"],
    ["id indefinido", undefined, "gustavo"],
  ])("%s: nem chama a API", async (_descricao, videoId, userId) => {
    const fetch = responderJson({ "/watch": { registrado: true } });

    expect(await registrarVisualizacao(videoId, userId)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("API fora do ar devolve false em vez de lançar", async () => {
    falharFetch();

    await expect(registrarVisualizacao("v-fra", "gustavo")).resolves.toBe(false);
  });

  test("funciona sem usuário anônimo", async () => {
    responderJson({ "/watch": { registrado: true } });

    expect(await registrarVisualizacao("v-fra")).toBe(true);
    expect(JSON.parse(global.fetch.mock.calls.at(-1)[1].body).user_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// atualizarCatalogoDaApi
// ---------------------------------------------------------------------------

function criarContainer() {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

describe("atualizarCatalogoDaApi", () => {
  test("troca os cards de demonstração pelos dados da API", async () => {
    responderJson({
      "/relacionados": { relacionados: [VIDEO_DA_API] },
      "/trending": { trending: [VIDEO_DA_API, { ...VIDEO_DA_API, video_id: "v-geo", titulo: "Geometria" }] },
    });
    const related = criarContainer();
    const sidebar = criarContainer();

    await atualizarCatalogoDaApi({ relatedContainer: related, sidebarContainer: sidebar, videoId: "v-x" });

    expect(related.querySelectorAll("article").length).toBe(1);
    expect(sidebar.querySelectorAll("article").length).toBe(2);
  });

  test("com o backend fora, não redesenha nada (mantém a demonstração)", async () => {
    falharFetch();
    const related = criarContainer();
    related.innerHTML = "<article class='video-card'>demo</article>";
    const sidebar = criarContainer();
    sidebar.innerHTML = "<article class='video-card'>demo</article>";

    await atualizarCatalogoDaApi({ relatedContainer: related, sidebarContainer: sidebar, videoId: "v-x" });

    expect(related.textContent).toBe("demo");
    expect(sidebar.textContent).toBe("demo");
  });

  test("devolve as duas listas para quem quiser inspecionar", async () => {
    responderJson({
      "/relacionados": { relacionados: [VIDEO_DA_API] },
      "/trending": { trending: [] },
    });

    const resultado = await atualizarCatalogoDaApi({
      relatedContainer: criarContainer(),
      sidebarContainer: criarContainer(),
      videoId: "v-x",
    });

    expect(resultado.relacionados).toHaveLength(1);
    expect(resultado.emAlta).toHaveLength(0);
  });

  test("consulta as duas rotas em paralelo", async () => {
    const fetch = responderJson({ "/relacionados": { relacionados: [] }, "/trending": { trending: [] } });

    await atualizarCatalogoDaApi({
      relatedContainer: criarContainer(),
      sidebarContainer: criarContainer(),
      videoId: "v-x",
    });

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("sobrevive a containers ausentes", async () => {
    responderJson({ "/relacionados": { relacionados: [VIDEO_DA_API] }, "/trending": { trending: [VIDEO_DA_API] } });

    await expect(
      atualizarCatalogoDaApi({ relatedContainer: null, sidebarContainer: null, videoId: "v-x" })
    ).resolves.toBeDefined();
  });
});
