/**
 * Parâmetros de URL compartilhados pelas duas páginas do player.
 *
 * Existe como módulo próprio (em vez de ler `window.location` direto em cada
 * arquivo) por dois motivos:
 *   1. home.html e index.html precisam concordar sobre o formato dos links
 *      que trocam entre si (`home.html?q=...` ⇄ `index.html?video=...`);
 *   2. fica testável — nos testes Jest a URL do jsdom é fixa por arquivo, então
 *      o módulo é dublado para simular "a página abriu com ?q=geometria".
 */

/** Query string atual da página (com o "?" removido). */
export function queryString() {
  try {
    return window.location.search || "";
  } catch (error) {
    return "";
  }
}

/** Valor de um parâmetro da URL ("" quando ausente). */
export function parametro(nome) {
  try {
    return new URLSearchParams(queryString()).get(nome) || "";
  } catch (error) {
    return "";
  }
}

/**
 * Atualiza a barra de endereço sem recarregar a página (link compartilhável).
 * Silencioso quando o navegador não suporta History API.
 */
export function definirParametro(nome, valor) {
  if (!window.history?.replaceState) return;

  try {
    const url = new URL(window.location.href);
    if (valor) {
      url.searchParams.set(nome, valor);
    } else {
      url.searchParams.delete(nome);
    }
    window.history.replaceState({}, "", url);
  } catch (error) {
    // URL não manipulável (ex.: file://): seguir sem atualizar o endereço.
  }
}
