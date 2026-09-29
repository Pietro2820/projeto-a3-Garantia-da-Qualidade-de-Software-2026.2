/**
 * Testes do upload pela interface (home → modal → POST /upload).
 *
 * Cobre o js/upload.js com o modal REAL da home.html (carregado no jsdom):
 * abrir/fechar, validação sem arquivo, caminho feliz (multipart + polling de
 * /status até completed + refresh do catálogo) e erro da API mostrando o
 * detail legível dentro do modal.
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { uploadVideo } from "../js/api.js";

const homeHtml = readFileSync(
  fileURLToPath(new URL("../home.html", import.meta.url)),
  "utf8"
);

let chamadasStatus = 0;

/** Dubla /upload, /status (processing → completed) e /catalogo. */
function mockarRotas({ uploadOk = true, detail = "Formato inválido." } = {}) {
  chamadasStatus = 0;
  global.fetch = jest.fn(async (url, options) => {
    const alvo = String(url);

    if (alvo.endsWith("/upload")) {
      if (!uploadOk) {
        return { ok: false, status: 400, json: async () => ({ detail }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ video_id: "v-novo", status: "pending", fila: "enfileirado" }),
      };
    }

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

beforeEach(() => {
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
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/upload")))
      .toBe(false);
  });
});

describe("upload.js — caminho feliz", () => {
  test("envia multipart, acompanha o status e avisa sucesso", async () => {
    const fetchMock = mockarRotas();
    subirHomeComModal();
    const onSucesso = jest.fn();
    await subirUiUpload({ onSucesso });

    preencherFormulario();
    document.querySelector("#uploadForm")
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();

    const chamadaUpload = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/upload"));
    expect(chamadaUpload).toBeDefined();
    const [, options] = chamadaUpload;
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get("titulo")).toBe("Aula nova");
    expect(options.body.get("tags")).toBe("matemática");

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

describe("upload.js — erros", () => {
  test("detail da API aparece legível no modal (sem stacktrace)", async () => {
    mockarRotas({ uploadOk: false, detail: "Formato inválido. Use mp4, avi, mov ou webm." });
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
      if (alvo.endsWith("/upload")) {
        return { ok: true, status: 200, json: async () => ({ video_id: "v-novo" }) };
      }
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
});

describe("api.js — uploadVideo (multipart)", () => {
  test("POST /upload com FormData e SEM Content-Type json fixo", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true, status: 200, json: async () => ({ video_id: "v1" }),
    }));

    const dados = new FormData();
    dados.append("titulo", "X");
    await uploadVideo(dados);

    const [url, options] = global.fetch.mock.calls.at(-1);
    expect(String(url)).toBe("http://localhost:8000/upload");
    expect(options.method).toBe("POST");
    expect(options.body).toBe(dados);
    expect(options.headers).toBeUndefined();
  });

  test("erro da API vira Error com o detail", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false, status: 400, json: async () => ({ detail: "O título é obrigatório." }),
    }));

    await expect(uploadVideo(new FormData())).rejects.toThrow("O título é obrigatório.");
  });
});
