const DEMO_VIDEOS = [
  {
    id: "demo-java",
    title: "Introdução à Programação Java",
    views: "842 visualizações",
    duration: "12:32",
    thumbnail: "./assets/thumbnails/java.svg"
  },
  {
    id: "demo-git",
    title: "Git e GitHub para iniciantes",
    views: "1,1 mil visualizações",
    duration: "08:21",
    thumbnail: "./assets/thumbnails/git.svg"
  },
  {
    id: "demo-db",
    title: "Banco de Dados e SQL",
    views: "634 visualizações",
    duration: "21:42",
    thumbnail: "./assets/thumbnails/database.svg"
  },
  {
    id: "demo-python",
    title: "Python: fundamentos",
    views: "2,3 mil visualizações",
    duration: "18:10",
    thumbnail: "./assets/thumbnails/python.svg"
  },
  {
    id: "demo-quality",
    title: "Qualidade de Software",
    views: "503 visualizações",
    duration: "14:05",
    thumbnail: "./assets/thumbnails/quality.svg"
  },
  {
    id: "demo-hls",
    title: "Como funciona streaming HLS",
    views: "391 visualizações",
    duration: "10:48",
    thumbnail: "./assets/thumbnails/hls.svg"
  }
];

function createCard(video, compact = false) {
  const article = document.createElement("article");
  article.className = "video-card";
  article.dataset.videoId = video.id;

  article.innerHTML = `
    <div class="thumbnail">
      <img src="${escapeHtml(video.thumbnail || "")}" alt="" loading="lazy">
      <span class="thumbnail-duration">${escapeHtml(video.duration || "")}</span>
    </div>
    <div class="card-content">
      <h3 class="card-title">${escapeHtml(video.title || "Vídeo sem título")}</h3>
      <div class="card-meta">${escapeHtml(video.views || "")}</div>
    </div>
  `;

  article.addEventListener("click", () => {
    const event = new CustomEvent("video-selected", {
      detail: video
    });
    window.dispatchEvent(event);
  });

  return article;
}

export function renderRecommendations(container, videos = DEMO_VIDEOS) {
  container.replaceChildren();

  videos.forEach((video) => {
    container.appendChild(createCard(video));
  });
}

export function renderSidebar(container, videos = DEMO_VIDEOS.slice(0, 5)) {
  container.replaceChildren();

  videos.forEach((video) => {
    container.appendChild(createCard(video, true));
  });
}

export { DEMO_VIDEOS };

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
