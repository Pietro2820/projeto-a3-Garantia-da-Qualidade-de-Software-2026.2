/**
 * Testes do fluxo pós-login (js/login.js + js/sessao.js).
 *
 * O guard (sessao.js) manda o usuário deslogado para
 * login.html?proximo=<página>. Este arquivo garante o outro lado: depois de
 * autenticar (POST /login real, fetch dublado), o login.js grava a sessão
 * (entrar) e chama irParaDestino — que devolve o usuário EXATAMENTE para o
 * destino pedido (a allowlist do ?proximo tem suíte própria em
 * sessao.test.js).
 *
 * CRIAR CONTA agora é uma página separada (cadastro.html): o comportamento
 * dela tem suíte própria (tests/cadastro.test.js). Aqui ficam, além do
 * contrato de login, a afirmação de que o link "Criar conta" leva à página
 * nova PRESERVANDO o ?proximo.
 *
 * js/sessao.js é dublado por módulo (jest.unstable_mockModule, padrão ESM do
 * Jest): assim o teste afirma o CONTRATO entre login.js e sessao.js — e não
 * repete os cenários de navegação já cobertos por sessao.test.js.
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const loginHtml = readFileSync(
  fileURLToPath(new URL("../login.html", import.meta.url)),
  "utf8"
);

const USUARIO = {
  usuario_id: "9a1b2c3d-0000-0000-0000-000000000002",
  nome: "Aluna de Teste",
  email: "aluna@edustream.com",
};

/** Dubla a API: /login devolve o usuário autenticado. */
function mockarApi() {
  global.fetch = jest.fn(async (url) => {
    const alvo = String(url);
    if (alvo.includes("/login")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ usuario: USUARIO }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
}

function montarPagina(caminho = "/login.html") {
  window.history.replaceState(null, "", caminho);
  const pagina = new DOMParser().parseFromString(loginHtml, "text/html");
  document.body.innerHTML = pagina.body.innerHTML;
}

/**
 * Importa login.js com a sessão dublada. Devolve os dublês de sessão
 * (entrar/irParaDestino) para as asserções de contrato.
 */
async function importarLogin() {
  jest.resetModules();
  jest.unstable_mockModule("../js/sessao.js", () => ({
    entrar: jest.fn(),
    irParaDestino: jest.fn(),
  }));
  const sessaoDuble = await import("../js/sessao.js");
  await import("../js/login.js");
  return sessaoDuble;
}

function flush(times = 4) {
  let promise = Promise.resolve();
  for (let i = 0; i < times; i += 1) {
    promise = promise.then(() => new Promise((resolver) => setTimeout(resolver, 0)));
  }
  return promise;
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
  sessionStorage.clear();
  document.body.innerHTML = "";
});

describe("login — contrato com a sessão depois de autenticar", () => {
  test("login direto (sem ?proximo): grava o usuário e chama irParaDestino", async () => {
    mockarApi();
    montarPagina("/login.html");
    const { entrar, irParaDestino } = await importarLogin();

    document.querySelector("#email").value = "aluna@edustream.com";
    document.querySelector("#senha").value = "senha12345";
    document.querySelector("#loginForm")
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();

    expect(entrar).toHaveBeenCalledWith(USUARIO);
    expect(irParaDestino).toHaveBeenCalledTimes(1);
  });

  test("login vindo da watch page passa pelo mesmo contrato (?proximo no destino)", async () => {
    mockarApi();
    montarPagina("/login.html?proximo=index.html%3Fvideo%3Dv1");
    const { entrar, irParaDestino } = await importarLogin();

    document.querySelector("#email").value = "aluna@edustream.com";
    document.querySelector("#senha").value = "senha12345";
    document.querySelector("#loginForm")
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();

    expect(entrar).toHaveBeenCalledWith(USUARIO);
    expect(irParaDestino).toHaveBeenCalledTimes(1);
  });

  test("senha errada (401) NÃO grava sessão e NÃO navega", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ detail: "E-mail ou senha incorretos." }),
    }));
    montarPagina("/login.html");
    const { entrar, irParaDestino } = await importarLogin();

    document.querySelector("#email").value = "aluna@edustream.com";
    document.querySelector("#senha").value = "senha-errada";
    document.querySelector("#loginForm")
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();

    expect(entrar).not.toHaveBeenCalled();
    expect(irParaDestino).not.toHaveBeenCalled();
  });
});

describe("navegação Entrar → Criar conta", () => {
  test("o link 'Criar conta' aponta para cadastro.html e leva o ?proximo junto", async () => {
    montarPagina("/login.html?proximo=index.html%3Fvideo%3Dv1");
    await importarLogin();

    const link = document.querySelector("#linkCadastro");
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toContain("cadastro.html");
    expect(link.getAttribute("href")).toContain("proximo=index.html%3Fvideo%3Dv1");
  });

  test("sem ?proximo, o link fica limpo (só cadastro.html)", async () => {
    montarPagina("/login.html");
    await importarLogin();

    const link = document.querySelector("#linkCadastro");
    expect(link.getAttribute("href")).toBe("./cadastro.html");
  });

  test("a página de login não tem mais formulário de cadastro embutido", async () => {
    montarPagina("/login.html");
    await importarLogin();

    // A separação é a própria feature: nenhum resquício do formulário antigo.
    expect(document.querySelector("#cadastroForm")).toBeNull();
    expect(document.querySelector("#nomeCadastro")).toBeNull();
    expect(document.querySelector("#alternarFormulario")).toBeNull();
  });
});
