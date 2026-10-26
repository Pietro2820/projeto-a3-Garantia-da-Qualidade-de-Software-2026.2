/**
 * Configuração do Jest para o player adaptativo.
 *
 * `testEnvironment: "jsdom"` é obrigatório: os testes (e o próprio código do
 * player) usam `document`, `window` e `CustomEvent`, que não existem no Node puro.
 *
 * O projeto usa ES Modules (`export class ...`), por isso o script `npm test`
 * roda o Jest com `--experimental-vm-modules`.
 */
export default {
  testEnvironment: "jsdom",
  testMatch: ["**/tests/**/*.test.js"],
  collectCoverageFrom: ["js/**/*.js"],
};
