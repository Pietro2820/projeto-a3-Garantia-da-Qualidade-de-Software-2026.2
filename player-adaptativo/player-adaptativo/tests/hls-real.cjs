/**
 * Carrega o HLS.js VENDALIZADO de verdade dentro do jsdom (CommonJS para poder
 * ser usado pelos testes ESM via createRequire).
 *
 * Duas adaptações são necessárias porque o jsdom não é um navegador completo:
 *
 *  1. MediaSource não existe no jsdom — e é justamente o que o
 *     `Hls.isSupported()` verifica. Sem o stub a lib se declara incompatível e o
 *     player nem tenta carregar a playlist (em navegador real existe).
 *  2. `loadSource` é interceptado para NÃO baixar a playlist: o que os testes
 *     validam é QUAL url o player escolheu, não a decodificação de mídia.
 */
"use strict";

const { readFileSync } = require("node:fs");

function instalarMediaSourceStub(win) {
  class SourceBufferStub extends win.EventTarget {
    appendBuffer() {}
    remove() {}
    abort() {}
  }

  class MediaSourceStub extends win.EventTarget {
    static isTypeSupported(tipo) {
      return /video\/mp4|audio\/mp4|video\/mpeg|audio\/mpeg/i.test(String(tipo));
    }

    addSourceBuffer() {
      return new SourceBufferStub();
    }

    endOfStream() {}
  }

  win.MediaSource = MediaSourceStub;
  win.SourceBuffer = SourceBufferStub;
  return MediaSourceStub;
}

/**
 * Evalua o vendor/hls.min.js no window informado.
 * Devolve { Hls, urlsCarregadas } — `urlsCarregadas` recebe cada loadSource.
 *
 * `caminho` é obrigatório: este módulo é CommonJS (não tem `import.meta`), quem
 * chama é que resolve o caminho do vendor a partir do próprio `import.meta.url`.
 */
function carregarHlsReal(win, caminho) {
  const codigo = readFileSync(caminho, "utf8");

  instalarMediaSourceStub(win);

  // A lib espera ambiente de browser; o jsdom fornece window/document/navigator.
  // eslint-disable-next-line no-new-func
  new Function("window", "self", "document", "navigator", codigo)(
    win, win, win.document, win.navigator
  );

  const urlsCarregadas = [];
  win.Hls.prototype.loadSource = function (url) {
    urlsCarregadas.push(url);
    return undefined;
  };

  return { Hls: win.Hls, urlsCarregadas };
}

/** Evalua um <script> clássico (ex.: config.js) no window do jsdom. */
function evaluarScript(win, caminho) {
  const codigo = readFileSync(caminho, "utf8");
  // eslint-disable-next-line no-new-func
  new Function("window", "document", "location", codigo)(win, win.document, win.location);
  return codigo;
}

module.exports = { carregarHlsReal, instalarMediaSourceStub, evaluarScript };
