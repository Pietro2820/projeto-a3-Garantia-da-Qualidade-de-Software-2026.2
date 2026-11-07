/**
 * Tela de login (js/login.js).
 *
 * Escopo desta etapa (branch frontend-css): o DESIGN da tela — organizada,
 * acessível e visualmente funcional. O envio é simulado (spinner + redirecion-
 * amento para o catálogo) porque a autenticação ainda não existe no backend.
 *
 * O que já está pronto e é reutilizável quando a API existir:
 *  - validação de e-mail/senha com mensagens por campo (aria-invalid +
 *    aria-describedby), revalidando enquanto o usuário digita;
 *  - estado de carregamento no botão (classe .carregando + spinner);
 *  - aviso de Caps Lock no campo de senha;
 *  - alternância mostrar/esconder senha (aria-pressed + troca de ícone).
 *
 * TODO(integração): trocar o setTimeout de `enviar()` pela chamada real
 * (ex.: POST /login via API_BASE_URL de ./api.js) e tratar 401 exibindo
 * `mostrarErro()` no campo correspondente.
 */

const form = document.querySelector("#loginForm");
const campoEmail = document.querySelector("#email");
const campoSenha = document.querySelector("#senha");
const botaoEnviar = document.querySelector("#btnEntrar");
const botaoToggle = document.querySelector("#toggleSenha");
const aviso = document.querySelector("#loginAviso");

const erroEmail = document.querySelector("#emailErro");
const erroSenha = document.querySelector("#senhaErro");
const capsAviso = document.querySelector("#capsAviso");

const EMAIL_REGEXP = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SENHA_MINIMA = 8;

/* ---------------------------------------------------------------------------
 * Mostrar / esconder senha
 * ------------------------------------------------------------------------- */

/** Alterna a visibilidade da senha e sincroniza ícone + estados ARIA. */
function alternarVisibilidadeSenha() {
  const visivel = campoSenha.type === "password";

  campoSenha.type = visivel ? "text" : "password";
  botaoToggle.classList.toggle("ativo", visivel);
  botaoToggle.setAttribute("aria-pressed", String(visivel));
  botaoToggle.setAttribute("aria-label", visivel ? "Esconder senha" : "Mostrar senha");
  botaoToggle.title = visivel ? "Esconder senha" : "Mostrar senha";
}

botaoToggle.addEventListener("click", alternarVisibilidadeSenha);

// Mantém o foco no campo enquanto o usuário clica no olho — a digitação não
// é interrompida (mesmo comportamento da tela de login do GitHub).
botaoToggle.addEventListener("mousedown", (evento) => evento.preventDefault());

/* ---------------------------------------------------------------------------
 * Aviso de Caps Lock
 * ------------------------------------------------------------------------- */

function atualizarAvisoCapsLock(evento) {
  if (evento.getModifierState) {
    capsAviso.hidden = !evento.getModifierState("CapsLock");
  }
}

campoSenha.addEventListener("keydown", atualizarAvisoCapsLock);
campoSenha.addEventListener("keyup", atualizarAvisoCapsLock);
campoSenha.addEventListener("blur", () => { capsAviso.hidden = true; });

/* ---------------------------------------------------------------------------
 * Validação dos campos
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

/** Valida o e-mail; devolve true quando válido. */
function validarEmail() {
  const valor = campoEmail.value.trim();

  if (valor === "") {
    mostrarErro(campoEmail, erroEmail, "Informe seu e-mail.");
    return false;
  }
  if (!EMAIL_REGEXP.test(valor)) {
    mostrarErro(campoEmail, erroEmail, "Informe um e-mail válido (ex.: voce@exemplo.com).");
    return false;
  }
  limparErro(campoEmail, erroEmail);
  return true;
}

/** Valida a senha; devolve true quando válida. */
function validarSenha() {
  const valor = campoSenha.value;

  if (valor === "") {
    mostrarErro(campoSenha, erroSenha, "Informe sua senha.");
    return false;
  }
  if (valor.length < SENHA_MINIMA) {
    mostrarErro(campoSenha, erroSenha, `A senha deve ter pelo menos ${SENHA_MINIMA} caracteres.`);
    return false;
  }
  limparErro(campoSenha, erroSenha);
  return true;
}

// Revalida enquanto digita: o erro some assim que o campo fica válido,
// sem esperar o próximo envio do formulário.
campoEmail.addEventListener("input", () => {
  if (!erroEmail.hidden) validarEmail();
});

campoSenha.addEventListener("input", () => {
  if (!erroSenha.hidden) validarSenha();
});

/* ---------------------------------------------------------------------------
 * Envio do formulário (simulado — design primeiro)
 * ------------------------------------------------------------------------- */

function enviar(evento) {
  evento.preventDefault();

  const emailOk = validarEmail();
  const senhaOk = validarSenha();

  // Foco vai direto pro primeiro campo inválido (teclado e leitores de tela).
  if (!emailOk) {
    campoEmail.focus();
    return;
  }
  if (!senhaOk) {
    campoSenha.focus();
    return;
  }

  botaoEnviar.classList.add("carregando");
  botaoEnviar.disabled = true;

  // TODO(integração): substituir pelo POST /login real (API_BASE_URL em
  // ./api.js) quando o backend de autenticação existir.
  window.setTimeout(() => {
    window.location.href = "./home.html";
  }, 900);
}

form.addEventListener("submit", enviar);

/* ---------------------------------------------------------------------------
 * Funcionalidades ainda não integradas (avisos não-bloqueantes)
 * ------------------------------------------------------------------------- */

/** Mostra um aviso curto no rodapé do card (role="status"). */
function mostrarAviso(mensagem) {
  aviso.textContent = mensagem;
  aviso.hidden = false;
}

document.querySelector("#esqueciSenha").addEventListener("click", () => {
  mostrarAviso("A recuperação de senha será conectada à API na etapa de autenticação.");
});

document.querySelector("#criarConta").addEventListener("click", () => {
  mostrarAviso("A criação de contas será conectada à API na etapa de autenticação.");
});
