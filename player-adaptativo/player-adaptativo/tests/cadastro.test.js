/**
 * Testes da tela de CRIAR CONTA (cadastro.html + js/cadastro.js).
 *
 * A criação de conta ganhou página própria (antes era um formulário escondido
 * dentro do login.html). Esta suíte cobre o que é exclusivo dela:
 *   - confirmação de senha (dois campos precisam coincidir — erro ANTES de
 *     chamar a API);
 *   - o fluxo real: POST /cadastro → POST /login automático → entrar() +
 *     irParaDestino() no sessao.js (dublado por módulo, padrão ESM do Jest);
 *   - 409 (e-mail duplicado) cai no campo de e-mail e não grava sessão;
 *   - o link "Entrar" devolve ao login PRESERVANDO o ?proximo.
 *
 * A validação em si (e-mail, senha mínima) é compartilhada com o login via
 * js/formulario.js e já é exercitada por tests/login.proximo.test.js — aqui
 * só o que muda por página.
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const cadastroHtml = readFileSync(
  fileURLToPath(new URL("../cadastro.html", import.meta.url)),
  "utf8"
);

const USUARIO = {
  usuario_id: "9a1b2c3d-0000-0000-0000-000000000003",
  nome: "Aluno Novo",
  email: "novo@edustream.com",
};

/** Dubla a API por rota: /cadastro devolve 201; /login, o usuário criado. */
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

function montarPagina(caminho = "/cadastro.html") {
  window.history.replaceState(null, "", caminho);
  const pagina = new DOMParser().parseFromString(cadastroHtml, "text/html");
  document.body.innerHTML = pagina.body.innerHTML;
}

async function importarCadastro() {
  jest.resetModules();
  jest.unstable_mockModule("../js/sessao.js", () => ({
    entrar: jest.fn(),
    irParaDestino: jest.fn(),
  }));
  const sessaoDuble = await import("../js/sessao.js");
  await import("../js/cadastro.js");
  return sessaoDuble;
}

function flush(times = 4) {
  let promise = Promise.resolve();
  for (let i = 0; i < times; i += 1) {
    promise = promise.then(() => new Promise((resolver) => setTimeout(resolver, 0)));
  }
  return promise;
}

/** Preenche o formulário com os 4 campos válidos (o teste sobrescreve o que quiser). */
function preencher({ nome = "Aluno Novo", email = "novo@edustream.com", senha = "senha12345", confirmar = senha } = {}) {
  document.querySelector("#nomeCadastro").value = nome;
  document.querySelector("#emailCadastro").value = email;
  document.querySelector("#senhaCadastro").value = senha;
  document.querySelector("#confirmarCadastro").value = confirmar;
}

function enviarFormulario() {
  document.querySelector("#cadastroForm")
    .dispatchEvent(new Event("submit", { cancelable: true }));
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
  sessionStorage.clear();
  document.body.innerHTML = "";
});

describe("cadastro — fluxo de sucesso", () => {
  test("cria a conta, faz login automático e vai para o destino", async () => {
    mockarApi();
    montarPagina("/cadastro.html");
    const { entrar, irParaDestino } = await importarCadastro();
    preencher();
    enviarFormulario();
    await flush();

    // Duas chamadas: POST /cadastro (cria) + POST /login (automático).
    const rotas = global.fetch.mock.calls.map(([url]) => String(url));
    expect(rotas.some((rota) => rota.includes("/cadastro"))).toBe(true);
    expect(rotas.some((rota) => rota.includes("/login"))).toBe(true);

    expect(entrar).toHaveBeenCalledWith(USUARIO);
    expect(irParaDestino).toHaveBeenCalledTimes(1);
  });

  test("cadastro com ?proximo segue o mesmo contrato (volta pro vídeo)", async () => {
    mockarApi();
    montarPagina("/cadastro.html?proximo=index.html%3Fvideo%3Dv2");
    const { entrar, irParaDestino } = await importarCadastro();
    preencher();
    enviarFormulario();
    await flush();

    expect(entrar).toHaveBeenCalledWith(USUARIO);
    expect(irParaDestino).toHaveBeenCalledTimes(1);
  });
});

describe("cadastro — confirmação de senha (validação antes da API)", () => {
  test("senhas diferentes NÃO chamam a API e mostram erro no campo", async () => {
    mockarApi();
    montarPagina("/cadastro.html");
    const { entrar, irParaDestino } = await importarCadastro();

    preencher({ confirmar: "senha99999" });
    enviarFormulario();
    await flush();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(entrar).not.toHaveBeenCalled();
    expect(irParaDestino).not.toHaveBeenCalled();

    const campo = document.querySelector("#confirmarCadastro");
    const erro = document.querySelector("#confirmarCadastroErro");
    expect(campo.getAttribute("aria-invalid")).toBe("true");
    expect(erro.hidden).toBe(false);
    expect(erro.textContent).toContain("não coincidem");
  });

  test("corrigir a senha ao digitar limpa o erro da confirmação", async () => {
    mockarApi();
    montarPagina("/cadastro.html");
    await importarCadastro();

    preencher({ confirmar: "errada" });
    enviarFormulario();
    const campoConfirmar = document.querySelector("#confirmarCadastro");
    expect(campoConfirmar.getAttribute("aria-invalid")).toBe("true");

    // Usuário corrige a confirmação ao digitar — o erro some sem reenviar.
    campoConfirmar.value = "senha12345";
    campoConfirmar.dispatchEvent(new Event("input", { bubbles: true }));

    expect(campoConfirmar.getAttribute("aria-invalid")).toBeNull();
    expect(document.querySelector("#confirmarCadastroErro").hidden).toBe(true);
  });

  test("trocar a senha com erro de confirmação visível revalida os dois campos", async () => {
    mockarApi();
    montarPagina("/cadastro.html");
    await importarCadastro();

    preencher({ confirmar: "outra-coisa" });
    enviarFormulario();
    const campoSenha = document.querySelector("#senhaCadastro");
    const campoConfirmar = document.querySelector("#confirmarCadastro");
    expect(campoConfirmar.getAttribute("aria-invalid")).toBe("true");

    // Agora a SENHA muda para ficar igual à confirmação — o erro também some.
    campoSenha.value = "outra-coisa";
    campoSenha.dispatchEvent(new Event("input", { bubbles: true }));

    expect(campoConfirmar.getAttribute("aria-invalid")).toBeNull();
    expect(document.querySelector("#confirmarCadastroErro").hidden).toBe(true);
  });
});

describe("cadastro — erros da API", () => {
  test("e-mail duplicado (409) marca o campo de e-mail e NÃO grava sessão", async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes("/cadastro")) {
        return {
          ok: false,
          status: 409,
          json: async () => ({ detail: "E-mail já cadastrado." }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    montarPagina("/cadastro.html");
    const { entrar, irParaDestino } = await importarCadastro();

    preencher({ email: "ja-existe@edustream.com" });
    enviarFormulario();
    await flush();

    const campoEmail = document.querySelector("#emailCadastro");
    expect(campoEmail.getAttribute("aria-invalid")).toBe("true");
    expect(document.querySelector("#emailCadastroErro").textContent)
      .toContain("já tem uma conta");
    expect(entrar).not.toHaveBeenCalled();
    expect(irParaDestino).not.toHaveBeenCalled();
  });

  test("API desligada mostra aviso no rodapé do card", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    montarPagina("/cadastro.html");
    const { entrar } = await importarCadastro();

    preencher();
    enviarFormulario();
    await flush();

    const aviso = document.querySelector("#cadastroAviso");
    expect(aviso.hidden).toBe(false);
    expect(aviso.textContent).toContain("conectar à API");
    expect(entrar).not.toHaveBeenCalled();
  });
});

describe("navegação Criar conta → Entrar", () => {
  test("o link 'Entrar' aponta para login.html e preserva o ?proximo", async () => {
    montarPagina("/cadastro.html?proximo=index.html%3Fvideo%3Dv3");
    await importarCadastro();

    const link = document.querySelector("#linkLogin");
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toContain("login.html");
    expect(link.getAttribute("href")).toContain("proximo=index.html%3Fvideo%3Dv3");
  });

  test("a página de cadastro é independente (não herda nada do login.html)", async () => {
    montarPagina("/cadastro.html");
    await importarCadastro();

    // Garante que a página nova não depende do DOM do login antigo.
    expect(document.querySelector("#cadastroForm")).not.toBeNull();
    expect(document.querySelector("#confirmarCadastro")).not.toBeNull();
    expect(document.querySelector("#loginForm")).toBeNull();
  });
});
