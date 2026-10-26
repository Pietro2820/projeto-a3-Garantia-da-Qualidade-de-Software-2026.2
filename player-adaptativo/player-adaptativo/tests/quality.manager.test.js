/**
 * Testes REAIS do QualityManager (js/quality.js).
 *
 * Diferença para o tests/quality.test.js original: aqui importamos a classe de
 * produção e exercitamos o comportamento dela — troca de qualidade manual/automática,
 * validação de nível inválido, detecção de travamentos (stall) e a redução de
 * qualidade que nunca pode passar do nível 0.
 *
 * O `Hls` global é um dublê: o quality.js só usa Hls.Events/Hls.ErrorDetails
 * como chaves de evento, então um objeto simples basta (não baixamos a lib).
 */
import { jest } from "@jest/globals";
import { QualityManager } from "../js/quality.js";

function criarHlsFake(levels = [{ height: 360 }, { height: 720 }, { height: 1080 }]) {
  return {
    levels,
    currentLevel: -1,
    on: jest.fn(),
  };
}

function criarElementos() {
  return {
    qualitySelect: document.createElement("select"),
    currentQuality: document.createElement("span"),
    connectionAlert: document.createElement("div"),
  };
}

beforeAll(() => {
  global.Hls = {
    Events: {
      MANIFEST_PARSED: "hlsManifestParsed",
      LEVEL_SWITCHED: "hlsLevelSwitched",
      ERROR: "hlsError",
    },
    ErrorDetails: {
      BUFFER_STALLED_ERROR: "bufferStalledError",
    },
  };
});

beforeEach(() => {
  jest.restoreAllMocks();
});

describe("QualityManager — construção", () => {
  test("começa em modo automático (nível -1)", () => {
    const manager = new QualityManager(criarHlsFake(), {}, criarElementos());

    expect(manager.manualLevel).toBe(-1);
  });

  test("sobrevive sem HLS (não quebra quando a lib ainda não carregou)", () => {
    expect(() => new QualityManager(null, {}, criarElementos())).not.toThrow();
  });

  test("registra os 3 eventos do HLS.js", () => {
    const hls = criarHlsFake();
    new QualityManager(hls, {}, criarElementos());

    expect(hls.on).toHaveBeenCalledTimes(3);
  });
});

describe("QualityManager — populateQualityOptions", () => {
  test("cria a opção Automático mais uma por resolução", () => {
    const elements = criarElementos();
    const manager = new QualityManager(criarHlsFake(), {}, elements);

    manager.populateQualityOptions();

    const opcoes = [...elements.qualitySelect.options].map((o) => o.textContent);
    expect(opcoes).toEqual(["Automático", "360p", "720p", "1080p"]);
  });

  test("a opção Automático tem value -1", () => {
    const elements = criarElementos();
    const manager = new QualityManager(criarHlsFake(), {}, elements);

    manager.populateQualityOptions();

    expect(elements.qualitySelect.options[0].value).toBe("-1");
  });

  test("não duplica resoluções repetidas no manifest", () => {
    const elements = criarElementos();
    const hls = criarHlsFake([{ height: 720 }, { height: 720 }, { height: 360 }]);
    const manager = new QualityManager(hls, {}, elements);

    manager.populateQualityOptions();

    const textos = [...elements.qualitySelect.options].map((o) => o.textContent);
    expect(textos).toEqual(["Automático", "720p", "360p"]);
  });

  test("ignora nível sem altura conhecida", () => {
    const elements = criarElementos();
    const manager = new QualityManager(criarHlsFake([{ height: 0 }, { height: 480 }]), {}, elements);

    manager.populateQualityOptions();

    expect(elements.qualitySelect.options).toHaveLength(2);
  });
});

describe("QualityManager — setQuality", () => {
  test("-1 volta para o automático e rotula como Auto", () => {
    const hls = criarHlsFake();
    const elements = criarElementos();
    const manager = new QualityManager(hls, {}, elements);

    manager.setQuality(-1);

    expect(hls.currentLevel).toBe(-1);
    expect(manager.manualLevel).toBe(-1);
    expect(elements.currentQuality.textContent).toBe("Qualidade: Auto");
  });

  test("nível válido troca a qualidade e mostra a resolução", () => {
    const hls = criarHlsFake();
    const elements = criarElementos();
    const manager = new QualityManager(hls, {}, elements);

    manager.setQuality(1);

    expect(hls.currentLevel).toBe(1);
    expect(elements.currentQuality.textContent).toBe("Qualidade: 720p");
  });

  test("aceita o nível vindo como string (é o que o <select> entrega)", () => {
    const hls = criarHlsFake();
    const manager = new QualityManager(hls, {}, criarElementos());

    manager.setQuality("2");

    expect(hls.currentLevel).toBe(2);
  });

  test.each([
    ["acima do último nível", 99],
    ["negativo diferente de -1", -5],
    ["não inteiro", 1.5],
  ])("lança erro para nível inválido: %s", (_descricao, nivel) => {
    const manager = new QualityManager(criarHlsFake(), {}, criarElementos());

    expect(() => manager.setQuality(nivel)).toThrow("Nível de qualidade inválido.");
  });

  test("o último nível válido é aceito (limite superior)", () => {
    const hls = criarHlsFake();
    const manager = new QualityManager(hls, {}, criarElementos());

    expect(() => manager.setQuality(2)).not.toThrow();
  });
});

describe("QualityManager — leitura do nível atual", () => {
  test("getCurrentLevel devolve -1 quando não há HLS", () => {
    const manager = new QualityManager(null, {}, criarElementos());

    expect(manager.getCurrentLevel()).toBe(-1);
  });

  test("getCurrentHeight devolve a altura do nível em reprodução", () => {
    const hls = criarHlsFake();
    hls.currentLevel = 2;
    const manager = new QualityManager(hls, {}, criarElementos());

    expect(manager.getCurrentHeight()).toBe(1080);
  });

  test("getCurrentHeight devolve null para nível desconhecido", () => {
    const hls = criarHlsFake();
    hls.currentLevel = 7;
    const manager = new QualityManager(hls, {}, criarElementos());

    expect(manager.getCurrentHeight()).toBeNull();
  });
});

describe("QualityManager — detecção de conexão ruim (stall)", () => {
  test("alerta aparece a partir do 2º travamento", () => {
    const elements = criarElementos();
    elements.connectionAlert.classList.add("hidden");
    const manager = new QualityManager(criarHlsFake(), {}, elements);

    manager.recordStall();
    expect(elements.connectionAlert.classList.contains("hidden")).toBe(true);

    manager.recordStall();
    expect(elements.connectionAlert.classList.contains("hidden")).toBe(false);
  });

  test("não alerta quando a qualidade é manual (culpa é do usuário)", () => {
    const elements = criarElementos();
    elements.connectionAlert.classList.add("hidden");
    const hls = criarHlsFake();
    const manager = new QualityManager(hls, {}, elements);
    manager.setQuality(0);

    manager.recordStall();
    manager.recordStall();

    expect(elements.connectionAlert.classList.contains("hidden")).toBe(true);
  });

  test("travamentos com mais de 15s entre si não acumulam", () => {
    const elements = criarElementos();
    elements.connectionAlert.classList.add("hidden");
    const manager = new QualityManager(criarHlsFake(), {}, elements);

    const agora = Date.now();
    jest.spyOn(Date, "now").mockReturnValueOnce(agora).mockReturnValueOnce(agora + 60_000);

    manager.recordStall();
    manager.recordStall();

    expect(manager.stallCount).toBe(1);
    expect(elements.connectionAlert.classList.contains("hidden")).toBe(true);
  });

  test("hideAlert esconde o alerta e zera o marcador", () => {
    const elements = criarElementos();
    const manager = new QualityManager(criarHlsFake(), {}, elements);
    manager.alertShown = true;

    manager.hideAlert();

    expect(elements.connectionAlert.classList.contains("hidden")).toBe(true);
    expect(manager.alertShown).toBe(false);
  });
});

describe("QualityManager — reduceQuality", () => {
  test("desce um nível e esconde o alerta", () => {
    const hls = criarHlsFake();
    hls.currentLevel = 2;
    const elements = criarElementos();
    const manager = new QualityManager(hls, {}, elements);

    manager.reduceQuality();

    expect(hls.currentLevel).toBe(1);
    expect(elements.connectionAlert.classList.contains("hidden")).toBe(true);
  });

  test("nunca desce abaixo do nível 0", () => {
    const hls = criarHlsFake();
    hls.currentLevel = 0;
    const manager = new QualityManager(hls, {}, criarElementos());

    manager.reduceQuality();

    expect(hls.currentLevel).toBe(0);
  });

  test("em modo automático (nível -1) só esconde o alerta", () => {
    const hls = criarHlsFake();
    hls.currentLevel = -1;
    const elements = criarElementos();
    const manager = new QualityManager(hls, {}, elements);

    manager.reduceQuality();

    expect(hls.currentLevel).toBe(-1);
    expect(elements.connectionAlert.classList.contains("hidden")).toBe(true);
  });
});
