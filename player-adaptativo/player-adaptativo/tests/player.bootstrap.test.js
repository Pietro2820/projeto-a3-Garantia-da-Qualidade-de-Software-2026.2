/**
 * Teste de fumaça (smoke test) do bootstrap do player — js/player.js.
 *
 * `player.js` não exporta nada: ele É a página. Por isso o teste carrega o
 * `index.html` real no jsdom e importa o módulo, deixando o `initialize()`
 * rodar exatamente como roda no navegador.
 *
 * O que se valida aqui não é regra de negócio (isso está nos testes de
 * controls/quality/recommendations/api), e sim a FIAÇÃO: a página sobe sem
 * quebrar, os painéis de loading/erro/alerta são controlados corretamente e
 * a API pública `window.eduStreamPlayer` existe.
 *
 * Sem a lib HLS.js no ar, o caminho exercitado é o de fallback — que é justo
 * o que um navegador sem suporte a HLS mostraria ao usuário final.
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const indexHtml = readFileSync(
  fileURLToPath(new URL("../index.html", import.meta.url)),
  "utf8"
);

let player;

beforeAll(async () => {
  // O bootstrap tenta buscar dados na API; sem servidor no ar o catálogo cai
  // no fallback (DEMO_VIDEOS) e loga console.info. É o comportamento esperado,
  // só não precisa poluir a saída do teste.
  jest.spyOn(console, "info").mockImplementation(() => {});

  const pagina = new DOMParser().parseFromString(indexHtml, "text/html");
  document.body.innerHTML = pagina.body.innerHTML;

  await import("../js/player.js");
  player = window.eduStreamPlayer;
});

function visivel(seletor) {
  return !document.querySelector(seletor).classList.contains("hidden");
}

describe("player.js — a página sobe", () => {
  test("initialize() roda sem lançar exceção", () => {
    expect(player).toBeDefined();
  });

  test("expõe a API pública window.eduStreamPlayer", () => {
    expect(typeof player.loadVideo).toBe("function");
    expect(typeof player.destroy).toBe("function");
    expect(typeof player.getHls).toBe("function");
    expect(typeof player.getQualityManager).toBe("function");
  });

  test("sem a lib HLS.js carregada, não há instância de Hls nem QualityManager", () => {
    expect(player.getHls()).toBeNull();
    expect(player.getQualityManager()).toBeNull();
  });

  test("popula a sidebar com os vídeos de demonstração", () => {
    expect(document.querySelectorAll("#sidebarVideos article.video-card").length).toBeGreaterThan(0);
  });

  test("popula a seção de relacionados", () => {
    expect(document.querySelectorAll("#relatedVideos article.video-card").length).toBeGreaterThan(0);
  });
});

describe("player.js — fallback sem suporte a HLS", () => {
  test("mostra o painel de erro explicando que o navegador não suporta HLS", () => {
    expect(visivel("#playerError")).toBe(true);
    expect(document.querySelector("#playerErrorMessage").textContent).toBe(
      "Este navegador não suporta HLS."
    );
  });

  test("o painel de loading é escondido junto com o erro", () => {
    expect(visivel("#playerLoading")).toBe(false);
  });
});

describe("player.js — loadVideo", () => {
  test("sem URL configurada, reclama de forma legível", () => {
    player.loadVideo("");

    expect(document.querySelector("#playerErrorMessage").textContent).toBe(
      "Nenhuma URL HLS foi configurada."
    );
    expect(visivel("#playerError")).toBe(true);
  });

  test("o estado final é consistente: erro visível e loading escondido", () => {
    player.loadVideo("");

    expect(visivel("#playerError")).toBe(true);
    expect(visivel("#playerLoading")).toBe(false);
  });

  test("destroy() é seguro mesmo sem Hls instanciado", () => {
    expect(() => player.destroy()).not.toThrow();
    expect(player.getHls()).toBeNull();
  });
});

describe("player.js — eventos de conexão", () => {
  test("ficar offline mostra o alerta com aviso", () => {
    window.dispatchEvent(new Event("offline"));

    expect(visivel("#connectionAlert")).toBe(true);
    expect(document.querySelector("#connectionMessage").textContent).toContain("offline");
  });

  test("voltar a ficar online atualiza a mensagem", () => {
    window.dispatchEvent(new Event("online"));

    expect(document.querySelector("#connectionMessage").textContent).toContain(
      "Conexão recuperada"
    );
  });
});

describe("player.js — controles não quebram sem QualityManager", () => {
  test("clique em 'reduzir qualidade' não lança (encadeamento opcional)", () => {
    expect(() => document.querySelector("#reduceQualityButton").click()).not.toThrow();
  });

  test("clique em 'dispensar alerta' não lança", () => {
    expect(() => document.querySelector("#dismissQualityButton").click()).not.toThrow();
  });

  test("trocar a qualidade no <select> captura o erro em vez de derrubar a página", () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const select = document.querySelector("#qualitySelect");
    select.value = "99";

    expect(() => select.dispatchEvent(new Event("change"))).not.toThrow();
  });

  test("clique em 'tentar novamente' reexecuta o loadVideo sem lançar", () => {
    expect(() => document.querySelector("#retryButton").click()).not.toThrow();
  });
});
