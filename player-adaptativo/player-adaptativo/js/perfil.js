/**
 * Menu de perfil (o 👤 do topo) — js/perfil.js.
 *
 * Antes o botão era decorativo. Agora ele abre um painel que:
 *   1. identifica quem assiste (nome salvo em localStorage → `usuarioAtual()`),
 *      que é o `user_id` enviado no POST /watch;
 *   2. mostra as recomendações personalizadas do backend
 *      (GET /recomendacoes/{user_id} — Jaccard sobre as tags do histórico);
 *   3. permite sair (volta a ser "Convidado", com id anônimo estável).
 *
 * O painel é criado em JS e funciona nas duas páginas (home e watch), sem
 * marcar HTML duplicado. Se a API estiver fora do ar, o painel continua útil
 * (identificação) e apenas avisa que não deu para carregar as sugestões.
 */
import { getRecommendations } from "./api.js";
import { paraCard, temStream } from "./catalog.js";
import { escapeHtml } from "./recommendations.js";
import { definirUsuario, nomeDoUsuario, rotuloDoUsuario, usuarioAtual } from "./usuario.js";

const THUMBNAIL_PADRAO = "./assets/default-thumbnail.svg";

/**
 * Liga o menu de perfil. `aoTrocarUsuario` é chamado depois de salvar/sair —
 * a watch page usa para registrar as próximas visualizações com o id novo.
 */
export function iniciarPerfil({ aoTrocarUsuario } = {}) {
  const botao = document.querySelector("#profileButton");
  if (!botao) return null;

  const painel = criarPainel();
  document.body.appendChild(painel);

  const abrir = () => {
    atualizarCabecalho(painel);
    painel.classList.remove("hidden");
    carregarRecomendacoes(painel);
  };
  const fechar = () => painel.classList.add("hidden");

  botao.addEventListener("click", (event) => {
    event.stopPropagation();
    if (painel.classList.contains("hidden")) {
      abrir();
    } else {
      fechar();
    }
  });

  document.addEventListener("click", (event) => {
    if (!painel.contains(event.target) && event.target !== botao) fechar();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") fechar();
  });

  painel.querySelector("#profileClose").addEventListener("click", fechar);

  painel.querySelector("#profileForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const campo = painel.querySelector("#profileName");
    definirUsuario(campo.value);
    atualizarCabecalho(painel);
    carregarRecomendacoes(painel);
    aoTrocarUsuario?.(usuarioAtual());
  });

  painel.querySelector("#profileLogout").addEventListener("click", () => {
    definirUsuario("");
    atualizarCabecalho(painel);
    carregarRecomendacoes(painel);
    aoTrocarUsuario?.(usuarioAtual());
  });

  return { abrir, fechar, painel };
}

function criarPainel() {
  const painel = document.createElement("div");
  painel.className = "profile-menu hidden";
  painel.id = "profileMenu";
  painel.setAttribute("role", "dialog");
  painel.setAttribute("aria-label", "Perfil e recomendações");

  painel.innerHTML = `
    <div class="profile-header">
      <strong id="profileTitle">Convidado</strong>
      <button class="icon-button" id="profileClose" type="button" aria-label="Fechar">×</button>
    </div>

    <form id="profileForm" class="profile-form">
      <label for="profileName">Seu nome (fica só neste navegador)</label>
      <div class="profile-row">
        <input id="profileName" type="text" maxlength="40" placeholder="Como quer ser chamado?"
               autocomplete="off">
        <button class="btn-primary" type="submit">Salvar</button>
      </div>
      <p class="profile-hint" id="profileId"></p>
    </form>

    <div class="profile-section">
      <strong>Recomendados para você</strong>
      <div id="profileRecommendations" class="profile-list">
        <p class="profile-hint">Carregando…</p>
      </div>
    </div>

    <button class="profile-logout" id="profileLogout" type="button">Sair (voltar a Convidado)</button>
  `;

  return painel;
}

function atualizarCabecalho(painel) {
  painel.querySelector("#profileTitle").textContent = rotuloDoUsuario();
  painel.querySelector("#profileName").value = nomeDoUsuario();
  painel.querySelector("#profileId").textContent = `Identificador enviado à API: ${usuarioAtual()}`;
  painel.querySelector("#profileLogout").disabled = !nomeDoUsuario();
}

async function carregarRecomendacoes(painel) {
  const lista = painel.querySelector("#profileRecommendations");
  lista.replaceChildren(mensagem("Carregando…"));

  let recomendacoes = [];
  try {
    const corpo = await getRecommendations(usuarioAtual());
    recomendacoes = (corpo?.recomendacoes ?? []).map(paraCard).filter(Boolean);
    if (!recomendacoes.length && corpo?.motivo) {
      lista.replaceChildren(mensagem(capitalizar(corpo.motivo)));
      return;
    }
  } catch (error) {
    lista.replaceChildren(
      mensagem("Não foi possível carregar as recomendações (a API respondeu com erro).")
    );
    return;
  }

  if (!recomendacoes.length) {
    lista.replaceChildren(
      mensagem("Assista a algum vídeo para receber sugestões por tags em comum.")
    );
    return;
  }

  lista.replaceChildren(...recomendacoes.slice(0, 6).map((video) => criarItem(video, painel)));
}

function criarItem(video) {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "profile-item";
  botao.disabled = !temStream(video);

  const thumbnail = video.thumbnail || THUMBNAIL_PADRAO;
  botao.innerHTML = `
    <img src="${escapeHtml(thumbnail)}" alt="" loading="lazy"
         onerror="this.onerror=null;this.src='${THUMBNAIL_PADRAO}';">
    <span class="profile-item-title">${escapeHtml(video.title || "Vídeo sem título")}</span>
    ${temStream(video) ? "" : '<span class="profile-item-badge">sem mídia</span>'}
  `;

  botao.addEventListener("click", () => {
    // Na watch page troca sem recarregar; na home navega para o player.
    window.dispatchEvent(new CustomEvent("video-selected", { detail: video }));

    const naWatchPage = Boolean(document.querySelector("#video"));
    if (naWatchPage) {
      document.querySelector("#profileMenu")?.classList.add("hidden");
    } else {
      window.location.href = `index.html?video=${encodeURIComponent(video.id)}`;
    }
  });

  return botao;
}

function mensagem(texto) {
  const paragrafo = document.createElement("p");
  paragrafo.className = "profile-hint";
  paragrafo.textContent = texto;
  return paragrafo;
}

function capitalizar(texto) {
  const valor = String(texto || "");
  return valor.charAt(0).toUpperCase() + valor.slice(1);
}
