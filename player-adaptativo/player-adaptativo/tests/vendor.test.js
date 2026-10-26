/**
 * Testes da biblioteca vendalizada (vendor/hls.min.js).
 *
 * O objetivo aqui é duplo:
 *
 *  1. Garantir que o player funciona OFFLINE — o index.html carregava o HLS.js
 *     de cdn.jsdelivr.net, então sem internet (ou com a rede da instituição
 *     bloqueando CDN) o vídeo não rodava no dia da apresentação.
 *
 *  2. Impedir regressão de supply-chain: o hash do arquivo está fixado aqui e
 *     em vendor/README.md. Se alguém trocá-lo, o teste quebra.
 *
 * O último describe é o mais importante: ele CARREGA a lib de verdade e
 * verifica que o global `Hls` aparece com a API que js/player.js e
 * js/quality.js usam.
 */
import { jest } from "@jest/globals";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const VERSAO_HLS = "1.6.13";
const SHA256_HLS =
  "7c47cd97d7a6e7b98d9623dd8ed9a6d45af4be4085e0c2001cd7175c2b4cfb07";

const caminhoVendor = (arquivo) =>
  fileURLToPath(new URL(`../vendor/${arquivo}`, import.meta.url));

const indexHtml = readFileSync(
  fileURLToPath(new URL("../index.html", import.meta.url)),
  "utf8"
);

describe("vendor/hls.min.js — arquivo", () => {
  test("existe", () => {
    expect(statSync(caminhoVendor("hls.min.js")).isFile()).toBe(true);
  });

  test("não está truncado (tem o tamanho esperado de um build completo)", () => {
    const bytes = statSync(caminhoVendor("hls.min.js")).size;

    // O build minificado 1.6.13 tem ~541 KB. Um download interrompido
    // entregaria alguns KB e passaria despercebido sem esta checagem.
    expect(bytes).toBeGreaterThan(500_000);
    expect(bytes).toBeLessThan(700_000);
  });

  test("o SHA-256 confere com o valor documentado em vendor/README.md", () => {
    const conteudo = readFileSync(caminhoVendor("hls.min.js"));
    const sha256 = createHash("sha256").update(conteudo).digest("hex");

    expect(sha256).toBe(SHA256_HLS);
  });

  test("declara a versão fixada", () => {
    const conteudo = readFileSync(caminhoVendor("hls.min.js"), "utf8");

    expect(conteudo).toContain(VERSAO_HLS);
  });

  test("acompanha a licença Apache-2.0 (obrigação ao redistribuir)", () => {
    const licenca = readFileSync(caminhoVendor("LICENSE-hls.js.txt"), "utf8");

    expect(licenca).toContain("Apache License");
    expect(licenca).toContain("Dailymotion");
  });
});

describe("index.html — nenhum recurso externo", () => {
  /**
   * Só os atributos que realmente carregam algo. Comentários e textos são
   * ignorados de propósito: o que importa é o que o navegador vai buscar.
   */
  function referenciasDeRecurso() {
    return [...indexHtml.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)].map(
      (grupo) => grupo[1]
    );
  }

  test("carrega o HLS.js do arquivo local", () => {
    expect(referenciasDeRecurso()).toContain("./vendor/hls.min.js");
  });

  test("nenhum recurso vem de CDN", () => {
    const externas = referenciasDeRecurso().filter((url) =>
      /^(https?:)?\/\//.test(url)
    );

    expect(externas).toEqual([]);
  });

  test("não depende de internet para abrir", () => {
    // Além de src/href, checa @import de CSS e <link> de fontes — vazamentos
    // comuns que só aparecem no dia, quando a rede da sala bloqueia.
    expect(indexHtml).not.toMatch(/(?:src|href)\s*=\s*"https?:/);
    expect(indexHtml).not.toContain("@import");
    expect(indexHtml).not.toContain("fonts.googleapis.com");
  });

  test("toda referência local aponta para arquivo que existe", () => {
    const locais = referenciasDeRecurso().filter(
      (url) => url.startsWith("./") || url.startsWith("../")
    );

    expect(locais.length).toBeGreaterThan(0);
    for (const referencia of locais) {
      const arquivo = fileURLToPath(new URL(`../${referencia}`, import.meta.url));
      expect(statSync(arquivo).isFile()).toBe(true);
    }
  });

  test("âncoras de navegação não são tratadas como arquivo", () => {
    const locais = referenciasDeRecurso().filter((url) => url.startsWith("./"));

    expect(locais).not.toContain("#");
  });

  test("o script do player continua sendo módulo e vem depois da lib", () => {
    const posicaoLib = indexHtml.indexOf("./vendor/hls.min.js");
    const posicaoPlayer = indexHtml.indexOf("./js/player.js");

    expect(posicaoLib).toBeGreaterThan(-1);
    expect(posicaoPlayer).toBeGreaterThan(posicaoLib);
  });
});

describe("vendor/hls.min.js — carrega e expõe a API usada pelo player", () => {
  beforeAll(async () => {
    // O build é UMD: em ambiente de módulo ele cai no ramo que atribui o
    // global. É exatamente o que acontece no navegador ao abrir o index.html.
    await import("../vendor/hls.min.js");
  });

  test("define o global Hls", () => {
    expect(globalThis.Hls).toBeDefined();
  });

  test("Hls.isSupported() responde sem lançar", () => {
    expect(typeof globalThis.Hls.isSupported()).toBe("boolean");
  });

  test("expõe Hls.Events, que js/quality.js e js/player.js usam", () => {
    const { Events } = globalThis.Hls;

    expect(Events.MANIFEST_PARSED).toEqual(expect.any(String));
    expect(Events.LEVEL_SWITCHED).toEqual(expect.any(String));
    expect(Events.ERROR).toEqual(expect.any(String));
    expect(Events.FRAG_BUFFERED).toEqual(expect.any(String));
  });

  test("expõe Hls.ErrorDetails.BUFFER_STALLED_ERROR (detecção de travamento)", () => {
    expect(globalThis.Hls.ErrorDetails.BUFFER_STALLED_ERROR).toEqual(
      expect.any(String)
    );
  });

  test("expõe Hls.ErrorTypes, usado no tratamento de erro fatal", () => {
    const { ErrorTypes } = globalThis.Hls;

    expect(ErrorTypes.NETWORK_ERROR).toEqual(expect.any(String));
    expect(ErrorTypes.MEDIA_ERROR).toEqual(expect.any(String));
  });

  test("a versão carregada é a fixada", () => {
    expect(globalThis.Hls.version).toBe(VERSAO_HLS);
  });
});
