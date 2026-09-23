/**
 * Adaptador entre a API (backend FastAPI) e os cards do player.
 *
 * Por que este arquivo existe:
 *   O backend responde no formato do contrato #2 da documentação técnica, em
 *   português (`video_id`, `titulo`, `hls_url`). Os cards do player esperam
 *   `id`, `title`, `hlsUrl`. Este módulo traduz um para o outro e — mais
 *   importante — garante que a página NUNCA fica vazia: se o backend estiver
 *   fora do ar, sem credenciais de banco (503) ou a rota não existir (404),
 *   devolvemos lista vazia e o player mantém os vídeos de demonstração.
 *
 *   É o padrão "enhancement progressivo": renderiza o demo na hora, troca por
 *   dados reais quando a API responde.
 */
import { getRelatedVideos, getTrending, registerWatch } from "./api.js";
import { renderRecommendations, renderSidebar } from "./recommendations.js";

/**
 * Formata um número de visualizações como o texto que aparece no card.
 * 842 -> "842 visualizações" · 1100 -> "1,1 mil visualizações"
 */
export function formatarVisualizacoes(quantidade) {
  const total = Number(quantidade);

  if (!Number.isFinite(total) || total <= 0) return "0 visualizações";

  if (total < 1000) {
    return `${total} visualiza${total === 1 ? "ção" : "ções"}`;
  }

  const milhares = total / 1000;
  const texto =
    milhares < 10
      ? milhares.toFixed(1).replace(".", ",")
      : String(Math.round(milhares));

  return `${texto} mil visualizações`;
}

/**
 * Converte um vídeo vindo da API (ou um demo, que já está no formato do card)
 * no objeto que `createCard()` sabe desenhar.
 */
export function paraCard(video) {
  if (!video || typeof video !== "object") return null;

  const views = video.views ?? video.visualizacoes;

  return {
    id: video.id ?? video.video_id ?? "",
    title: video.title ?? video.titulo ?? "Vídeo sem título",
    views: typeof views === "number" ? formatarVisualizacoes(views) : views ?? "",
    duration: video.duration ?? video.duracao ?? "",
    thumbnail: video.thumbnail ?? video.thumbnail_url ?? "",
    hlsUrl: video.hlsUrl ?? video.hls_url ?? null,
    score: typeof video.score === "number" ? video.score : null,
  };
}

/** Lista de vídeos relacionados; [] se a API falhar por qualquer motivo. */
export async function buscarRelacionados(videoId) {
  try {
    const corpo = await getRelatedVideos(videoId);
    return (corpo?.relacionados ?? []).map(paraCard).filter(Boolean);
  } catch (error) {
    console.info("Relacionados indisponíveis, mantendo demonstração:", error.message);
    return [];
  }
}

/** Vídeos em alta; [] se a API falhar por qualquer motivo. */
export async function buscarEmAlta() {
  try {
    const corpo = await getTrending();
    return (corpo?.trending ?? []).map(paraCard).filter(Boolean);
  } catch (error) {
    console.info("Em alta indisponível, mantendo demonstração:", error.message);
    return [];
  }
}

/**
 * Registra a visualização (alimenta /trending e /recomendacoes no backend).
 * Devolve false em vez de lançar: falhar aqui não pode travar a reprodução.
 */
export async function registrarVisualizacao(videoId, userId) {
  if (!videoId) return false;

  try {
    await registerWatch({ video_id: videoId, user_id: userId ?? null });
    return true;
  } catch (error) {
    console.info("Não foi possível registrar a visualização:", error.message);
    return false;
  }
}

/**
 * Troca os cards de demonstração pelos dados reais da API.
 *
 * Só redesenha quando vem conteúdo — assim, com o backend desligado, a página
 * continua exatamente como estava (com os demos).
 */
export async function atualizarCatalogoDaApi({ relatedContainer, sidebarContainer, videoId }) {
  const [relacionados, emAlta] = await Promise.all([
    buscarRelacionados(videoId),
    buscarEmAlta(),
  ]);

  if (relacionados.length && relatedContainer) {
    renderRecommendations(relatedContainer, relacionados);
  }

  if (emAlta.length && sidebarContainer) {
    renderSidebar(sidebarContainer, emAlta);
  }

  return { relacionados, emAlta };
}
