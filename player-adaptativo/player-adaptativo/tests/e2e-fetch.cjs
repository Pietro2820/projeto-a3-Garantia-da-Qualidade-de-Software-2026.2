/**
 * Client HTTP para o teste E2E (tests/e2e.player-api.test.js).
 *
 * O jsdom não fornece `fetch` e o teste roda em ESM (sem `require`), então a
 * instalação do global fica neste módulo CommonJS — carregado via
 * `createRequire`. Ele fala node:http/https, que é tudo o que as rotas JSON da
 * API precisam.
 */
"use strict";

const http = require("node:http");
const https = require("node:https");

function instalarFetch(globalAlvo = globalThis) {
  globalAlvo.fetch = (input, init = {}) =>
    new Promise((resolver, rejeitar) => {
      const url = new URL(String(typeof input === "string" ? input : input.url));
      const transport = url.protocol === "https:" ? https : http;
      const corpo = init.body ? String(init.body) : null;

      const requisicao = transport.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: init.method || "GET",
          headers: {
            ...(init.headers || {}),
            ...(corpo ? { "content-length": Buffer.byteLength(corpo) } : {}),
          },
        },
        (resposta) => {
          const pedacos = [];
          resposta.on("data", (pedaco) => pedacos.push(pedaco));
          resposta.on("end", () => {
            const texto = Buffer.concat(pedacos).toString("utf8");
            resolver({
              ok: resposta.statusCode >= 200 && resposta.statusCode < 300,
              status: resposta.statusCode,
              headers: resposta.headers,
              text: async () => texto,
              json: async () => JSON.parse(texto),
            });
          });
        }
      );

      requisicao.on("error", rejeitar);
      if (corpo) requisicao.write(corpo);
      requisicao.end();
    });

  return globalAlvo.fetch;
}

module.exports = { instalarFetch };
