/**
 * Cards de vídeo (relacionados, sidebar) — js/recommendations.js.
 *
 * Os vídeos DE VERDADE vêm do banco (via js/catalog.js → GET /catalogo,
 * /trending e /videos/{id}/relacionados). A lista `DEMO_VIDEOS` abaixo existe
 * por um motivo só: deixar a página desenhada quando a API está fora do ar
 * (apresentação sem backend, CI, primeira abertura do projeto). Cards de
 * demonstração NÃO têm stream — eles aparecem marcados como indisponíveis e,
 * ao clicar, o player explica isso em vez de ficar em silêncio.
 */

/** Thumbnail padrão (SVG local) usada quando o vídeo não tem thumbnail. */
const THUMBNAIL_PADRAO = "./assets/default-thumbnail.svg";

const DEMO_VIDEOS = [
  {
    id: "demo-java",
    title: "Introdução à Programação Java",
    views: "842 visualizações",
    duration: "12:32",
    thumbnail: "./assets/thumbnails/java.svg",
    demo: true
  },
  {
    id: "demo-git",
    title: "Git e GitHub para iniciantes",
    views: "1,1 mil visualizações",
    duration: "08:21",
    thumbnail: "./assets/thumbnails/git.svg",
    demo: true
  },
  {
    id: "demo-db",
    title: "Banco de Dados e SQL",
    views: "634 visualizações",
    duration: "21:42",
    thumbnail: "./assets/thumbnails/database.svg",
    demo: true
  },
  {
    id: "demo-python",
    title: "Python: fundamentos",
    views: "2,3 mil visualizações",
    duration: "18:10",
    thumbnail: "./assets/thumbnails/python.svg",
    demo: true
  },
  {
    id: "demo-quality",
    title: "Qualidade de Software",
    views: "503 visualizações",
    duration: "14:05",
    thumbnail: "./assets/thumbnails/quality.svg",
    demo: true
  },
  {
    id: "demo-hls",
    title: "Como funciona streaming HLS",
    views: "391 visualizações",
    duration: "10:48",
    thumbnail: "./assets/thumbnails/hls.svg",
    demo: true
  }
];

/**
 * O card tem stream pronto para tocar?
 * Vídeos da API chegam com `pronta` (media_pronta do backend); os de
 * demonstração nunca têm.
 */
function estaDisponivel(video) {
  return Boolean(video?.hlsUrl) && video?.pronta !== false && !video?.demo;
}

function createCard(video, compact = false) {
  const article = document.createElement("article");
  const disponivel = estaDisponivel(video);

  article.className = `video-card${disponivel ? "" : " indisponivel"}`.trim();
  article.dataset.videoId = video.id;
  article.dataset.disponivel = String(disponivel);
  article.setAttribute("role", "button");
  article.tabIndex = 0;
  article.setAttribute(
    "aria-label",
    disponivel
      ? `Reproduzir ${video.title || "vídeo"}`
      : `${video.title || "Vídeo"} — indisponível (sem stream)`
  );

  const thumbnail = video.thumbnail || THUMBNAIL_PADRAO;
  const badge = disponivel
    ? ""
    : `<span class="thumbnail-badge" title="O master.m3u8 deste vídeo ainda não existe no servidor">Indisponível</span>`;

  article.innerHTML = `
    <div class="thumbnail">
      <img src="${escapeHtml(thumbnail)}" alt="" loading="lazy"
           onerror="this.onerror=null;this.src='${THUMBNAIL_PADRAO}';">
      <span class="thumbnail-duration">${escapeHtml(video.duration || "")}</span>
      ${badge}
    </div>
    <div class="card-content">
      <h3 class="card-title">${escapeHtml(video.title || "Vídeo sem título")}</h3>
      <div class="card-meta">${escapeHtml(video.views || "")}</div>
    </div>
  `;

  const selecionar = () => {
    const event = new CustomEvent("video-selected", {
      detail: { ...video, pronta: disponivel }
    });
    window.dispatchEvent(event);
  };

  article.addEventListener("click", selecionar);
  article.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selecionar();
    }
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

/** Estado vazio dos containers (catálogo sem vídeos prontos). */
export function renderSemVideos(container, mensagem) {
  if (!container) return;

  const aviso = document.createElement("p");
  aviso.className = "cards-empty";
  aviso.textContent = mensagem;
  container.replaceChildren(aviso);
}

export { DEMO_VIDEOS, THUMBNAIL_PADRAO, createCard, escapeHtml, estaDisponivel };

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
