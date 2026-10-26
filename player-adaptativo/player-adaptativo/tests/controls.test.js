/**
 * Testes REAIS dos controles do player (js/controls.js).
 *
 * Cobrem o que o usuário sente na prática: play/pause, seek com limite nas
 * bordas do vídeo, volume/mute, velocidade, barra de progresso, atalhos de
 * teclado e a formatação de tempo (`formatTime`).
 *
 * O `<video>` é substituído por um dublê (jsdom não decodifica mídia) e os
 * elementos de UI são DOM de verdade, para que `classList`/`textContent`
 * funcionem como no navegador.
 */
import { jest } from "@jest/globals";

import { PlayerControls, formatTime } from "../js/controls.js";

function criarVideoFake(overrides = {}) {
  return {
    paused: true,
    muted: false,
    volume: 1,
    currentTime: 0,
    duration: 100,
    playbackRate: 1,
    disablePictureInPicture: false,
    addEventListener: jest.fn(),
    play: jest.fn(async () => {}),
    pause: jest.fn(),
    requestPictureInPicture: jest.fn(async () => {}),
    closest: jest.fn(() => ({ requestFullscreen: jest.fn(async () => {}) })),
    ...overrides,
  };
}

function criarElementos() {
  const elements = {
    playButton: document.createElement("button"),
    backButton: document.createElement("button"),
    muteButton: document.createElement("button"),
    fullscreenButton: document.createElement("button"),
    pipButton: document.createElement("button"),
    settingsButton: document.createElement("button"),
    closeSettingsButton: document.createElement("button"),
    settingsMenu: document.createElement("div"),
    timeLabel: document.createElement("span"),
    volume: document.createElement("input"),
    progress: document.createElement("input"),
    speedSelect: criarSpeedSelect(),
  };
  document.body.append(...Object.values(elements));
  return elements;
}

/**
 * Réplica do <select id="speedSelect"> do index.html.
 * Um <select> sem <option> não aceita `.value` (o navegador devolve ""),
 * então o dublê precisa ter as mesmas velocidades da página real.
 */
function criarSpeedSelect() {
  const select = document.createElement("select");
  for (const velocidade of ["0.5", "0.75", "1", "1.25", "1.5", "2"]) {
    const option = document.createElement("option");
    option.value = velocidade;
    select.appendChild(option);
  }
  select.value = "1";
  return select;
}

function criarControls(videoOverrides) {
  const video = criarVideoFake(videoOverrides);
  const elements = criarElementos();
  return { controls: new PlayerControls(video, elements), video, elements };
}

function tecla(propriedades) {
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...propriedades })
  );
}

afterEach(() => {
  document.body.innerHTML = "";
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// formatTime — função pura, coração do rótulo de tempo
// ---------------------------------------------------------------------------

describe("formatTime", () => {
  test.each([
    [0, "0:00"],
    [9, "0:09"],
    [59, "0:59"],
    [60, "1:00"],
    [65, "1:05"],
    [600, "10:00"],
    [3599, "59:59"],
  ])("%p segundos -> %p", (entrada, esperado) => {
    expect(formatTime(entrada)).toBe(esperado);
  });

  test("passa de uma hora com formato h:mm:ss", () => {
    expect(formatTime(3661)).toBe("1:01:01");
  });

  test.each([
    ["NaN", NaN],
    ["infinito", Infinity],
    ["negativo", -5],
    ["undefined", undefined],
  ])("devolve 0:00 para valor inválido: %s", (_descricao, entrada) => {
    expect(formatTime(entrada)).toBe("0:00");
  });

  test("arredonda para baixo os segundos fracionados", () => {
    expect(formatTime(59.9)).toBe("0:59");
  });
});

// ---------------------------------------------------------------------------
// Construção
// ---------------------------------------------------------------------------

describe("PlayerControls — construção", () => {
  test("assina os eventos de mídia do vídeo", () => {
    const { video } = criarControls();

    const eventos = video.addEventListener.mock.calls.map((c) => c[0]);

    expect(eventos).toEqual(
      expect.arrayContaining(["play", "pause", "timeupdate", "loadedmetadata", "volumechange"])
    );
  });
});

// ---------------------------------------------------------------------------
// Reprodução
// ---------------------------------------------------------------------------

describe("PlayerControls — play/pause", () => {
  test("togglePlay dá play quando está pausado", async () => {
    const { controls, video } = criarControls({ paused: true });

    await controls.togglePlay();

    expect(video.play).toHaveBeenCalledTimes(1);
    expect(video.pause).not.toHaveBeenCalled();
  });

  test("togglePlay pausa quando está reproduzindo", async () => {
    const { controls, video } = criarControls({ paused: false });

    await controls.togglePlay();

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.play).not.toHaveBeenCalled();
  });

  test("falha no play() é tratada e não derruba a página", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { controls, video } = criarControls({ paused: true });
    video.play.mockRejectedValue(new Error("NotAllowedError"));

    await expect(controls.togglePlay()).resolves.not.toThrow();
    expect(console.error).toHaveBeenCalled();

    // O listener de teclado desta instância fica registrado no document para o
    // resto da suíte; devolvemos um play() que resolve para não vazar
    // rejeição (e log) para os testes seguintes.
    video.play.mockImplementation(async () => {});
  });

  test("clique no botão de play dispara o togglePlay", async () => {
    const { controls, elements, video } = criarControls({ paused: true });
    const espiao = jest.spyOn(controls, "togglePlay");

    elements.playButton.click();
    await Promise.resolve();

    expect(espiao).toHaveBeenCalled();
    expect(video.play).toHaveBeenCalled();
  });

  test("ícone e aria-label acompanham o estado de reprodução", () => {
    const { controls, elements, video } = criarControls({ paused: true });

    controls.updatePlayIcon();
    expect(elements.playButton.textContent).toBe("▶");
    expect(elements.playButton.getAttribute("aria-label")).toBe("Reproduzir");

    video.paused = false;
    controls.updatePlayIcon();
    expect(elements.playButton.textContent).toBe("❚❚");
    expect(elements.playButton.getAttribute("aria-label")).toBe("Pausar");
  });
});

// ---------------------------------------------------------------------------
// Seek
// ---------------------------------------------------------------------------

describe("PlayerControls — seekRelative", () => {
  test("avança e retrocede os segundos pedidos", () => {
    const { controls, video } = criarControls({ currentTime: 50, duration: 100 });

    controls.seekRelative(10);
    expect(video.currentTime).toBe(60);

    controls.seekRelative(-25);
    expect(video.currentTime).toBe(35);
  });

  test("não passa do início do vídeo", () => {
    const { controls, video } = criarControls({ currentTime: 3, duration: 100 });

    controls.seekRelative(-10);

    expect(video.currentTime).toBe(0);
  });

  test("não passa do fim do vídeo", () => {
    const { controls, video } = criarControls({ currentTime: 95, duration: 100 });

    controls.seekRelative(30);

    expect(video.currentTime).toBe(100);
  });

  test("não faz nada enquanto a duração é desconhecida (metadados não carregaram)", () => {
    const { controls, video } = criarControls({ currentTime: 10, duration: NaN });

    controls.seekRelative(10);

    expect(video.currentTime).toBe(10);
  });

  test("botão de voltar retrocede 10 segundos", () => {
    const { elements, video } = criarControls({ currentTime: 50, duration: 100 });

    elements.backButton.click();

    expect(video.currentTime).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// Volume e mute
// ---------------------------------------------------------------------------

describe("PlayerControls — volume", () => {
  test("slider de volume altera o volume do vídeo", () => {
    const { elements, video } = criarControls();
    elements.volume.value = "0.3";

    elements.volume.dispatchEvent(new Event("input"));

    expect(video.volume).toBe(0.3);
    expect(video.muted).toBe(false);
  });

  test("volume 0 muta o vídeo automaticamente", () => {
    const { elements, video } = criarControls();
    elements.volume.value = "0";

    elements.volume.dispatchEvent(new Event("input"));

    expect(video.muted).toBe(true);
  });

  test("botão de mute alterna o estado", () => {
    const { elements, video } = criarControls({ muted: false });

    elements.muteButton.click();
    expect(video.muted).toBe(true);

    elements.muteButton.click();
    expect(video.muted).toBe(false);
  });

  test("ícone fica mudo quando o volume é zero mesmo sem muted", () => {
    const { controls, elements, video } = criarControls({ muted: false, volume: 0 });

    controls.updateMuteIcon();

    expect(elements.muteButton.textContent).toBe("🔇");
  });

  test("ícone fica sonoro quando há áudio", () => {
    const { controls, elements, video } = criarControls({ muted: false, volume: 0.8 });

    controls.updateMuteIcon();

    expect(elements.muteButton.textContent).toBe("🔊");
  });
});

// ---------------------------------------------------------------------------
// Progresso e velocidade
// ---------------------------------------------------------------------------

describe("PlayerControls — progresso", () => {
  test("barra e rótulo refletem a posição atual", () => {
    const { controls, elements, video } = criarControls({ currentTime: 25, duration: 100 });

    controls.updateProgress();

    expect(elements.progress.value).toBe("25");
    expect(elements.timeLabel.textContent).toBe("0:25 / 1:40");
  });

  test("não atualiza enquanto a duração é desconhecida", () => {
    const { controls, elements, video } = criarControls({ currentTime: 25, duration: NaN });

    controls.updateProgress();

    expect(elements.timeLabel.textContent).toBe("");
  });

  test("arrastar a barra reposiciona o vídeo em porcentagem", () => {
    const { elements, video } = criarControls({ currentTime: 0, duration: 200 });
    elements.progress.value = "50";

    elements.progress.dispatchEvent(new Event("input"));

    expect(video.currentTime).toBe(100);
  });

  test("seletor de velocidade altera o playbackRate", () => {
    const { elements, video } = criarControls();
    elements.speedSelect.value = "1.5";

    elements.speedSelect.dispatchEvent(new Event("change"));

    expect(video.playbackRate).toBe(1.5);
  });
});

// ---------------------------------------------------------------------------
// Menu de configurações
// ---------------------------------------------------------------------------

describe("PlayerControls — menu de configurações", () => {
  test("botão de configurações abre e fecha o menu", () => {
    const { elements } = criarControls();
    elements.settingsMenu.classList.add("hidden");

    elements.settingsButton.click();
    expect(elements.settingsMenu.classList.contains("hidden")).toBe(false);

    elements.settingsButton.click();
    expect(elements.settingsMenu.classList.contains("hidden")).toBe(true);
  });

  test("botão de fechar sempre esconde o menu", () => {
    const { elements } = criarControls();

    elements.closeSettingsButton.click();

    expect(elements.settingsMenu.classList.contains("hidden")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Atalhos de teclado
// ---------------------------------------------------------------------------

describe("PlayerControls — atalhos de teclado", () => {
  test("espaço alterna reprodução", async () => {
    const { video } = criarControls({ paused: true });

    tecla({ code: "Space", key: " " });
    await Promise.resolve();

    expect(video.play).toHaveBeenCalled();
  });

  test("seta esquerda volta 5s e seta direita avança 5s", () => {
    const { video } = criarControls({ currentTime: 50, duration: 100 });

    tecla({ code: "ArrowLeft", key: "ArrowLeft" });
    expect(video.currentTime).toBe(45);

    tecla({ code: "ArrowRight", key: "ArrowRight" });
    expect(video.currentTime).toBe(50);
  });

  test("tecla M muta o vídeo", () => {
    const { video } = criarControls({ muted: false });

    tecla({ code: "KeyM", key: "m" });

    expect(video.muted).toBe(true);
  });

  test("atalhos são ignorados com foco em campo de formulário", () => {
    const { video } = criarControls({ currentTime: 50, duration: 100 });
    const campo = document.createElement("input");
    document.body.appendChild(campo);

    campo.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code: "ArrowLeft", key: "ArrowLeft" }));

    expect(video.currentTime).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Fullscreen e Picture-in-Picture
// ---------------------------------------------------------------------------

describe("PlayerControls — fullscreen e PiP", () => {
  test("entra em tela cheia a partir do container do player", async () => {
    const requestFullscreen = jest.fn(async () => {});
    const { controls, video } = criarControls();
    video.closest.mockReturnValue({ requestFullscreen });

    await controls.toggleFullscreen();

    expect(video.closest).toHaveBeenCalledWith(".player-shell");
    expect(requestFullscreen).toHaveBeenCalled();
  });

  test("falha de fullscreen é capturada e logada", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { controls, video } = criarControls();
    video.closest.mockReturnValue({
      requestFullscreen: jest.fn(async () => {
        throw new Error("não suportado");
      }),
    });

    await expect(controls.toggleFullscreen()).resolves.not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });

  test("PiP não faz nada quando o navegador não suporta", async () => {
    const { controls, video } = criarControls();
    Object.defineProperty(document, "pictureInPictureEnabled", { value: false, configurable: true });

    await controls.togglePiP();

    expect(video.requestPictureInPicture).not.toHaveBeenCalled();
  });
});
