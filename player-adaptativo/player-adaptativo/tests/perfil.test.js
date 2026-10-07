/**
 * Menu de perfil (js/perfil.js) — o 👤 do topo.
 *
 * Cobre: abrir/fechar, salvar o nome (que vira o user_id do POST /watch),
 * carregar GET /recomendacoes/{user_id}, clicar numa sugestão e sair.
 * O fetch é dublado; o DOM é criado pelo próprio módulo (como no navegador).
 *
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";

const RECOMENDACAO = {
  video_id: "v-sugerido",
  titulo: "Geometria básica",
  views: 4,
  media_pronta: true,
  hls_url: "http://localhost:8000/videos/v-sugerido/master.m3u8",
  thumbnail_url: "http://localhost:8000/videos/v-sugerido/thumbnail.jpg",
};

let fetchMock;

function mockarApi({ recomendacoes = [RECOMENDACAO], motivo = null, falhar = false } = {}) {
  fetchMock = jest.fn(async (url) => {
    const alvo = String(url);

    if (alvo.includes("/recomendacoes/")) {
      if (falhar) return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ recomendacoes, motivo }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  global.fetch = fetchMock;
  return fetchMock;
}

async function subirPerfil(opcoes = {}) {
  jest.resetModules();
  window.localStorage.clear();
  document.body.innerHTML = '<button id="profileButton" type="button">👤</button>';

  const { iniciarPerfil } = await import("../js/perfil.js");
  return iniciarPerfil(opcoes);
}

async function flush(vezes = 6) {
  for (let i = 0; i < vezes; i += 1) {
    await new Promise((resolver) => setTimeout(resolver, 0));
  }
}

const painel = () => document.querySelector("#profileMenu");

beforeEach(() => {
  jest.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
  window.localStorage.clear();
  delete window.PLAYER_CONFIG;
});

describe("perfil — abertura", () => {
  test("não cria nada se a página não tem o botão", async () => {
    jest.resetModules();
    document.body.innerHTML = "<div></div>";

    const { iniciarPerfil } = await import("../js/perfil.js");

    expect(iniciarPerfil()).toBeNull();
    expect(painel()).toBeNull();
  });

  test("clique no botão abre o painel e busca as recomendações", async () => {
    mockarApi();
    await subirPerfil();

    expect(painel().classList.contains("hidden")).toBe(true);

    document.querySelector("#profileButton").click();
    await flush();

    expect(painel().classList.contains("hidden")).toBe(false);
    expect(String(fetchMock.mock.calls.at(-1)[0])).toContain("/recomendacoes/");
    expect(painel().querySelectorAll(".profile-item")).toHaveLength(1);
  });

  test("clique fora e tecla Escape fecham o painel", async () => {
    mockarApi();
    await subirPerfil();

    document.querySelector("#profileButton").click();
    await flush();
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(painel().classList.contains("hidden")).toBe(true);

    document.querySelector("#profileButton").click();
    await flush();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(painel().classList.contains("hidden")).toBe(true);
  });
});

describe("perfil — identidade", () => {
  test("salvar o nome troca o identificador e avisa quem se inscreveu", async () => {
    mockarApi();
    const aoTrocarUsuario = jest.fn();
    await subirPerfil({ aoTrocarUsuario });

    document.querySelector("#profileButton").click();
    await flush();

    painel().querySelector("#profileName").value = "  Rafael  ";
    painel().querySelector("#profileForm").dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();

    expect(aoTrocarUsuario).toHaveBeenCalledWith("Rafael");
    expect(painel().querySelector("#profileTitle").textContent).toBe("Rafael");
    expect(painel().querySelector("#profileId").textContent).toContain("Rafael");
  });

  test("depois de salvar, as recomendações são pedidas com o novo user_id", async () => {
    mockarApi();
    await subirPerfil();

    document.querySelector("#profileButton").click();
    await flush();
    painel().querySelector("#profileName").value = "gustavo";
    painel().querySelector("#profileForm").dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();

    expect(String(fetchMock.mock.calls.at(-1)[0])).toContain("/recomendacoes/gustavo");
  });

  test("sair volta a Convidado e desabilita o botão de sair", async () => {
    mockarApi();
    await subirPerfil();

    document.querySelector("#profileButton").click();
    await flush();
    painel().querySelector("#profileName").value = "Rafael";
    painel().querySelector("#profileForm").dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();

    painel().querySelector("#profileLogout").click();
    await flush();

    expect(painel().querySelector("#profileTitle").textContent).toBe("Convidado");
    expect(painel().querySelector("#profileLogout").disabled).toBe(true);
  });
});

describe("perfil — recomendações", () => {
  test("sem histórico mostra o motivo devolvido pela API", async () => {
    mockarApi({ recomendacoes: [], motivo: "usuário ainda não assistiu nenhum vídeo" });
    await subirPerfil();

    document.querySelector("#profileButton").click();
    await flush();

    expect(painel().querySelector("#profileRecommendations").textContent)
      .toContain("Usuário ainda não assistiu nenhum vídeo");
  });

  test("API com erro não quebra o painel (mensagem legível)", async () => {
    mockarApi({ falhar: true });
    await subirPerfil();

    document.querySelector("#profileButton").click();
    await flush();

    expect(painel().querySelector("#profileRecommendations").textContent)
      .toContain("Não foi possível carregar");
    expect(painel().classList.contains("hidden")).toBe(false);
  });

  test("vídeo sugerido sem mídia vem desabilitado", async () => {
    mockarApi({ recomendacoes: [{ ...RECOMENDACAO, video_id: "v-x", media_pronta: false }] });
    await subirPerfil();

    document.querySelector("#profileButton").click();
    await flush();

    const item = painel().querySelector(".profile-item");
    expect(item.disabled).toBe(true);
    expect(item.textContent).toContain("sem mídia");
  });

  test("clique na sugestão dispara video-selected com o vídeo", async () => {
    mockarApi();
    await subirPerfil();

    document.querySelector("#profileButton").click();
    await flush();

    let recebido = null;
    window.addEventListener("video-selected", (event) => { recebido = event.detail; });

    painel().querySelector(".profile-item").click();

    expect(recebido?.id).toBe("v-sugerido");
    expect(recebido?.hlsUrl).toContain("/videos/v-sugerido/master.m3u8");
  });
});
