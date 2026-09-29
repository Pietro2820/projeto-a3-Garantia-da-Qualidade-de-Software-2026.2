import { PlayerControls } from "./controls.js";
import { QualityManager } from "./quality.js";
import {
  renderRecommendations,
  renderSidebar,
  DEMO_VIDEOS
} from "./recommendations.js";
import {
  atualizarCatalogoDaApi,
  buscarVideoDaApi,
  registrarVisualizacao
} from "./catalog.js";
import { API_BASE_URL } from "./api.js";

// index.html?video={id} — é assim que a home (home.html) abre um vídeo.
const PARAMS = new URLSearchParams(window.location.search);
const VIDEO_DA_URL = PARAMS.get("video");

const CONFIG = {
  // Durante o desenvolvimento, troque por um master.m3u8 real.
  // Exemplo local:
  // HLS_URL: "http://localhost:8000/videos/UUID/master.m3u8"
  HLS_URL: window.PLAYER_CONFIG?.HLS_URL || "./videos/master.m3u8",

  // Quando o backend estiver pronto:
  VIDEO_ID: window.PLAYER_CONFIG?.VIDEO_ID || VIDEO_DA_URL || "demo-video",
  USER_ID: window.PLAYER_CONFIG?.USER_ID || "demo-user"
};

/**
 * Resolve uma URL de mídia vinda da API para uma URL utilizável no navegador.
 *
 * A API devolve URLs absolutas (http://host:8000/videos/...), mas se vier um
 * caminho relativo de raiz ("/videos/..."), ele precisa ser prefixado com a
 * origem do BACKEND — senão o navegador resolve contra a origem do front
 * (Live Server :5500, por exemplo) e o vídeo dá 404.
 * URLs relativas à página ("./videos/...") e absolutas passam intactas.
 */
function resolveMediaUrl(url) {
  if (!url || typeof url !== "string") return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `${API_BASE_URL}${url}`;
  return url;
}

const video = document.querySelector("#video");

const elements = {
  playerShell: document.querySelector("#playerShell"),
  playerLoading: document.querySelector("#playerLoading"),
  playerError: document.querySelector("#playerError"),
  playerErrorMessage: document.querySelector("#playerErrorMessage"),
  retryButton: document.querySelector("#retryButton"),
  connectionAlert: document.querySelector("#connectionAlert"),
  connectionMessage: document.querySelector("#connectionMessage"),
  reduceQualityButton: document.querySelector("#reduceQualityButton"),
  dismissQualityButton: document.querySelector("#dismissQualityButton"),
  playButton: document.querySelector("#playButton"),
  backButton: document.querySelector("#backButton"),
  muteButton: document.querySelector("#muteButton"),
  volume: document.querySelector("#volume"),
  progress: document.querySelector("#progress"),
  timeLabel: document.querySelector("#timeLabel"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsMenu: document.querySelector("#settingsMenu"),
  closeSettingsButton: document.querySelector("#closeSettingsButton"),
  qualitySelect: document.querySelector("#qualitySelect"),
  speedSelect: document.querySelector("#speedSelect"),
  pipButton: document.querySelector("#pipButton"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  currentQuality: document.querySelector("#currentQuality"),
  relatedVideos: document.querySelector("#relatedVideos"),
  sidebarVideos: document.querySelector("#sidebarVideos")
};

let hls = null;
let qualityManager = null;
let controls = null;
let retryTimer = null;

try {
  initialize();
} catch (error) {
  // Sem isso, um erro de JS deixava a página com o spinner "Carregando vídeo..."
  // para sempre e nenhuma dica do que aconteceu (nem nos cards, nem no console).
  console.error("Falha ao iniciar o player:", error);
  const mensagem = document.querySelector("#playerErrorMessage");
  const painel = document.querySelector("#playerError");
  const loading = document.querySelector("#playerLoading");
  if (mensagem) mensagem.textContent = `Falha ao iniciar o player: ${error.message}`;
  painel?.classList.remove("hidden");
  loading?.classList.add("hidden");
}

function initialize() {
  controls = new PlayerControls(video, elements);
  renderRecommendations(elements.relatedVideos);
  renderSidebar(elements.sidebarVideos);

  // Veio da home (?video=id): busca o metadado e toca exatamente esse vídeo.
  if (VIDEO_DA_URL) {
    buscarVideoDaApi(VIDEO_DA_URL).then((video) => {
      if (video?.hlsUrl) {
        loadVideo(resolveMediaUrl(video.hlsUrl), video);
      } else {
        showError(
          "Este vídeo ainda não está pronto para reprodução " +
          "(não foi transcodificado ou não existe mais)."
        );
      }
    });
  }

  // Enhancement progressivo: os cards de demonstração já estão na tela; aqui
  // tentamos trocá-los pelos dados reais da API. Se o backend estiver fora,
  // `atualizarCatalogoDaApi` devolve listas vazias e nada é redesenhado.
  carregarCatalogo(CONFIG.VIDEO_ID);

  registrarVisualizacao(CONFIG.VIDEO_ID, CONFIG.USER_ID);

  elements.qualitySelect.addEventListener("change", (event) => {
    try {
      qualityManager?.setQuality(event.target.value);
    } catch (error) {
      console.error(error);
    }
  });

  elements.reduceQualityButton.addEventListener("click", () => {
    qualityManager?.reduceQuality();
  });

  elements.dismissQualityButton.addEventListener("click", () => {
    qualityManager?.hideAlert();
  });

  elements.retryButton.addEventListener("click", () => {
    loadVideo();
  });

  window.addEventListener("video-selected", (event) => {
    const selected = event.detail;

    registrarVisualizacao(selected?.id, CONFIG.USER_ID);

    if (selected?.hlsUrl) {
      CONFIG.VIDEO_ID = selected.id;
      loadVideo(resolveMediaUrl(selected.hlsUrl), selected);

      // Os "relacionados" passam a ser os do vídeo recém-escolhido — é a
      // conversa com o backend: GET /videos/{novo_id}/relacionados.
      carregarCatalogo(selected.id, { autoSelecionar: false });
    } else {
      console.info("Vídeo selecionado no mock:", selected);
    }
  });

  loadVideo();
}

/**
 * Busca relacionados + em alta na API e redesenha os cards.
 *
 * Com `autoSelecionar` (padrão na primeira carga), o primeiro vídeo real
 * disponível vira o vídeo em reprodução — é o que faz a página mostrar
 * conteúdo DE VERDADE do backend em vez do master.m3u8 de demonstração
 * (que não existe no repositório). Falha em qualquer etapa mantém os demos.
 */
function carregarCatalogo(videoId, { autoSelecionar = true } = {}) {
  return atualizarCatalogoDaApi({
    relatedContainer: elements.relatedVideos,
    sidebarContainer: elements.sidebarVideos,
    videoId
  })
    .then(({ relacionados, emAlta }) => {
      if (autoSelecionar) {
        selecionarVideoInicialDaApi([...emAlta, ...relacionados]);
      }
      return { relacionados, emAlta };
    })
    .catch((error) => console.info("Catálogo da API indisponível:", error));
}

/**
 * Toca o primeiro vídeo real do catálogo da API, se houver.
 *
 * Não faz nada quando:
 *   • o integrador configurou HLS_URL explicitamente (config.js) — a
 *     configuração manual sempre vence;
 *   • a API não devolveu nenhum vídeo com stream pronto (backend fora, sem
 *     banco, nada transcodificado ainda) — o player segue com a demonstração.
 */
function selecionarVideoInicialDaApi(videos) {
  if (window.PLAYER_CONFIG?.HLS_URL || VIDEO_DA_URL) return;

  const primeiro = (videos || []).find((video) => video?.hlsUrl);
  if (!primeiro) return;

  CONFIG.VIDEO_ID = primeiro.id;
  registrarVisualizacao(primeiro.id, CONFIG.USER_ID);
  loadVideo(resolveMediaUrl(primeiro.hlsUrl), primeiro);
}

function loadVideo(url = CONFIG.HLS_URL, metadata = null) {
  clearRetryTimer();
  destroyHls();
  hideError();
  showLoading();

  if (metadata) {
    updateVideoInfo(metadata);
  }

  if (!url) {
    showError("Nenhuma URL HLS foi configurada.");
    return;
  }

  if (window.Hls && Hls.isSupported()) {
    initializeHls(url);
    return;
  }

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
    video.addEventListener("loadedmetadata", () => {
      hideLoading();
    }, { once: true });
    video.addEventListener("error", () => {
      showError("O navegador não conseguiu carregar o stream HLS.");
    }, { once: true });
    return;
  }

  showError("Este navegador não suporta HLS.");
}

function initializeHls(url) {
  hls = new Hls({
    enableWorker: true,
    lowLatencyMode: false,
    backBufferLength: 30,
    maxBufferLength: 30,
    capLevelToPlayerSize: true
  });

  qualityManager = new QualityManager(hls, video, elements);

  hls.loadSource(url);
  hls.attachMedia(video);

  hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
    hideLoading();

    console.info(
      `HLS carregado: ${data.levels.length} níveis de qualidade.`
    );
  });

  hls.on(Hls.Events.FRAG_BUFFERED, () => {
    hideLoading();
  });

  hls.on(Hls.Events.ERROR, (_, data) => {
    console.error("HLS error:", data);

    if (!data.fatal) return;

    switch (data.type) {
      case Hls.ErrorTypes.NETWORK_ERROR:
        if (url === CONFIG.HLS_URL && !window.PLAYER_CONFIG?.HLS_URL && !VIDEO_DA_URL) {
          // O padrão de dev aponta para ./videos/master.m3u8, que não existe no
          // repositório: em vez de um loop de retries num 404, explicamos como
          // publicar vídeos de verdade (home + script de demo).
          showError(
            "Nenhum vídeo carregado ainda. Abra a home (home.html) e escolha um " +
            "vídeo, ou publique vídeos de teste com: python scripts/demo_completo.py"
          );
          return;
        }
        showError("Falha de rede ao carregar o vídeo. Tentando novamente...");
        retryTimer = setTimeout(() => loadVideo(url), 3000);
        break;

      case Hls.ErrorTypes.MEDIA_ERROR:
        showError("O navegador encontrou um problema com a mídia.");
        hls.recoverMediaError();
        break;

      default:
        showError("Erro fatal no streaming HLS.");
        destroyHls();
        break;
    }
  });
}

function destroyHls() {
  if (hls) {
    hls.destroy();
    hls = null;
  }

  qualityManager = null;
}

function clearRetryTimer() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function showLoading() {
  elements.playerLoading.classList.remove("hidden");
}

function hideLoading() {
  elements.playerLoading.classList.add("hidden");
}

function showError(message) {
  hideLoading();
  elements.playerErrorMessage.textContent = message;
  elements.playerError.classList.remove("hidden");
}

function hideError() {
  elements.playerError.classList.add("hidden");
}

function updateVideoInfo(videoData) {
  if (videoData.title) {
    document.querySelector("#videoTitle").textContent = videoData.title;
  }

  if (videoData.views) {
    document.querySelector("#views").textContent = videoData.views;
  }

  if (videoData.description) {
    document.querySelector("#description").textContent = videoData.description;
  }
}

window.addEventListener("online", () => {
  elements.connectionMessage.textContent =
    "Conexão recuperada. O player pode voltar a aumentar a qualidade automaticamente.";
});

window.addEventListener("offline", () => {
  elements.connectionMessage.textContent =
    "Você está offline. A reprodução poderá ser interrompida.";
  elements.connectionAlert.classList.remove("hidden");
});

// Exposto apenas para facilitar testes/manutenção no navegador.
window.eduStreamPlayer = {
  loadVideo,
  destroy: destroyHls,
  getHls: () => hls,
  getQualityManager: () => qualityManager
};
