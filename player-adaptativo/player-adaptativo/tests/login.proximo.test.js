/**
 * Testes do fluxo pós-login (js/login.js + js/sessao.js).
 *
 * O guard (sessao.js) manda o usuário deslogado para
 * login.html?proximo=<página>. Este arquivo garante o outro lado: depois de
 * autenticar (POST /login real, fetch dublado), o login.js grava a sessão
 * (entrar) e chama irParaDestino — que devolve o usuário EXATAMENTE para o
 * destino pedido (a allowlist do ?proximo tem suíte própria em
 * sessao.test.js). O cadastro (POST /cadastro + login automático) segue o
 * mesmo caminho.
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

/** Dubla a API por rota: /login devolve o usuário; /cadastro, 201 vazio. */
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
    if (alvo.includes("/cadastro")) {
      return { ok: true, status: 201, json: async () => ({}) };
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

describe("cadastro — conta criada, login automático e destino", () => {
  test("cadastro com ?proximo cria conta, loga e leva ao destino", async () => {
    mockarApi();
    montarPagina("/login.html?proximo=index.html%3Fvideo%3Dv2");
    const { entrar, irParaDestino } = await importarLogin();

    document.querySelector("#nomeCadastro").value = "Aluna de Teste";
    document.querySelector("#emailCadastro").value = "aluna@edustream.com";
    document.querySelector("#senhaCadastro").value = "senha12345";
    document.querySelector("#cadastroForm")
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();

    // Duas chamadas: POST /cadastro (cria) + POST /login (automático).
    const rotas = global.fetch.mock.calls.map(([url]) => String(url));
    expect(rotas.some((rota) => rota.includes("/cadastro"))).toBe(true);
    expect(rotas.some((rota) => rota.includes("/login"))).toBe(true);

    expect(entrar).toHaveBeenCalledWith(USUARIO);
    expect(irParaDestino).toHaveBeenCalledTimes(1);
  });
});
