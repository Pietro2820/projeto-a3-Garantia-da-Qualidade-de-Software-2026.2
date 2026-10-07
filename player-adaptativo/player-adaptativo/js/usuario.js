/**
 * Identidade de quem assiste — js/usuario.js.
 *
 * O projeto ainda não tem autenticação, mas o backend já personaliza por
 * usuário: `POST /watch` guarda o histórico e `GET /recomendacoes/{user_id}`
 * devolve sugestões baseadas nas tags do que essa pessoa assistiu. Antes o
 * `USER_ID` era uma constante no config.js — todo mundo era o mesmo "usuário",
 * então as recomendações nunca mudavam.
 *
 * Aqui o identificador é:
 *   1. o nome que a pessoa informa no menu de perfil (guardado em
 *      localStorage — sem servidor, sem cadastro);
 *   2. `PLAYER_CONFIG.USER_ID`, se o integrador quiser fixar;
 *   3. um anônimo estável por navegador ("anon-<aleatório>"), criado uma vez e
 *      reaproveitado — assim o histórico sobrevive ao F5 sem exigir login.
 *
 * Quando a autenticação real entrar, basta trocar `usuarioAtual()` pela
 * resposta do login: quem consome (player.js e home.js) não muda.
 */

const CHAVE_NOME = "edustream.usuario.nome";
const CHAVE_ANONIMO = "edustream.usuario.anonimo";

function localStorageDisponivel() {
  try {
    // O simples ACESSO a window.localStorage pode lançar (navegação privada,
    // iframe sandbox, política do navegador) — por isso o try cobre tudo.
    if (typeof window === "undefined") return false;
    const storage = window.localStorage;
    if (!storage) return false;
    const chave = "__edustream_probe__";
    storage.setItem(chave, "1");
    storage.removeItem(chave);
    return true;
  } catch (error) {
    return false;
  }
}

function ler(chave) {
  if (!localStorageDisponivel()) return "";
  try {
    return window.localStorage.getItem(chave) || "";
  } catch (error) {
    return "";
  }
}

function gravar(chave, valor) {
  if (!localStorageDisponivel()) return;
  try {
    window.localStorage.setItem(chave, valor);
  } catch (error) {
    // Sem storage a sessão continua funcionando (identidade volátil).
  }
}

function remover(chave) {
  if (!localStorageDisponivel()) return;
  try {
    window.localStorage.removeItem(chave);
  } catch (error) {
    // idem
  }
}

/** Identificador anônimo estável por navegador (criado no primeiro acesso). */
function idAnonimo() {
  let id = ler(CHAVE_ANONIMO);

  if (!id) {
    id = `anon-${Math.random().toString(36).slice(2, 10)}`;
    gravar(CHAVE_ANONIMO, id);
  }

  return id;
}

/** Nome informado pela pessoa ("" se nunca informou). */
export function nomeDoUsuario() {
  return ler(CHAVE_NOME);
}

/** Identificador usado nas chamadas de API (/watch, /recomendacoes). */
export function usuarioAtual() {
  return nomeDoUsuario() || window.PLAYER_CONFIG?.USER_ID || idAnonimo();
}

/** Define (ou limpa, com "") o nome da pessoa. Devolve o id em vigor. */
export function definirUsuario(nome) {
  const limpo = String(nome ?? "").trim().slice(0, 40);

  if (limpo) {
    gravar(CHAVE_NOME, limpo);
  } else {
    remover(CHAVE_NOME);
  }

  return usuarioAtual();
}

/** Rótulo para a interface: o nome, ou "Convidado". */
export function rotuloDoUsuario() {
  return nomeDoUsuario() || "Convidado";
}
