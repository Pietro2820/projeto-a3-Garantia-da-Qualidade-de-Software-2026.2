/**
 * Sonda a API e sai com código 0 (no ar) ou 1 (fora/erro).
 *
 * Roda como processo separado porque o Jest precisa decidir `describe.skip`
 * durante a COLETA dos testes (síncrona) — e dentro do jsdom não há como
 * esperar uma resposta de rede de forma síncrona.
 */
const API = process.argv[2] || process.env.E2E_API_URL || "http://127.0.0.1:8000";

try {
  const resposta = await fetch(`${API}/catalogo?prontos=1`);
  process.exit(resposta.ok ? 0 : 1);
} catch (error) {
  process.exit(1);
}
