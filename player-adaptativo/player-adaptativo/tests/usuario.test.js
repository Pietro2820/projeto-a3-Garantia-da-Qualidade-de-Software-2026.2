/**
 * Identidade de quem assiste (js/usuario.js).
 *
 * O backend personaliza recomendações por `user_id` (POST /watch guarda o
 * histórico). Estes testes garantem que o id é estável entre recargas, que o
 * nome informado vence o anônimo e que a falta de localStorage não quebra a
 * página (navegação privada).
 *
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";

let usuario;

beforeEach(async () => {
  jest.resetModules();
  window.localStorage.clear();
  delete window.PLAYER_CONFIG;
  usuario = await import("../js/usuario.js");
});

afterEach(() => {
  // O describe "sem localStorage" substitui o storage por um getter que lança;
  // como o afterEach raiz roda ANTES do dele, a limpeza precisa ser tolerante.
  try {
    window.localStorage.clear();
  } catch (error) {
    // storage bloqueado de propósito — nada a limpar
  }
  delete window.PLAYER_CONFIG;
});

describe("usuarioAtual", () => {
  test("sem nada configurado, cria um anônimo estável", () => {
    const primeiro = usuario.usuarioAtual();

    expect(primeiro).toMatch(/^anon-/);
    expect(usuario.usuarioAtual()).toBe(primeiro);
  });

  test("o anônimo sobrevive a um reload (localStorage)", async () => {
    const primeiro = usuario.usuarioAtual();

    jest.resetModules();
    const recarregado = await import("../js/usuario.js");

    expect(recarregado.usuarioAtual()).toBe(primeiro);
  });

  test("o nome informado vira o identificador", () => {
    usuario.definirUsuario("  Rafael Lima  ");

    expect(usuario.usuarioAtual()).toBe("Rafael Lima");
    expect(usuario.rotuloDoUsuario()).toBe("Rafael Lima");
  });

  test("PLAYER_CONFIG.USER_ID vence o anônimo (mas perde para o nome)", async () => {
    window.PLAYER_CONFIG = { USER_ID: "gustavo" };
    jest.resetModules();
    const modulo = await import("../js/usuario.js");

    expect(modulo.usuarioAtual()).toBe("gustavo");

    modulo.definirUsuario("Pedro");
    expect(modulo.usuarioAtual()).toBe("Pedro");
  });

  test("sair volta para o anônimo (sem perder o histórico dele)", () => {
    const anonimo = usuario.usuarioAtual();
    usuario.definirUsuario("Rafael");
    expect(usuario.usuarioAtual()).toBe("Rafael");

    usuario.definirUsuario("");

    expect(usuario.nomeDoUsuario()).toBe("");
    expect(usuario.rotuloDoUsuario()).toBe("Convidado");
    expect(usuario.usuarioAtual()).toBe(anonimo);
  });

  test("nome longo é truncado (cabe no card e na URL)", () => {
    usuario.definirUsuario("x".repeat(120));

    expect(usuario.usuarioAtual()).toHaveLength(40);
  });
});

describe("sem localStorage disponível", () => {
  let original = null;

  beforeEach(() => {
    original = window.localStorage;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError: storage bloqueado");
      },
    });
  });

  afterEach(() => {
    // Restaura ANTES do clear() do afterEach raiz (que acessa o storage).
    Object.defineProperty(window, "localStorage", { value: original, configurable: true });
  });

  test("não quebra: devolve um id volátil", async () => {
    // Sem jest.resetModules() aqui: ele varre as propriedades do window e
    // acabaria tocando o getter que lança. O reset do beforeEach raiz basta.
    const modulo = await import("../js/usuario.js");

    expect(typeof modulo.usuarioAtual()).toBe("string");
    expect(modulo.usuarioAtual().length).toBeGreaterThan(0);
    expect(() => modulo.definirUsuario("Rafael")).not.toThrow();
    expect(modulo.rotuloDoUsuario()).toBe("Convidado");
  });
});
