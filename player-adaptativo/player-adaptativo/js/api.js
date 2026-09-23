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

export async function registerWatch(payload) {
  return requestJson("/watch", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export { API_BASE_URL };
