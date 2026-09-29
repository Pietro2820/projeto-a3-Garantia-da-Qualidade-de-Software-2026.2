const API_BASE_URL = window.PLAYER_CONFIG?.API_BASE_URL || "http://localhost:8000";

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    throw new Error(`API respondeu com HTTP ${response.status}`);
  }

  return response.json();
}

export async function getVideoStatus(videoId) {
  return requestJson(`/status/${encodeURIComponent(videoId)}`);
}

export async function getRelatedVideos(videoId) {
  return requestJson(`/videos/${encodeURIComponent(videoId)}/relacionados`);
}

export async function getRecommendations(userId) {
  return requestJson(`/recomendacoes/${encodeURIComponent(userId)}`);
}

export async function getTrending() {
  return requestJson("/trending");
}

export async function getCatalogo(termo = "") {
  const query = termo ? `?q=${encodeURIComponent(termo)}` : "";
  return requestJson(`/catalogo${query}`);
}

export async function getVideo(videoId) {
  return requestJson(`/catalogo/${encodeURIComponent(videoId)}`);
}

export async function registerWatch(payload) {
  return requestJson("/watch", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

/**
 * Envia um vídeo novo (multipart/form-data) para o POST /upload.
 *
 * Não passa pelo requestJson de propósito: ele fixaria Content-Type
 * application/json e quebraria o boundary do multipart — aqui o próprio
 * navegador define o cabeçalho certo a partir do FormData.
 */
export async function uploadVideo(formData) {
  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    let detalhe = `API respondeu com HTTP ${response.status}`;
    try {
      const corpo = await response.json();
      if (corpo?.detail) detalhe = corpo.detail;
    } catch (error) {
      // corpo não era JSON: mantém a mensagem genérica
    }
    throw new Error(detalhe);
  }

  return response.json();
}

export { API_BASE_URL };
