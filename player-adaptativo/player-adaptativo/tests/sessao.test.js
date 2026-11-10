/**
 * Testes do guard de sessão (js/sessao.js).
 *
 * O que está em jogo: home e watch page EXIGEM login. Sem sessão, o usuário
 * vai para login.html?proximo=<página atual>; com sessão, a página decora o
 * perfil, liga o botão Sair e troca o USER_ID do player. O ?proximo volta
 * validado por allowlist — redirect aberto não pode existir.
 *
 * Navegação: o jsdom sela `window.location` (não-configurável — não dá para
 * espiar assign). Por isso o módulo recebe o destino como parâmetro
 * injetável `{ navegar }` e os testes injetam um jest.fn() — sem dublar
 * globals. O auto-init (efeito colateral do import) usa a navegação real,
 * então os testes que importam o módulo mantêm a página em estado sem
 * redirect (com sessão, ou na tela de login).
 */
import { jest } from "@jest/globals";

const USUARIO = {
  usuario_id: "9a1b2c3d-0000-0000-0000-000000000001",
  nome: "Pietro Cardoso",
  email: "pietro@edustream.com",
};

/** Importa uma instância fresca do módulo (o auto-init roda no import). */
async function importarSessao() {
  jest.resetModules();
  return import("../js/sessao.js");
}

/** Coloca o usuário na chave que o login.js grava. */
function comSessao(usuario = USUARIO) {
  sessionStorage.setItem("edustream.usuario", JSON.stringify(usuario));
}

function comPagina(caminho) {
  window.history.replaceState(null, "", caminho);
}

/** Dublê de navegação (o `navegar` injetável do módulo). */
const navegar = jest.fn();

beforeEach(() => {
  sessionStorage.clear();
  navegar.mockClear();
  // jsdom reclama de navegação "Not implemented" quando o auto-init/click
  // usa a navegação real — silencia o ruído que não é assunto do teste.
  jest.spyOn(console, "error").mockImplementation(() => {});
  comPagina("/home.html");
});

afterEach(() => {
  jest.restoreAllMocks();
  sessionStorage.clear();
  delete window.PLAYER_CONFIG;
  document.body.innerHTML = "";
});

describe("sessao — usuarioAtual", () => {
  test("sem sessão devolve null", async () => {
    const { usuarioAtual } = await importarSessao();
    expect(usuarioAtual()).toBeNull();
  });

  test("com sessão devolve os dados gravados pelo login", async () => {
    comSessao();
    const { usuarioAtual } = await importarSessao();
    expect(usuarioAtual()).toEqual(USUARIO);
  });

  test("JSON corrompido na sessionStorage não quebra (trata como não logado)", async () => {
    sessionStorage.setItem("edustream.usuario", "{isso não é json");
    const { usuarioAtual } = await importarSessao();
    expect(usuarioAtual()).toBeNull();
  });

  test("objeto sem e-mail não vale como sessão", async () => {
    comSessao({ nome: "Sem E-mail" });
    const { usuarioAtual } = await importarSessao();
    expect(usuarioAtual()).toBeNull();
  });
});

describe("sessao — exigirLogin (o guard)", () => {
  test("com sessão devolve o usuário e NÃO navega", async () => {
    comSessao();
    const { exigirLogin } = await importarSessao();

    expect(exigirLogin({ navegar })).toEqual(USUARIO);
    expect(navegar).not.toHaveBeenCalled();
  });

  test("sem sessão manda para o login levando a página atual no ?proximo", async () => {
    const { exigirLogin } = await importarSessao();

    expect(exigirLogin({ navegar })).toBeNull();
    expect(navegar).toHaveBeenCalledWith("./login.html?proximo=home.html");
  });

  test("sem sessão na watch page preserva o vídeo pedido no ?proximo", async () => {
    comPagina("/index.html?video=v1");
    const { exigirLogin } = await importarSessao();

    exigirLogin({ navegar });
    expect(navegar).toHaveBeenCalledWith(
      "./login.html?proximo=index.html%3Fvideo%3Dv1"
    );
  });
});

describe("sessao — destinoSeguro (allowlist do ?proximo)", () => {
  test.each([
    ["index.html?video=v1", "index.html?video=v1"],
    ["/index.html?video=v1", "index.html?video=v1"],
    ["http://localhost/index.html?video=v1", "index.html?video=v1"],
    [null, "./home.html"],
    ["", "./home.html"],
    ["https://site-malicioso.com/roubar.html", "./home.html"],
    ["javascript:alert(1)", "./home.html"],
    ["login.html", "./home.html"],
    ["//localhost/outra.html", "./home.html"],
  ])("proximo=%j → %j", async (pedido, esperado) => {
    const { destinoSeguro } = await importarSessao();
    expect(destinoSeguro(pedido)).toBe(esperado);
  });
});

describe("sessao — irParaDestino (depois do login)", () => {
  test("vai exatamente para o ?proximo validado", async () => {
    comPagina("/login.html?proximo=index.html%3Fvideo%3Dv1");
    const { irParaDestino } = await importarSessao();

    irParaDestino({ navegar });
    expect(navegar).toHaveBeenCalledWith("index.html?video=v1");
  });

  test("sem ?proximo vai para a home", async () => {
    comPagina("/login.html");
    const { irParaDestino } = await importarSessao();

    irParaDestino({ navegar });
    expect(navegar).toHaveBeenCalledWith("./home.html");
  });

  test("?proximo de fora do site cai na home (redirect aberto bloqueado)", async () => {
    comPagina("/login.html?proximo=https%3A%2F%2Fmalicioso.com%2F.html");
    const { irParaDestino } = await importarSessao();

    irParaDestino({ navegar });
    expect(navegar).toHaveBeenCalledWith("./home.html");
  });
});

describe("sessao — entrar e sair", () => {
  test("entrar grava na chave oficial da sessão", async () => {
    const { entrar, usuarioAtual } = await importarSessao();

    entrar(USUARIO);
    expect(sessionStorage.getItem("edustream.usuario")).toBe(
      JSON.stringify(USUARIO)
    );
    expect(usuarioAtual()).toEqual(USUARIO);
  });

  test("sair limpa a sessão e leva ao login", async () => {
    comSessao();
    const { sair, usuarioAtual } = await importarSessao();

    sair({ navegar });
    expect(usuarioAtual()).toBeNull();
    expect(navegar).toHaveBeenCalledWith("./login.html");
  });
});

describe("sessao — auto-init na página (home/watch)", () => {
  test("com sessão: perfil mostra o nome, Sair encerra e USER_ID vira o usuário real", async () => {
    comSessao();
    window.PLAYER_CONFIG = { USER_ID: "demo-user" };
    document.body.innerHTML =
      '<button id="profileButton" aria-label="Perfil">👤</button>' +
      '<button id="sairButton" type="button">Sair</button>';

    const { inicializar } = await importarSessao();
    expect(inicializar({ navegar })).toEqual(USUARIO);
    expect(navegar).not.toHaveBeenCalled();

    const perfil = document.querySelector("#profileButton");
    expect(perfil.title).toBe(USUARIO.nome);
    expect(perfil.getAttribute("aria-label")).toBe(`Perfil — ${USUARIO.nome}`);
    expect(window.PLAYER_CONFIG.USER_ID).toBe(USUARIO.usuario_id);

    // O clique no Sair passa pela navegação real (assign) — o jsdom só
    // reclama no console (silenciado no beforeEach). O efeito que importa:
    // a sessão acabou.
    document.querySelector("#sairButton").click();
    expect(sessionStorage.getItem("edustream.usuario")).toBeNull();
  });

  test("página protegida sem sessão: navega para o login com o ?proximo", async () => {
    const { inicializar } = await importarSessao();

    expect(inicializar({ navegar })).toBeNull();
    expect(navegar).toHaveBeenCalledWith("./login.html?proximo=home.html");
  });

  test("na tela de login o guard NÃO age (sem loop de redirect)", async () => {
    // login.js importa sessao.js; se o guard corresse na página de login,
    // o usuário sem sessão seria redirecionado para... login.html, para
    // sempre. Regressão travada por este teste.
    comPagina("/login.html?proximo=index.html%3Fvideo%3Dv1");
    document.body.innerHTML = '<form id="loginForm"></form>';

    const { inicializar } = await importarSessao();

    expect(inicializar({ navegar })).toBeNull();
    expect(navegar).not.toHaveBeenCalled();
  });
});
