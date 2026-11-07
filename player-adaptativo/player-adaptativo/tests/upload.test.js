/**
 * Testes do upload pela interface — página dedicada upload.html, aberta em
 * NOVA ABA pelo botão "Enviar vídeo" da home.
 *
 * Cobre o js/upload-page.js com a página REAL (carregada no jsdom): escolha
 * de arquivo com prévia local, caminho feliz (multipart + polling de /status
 * até completed + painel "Assistir agora"), as 3 FASES da barra (ENVIO com
 * % exato do XHR, TRANSCODIFICAÇÃO indeterminada, PUBLICADO verde) e os
 * erros da API mostrando o detail legível na página.
 *
 * O POST /upload usa XMLHttpRequest (para ter eventos de progresso de envio
 * — fetch não expõe isso), então os testes instalam uma dublê (FakeXHR) em
 * global.XMLHttpRequest. /status e /catalogo seguem dublados via global.fetch.
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { uploadVideo } from "../js/api.js";

const paginaHtml = readFileSync(
  fileURLToPath(new URL("../upload.html", import.meta.url)),
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
 * é assim que a suíte congela o envio no meio para inspecionar a barra.
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

/** Carrega a página de upload real no jsdom (sem executar os <script>). */
function subirPagina() {
  jest.resetModules();
  const pagina = new DOMParser().parseFromString(paginaHtml, "text/html");
  document.body.innerHTML = pagina.body.innerHTML;
}

async function flush(vezes = 8) {
  for (let i = 0; i < vezes; i += 1) {
    await new Promise((resolver) => setTimeout(resolver, 0));
  }
}

/** Instala o arquivo no input (jsdom não abre seletor de arquivos). */
function escolherArquivo(nome = "aula.mp4", bytes = [1, 2, 3]) {
  const arquivo = new File([new Uint8Array(bytes)], nome, { type: "video/mp4" });
  const input = document.querySelector("#uploadFile");
  Object.defineProperty(input, "files", { value: [arquivo] });
  input.dispatchEvent(new Event("change"));
  return arquivo;
}

function preencherFormulario() {
  escolherArquivo();
  document.querySelector("#uploadTitulo").value = "Aula nova";
  document.querySelector("#uploadAutor").value = "Rafael";
  document.querySelector("#uploadTags").value = "matemática";
}

async function iniciarPagina(opcoes = {}) {
  const { iniciarPaginaUpload } = await import("../js/upload-page.js");
  return iniciarPaginaUpload({ intervaloMs: 0, ...opcoes });
}

function submeter() {
  document.querySelector("#uploadForm")
    .dispatchEvent(new Event("submit", { cancelable: true }));
}

beforeAll(() => {
  global.XMLHttpRequest = FakeXHR;
  // jsdom não implementa blob: — a prévia local precisa destes stubs.
  global.URL.createObjectURL = jest.fn(() => "blob:previa");
  global.URL.revokeObjectURL = jest.fn();
});

afterAll(() => {
  global.XMLHttpRequest = XHR_ORIGINAL;
});

beforeEach(() => {
  FakeXHR.reset();
  // Resposta padrão: upload aceito e enfileirado (cenário do caminho feliz).
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

describe("upload.html — escolha do arquivo", () => {
  test("submit sem arquivo avisa e não chama a API", async () => {
    const fetchMock = mockarRotas();
    subirPagina();
    await iniciarPagina();

    submeter();
    await flush(2);

    expect(document.querySelector("#uploadStatus").textContent)
      .toContain("Escolha um arquivo");
    expect(FakeXHR.instancias.length).toBe(0);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/upload")))
      .toBe(false);
  });

  test("escolher arquivo mostra a prévia local com nome e tamanho", async () => {
    mockarRotas();
    subirPagina();
    await iniciarPagina();

    const arquivo = escolherArquivo();

    expect(global.URL.createObjectURL).toHaveBeenCalledWith(arquivo);
    expect(document.querySelector("#uploadPreviewBox").classList.contains("hidden")).toBe(false);
    expect(document.querySelector("#uploadPreview").getAttribute("src")).toBe("blob:previa");
    expect(document.querySelector("#uploadArquivoInfo").textContent)
      .toContain("aula.mp4 — 3 B");
    expect(document.querySelector("#uploadStatus").textContent).toContain("Arquivo escolhido");
  });

  test("extensão inválida é barrada antes de subir (prévia não aparece)", async () => {
    mockarRotas();
    subirPagina();
    await iniciarPagina();

    escolherArquivo("trabalho.pdf");

    expect(document.querySelector("#uploadStatus").textContent)
      .toContain("Formato inválido");
    expect(document.querySelector("#uploadPreviewBox").classList.contains("hidden")).toBe(true);
  });
});

describe("upload.html — caminho feliz", () => {
  test("envia multipart, acompanha o status e mostra o painel com Assistir agora", async () => {
    mockarRotas();
    subirPagina();
    await iniciarPagina();

    preencherFormulario();
    submeter();
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

    // Painel de sucesso com o link da watch page do vídeo publicado.
    const resultado = document.querySelector("#uploadResultado");
    expect(resultado.classList.contains("hidden")).toBe(false);
    expect(document.querySelector("#uploadAssistir").getAttribute("href"))
      .toBe("index.html?video=v-novo");
    expect(document.querySelector("#uploadStatus").textContent)
      .toContain("pronto e publicado");

    // Botão volta a habilitar e o formulário é limpo para o próximo envio.
    expect(document.querySelector("#uploadSubmit").disabled).toBe(false);
    expect(document.querySelector("#uploadTitulo").value).toBe("");
  });

  test("as etapas 1→2→3 marcam feito/ativo conforme o pipeline anda", async () => {
    mockarRotas();
    subirPagina();
    await iniciarPagina();

    preencherFormulario();
    submeter();
    await flush(12);

    const passos = document.querySelectorAll("#uploadPassos li");
    expect(passos[0].classList.contains("feito")).toBe(true);
    expect(passos[1].classList.contains("feito")).toBe(true);
    expect(passos[2].classList.contains("ativo")).toBe(true);
  });
});

describe("upload.html — barra de progresso (3 fases até o carregamento final)", () => {
  test("fase 1 ENVIO: barra visível desde 0% e avança com o valor EXATO do XHR", async () => {
    mockarRotas();
    FakeXHR.auto = null; // envio pilotado manualmente
    subirPagina();
    await iniciarPagina();

    preencherFormulario();
    submeter();
    await flush(2);

    const barra = document.querySelector("#uploadProgress");
    const fill = document.querySelector("#uploadProgressFill");
    const valor = document.querySelector("#uploadProgressValor");
    const status = document.querySelector("#uploadStatus");

    // Diferente do modal antigo, a barra da página JÁ NASCE visível em 0%:
    // a aba existe para mostrar a evolução exata do começo ao fim.
    expect(barra.classList.contains("hidden")).toBe(false);
    expect(barra.getAttribute("aria-valuenow")).toBe("0");
    expect(fill.style.width).toBe("0%");
    expect(valor.textContent).toBe("0%");
    expect(status.textContent).toContain("0% (0 B de 3 B)");

    FakeXHR.ultima.emitirProgresso(0.4);
    await flush(1);
    expect(barra.getAttribute("aria-valuenow")).toBe("40");
    expect(fill.style.width).toBe("40%");
    expect(valor.textContent).toBe("40%");
    expect(status.textContent).toContain("410 KB de 1.0 MB");

    // Fração que não fecha inteira: rótulo com 1 casa decimal, largura
    // proporcional ao valor real (não arredondado para 87%).
    FakeXHR.ultima.emitirProgresso(0.873);
    await flush(1);
    expect(valor.textContent).toBe("87.3%");
    expect(fill.style.width).toBe("87.3%");
    expect(barra.getAttribute("aria-valuenow")).toBe("87");
  });

  test("fase 2 TRANSCODIFICAÇÃO: barra anima em modo indeterminado em vez de sumir", async () => {
    // Status travado em "processing": o polling não conclui, e assim a
    // janela indeterminada fica observável de forma determinística.
    global.fetch = jest.fn(async (url) => {
      const alvo = String(url);
      if (alvo.includes("/status/v-novo")) {
        return {
          ok: true, status: 200,
          json: async () => ({ video_id: "v-novo", status: "processing" }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ videos: [], total: 0 }) };
    });
    FakeXHR.auto = null;
    subirPagina();
    await iniciarPagina();

    preencherFormulario();
    submeter();
    await flush(2);

    const barra = document.querySelector("#uploadProgress");
    const valor = document.querySelector("#uploadProgressValor");

    FakeXHR.ultima.emitirProgresso(1);
    FakeXHR.ultima.concluir(200, { video_id: "v-novo", status: "pending", fila: "enfileirado" });
    await flush(2);

    // O envio terminou, mas a barra CONTINUA visível — agora animada no modo
    // indeterminado enquanto a transcodificação roda (FFmpeg não informa %).
    expect(barra.classList.contains("hidden")).toBe(false);
    expect(barra.classList.contains("indeterminada")).toBe(true);
    expect(barra.getAttribute("aria-valuenow")).toBeNull();
    expect(valor.textContent).toBe("—");
    expect(document.querySelector("#uploadProgressRotulo").textContent)
      .toContain("Transcodificando");

    // Etapa 2 em andamento na régua de passos.
    const passos = document.querySelectorAll("#uploadPassos li");
    expect(passos[0].classList.contains("feito")).toBe(true);
    expect(passos[1].classList.contains("ativo")).toBe(true);
  });

  test("fase 3 PUBLICADO: 100% verde com a página ainda aberta", async () => {
    mockarRotas();
    subirPagina();
    await iniciarPagina();

    preencherFormulario();
    submeter();
    await flush(12);

    const barra = document.querySelector("#uploadProgress");
    expect(document.querySelector("#uploadStatus").textContent)
      .toContain("pronto e publicado");
    expect(barra.classList.contains("hidden")).toBe(false);
    expect(barra.classList.contains("concluida")).toBe(true);
    expect(barra.getAttribute("aria-valuenow")).toBe("100");
    expect(document.querySelector("#uploadProgressFill").style.width).toBe("100%");
    expect(document.querySelector("#uploadProgressValor").textContent).toBe("100%");
    expect(document.querySelector("#uploadProgressRotulo").textContent)
      .toContain("Publicado");
  });

  test("erro no meio do envio: volta ao estado limpo (sem animação residual)", async () => {
    FakeXHR.auto = null;
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    subirPagina();
    await iniciarPagina();

    preencherFormulario();
    submeter();
    await flush(2);

    const barra = document.querySelector("#uploadProgress");
    FakeXHR.ultima.emitirProgresso(0.5);
    await flush(1);
    expect(barra.classList.contains("indeterminada")).toBe(false);

    FakeXHR.ultima.concluirTexto(413, JSON.stringify({ detail: "Arquivo excede o tamanho máximo de 500MB." }));
    await flush(4);

    expect(barra.classList.contains("hidden")).toBe(true);
    expect(barra.classList.contains("indeterminada")).toBe(false);
    expect(barra.classList.contains("concluida")).toBe(false);
    expect(document.querySelector("#uploadResultado").classList.contains("hidden")).toBe(true);
  });
});

describe("upload.html — \"Enviar outro vídeo\"", () => {
  test("limpa formulário, barra, prévia e painel sem recarregar a página", async () => {
    mockarRotas();
    subirPagina();
    await iniciarPagina();

    preencherFormulario();
    submeter();
    await flush(12);
    expect(document.querySelector("#uploadResultado").classList.contains("hidden")).toBe(false);

    document.querySelector("#uploadNovo").click();

    const barra = document.querySelector("#uploadProgress");
    expect(barra.classList.contains("hidden")).toBe(true);
    expect(document.querySelector("#uploadProgressFill").style.width).toBe("0%");
    expect(document.querySelector("#uploadProgressValor").textContent).toBe("0%");
    expect(document.querySelector("#uploadResultado").classList.contains("hidden")).toBe(true);
    expect(document.querySelector("#uploadPreviewBox").classList.contains("hidden")).toBe(true);
    expect(document.querySelector("#uploadTitulo").value).toBe("");

    // A régua de passos volta para a etapa 1.
    const passos = document.querySelectorAll("#uploadPassos li");
    expect(passos[0].classList.contains("ativo")).toBe(true);
    expect(passos[2].classList.contains("feito")).toBe(false);
  });
});

describe("upload.html — erros", () => {
  test("detail da API aparece legível na página (sem stacktrace)", async () => {
    mockarRotas();
    FakeXHR.auto = {
      status: 400,
      corpo: { detail: "Formato inválido. Use mp4, avi, mov ou webm." },
    };
    subirPagina();
    await iniciarPagina();

    preencherFormulario();
    submeter();
    await flush(4);

    const status = document.querySelector("#uploadStatus");
    expect(status.textContent).toContain("Formato inválido");
    expect(status.classList.contains("erro")).toBe(true);
    expect(document.querySelector("#uploadResultado").classList.contains("hidden")).toBe(true);
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
    subirPagina();
    await iniciarPagina();

    preencherFormulario();
    submeter();
    await flush(4);

    expect(document.querySelector("#uploadStatus").textContent).toContain("FFmpeg ausente");
  });

  test("fila indisponível (Redis/worker desligados) avisa na hora em vez de travar no polling", async () => {
    const fetchMock = mockarRotas();
    FakeXHR.auto = {
      status: 200,
      corpo: { video_id: "v-novo", status: "pending", fila: "indisponivel" },
    };
    subirPagina();
    await iniciarPagina();

    preencherFormulario();
    submeter();
    await flush(4);

    const status = document.querySelector("#uploadStatus");
    expect(status.textContent).toContain("fila de processamento está fora do ar");
    expect(status.classList.contains("erro")).toBe(true);
    // O bug original do modal: mesmo sem fila, ficava pollando /status por 10 min.
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
    subirPagina();
    await iniciarPagina({ timeoutFilaMs: 40, intervaloMs: 5 });

    preencherFormulario();
    submeter();
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
