/**
 * Tela de login (js/login.js).
 *
 * Integração REAL com a API (branch feature/login-banco):
 *   - POST /login    (app/auth/router.py) — valida e-mail+senha contra a
 *     tabela `usuarios` do Supabase e devolve os dados públicos do usuário;
 *   - POST /cadastro — cria a conta (hash PBKDF2 no backend) e, se der tudo
 *     certo, faz login automático;
 *   - após autenticar, a sessão fica em sessionStorage (chave
 *     "edustream.usuario", via js/sessao.js) e o usuário vai para o destino
 *     pedido no ?proximo — home.html, ou a watch page que disparou o login
 *     (ex.: index.html?video=v1). Sem ?proximo, cai na home.
 *
 * O guard de entrada é o js/sessao.js (home e watch exigem login); este
 * arquivo é o outro lado do fluxo: autenticar e devolver o usuário ao lugar
 * de onde ele veio.
 *
 * Tudo o que já existia na etapa de design continua igual: validação por
 * campo com aria-invalid/aria-describedby e revalidação ao digitar, estado
 * de carregamento no botão (spinner), aviso de Caps Lock e alternância
 * mostrar/esconder senha.
 */
import { ApiError, cadastrarUsuario, loginUsuario } from "./api.js";
import { entrar, irParaDestino } from "./sessao.js";

const form = document.querySelector("#loginForm");
const campoEmail = document.querySelector("#email");
const campoSenha = document.querySelector("#senha");
const botaoEnviar = document.querySelector("#btnEntrar");

const formCadastro = document.querySelector("#cadastroForm");
const campoNome = document.querySelector("#nomeCadastro");
const campoEmailCadastro = document.querySelector("#emailCadastro");
const campoSenhaCadastro = document.querySelector("#senhaCadastro");
const botaoCadastrar = document.querySelector("#btnCadastrar");

const botaoToggle = document.querySelector("#toggleSenha");
const botaoToggleCadastro = document.querySelector("#toggleSenhaCadastro");

const cabecalhoTitulo = document.querySelector("#loginTitulo");
const cabecalhoSubtitulo = cabecalhoTitulo.parentElement.querySelector("p");

const botaoAlternar = document.querySelector("#alternarFormulario");
const textoAlternar = document.querySelector("#textoAlternar");
const aviso = document.querySelector("#loginAviso");

const erroEmail = document.querySelector("#emailErro");
const erroSenha = document.querySelector("#senhaErro");
const capsAviso = document.querySelector("#capsAviso");

const erroNome = document.querySelector("#nomeCadastroErro");
const erroEmailCadastro = document.querySelector("#emailCadastroErro");
const erroSenhaCadastro = document.querySelector("#senhaCadastroErro");
const capsCadastroAviso = document.querySelector("#capsCadastroAviso");

const EMAIL_REGEXP = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SENHA_MINIMA = 8;

/* ---------------------------------------------------------------------------
 * Mostrar / esconder senha (os dois formulários)
 * ------------------------------------------------------------------------- */

/** Alterna a visibilidade de um campo de senha e sincroniza ícone + ARIA. */
function ligarToggleSenha(botao, campo, avisoCaps) {
  botao.addEventListener("click", () => {
    const visivel = campo.type === "password";

    campo.type = visivel ? "text" : "password";
    botao.classList.toggle("ativo", visivel);
    botao.setAttribute("aria-pressed", String(visivel));
    botao.setAttribute("aria-label", visivel ? "Esconder senha" : "Mostrar senha");
    botao.title = visivel ? "Esconder senha" : "Mostrar senha";
  });

  // Mantém o foco no campo enquanto o usuário clica no olho — a digitação
  // não é interrompida (mesmo comportamento da tela de login do GitHub).
  botao.addEventListener("mousedown", (evento) => evento.preventDefault());

  // O aviso de Caps Lock acompanha o MESMO campo do toggle.
  function atualizarAvisoCapsLock(evento) {
    if (evento.getModifierState) {
      avisoCaps.hidden = !evento.getModifierState("CapsLock");
    }
  }

  campo.addEventListener("keydown", atualizarAvisoCapsLock);
  campo.addEventListener("keyup", atualizarAvisoCapsLock);
  campo.addEventListener("blur", () => { avisoCaps.hidden = true; });
}

ligarToggleSenha(botaoToggle, campoSenha, capsAviso);
ligarToggleSenha(botaoToggleCadastro, campoSenhaCadastro, capsCadastroAviso);

/* ---------------------------------------------------------------------------
 * Validação dos campos (login e cadastro compartilham as regras)
 * ------------------------------------------------------------------------- */

/** Exibe a mensagem de erro de um campo (e marca aria-invalid). */
function mostrarErro(campo, elementoErro, mensagem) {
  elementoErro.textContent = mensagem;
  elementoErro.hidden = false;
  campo.setAttribute("aria-invalid", "true");
}

/** Limpa o erro de um campo. */
function limparErro(campo, elementoErro) {
  elementoErro.textContent = "";
  elementoErro.hidden = true;
  campo.removeAttribute("aria-invalid");
}

/** Valida um e-mail; devolve true quando válido. */
function validarEmail(campo, elementoErro) {
  const valor = campo.value.trim();

  if (valor === "") {
    mostrarErro(campo, elementoErro, "Informe seu e-mail.");
    return false;
  }
  if (!EMAIL_REGEXP.test(valor)) {
    mostrarErro(campo, elementoErro, "Informe um e-mail válido (ex.: voce@exemplo.com).");
    return false;
  }
  limparErro(campo, elementoErro);
  return true;
}

/** Valida uma senha; devolve true quando válida. */
function validarSenha(campo, elementoErro) {
  const valor = campo.value;

  if (valor === "") {
    mostrarErro(campo, elementoErro, "Informe sua senha.");
    return false;
  }
  if (valor.length < SENHA_MINIMA) {
    mostrarErro(campo, elementoErro, `A senha deve ter pelo menos ${SENHA_MINIMA} caracteres.`);
    return false;
  }
  limparErro(campo, elementoErro);
  return true;
}

function validarNome() {
  const valor = campoNome.value.trim();

  if (valor.length < 2) {
    mostrarErro(campoNome, erroNome, "Informe seu nome.");
    return false;
  }
  limparErro(campoNome, erroNome);
  return true;
}

// Revalida enquanto digita: o erro some assim que o campo fica válido,
// sem esperar o próximo envio do formulário.
campoEmail.addEventListener("input", () => {
  if (!erroEmail.hidden) validarEmail(campoEmail, erroEmail);
});

campoSenha.addEventListener("input", () => {
  if (!erroSenha.hidden) validarSenha(campoSenha, erroSenha);
});

campoNome.addEventListener("input", () => {
  if (!erroNome.hidden) validarNome();
});

campoEmailCadastro.addEventListener("input", () => {
  if (!erroEmailCadastro.hidden) validarEmail(campoEmailCadastro, erroEmailCadastro);
});

campoSenhaCadastro.addEventListener("input", () => {
  if (!erroSenhaCadastro.hidden) validarSenha(campoSenhaCadastro, erroSenhaCadastro);
});

/* ---------------------------------------------------------------------------
 * Alternância Entrar ↔ Criar conta
 * ------------------------------------------------------------------------- */

let mostrandoCadastro = false;

function alternarFormulario() {
  mostrandoCadastro = !mostrandoCadastro;

  form.hidden = mostrandoCadastro;
  formCadastro.hidden = !mostrandoCadastro;

  cabecalhoTitulo.textContent = mostrandoCadastro ? "Criar conta" : "Entrar";
  cabecalhoSubtitulo.textContent = mostrandoCadastro
    ? "Crie sua conta para começar a assistir"
    : "Acesse sua conta para continuar assistindo";

  textoAlternar.textContent = mostrandoCadastro
    ? "Já tem uma conta?"
    : "Não tem uma conta?";
  botaoAlternar.textContent = mostrandoCadastro ? "Entrar" : "Criar conta";

  limparAviso();
  (mostrandoCadastro ? campoNome : campoEmail).focus();
}

botaoAlternar.addEventListener("click", alternarFormulario);

/* ---------------------------------------------------------------------------
 * Avisos no rodapé do card (role="status" — leitores de tela anunciam)
 * ------------------------------------------------------------------------- */

function mostrarAviso(mensagem) {
  aviso.textContent = mensagem;
  aviso.hidden = false;
}

function limparAviso() {
  aviso.textContent = "";
  aviso.hidden = true;
}

/** Estado de carregamento compartilhado pelos dois botões de submit. */
function definirCarregando(botao, carregando) {
  botao.classList.toggle("carregando", carregando);
  botao.disabled = carregando;
}

/**
 * Mapeia o erro da API para a interface: credencial/e-mail viram erro no
 * campo certo, 503 e falha de rede viram aviso no rodapé do card.
 *
 * `alvo` descreve para onde apontar o erro de cada formulário:
 *   { campoEmail, erroEmail, campoSenha, erroSenha, ehCadastro }
 */
function tratarErroApi(erro, alvo) {
  if (erro instanceof ApiError) {
    if (erro.status === 401) {
      // Login: erro no campo de senha (não revela se o e-mail existe).
      mostrarErro(alvo.campoSenha, alvo.erroSenha, "E-mail ou senha incorretos.");
      return;
    }
    if (erro.status === 409) {
      mostrarErro(alvo.campoEmail, alvo.erroEmail,
        "Este e-mail já tem uma conta. Faça login ou use outro e-mail.");
      return;
    }
    if (erro.status === 503) {
      mostrarAviso("Banco de dados indisponível. Verifique se a API está rodando e se o SQL de usuários (schema_usuarios.sql) já foi executado no Supabase.");
      return;
    }
    mostrarAviso(`Não foi possível continuar (HTTP ${erro.status}). Tente novamente.`);
    return;
  }
  // Falha de rede (API desligada) não é ApiError — fetch lança TypeError.
  mostrarAviso("Não foi possível conectar à API. Verifique se o backend está rodando em localhost:8000.");
}

/* ---------------------------------------------------------------------------
 * Envio do LOGIN (POST /login real)
 * ------------------------------------------------------------------------- */

async function enviar(evento) {
  evento.preventDefault();
  limparAviso();

  const emailOk = validarEmail(campoEmail, erroEmail);
  const senhaOk = validarSenha(campoSenha, erroSenha);

  // Foco vai direto pro primeiro campo inválido (teclado e leitores de tela).
  if (!emailOk) {
    campoEmail.focus();
    return;
  }
  if (!senhaOk) {
    campoSenha.focus();
    return;
  }

  definirCarregando(botaoEnviar, true);

  try {
    const resposta = await loginUsuario({
      email: campoEmail.value.trim(),
      senha: campoSenha.value,
    });

    // O backend devolve { usuario: { usuario_id, nome, email } }.
    entrar(resposta.usuario);
    // Vai para o ?proximo validado (allowlist em js/sessao.js) — ou para a
    // home quando o login foi direto pela tela.
    irParaDestino();
  } catch (erro) {
    tratarErroApi(erro, {
      campoEmail, erroEmail, campoSenha, erroSenha, ehCadastro: false,
    });
    definirCarregando(botaoEnviar, false);
  }
}

form.addEventListener("submit", enviar);

/* ---------------------------------------------------------------------------
 * Envio do CADASTRO (POST /cadastro real + login automático)
 * ------------------------------------------------------------------------- */

async function enviarCadastro(evento) {
  evento.preventDefault();
  limparAviso();

  const nomeOk = validarNome();
  const emailOk = validarEmail(campoEmailCadastro, erroEmailCadastro);
  const senhaOk = validarSenha(campoSenhaCadastro, erroSenhaCadastro);

  if (!nomeOk) {
    campoNome.focus();
    return;
  }
  if (!emailOk) {
    campoEmailCadastro.focus();
    return;
  }
  if (!senhaOk) {
    campoSenhaCadastro.focus();
    return;
  }

  definirCarregando(botaoCadastrar, true);

  try {
    await cadastrarUsuario({
      nome: campoNome.value.trim(),
      email: campoEmailCadastro.value.trim(),
      senha: campoSenhaCadastro.value,
    });

    // Conta criada: login automático com as MESMAS credenciais — o usuário
    // não precisa digitar de novo (fluxo padrão de apps de streaming).
    const resposta = await loginUsuario({
      email: campoEmailCadastro.value.trim(),
      senha: campoSenhaCadastro.value,
    });

    entrar(resposta.usuario);
    irParaDestino();
  } catch (erro) {
    tratarErroApi(erro, {
      campoEmail: campoEmailCadastro,
      erroEmail: erroEmailCadastro,
      campoSenha: campoSenhaCadastro,
      erroSenha: erroSenhaCadastro,
      ehCadastro: true,
    });
    definirCarregando(botaoCadastrar, false);
  }
}

formCadastro.addEventListener("submit", enviarCadastro);

/* ---------------------------------------------------------------------------
 * Recuperação de senha (ainda sem endpoint — aviso não-bloqueante)
 * ------------------------------------------------------------------------- */

document.querySelector("#esqueciSenha").addEventListener("click", () => {
  mostrarAviso("A recuperação de senha será implementada em uma próxima etapa. Por enquanto, use o usuário de teste do SQL ou crie uma nova conta.");
});
