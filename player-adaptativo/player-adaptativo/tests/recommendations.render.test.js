/**
 * Testes REAIS do módulo de recomendações (js/recommendations.js).
 *
 * Diferença para o tests/recommendations.test.js original (que só assertava
 * `expect(video.title).toBeTruthy()` num objeto criado no próprio teste):
 * aqui importamos `renderRecommendations`/`renderSidebar` e verificamos o DOM
 * que eles produzem — inclusive o escaping de HTML, que é a proteção contra XSS
 * ao renderizar títulos vindos da API.
 */
import {
  DEMO_VIDEOS,
  renderRecommendations,
  renderSidebar,
} from "../js/recommendations.js";

function criarContainer() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

const VIDEOS = [
  { id: "v1", title: "Aula de Frações", views: "10 visualizações", duration: "05:00", thumbnail: "./t1.svg" },
  { id: "v2", title: "Aula de Geometria", views: "20 visualizações", duration: "07:30", thumbnail: "./t2.svg" },
];

afterEach(() => {
  document.body.innerHTML = "";
});

describe("renderRecommendations", () => {
  test("renderiza um card por vídeo", () => {
    const container = criarContainer();

    renderRecommendations(container, VIDEOS);

    expect(container.querySelectorAll("article.video-card")).toHaveLength(2);
  });

  test("mostra título, duração e visualizações no card", () => {
    const container = criarContainer();

    renderRecommendations(container, [VIDEOS[0]]);

    expect(container.querySelector(".card-title").textContent).toBe("Aula de Frações");
    expect(container.querySelector(".card-meta").textContent).toBe("10 visualizações");
    expect(container.querySelector(".thumbnail-duration").textContent).toBe("05:00");
  });

  test("guarda o video_id no card (é o que o player usa para trocar de vídeo)", () => {
    const container = criarContainer();

    renderRecommendations(container, VIDEOS);

    const ids = [...container.querySelectorAll("article")].map((a) => a.dataset.videoId);
    expect(ids).toEqual(["v1", "v2"]);
  });

  test("limpa o container antes de renderizar (não acumula cards)", () => {
    const container = criarContainer();
    renderRecommendations(container, VIDEOS);

    renderRecommendations(container, [VIDEOS[0]]);

    expect(container.querySelectorAll("article")).toHaveLength(1);
  });

  test("usa a lista de demonstração quando nenhum vídeo é informado", () => {
    const container = criarContainer();

    renderRecommendations(container);

    expect(container.querySelectorAll("article")).toHaveLength(DEMO_VIDEOS.length);
  });

  test("lista vazia não renderiza nenhum card", () => {
    const container = criarContainer();

    renderRecommendations(container, []);

    expect(container.querySelectorAll("article")).toHaveLength(0);
  });

  test("escapa HTML do título — proteção contra XSS", () => {
    const container = criarContainer();

    renderRecommendations(container, [
      { id: "x", title: '<img src=x onerror="alert(1)">', views: "", duration: "", thumbnail: "" },
    ]);

    expect(container.querySelector("img[src='x']")).toBeNull();
    expect(container.querySelector(".card-title").innerHTML).toContain("&lt;img");
  });

  test("vídeo sem título recebe rótulo de fallback", () => {
    const container = criarContainer();

    renderRecommendations(container, [{ id: "sem-titulo" }]);

    expect(container.querySelector(".card-title").textContent).toBe("Vídeo sem título");
  });

  test("thumbnail é carregada de forma preguiçosa (lazy) e tem alt", () => {
    const container = criarContainer();

    renderRecommendations(container, VIDEOS);

    const img = container.querySelector(".thumbnail img");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.hasAttribute("alt")).toBe(true);
  });

  test("clique no card dispara o evento video-selected com o vídeo", () => {
    const container = criarContainer();
    renderRecommendations(container, VIDEOS);

    let recebido = null;
    window.addEventListener("video-selected", (event) => {
      recebido = event.detail;
    });
    container.querySelector("article").click();

    expect(recebido).toEqual(VIDEOS[0]);
  });
});

describe("renderSidebar", () => {
  test("limita a 5 vídeos por padrão", () => {
    const container = criarContainer();
    expect(DEMO_VIDEOS.length).toBeGreaterThan(5);

    renderSidebar(container);

    expect(container.querySelectorAll("article")).toHaveLength(5);
  });

  test("aceita uma lista própria de vídeos", () => {
    const container = criarContainer();

    renderSidebar(container, VIDEOS);

    expect(container.querySelectorAll("article")).toHaveLength(2);
  });

  test("também limpa o container antes de renderizar", () => {
    const container = criarContainer();
    renderSidebar(container, VIDEOS);

    renderSidebar(container, [VIDEOS[0]]);

    expect(container.querySelectorAll("article")).toHaveLength(1);
  });
});

describe("DEMO_VIDEOS", () => {
  test("todo vídeo de demonstração tem os campos que o card usa", () => {
    for (const video of DEMO_VIDEOS) {
      expect(typeof video.id).toBe("string");
      expect(typeof video.title).toBe("string");
      expect(video.thumbnail).toMatch(/^\.\/assets\/thumbnails\/.+\.svg$/);
    }
  });

  test("os ids de demonstração são únicos", () => {
    const ids = DEMO_VIDEOS.map((v) => v.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
