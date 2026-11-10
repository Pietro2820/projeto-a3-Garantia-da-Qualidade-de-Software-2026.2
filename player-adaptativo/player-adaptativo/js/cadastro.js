/**
 * Tela de CRIAR CONTA (js/cadastro.js) — página cadastro.html.
 *
 * Página separada do login (mesma identidade visual, card próprio) porque os
 * fluxos são diferentes: entrar exige 2 campos, criar conta pede nome,
 * e-mail, senha e confirmação — e a confirmação precisa comparar dois campos
 * em tempo real.
 *
 * Integração REAL com a API (branch feature/login-banco):
 *   - POST /cadastro (app/auth/router.py) — cria a conta (hash PBKDF2 no
 *     backend) contra a tabela `usuarios` do Supabase;
 *   - em seguida POST /login com as MESMAS credenciais: login automático —
 *     o usuário não digita de novo (fluxo padrão de apps de streaming);
 *   - a sessão fica em sessionStorage via js/sessao.js e o usuário segue para
 *     o ?proximo (allowlist em sessao.js) — o link "Entrar" deste card preserva
 *     o ?proximo, então o destino sobrevive à navegação entre as telas.
 *
 * Regras de validação/toggle/erros da API vivem no js/formulario.js,
 * compartilhados com o login.
 */
import { cadastrarUsuario, loginUsuario } from "./api.js";
import { entrar, irParaDestino } from "./sessao.js";
import {
  definirCarregando,
  ligarToggleSenha,
  limparAviso,
  preservarProximo,
  revalidarAoDigitar,
  tratarErroApi,
  validarConfirmacaoSenha,
  validarEmail,
  validarNome,
  validarSenha,
} from "./formulario.js";

const form = document.querySelector("#cadastroForm");

const campoNome = document.querySelector("#nomeCadastro");
const campoEmail = document.querySelector("#emailCadastro");
const campoSenha = document.querySelector("#senhaCadastro");
const campoConfirmar = document.querySelector("#confirmarCadastro");
const botaoEnviar = document.querySelector("#btnCadastrar");

const erroNome = document.querySelector("#nomeCadastroErro");
const erroEmail = document.querySelector("#emailCadastroErro");
const erroSenha = document.querySelector("#senhaCadastroErro");
const erroConfirmar = document.querySelector("#confirmarCadastroErro");

const capsAviso = document.querySelector("#capsCadastroAviso");
const capsAvisoConfirmar = document.querySelector("#capsConfirmarAviso");

const aviso = document.querySelector("#cadastroAviso");
const linkLogin = document.querySelector("#linkLogin");

/* Mostrar/esconder senha (os dois campos de senha) + aviso de Caps Lock. */
ligarToggleSenha(document.querySelector("#toggleSenhaCadastro"), campoSenha, capsAviso);
ligarToggleSenha(document.querySelector("#toggleSenhaConfirmar"), campoConfirmar, capsAvisoConfirmar);

/* O link "Entrar" leva o ?proximo de volta para o login. */
preservarProximo(linkLogin);

/* Revalidação ao digitar — inclusive a confirmação, que depende da senha. */
revalidarAoDigitar(campoNome, () => validarNome(campoNome, erroNome));
revalidarAoDigitar(campoEmail, () => validarEmail(campoEmail, erroEmail));
revalidarAoDigitar(campoSenha, () => validarSenha(campoSenha, erroSenha));
revalidarAoDigitar(campoConfirmar, () => validarConfirmacaoSenha(campoSenha, campoConfirmar, erroConfirmar));

// Trocou a senha com erro de confirmação visível? Revalida os dois lados:
// se a nova senha passa a ser igual à confirmação, o erro some.
campoSenha.addEventListener("input", () => {
  if (campoConfirmar.getAttribute("aria-invalid") === "true") {
    validarConfirmacaoSenha(campoSenha, campoConfirmar, erroConfirmar);
  }
});

/* ---------------------------------------------------------------------------
 * Envio do CADASTRO (POST /cadastro real + login automático)
 * ------------------------------------------------------------------------- */

async function enviar(evento) {
  evento.preventDefault();
  limparAviso(aviso);

  const nomeOk = validarNome(campoNome, erroNome);
  const emailOk = validarEmail(campoEmail, erroEmail);
  const senhaOk = validarSenha(campoSenha, erroSenha);
  const confirmacaoOk = validarConfirmacaoSenha(campoSenha, campoConfirmar, erroConfirmar);

  // Foco vai direto pro primeiro campo inválido (teclado e leitores de tela).
  if (!nomeOk) {
    campoNome.focus();
    return;
  }
  if (!emailOk) {
    campoEmail.focus();
    return;
  }
  if (!senhaOk) {
    campoSenha.focus();
    return;
  }
  if (!confirmacaoOk) {
    campoConfirmar.focus();
    return;
  }

  definirCarregando(botaoEnviar, true);

  try {
    await cadastrarUsuario({
      nome: campoNome.value.trim(),
      email: campoEmail.value.trim(),
      senha: campoSenha.value,
    });

    // Conta criada: login automático com as MESMAS credenciais.
    const resposta = await loginUsuario({
      email: campoEmail.value.trim(),
      senha: campoSenha.value,
    });

    entrar(resposta.usuario);
    irParaDestino();
  } catch (erro) {
    tratarErroApi(erro, {
      campoEmail,
      erroEmail,
      campoSenha,
      erroSenha,
      aviso,
    });
    definirCarregando(botaoEnviar, false);
  }
}

form.addEventListener("submit", enviar);
