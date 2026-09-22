import { PlayerControls } from "./controls.js";
import { QualityManager } from "./quality.js";
import {
  renderRecommendations,
  renderSidebar,
  DEMO_VIDEOS
} from "./recommendations.js";

const CONFIG = {
  // Durante o desenvolvimento, troque por um master.m3u8 real.
  // Exemplo local:
  // HLS_URL: "http://localhost:8000/videos/UUID/master.m3u8"
  HLS_URL: window.PLAYER_CONFIG?.HLS_URL || "./videos/master.m3u8",

  // Quando o backend estiver pronto:
  VIDEO_ID: window.PLAYER_CONFIG?.VIDEO_ID || "demo-video",
  USER_ID: window.PLAYER_CONFIG?.USER_ID || "demo-user"
};

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

initialize();

function initialize() {
  controls = new PlayerControls(video, elements);
  renderRecommendations(elements.relatedVideos);
  renderSidebar(elements.sidebarVideos);

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

    if (selected?.hlsUrl) {
      loadVideo(selected.hlsUrl, selected);
    } else {
      console.info("Vídeo selecionado no mock:", selected);
    }
  });

  loadVideo();
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
