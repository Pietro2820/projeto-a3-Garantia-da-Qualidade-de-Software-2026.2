/**
 * Home estilo YouTube (js/home.js).
 *
 * Grade com todos os vídeos prontos do catálogo (GET /catalogo), busca no
 * topo filtrando por título/tag (GET /catalogo?q=...) e navegação para a
 * página de watch com o vídeo escolhido: index.html?video={id}.
 *
 * Resiliência (mesmo padrão do resto do player): se a API estiver fora ou o
 * catálogo vazio, mostramos um estado vazio explicando como publicar vídeos
 * (scripts/demo_completo.py) — nunca uma tela quebrada.
 */
import { buscarCatalogo } from "./catalog.js";
import { escapeHtml } from "./recommendations.js";
import { iniciarUiUpload } from "./upload.js";

const elements = {
  grid: document.querySelector("#homeGrid"),
  empty: document.querySelector("#homeEmpty"),
  title: document.querySelector("#homeTitle"),
  count: document.querySelector("#homeCount"),
  searchForm: document.querySelector("#searchForm"),
  searchInput: document.querySelector("#searchInput"),
};

let debounce = null;

function criarCardHome(video) {
  const link = document.createElement("a");
  link.className = "video-card home-card";
  link.href = `index.html?video=${encodeURIComponent(video.id)}`;
  link.setAttribute("aria-label", video.title);

  link.innerHTML = `
    <div class="thumbnail">
      <img src="${escapeHtml(video.thumbnail || "")}" alt="" loading="lazy">
      <span class="thumbnail-duration">${escapeHtml(video.duration || "")}</span>
    </div>
    <div class="card-content">
      <h3 class="card-title">${escapeHtml(video.title || "Vídeo sem título")}</h3>
      <div class="card-meta">${escapeHtml(video.views || "")}</div>
    </div>
  `;

  return link;
}

export function renderHome(container, videos) {
  container.replaceChildren(...videos.map(criarCardHome));
}

function mostrarVazio(termo) {
  const semBusca = !termo;
  elements.empty.querySelector("strong").textContent = semBusca
    ? "Nenhum vídeo pronto para assistir ainda."
    : `Nada encontrado para "${termo}".`;
  // Em busca sem resultado não faz sentido mostrar o passo a passo de upload.
  elements.empty.classList.toggle("hide-details", !semBusca);
  elements.empty.classList.remove("hidden");
  elements.count.textContent = "";
}

async function carregar(termo = "") {
  const videos = await buscarCatalogo(termo);

  elements.title.textContent = termo ? `Resultados para "${termo}"` : "Catálogo";

  if (!videos.length) {
    elements.grid.replaceChildren();
    mostrarVazio(termo);
    return videos;
  }

  elements.empty.classList.add("hidden");
  elements.count.textContent =
    `${videos.length} vídeo${videos.length === 1 ? "" : "s"}`;
  renderHome(elements.grid, videos);
  return videos;
}

elements.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  carregar(elements.searchInput.value.trim());
});

elements.searchInput.addEventListener("input", () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => carregar(elements.searchInput.value.trim()), 350);
});

// Upload pela interface: quando a transcodificação completa, recarrega a
// grade para o card do vídeo novo aparecer (mantendo o termo da busca).
iniciarUiUpload({
  onSucesso: () => carregar(elements.searchInput.value.trim()),
});

carregar();
