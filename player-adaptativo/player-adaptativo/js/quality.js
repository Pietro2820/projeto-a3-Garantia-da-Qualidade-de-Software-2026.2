export class QualityManager {
  constructor(hls, video, elements) {
    this.hls = hls;
    this.video = video;
    this.elements = elements;
    this.manualLevel = -1;
    this.stallCount = 0;
    this.lastStallAt = 0;
    this.alertShown = false;

    this.bindHlsEvents();
  }

  bindHlsEvents() {
    if (!this.hls) return;

    this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
      this.populateQualityOptions();
      this.updateCurrentQuality();
    });

    this.hls.on(Hls.Events.LEVEL_SWITCHED, () => {
      this.updateCurrentQuality();
    });

    this.hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) return;
      if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
        this.recordStall();
      }
    });
  }

  populateQualityOptions() {
    const select = this.elements.qualitySelect;
    select.innerHTML = "";

    const autoOption = document.createElement("option");
    autoOption.value = "-1";
    autoOption.textContent = "Automático";
    select.appendChild(autoOption);

    const seen = new Set();

    this.hls.levels.forEach((level, index) => {
      const height = level.height;
      if (!height || seen.has(height)) return;

      seen.add(height);

      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${height}p`;
      option.dataset.height = String(height);
      select.appendChild(option);
    });

    select.value = String(this.manualLevel);
  }

  setQuality(level) {
    const numericLevel = Number(level);

    if (numericLevel === -1) {
      this.manualLevel = -1;
      this.hls.currentLevel = -1;
      this.elements.currentQuality.textContent = "Qualidade: Auto";
      return;
    }

    if (!Number.isInteger(numericLevel) || numericLevel < 0 || numericLevel >= this.hls.levels.length) {
      throw new Error("Nível de qualidade inválido.");
    }

    this.manualLevel = numericLevel;
    this.hls.currentLevel = numericLevel;
    this.updateCurrentQuality();
  }

  getCurrentLevel() {
    return this.hls?.currentLevel ?? -1;
  }

  getCurrentHeight() {
    const level = this.hls?.levels?.[this.getCurrentLevel()];
    return level?.height || null;
  }

  updateCurrentQuality() {
    if (!this.hls) return;

    if (this.manualLevel === -1) {
      const height = this.getCurrentHeight();
      this.elements.currentQuality.textContent =
        height ? `Qualidade: Auto (${height}p)` : "Qualidade: Auto";
      return;
    }

    const height = this.getCurrentHeight();
    this.elements.currentQuality.textContent =
      height ? `Qualidade: ${height}p` : "Qualidade: Manual";
  }

  recordStall() {
    const now = Date.now();

    if (now - this.lastStallAt > 15000) {
      this.stallCount = 0;
    }

    this.lastStallAt = now;
    this.stallCount += 1;

    if (this.stallCount >= 2 && this.manualLevel === -1 && !this.alertShown) {
      this.alertShown = true;
      this.elements.connectionAlert.classList.remove("hidden");
    }
  }

  reduceQuality() {
    const current = this.getCurrentLevel();

    if (!this.hls?.levels?.length || current < 0) {
      this.hideAlert();
      return;
    }

    const lowerLevel = Math.max(0, current - 1);
    this.hls.currentLevel = lowerLevel;

    this.hideAlert();
    this.updateCurrentQuality();
  }

  hideAlert() {
    this.elements.connectionAlert.classList.add("hidden");
    this.alertShown = false;
  }
}
