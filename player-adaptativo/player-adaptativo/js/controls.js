export class PlayerControls {
  constructor(video, elements) {
    this.video = video;
    this.elements = elements;
    this.bindEvents();
  }

  bindEvents() {
    this.elements.playButton.addEventListener("click", () => this.togglePlay());
    this.elements.backButton.addEventListener("click", () => this.seekRelative(-10));

    this.elements.volume.addEventListener("input", () => {
      this.video.volume = Number(this.elements.volume.value);
      this.video.muted = this.video.volume === 0;
      this.updateMuteIcon();
    });

    this.elements.muteButton.addEventListener("click", () => {
      this.video.muted = !this.video.muted;
      this.updateMuteIcon();
    });

    this.elements.progress.addEventListener("input", () => {
      if (!Number.isFinite(this.video.duration)) return;
      this.video.currentTime =
        (Number(this.elements.progress.value) / 100) * this.video.duration;
    });

    this.video.addEventListener("play", () => this.updatePlayIcon());
    this.video.addEventListener("pause", () => this.updatePlayIcon());
    this.video.addEventListener("timeupdate", () => this.updateProgress());
    this.video.addEventListener("loadedmetadata", () => this.updateProgress());
    this.video.addEventListener("volumechange", () => this.updateMuteIcon());

    this.elements.fullscreenButton.addEventListener("click", () => this.toggleFullscreen());
    this.elements.pipButton.addEventListener("click", () => this.togglePiP());

    this.elements.settingsButton.addEventListener("click", () => {
      this.elements.settingsMenu.classList.toggle("hidden");
    });

    this.elements.closeSettingsButton.addEventListener("click", () => {
      this.elements.settingsMenu.classList.add("hidden");
    });

    this.elements.speedSelect.addEventListener("change", () => {
      this.video.playbackRate = Number(this.elements.speedSelect.value);
    });

    document.addEventListener("keydown", (event) => {
      if (event.target.matches("input, select")) return;

      if (event.code === "Space") {
        event.preventDefault();
        this.togglePlay();
      }

      if (event.code === "ArrowLeft") this.seekRelative(-5);
      if (event.code === "ArrowRight") this.seekRelative(5);
      if (event.key.toLowerCase() === "f") this.toggleFullscreen();
      if (event.key.toLowerCase() === "m") {
        this.video.muted = !this.video.muted;
      }
    });
  }

  async togglePlay() {
    if (this.video.paused) {
      try {
        await this.video.play();
      } catch (error) {
        console.error("Não foi possível iniciar a reprodução:", error);
      }
    } else {
      this.video.pause();
    }
  }

  seekRelative(seconds) {
    if (!Number.isFinite(this.video.duration)) return;

    this.video.currentTime = Math.min(
      Math.max(this.video.currentTime + seconds, 0),
      this.video.duration
    );
  }

  updatePlayIcon() {
    this.elements.playButton.textContent = this.video.paused ? "▶" : "❚❚";
    this.elements.playButton.setAttribute(
      "aria-label",
      this.video.paused ? "Reproduzir" : "Pausar"
    );
  }

  updateMuteIcon() {
    this.elements.muteButton.textContent =
      this.video.muted || this.video.volume === 0 ? "🔇" : "🔊";
  }

  updateProgress() {
    if (!Number.isFinite(this.video.duration)) return;

    const percent = (this.video.currentTime / this.video.duration) * 100;
    this.elements.progress.value = String(percent);

    this.elements.timeLabel.textContent =
      `${formatTime(this.video.currentTime)} / ${formatTime(this.video.duration)}`;
  }

  async toggleFullscreen() {
    const container = this.video.closest(".player-shell");

    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error("Fullscreen indisponível:", error);
    }
  }

  async togglePiP() {
    if (!document.pictureInPictureEnabled || this.video.disablePictureInPicture) {
      return;
    }

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await this.video.requestPictureInPicture();
      }
    } catch (error) {
      console.error("Picture-in-Picture indisponível:", error);
    }
  }
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const remaining = String(total % 60).padStart(2, "0");

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = String(minutes % 60).padStart(2, "0");
    return `${hours}:${mins}:${remaining}`;
  }

  return `${minutes}:${remaining}`;
}
