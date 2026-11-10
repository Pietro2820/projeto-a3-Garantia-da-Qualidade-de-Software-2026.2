/**
 * Tela de ENTRAR (js/login.js) — página login.html.
 *
 * Integração REAL com a API (branch feature/login-banco):
 *   - POST /login (app/auth/router.py) — valida e-mail+senha contra a tabela
 *     `usuarios` do Supabase e devolve os dados públicos do usuário;
 *   - após autenticar, a sessão fica em sessionStorage (chave
 *     "edustream.usuario", via js/sessao.js) e o usuário vai para o destino
 *     pedido no ?proximo — home.html, ou a watch page que disparou o login
 *     (ex.: index.html?video=v1). Sem ?proximo, cai na home.
 *
 * Criar conta agora é uma PÁGINA PRÓPRIA (cadastro.html + js/cadastro.js):
 * o rodapé do card aponta para lá, e o ?proximo via junto no link
 * (preservarProximo) — a pessoa não perde o vídeo que ia assistir.
 *
 * O guard de entrada é o js/sessao.js (home e watch exigem login); este
 * arquivo é o outro lado do fluxo: autenticar e devolver o usuário ao lugar
 * de onde ele veio. As regras de validação/toggle/erros vivem no
 * js/formulario.js (compartilhado com o cadastro).
 */
import { loginUsuario } from "./api.js";
import { entrar, irParaDestino } from "./sessao.js";
import {
  definirCarregando,
  ligarToggleSenha,
  limparAviso,
  mostrarAviso,
  preservarProximo,
  revalidarAoDigitar,
  tratarErroApi,
  validarEmail,
  validarSenha,
} from "./formulario.js";

const form = document.querySelector("#loginForm");
const campoEmail = document.querySelector("#email");
const campoSenha = document.querySelector("#senha");
const botaoEnviar = document.querySelector("#btnEntrar");

const botaoToggle = document.querySelector("#toggleSenha");
const aviso = document.querySelector("#loginAviso");

const erroEmail = document.querySelector("#emailErro");
const erroSenha = document.querySelector("#senhaErro");
const capsAviso = document.querySelector("#capsAviso");

const linkCadastro = document.querySelector("#linkCadastro");

/* Mostrar/esconder senha + aviso de Caps Lock. */
ligarToggleSenha(botaoToggle, campoSenha, capsAviso);

/* O link "Criar conta" leva o ?proximo junto para o cadastro. */
preservarProximo(linkCadastro);

/* Revalida enquanto digita: o erro some assim que o campo fica válido. */
revalidarAoDigitar(campoEmail, () => validarEmail(campoEmail, erroEmail));
revalidarAoDigitar(campoSenha, () => validarSenha(campoSenha, erroSenha));

/* ---------------------------------------------------------------------------
 * Envio do LOGIN (POST /login real)
 * ------------------------------------------------------------------------- */

async function enviar(evento) {
  evento.preventDefault();
  limparAviso(aviso);

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
    tratarErroApi(erro, { campoEmail, erroEmail, campoSenha, erroSenha, aviso });
    definirCarregando(botaoEnviar, false);
  }
}

form.addEventListener("submit", enviar);

/* ---------------------------------------------------------------------------
 * Recuperação de senha (ainda sem endpoint — aviso não-bloqueante)
 * ------------------------------------------------------------------------- */

document.querySelector("#esqueciSenha").addEventListener("click", () => {
  mostrarAviso(aviso, "A recuperação de senha será implementada em uma próxima etapa. Por enquanto, use o usuário de teste do SQL ou crie uma nova conta.");
});
