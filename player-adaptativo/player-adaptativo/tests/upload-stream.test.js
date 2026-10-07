/**
 * Acompanhamento da transcodificação por SSE (js/upload.js).
 *
 * O modal de upload deixava de bater em GET /status a cada 2s: agora abre
 * GET /status/{id}/stream (Server-Sent Events) e o servidor avisa quando o
 * estado muda. Se o stream não estiver disponível (navegador sem EventSource,
 * proxy que bufferiza, backend antigo), o código VOLTA ao polling — e é essa
 * rede de segurança que também está em teste aqui.
 *
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";

/** EventSource de mentira: o teste empurra os quadros manualmente. */
class FakeEventSource {
  static instancias = [];

  constructor(url) {
    this.url = url;
    this.fechado = false;
    this.onmessage = null;
    this.onerror = null;
    FakeEventSource.instancias.push(this);
  }

  close() {
    this.fechado = true;
  }

  /** Simula um quadro `data: {...}` chegando do servidor. */
  enviar(payload) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  /** Simula keep-alive/comentário (não é JSON). */
  enviarLixo() {
    this.onmessage?.({ data: ": keep-alive" });
  }

  falhar() {
    this.onerror?.(new Event("error"));
  }
}

let upload;

beforeEach(async () => {
  jest.resetModules();
  FakeEventSource.instancias = [];
  window.EventSource = FakeEventSource;
  jest.spyOn(console, "info").mockImplementation(() => {});
  upload = await import("../js/upload.js");
});

afterEach(() => {
  jest.restoreAllMocks();
  delete window.EventSource;
});

function mockarStatus(sequencia) {
  let indice = 0;
  global.fetch = jest.fn(async () => {
    const status = sequencia[Math.min(indice, sequencia.length - 1)];
    indice += 1;
    return { ok: true, status: 200, json: async () => ({ video_id: "v1", status }) };
  });
  return global.fetch;
}

describe("acompanharPorStream", () => {
  test("abre o stream na URL da API e resolve no completed", async () => {
    const promise = upload.acompanharPorStream("v1");
    const fonte = FakeEventSource.instancias[0];

    expect(fonte.url).toContain("/status/v1/stream");

    fonte.enviar({ video_id: "v1", status: "processing" });
    fonte.enviar({ video_id: "v1", status: "completed", evento: "fim" });

    await expect(promise).resolves.toMatchObject({ status: "completed" });
    expect(fonte.fechado).toBe(true);
  });

  test("chama onStatus a cada mudança de estado (e só nela)", async () => {
    const onStatus = jest.fn();
    const promise = upload.acompanharPorStream("v1", { onStatus });
    const fonte = FakeEventSource.instancias[0];

    fonte.enviar({ status: "pending" });
    fonte.enviar({ status: "pending" });
    fonte.enviar({ status: "processing" });
    fonte.enviarLixo();
    fonte.enviar({ status: "completed" });

    await promise;

    expect(onStatus.mock.calls.map(([payload]) => payload.status))
      .toEqual(["pending", "processing", "completed"]);
  });

  test("status 'unknown' (upload ainda não gravou) não vira callback", async () => {
    const onStatus = jest.fn();
    const promise = upload.acompanharPorStream("v1", { onStatus });
    const fonte = FakeEventSource.instancias[0];

    fonte.enviar({ status: "unknown" });
    fonte.enviar({ status: "completed" });

    await promise;
    expect(onStatus).toHaveBeenCalledTimes(1);
  });

  test("failed rejeita com o erro que veio do servidor", async () => {
    const promise = upload.acompanharPorStream("v1");
    FakeEventSource.instancias[0].enviar({
      status: "failed",
      erro: "FFmpeg não está instalado no sistema",
    });

    await expect(promise).rejects.toThrow("FFmpeg não está instalado no sistema");
  });

  test("timeout do servidor rejeita (o front não fica preso)", async () => {
    const promise = upload.acompanharPorStream("v1");
    FakeEventSource.instancias[0].enviar({ evento: "timeout" });

    await expect(promise).rejects.toThrow("encerrou o acompanhamento");
  });
});

describe("acompanharProcessamento (SSE + rede de segurança)", () => {
  test("usa o stream quando o navegador tem EventSource", async () => {
    const promise = upload.acompanharProcessamento("v1", { intervaloMs: 0 });
    FakeEventSource.instancias[0].enviar({ status: "completed" });

    await expect(promise).resolves.toMatchObject({ status: "completed" });
  });

  test("cai no polling quando o stream não conecta", async () => {
    const fetchMock = mockarStatus(["processing", "completed"]);

    const promise = upload.acompanharProcessamento("v1", { intervaloMs: 0 });
    FakeEventSource.instancias[0].falhar();

    await expect(promise).resolves.toMatchObject({ status: "completed" });
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test("sem EventSource no navegador, vai direto para o polling", async () => {
    delete window.EventSource;
    const fetchMock = mockarStatus(["processing", "completed"]);

    const resultado = await upload.acompanharProcessamento("v1", { intervaloMs: 0 });

    expect(FakeEventSource.instancias).toHaveLength(0);
    expect(resultado.status).toBe("completed");
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test("erro de verdade no stream (failed) NÃO é engolido pelo fallback", async () => {
    mockarStatus(["completed"]);

    const promise = upload.acompanharProcessamento("v1", { intervaloMs: 0 });
    FakeEventSource.instancias[0].enviar({ status: "failed", erro: "codec não suportado" });

    await expect(promise).rejects.toThrow("codec não suportado");
  });
});
