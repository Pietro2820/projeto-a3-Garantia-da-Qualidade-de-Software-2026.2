/**
 * Home estilo YouTube (js/home.js).
 *
 * Grade com os vídeos prontos do BANCO (GET /catalogo?prontos=1 — só os que já
 * têm master.m3u8 no disco, ou seja, os que tocam de verdade), busca no topo
 * filtrando por título/tag (GET /catalogo?q=...) e navegação para a página de
 * watch com o vídeo escolhido: index.html?video={id}.
 *
 * Resiliência: a página nunca fica quebrada. Diferenciamos três estados
 * vazios — API fora do ar, catálogo sem vídeos publicados e busca sem
 * resultado — cada um com a instrução do que fazer.
 *
 * A busca também chega pela URL (home.html?q=frações), que é para onde a
 * watch page manda o formulário de pesquisa do topo.
 */
import { consultarCatalogo } from "./catalog.js";
import { escapeHtml } from "./recommendations.js";
import { iniciarUiUpload } from "./upload.js";
import { API_BASE_URL } from "./api.js";
import { definirParametro, parametro } from "./busca.js";
import { iniciarPerfil } from "./perfil.js";

/** Thumbnail padrão quando o vídeo não tem (ou a dele dá 404 no servidor). */
const THUMBNAIL_PADRAO = "./assets/default-thumbnail.svg";

const elements = {
  grid: document.querySelector("#homeGrid"),
  empty: document.querySelector("#homeEmpty"),
  emptyTitle: document.querySelector("#homeEmptyTitle"),
  emptyDetails: document.querySelector("#homeEmptyDetails"),
  emptyHint: document.querySelector("#homeEmptyHint"),
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

  const thumbnail = video.thumbnail || THUMBNAIL_PADRAO;

  link.innerHTML = `
    <div class="thumbnail">
      <img src="${escapeHtml(thumbnail)}" alt="" loading="lazy"
           onerror="this.onerror=null;this.src='${THUMBNAIL_PADRAO}';">
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

/** Estado vazio: título + (opcionalmente) o passo a passo e a dica final. */
function mostrarVazio({ titulo, detalhes = true, dica = "" }) {
  elements.emptyTitle.textContent = titulo;
  elements.empty.classList.toggle("hide-details", !detalhes);
  elements.emptyHint.textContent = dica;
  elements.empty.classList.remove("hidden");
  elements.count.textContent = "";
  elements.grid.replaceChildren();
}

async function carregar(termo = "") {
  const { itens: videos, ok: apiRespondeu } = await consultarCatalogo(termo);

  elements.title.textContent = termo ? `Resultados para "${termo}"` : "Catálogo";

  if (videos.length) {
    elements.empty.classList.add("hidden");
    elements.count.textContent =
      `${videos.length} vídeo${videos.length === 1 ? "" : "s"}`;
    renderHome(elements.grid, videos);
    return videos;
  }

  if (!apiRespondeu) {
    mostrarVazio({
      titulo: "A API não respondeu — o catálogo vem do banco de dados.",
      detalhes: true,
      dica: `O player tentou consultar ${API_BASE_URL}. Suba o backend com ` +
        "`uvicorn app.main:app --reload` (ou `python scripts/subir_tudo.py`) e recarregue.",
    });
    return videos;
  }

  if (termo) {
    mostrarVazio({
      titulo: `Nada encontrado para "${termo}".`,
      detalhes: false,
      dica: "A busca considera título e tags dos vídeos já transcodificados.",
    });
    return videos;
  }

  mostrarVazio({
    titulo: "Nenhum vídeo pronto para assistir ainda.",
    detalhes: true,
    dica: "Só entram na grade os vídeos com status concluído E master.m3u8 gerado " +
      "pela transcodificação (worker Celery + FFmpeg no ar).",
  });
  return videos;
}

elements.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  buscarPeloFormulario();
});

elements.searchInput.addEventListener("input", () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    const termo = elements.searchInput.value.trim();
    atualizarUrlDaBusca(termo);
    carregar(termo);
  }, 350);
});

/** Mantém ?q= na barra de endereço: a busca vira link compartilhável. */
function atualizarUrlDaBusca(termo) {
  definirParametro("q", termo);
}

// Menu de perfil (👤): identidade usada no POST /watch e recomendações.
iniciarPerfil();

// Upload pela interface: quando a transcodificação completa, recarrega a
// grade para o card do vídeo novo aparecer (mantendo o termo da busca).
iniciarUiUpload({
  onSucesso: () => carregar(elements.searchInput.value.trim()),
});

function buscarPeloFormulario() {
  const termo = elements.searchInput.value.trim();
  atualizarUrlDaBusca(termo);
  return carregar(termo);
}

// A watch page manda a pesquisa para cá: home.html?q=termo.
const termoInicial = parametro("q");
if (termoInicial) {
  elements.searchInput.value = termoInicial;
}

carregar(termoInicial);

export { buscarPeloFormulario, carregar };
