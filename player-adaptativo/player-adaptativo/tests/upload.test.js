/**
 * Testes do upload pela interface (home → modal → POST /upload).
 *
 * Cobre o js/upload.js com o modal REAL da home.html (carregado no jsdom):
 * abrir/fechar, validação sem arquivo, caminho feliz (multipart + polling de
 * /status até completed + refresh do catálogo), BARRA DE PROGRESSO do envio
 * e erros da API mostrando o detail legível dentro do modal.
 *
 * O POST /upload usa XMLHttpRequest (para ter eventos de progresso de envio —
 * fetch não expõe isso), então os testes instalam uma dublê (FakeXHR) em
 * global.XMLHttpRequest. /status e /catalogo seguem dublados via global.fetch.
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { uploadVideo } from "../js/api.js";

const homeHtml = readFileSync(
  fileURLToPath(new URL("../home.html", import.meta.url)),
  "utf8"
);

const UM_MB = 1024 * 1024;

let chamadasStatus = 0;

/**
 * Dublê de XMLHttpRequest.
 *
 * `FakeXHR.auto` define a resposta automática disparada no send() (num
 * setTimeout 0, como a rede real): { status, corpo, progresso: [frações] }.
 * Com `auto = null` o teste pilota manualmente via emitirProgresso/concluir —
 * é assim que o teste da barra congela o envio no meio para inspecionar o DOM.
 */
class FakeXHR {
  static instancias = [];
  static auto = null;

  constructor() {
    this.metodo = null;
    this.url = null;
    this.body = null;
    this.headers = {};
    this.status = 0;
    this.responseText = "";
    this._listeners = {};
    this.upload = {
      _listeners: {},
      addEventListener: (tipo, cb) => {
        (this.upload._listeners[tipo] ||= []).push(cb);
      },
    };
    FakeXHR.instancias.push(this);
  }

  static reset() {
    FakeXHR.instancias = [];
  }

  static get ultima() {
    return FakeXHR.instancias.at(-1) ?? null;
  }

  open(metodo, url) {
    this.metodo = metodo;
    this.url = url;
  }

  setRequestHeader(nome, valor) {
    this.headers[nome] = valor;
  }

  addEventListener(tipo, cb) {
    (this._listeners[tipo] ||= []).push(cb);
  }

  send(body) {
    this.body = body;
    if (FakeXHR.auto) {
      const { status, corpo, progresso = [1] } = FakeXHR.auto;
      setTimeout(() => {
        for (const fracao of progresso) this.emitirProgresso(fracao);
        this.concluir(status, corpo);
      }, 0);
    }
  }

  emitirProgresso(fracao, total = UM_MB) {
    for (const cb of this.upload._listeners.progress || []) {
      cb({ lengthComputable: true, loaded: Math.round(fracao * total), total });
    }
  }

  concluirTexto(status, texto) {
    this.status = status;
    this.responseText = texto;
    for (const cb of this._listeners.load || []) cb();
  }

  concluir(status, corpo) {
    this.concluirTexto(status, JSON.stringify(corpo ?? {}));
  }

  falharRede() {
    for (const cb of this._listeners.error || []) cb();
  }
}

const XHR_ORIGINAL = global.XMLHttpRequest;

/** Dubla /status (processing → completed) e /catalogo via fetch. */
function mockarRotas() {
  chamadasStatus = 0;
  global.fetch = jest.fn(async (url) => {
    const alvo = String(url);

    if (alvo.includes("/status/v-novo")) {
      chamadasStatus += 1;
      const status = chamadasStatus === 1 ? "processing" : "completed";
      return { ok: true, status: 200, json: async () => ({ video_id: "v-novo", status }) };
    }

    if (alvo.includes("/catalogo")) {
      return { ok: true, status: 200, json: async () => ({ videos: [], total: 0 }) };
    }

    return { ok: false, status: 404, json: async () => ({}) };
  });
  return global.fetch;
}

function subirHomeComModal() {
  jest.resetModules();
  const pagina = new DOMParser().parseFromString(homeHtml, "text/html");
  document.body.innerHTML = pagina.body.innerHTML;
}

async function flush(vezes = 8) {
  for (let i = 0; i < vezes; i += 1) {
    await new Promise((resolver) => setTimeout(resolver, 0));
  }
}

function preencherFormulario() {
  const arquivo = new File([new Uint8Array([1, 2, 3])], "aula.mp4", { type: "video/mp4" });
  Object.defineProperty(document.querySelector("#uploadFile"), "files", {
    value: [arquivo],
  });
  document.querySelector("#uploadTitulo").value = "Aula nova";
  document.querySelector("#uploadAutor").value = "Rafael";
  document.querySelector("#uploadTags").value = "matemática";
}

async function subirUiUpload(opcoes = {}) {
  const { iniciarUiUpload } = await import("../js/upload.js");
  return iniciarUiUpload({ intervaloMs: 0, delayFecharMs: 0, ...opcoes });
}

beforeAll(() => {
  global.XMLHttpRequest = FakeXHR;
});

afterAll(() => {
  global.XMLHttpRequest = XHR_ORIGINAL;
});

beforeEach(() => {
  FakeXHR.reset();
  // Resposta padrão: upload aceito e enfileirado (o cenário do caminho feliz).
  FakeXHR.auto = {
    status: 200,
    corpo: { video_id: "v-novo", status: "pending", fila: "enfileirado" },
    progresso: [1],
  };
  jest.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("upload.js — modal", () => {
  test("o botão da home abre e o × fecha", async () => {
    mockarRotas();
    subirHomeComModal();
    await subirUiUpload();

    const modal = document.querySelector("#uploadModal");
    expect(modal.classList.contains("hidden")).toBe(true);

    document.querySelector("#uploadOpenButton").click();
    expect(modal.classList.contains("hidden")).toBe(false);

    document.querySelector("#uploadClose").click();
    expect(modal.classList.contains("hidden")).toBe(true);
  });

  test("submit sem arquivo avisa e não chama a API", async () => {
    const fetchMock = mockarRotas();
    subirHomeComModal();
    await subirUiUpload();

    document.querySelector("#uploadForm")
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await flush(2);

    expect(document.querySelector("#uploadStatus").textContent)
      .toContain("Escolha um arquivo");
    expect(FakeXHR.instancias.length).toBe(0);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/upload")))
      .toBe(false);
  });
});

describe("upload.js — caminho feliz", () => {
  test("envia multipart, acompanha o status e avisa sucesso", async () => {
    mockarRotas();
    subirHomeComModal();
    const onSucesso = jest.fn();
    await subirUiUpload({ onSucesso });

    preencherFormulario();
    document.querySelector("#uploadForm")
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await flush(12);

    const xhr = FakeXHR.ultima;
    expect(xhr).not.toBeNull();
    expect(xhr.metodo).toBe("POST");
    expect(String(xhr.url)).toBe("http://localhost:8000/upload");
    expect(xhr.body).toBeInstanceOf(FormData);
    expect(xhr.body.get("titulo")).toBe("Aula nova");
    expect(xhr.body.get("tags")).toBe("matemática");
    // O navegador é quem monta o boundary do multipart — setar Content-Type
    // manualmente quebraria o corpo da requisição.
    expect(xhr.headers["Content-Type"]).toBeUndefined();

    expect(chamadasStatus).toBeGreaterThanOrEqual(2);
    expect(document.querySelector("#uploadStatus").textContent)
      .toContain("pronto e publicado");
    expect(onSucesso).toHaveBeenCalled();
  });

  test("a home recarrega o catálogo depois de publicar (fiação do onSucesso)", async () => {
    const fetchMock = mockarRotas();
    subirHomeComModal();
    // Quem liga o onSucesso ao reload da grade é a home (home.js), não o
    // upload.js isolado — por isso o teste sobe a página inteira.
    await import("../js/home.js");
    await flush(4);

    const antes = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/catalogo")).length;

    preencherFormulario();
    document.querySelector("#uploadForm")
      .dispatchEvent(new Event("submit", { cancelable: true }));

    // O polling de produção é de 2s: espera um pouco além dele.
    await new Promise((resolver) => setTimeout(resolver, 2600));

    const depois = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/catalogo")).length;
    expect(depois).toBeGreaterThan(antes);
  }, 10000);

  test("o modal fecha sozinho após o sucesso", async () => {
    mockarRotas();
    subirHomeComModal();
    await subirUiUpload();

    preencherFormulario();
    document.querySelector("#uploadForm")
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await flush(12);

    expect(document.querySelector("#uploadModal").classList.contains("hidden")).toBe(true);
  });
});

describe("upload.js — barra de progresso do envio", () => {
  test("a barra avança com os eventos do XHR e some ao concluir", async () => {
    mockarRotas();
    FakeXHR.auto = null; // envio pilotado manualmente
    subirHomeComModal();
    await subirUiUpload();

    preencherFormulario();
    document.querySelector("#uploadForm")
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await flush(2);

    const xhr = FakeXHR.ultima;
    expect(xhr).not.toBeNull();

    const barra = document.querySelector("#uploadProgress");
    const fill = document.querySelector("#uploadProgressFill");
    const status = document.querySelector("#uploadStatus");

    // Antes do primeiro evento: barra continua escondida.
    expect(barra.classList.contains("hidden")).toBe(true);

    xhr.emitirProgresso(0.4);
    await flush(1);
    expect(barra.classList.contains("hidden")).toBe(false);
    expect(barra.getAttribute("aria-valuenow")).toBe("40");
    expect(fill.style.width).toBe("40%");
    expect(status.textContent).toContain("40%");
    expect(status.textContent).toContain("410 KB de 1.0 MB");

    xhr.emitirProgresso(1);
    xhr.concluir(200, { video_id: "v-novo", status: "pending", fila: "enfileirado" });
    await flush(12);

    // Concluiu o processamento: barra zerada/escondida e mensagem final.
    expect(status.textContent).toContain("pronto e publicado");
    expect(barra.classList.contains("hidden")).toBe(true);
    expect(fill.style.width).toBe("0%");
  });

  test("a barra também some quando o envio termina em erro", async () => {
    FakeXHR.auto = null;
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    subirHomeComModal();
    await subirUiUpload();

    preencherFormulario();
    document.querySelector("#uploadForm")
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await flush(2);

    const xhr = FakeXHR.ultima;
    xhr.emitirProgresso(0.7);
    await flush(1);
    expect(document.querySelector("#uploadProgress").classList.contains("hidden")).toBe(false);

    xhr.concluirTexto(413, JSON.stringify({ detail: "Arquivo excede o tamanho máximo de 500MB." }));
    await flush(4);

    const barra = document.querySelector("#uploadProgress");
    expect(barra.classList.contains("hidden")).toBe(true);
    expect(document.querySelector("#uploadStatus").textContent)
      .toContain("tamanho máximo de 500MB");
  });
});

describe("upload.js — erros", () => {
  test("detail da API aparece legível no modal (sem stacktrace)", async () => {
    mockarRotas();
    FakeXHR.auto = {
      status: 400,
      corpo: { detail: "Formato inválido. Use mp4, avi, mov ou webm." },
    };
    subirHomeComModal();
    const onSucesso = jest.fn();
    await subirUiUpload({ onSucesso });

    preencherFormulario();
    document.querySelector("#uploadForm")
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await flush(4);

    const status = document.querySelector("#uploadStatus");
    expect(status.textContent).toContain("Formato inválido");
    expect(status.classList.contains("erro")).toBe(true);
    expect(onSucesso).not.toHaveBeenCalled();
  });

  test("transcodificação failed vira mensagem de erro", async () => {
    global.fetch = jest.fn(async (url) => {
      const alvo = String(url);
      if (alvo.includes("/status/v-novo")) {
        return {
          ok: true, status: 200,
          json: async () => ({ video_id: "v-novo", status: "failed", erro: "FFmpeg ausente" }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ videos: [], total: 0 }) };
    });
    subirHomeComModal();
    await subirUiUpload();

    preencherFormulario();
    document.querySelector("#uploadForm")
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await flush(4);

    expect(document.querySelector("#uploadStatus").textContent).toContain("FFmpeg ausente");
  });

  test("fila indisponível (Redis/worker desligados) avisa na hora em vez de travar no polling", async () => {
    const fetchMock = mockarRotas();
    FakeXHR.auto = {
      status: 200,
      corpo: { video_id: "v-novo", status: "pending", fila: "indisponivel" },
    };
    subirHomeComModal();
    await subirUiUpload();

    preencherFormulario();
    document.querySelector("#uploadForm")
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await flush(4);

    const status = document.querySelector("#uploadStatus");
    expect(status.textContent).toContain("fila de processamento está fora do ar");
    expect(status.classList.contains("erro")).toBe(true);
    // O bug original: mesmo sem fila, o modal ficava pollando /status por 10 min.
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/status/")))
      .toBe(false);
  });

  test("status preso em pending vira erro com orientação (watchdog da fila)", async () => {
    global.fetch = jest.fn(async (url) => {
      const alvo = String(url);
      if (alvo.includes("/status/v-novo")) {
        return {
          ok: true, status: 200,
          json: async () => ({ video_id: "v-novo", status: "pending" }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ videos: [], total: 0 }) };
    });
    subirHomeComModal();
    await subirUiUpload({ timeoutFilaMs: 40, intervaloMs: 5 });

    preencherFormulario();
    document.querySelector("#uploadForm")
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await new Promise((resolver) => setTimeout(resolver, 400));

    const status = document.querySelector("#uploadStatus");
    expect(status.textContent).toContain("Nenhum worker processou o vídeo");
    expect(status.textContent).toContain("pending");
    expect(status.classList.contains("erro")).toBe(true);
  }, 10000);
});

describe("api.js — uploadVideo (XHR multipart + progresso)", () => {
  test("POST /upload com FormData, SEM Content-Type json fixo e com onProgress", async () => {
    FakeXHR.auto = { status: 200, corpo: { video_id: "v1" }, progresso: [0.25, 0.75, 1] };

    const dados = new FormData();
    dados.append("titulo", "X");
    const eventos = [];
    const corpo = await uploadVideo(dados, (progresso) => eventos.push(progresso));

    const xhr = FakeXHR.ultima;
    expect(String(xhr.url)).toBe("http://localhost:8000/upload");
    expect(xhr.metodo).toBe("POST");
    expect(xhr.body).toBe(dados);
    expect(xhr.headers["Content-Type"]).toBeUndefined();
    expect(corpo).toEqual({ video_id: "v1" });

    expect(eventos.map((evento) => evento.fracao)).toEqual([0.25, 0.75, 1]);
    expect(eventos.at(-1)).toMatchObject({ enviado: UM_MB, total: UM_MB });
  });

  test("onProgress é opcional (não passa callback, não quebra)", async () => {
    FakeXHR.auto = { status: 200, corpo: { video_id: "v2" } };
    await expect(uploadVideo(new FormData())).resolves.toEqual({ video_id: "v2" });
  });

  test("erro da API vira Error com o detail", async () => {
    FakeXHR.auto = { status: 400, corpo: { detail: "O título é obrigatório." } };
    await expect(uploadVideo(new FormData())).rejects.toThrow("O título é obrigatório.");
  });

  test("resposta não-JSON vira Error com o status HTTP", async () => {
    FakeXHR.auto = null;
    const promessa = uploadVideo(new FormData());
    FakeXHR.ultima.concluirTexto(502, "<html>Bad Gateway</html>");
    await expect(promessa).rejects.toThrow("API respondeu com HTTP 502");
  });

  test("falha de rede vira Error legível", async () => {
    FakeXHR.auto = null;
    const promessa = uploadVideo(new FormData());
    FakeXHR.ultima.falharRede();
    await expect(promessa).rejects.toThrow("Falha de rede");
  });
});
