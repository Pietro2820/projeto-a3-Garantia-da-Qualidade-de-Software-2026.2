/**
 * Utilidades compartilhadas das telas de autenticação (js/formulario.js).
 *
 * login.html e cadastro.html são páginas SEPARADAS, mas compartilham o mesmo
 * vocabulário de interface: erro por campo (aria-invalid + mensagem), revalidação
 * ao digitar, mostrar/esconder senha com aviso de Caps Lock, botão em estado
 * de carregamento, aviso de rodapé (role="status") e o mapeamento dos erros
 * da API (401/409/503/rede) para o lugar certo da tela.
 *
 * Centralizar aqui evita copiar as mesmas regras nos dois módulos — e dá às
 * suítes (tests/login.proximo.test.js, tests/cadastro.test.js) um contrato
 * único para afirmar.
 */
import { ApiError } from "./api.js";

export const EMAIL_REGEXP = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const SENHA_MINIMA = 8;

/* ---------------------------------------------------------------------------
 * Erro por campo (aria-invalid + mensagem visível)
 * ------------------------------------------------------------------------- */

/** Exibe a mensagem de erro de um campo e marca aria-invalid="true". */
export function mostrarErro(campo, elementoErro, mensagem) {
  elementoErro.textContent = mensagem;
  elementoErro.hidden = false;
  campo.setAttribute("aria-invalid", "true");
}

/** Limpa o erro de um campo. */
export function limparErro(campo, elementoErro) {
  elementoErro.textContent = "";
  elementoErro.hidden = true;
  campo.removeAttribute("aria-invalid");
}

/* ---------------------------------------------------------------------------
 * Regras de validação (devolvem true quando o campo está válido)
 * ------------------------------------------------------------------------- */

/** E-mail obrigatório e no formato basico (tem @ e domínio). */
export function validarEmail(campo, elementoErro) {
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

/** Senha obrigatória com o mínimo de caracteres. */
export function validarSenha(campo, elementoErro) {
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

/** Nome do cadastro: pelo menos 2 caracteres. */
export function validarNome(campo, elementoErro) {
  const valor = campo.value.trim();

  if (valor.length < 2) {
    mostrarErro(campo, elementoErro, "Informe seu nome.");
    return false;
  }
  limparErro(campo, elementoErro);
  return true;
}

/**
 * Confirmação de senha (só no cadastro): precisa ser igual à senha digitada.
 * A comparação é caractere a caractere, sem trim — senha pode ter espaço.
 */
export function validarConfirmacaoSenha(campoSenha, campoConfirmar, elementoErro) {
  const valor = campoConfirmar.value;

  if (valor === "") {
    mostrarErro(campoConfirmar, elementoErro, "Confirme sua senha.");
    return false;
  }
  if (valor !== campoSenha.value) {
    mostrarErro(campoConfirmar, elementoErro, "As senhas não coincidem.");
    return false;
  }
  limparErro(campoConfirmar, elementoErro);
  return true;
}

/**
 * Revalida enquanto o usuário digita: o erro some assim que o campo fica
 * válido, sem esperar o próximo envio do formulário. Só revalida quando o
 * campo ESTÁ marcado como inválido (não irrita quem ainda está digitando).
 */
export function revalidarAoDigitar(campo, validar) {
  campo.addEventListener("input", () => {
    if (campo.getAttribute("aria-invalid") === "true") validar();
  });
}

/* ---------------------------------------------------------------------------
 * Mostrar / esconder senha + aviso de Caps Lock
 * ------------------------------------------------------------------------- */

/** Alterna a visibilidade de um campo de senha e sincroniza ícone + ARIA. */
export function ligarToggleSenha(botao, campo, avisoCaps) {
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

/* ---------------------------------------------------------------------------
 * Aviso do rodapé do card (role="status" — leitores de tela anunciam)
 * ------------------------------------------------------------------------- */

export function mostrarAviso(elemento, mensagem) {
  elemento.textContent = mensagem;
  elemento.hidden = false;
}

export function limparAviso(elemento) {
  elemento.textContent = "";
  elemento.hidden = true;
}

/* ---------------------------------------------------------------------------
 * Botão de submit em estado de carregamento (spinner)
 * ------------------------------------------------------------------------- */

export function definirCarregando(botao, carregando) {
  botao.classList.toggle("carregando", carregando);
  botao.disabled = carregando;
}

/* ---------------------------------------------------------------------------
 * Mapeamento dos erros da API para a interface
 * ------------------------------------------------------------------------- */

/**
 * Credencial/e-mail viram erro no campo certo; 503 e falha de rede viram
 * aviso no rodapé do card.
 *
 * `alvo` descreve para onde apontar cada coisa na página atual:
 *   { campoEmail, erroEmail, campoSenha, erroSenha, aviso }
 */
export function tratarErroApi(erro, alvo) {
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
      mostrarAviso(alvo.aviso, "Banco de dados indisponível. Verifique se a API está rodando e se o SQL de usuários (schema_usuarios.sql) já foi executado no Supabase.");
      return;
    }
    mostrarAviso(alvo.aviso, `Não foi possível continuar (HTTP ${erro.status}). Tente novamente.`);
    return;
  }
  // Falha de rede (API desligada) não é ApiError — fetch lança TypeError.
  mostrarAviso(alvo.aviso, "Não foi possível conectar à API. Verifique se o backend está rodando em localhost:8000.");
}

/* ---------------------------------------------------------------------------
 * Navegação entre as telas sem perder o destino (?proximo)
 * ------------------------------------------------------------------------- */

/**
 * Copia o ?proximo da página atual para o href do link — assim navegar entre
 * Entrar ↔ Criar conta não perde para onde o usuário voltaria depois
 * (ex.: index.html?video=v1 que disparou o login).
 */
export function preservarProximo(link) {
  if (!link) return;
  const proximo = new URLSearchParams(window.location.search).get("proximo");
  if (proximo) {
    link.href = `${link.getAttribute("href")}?proximo=${encodeURIComponent(proximo)}`;
  }
}
