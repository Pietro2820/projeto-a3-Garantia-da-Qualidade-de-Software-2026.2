/**
 * Upload pela interface (modal da home) — js/upload.js.
 *
 * Antes, publicar um vídeo exigia Swagger ou o scripts/demo_completo.py —
 * ruim para a apresentação. Agora a home tem o botão "Enviar vídeo":
 *
 *   1. o formulário monta um FormData e chama POST /upload (multipart);
 *   2. com o video_id da resposta, acompanha GET /status/{id} em polling
 *      (pending → processing → completed), mostrando o progresso no modal;
 *   3. quando completa, avisa `onSucesso` (a home recarrega o catálogo e o
 *     card do vídeo novo aparece na grade).
 *
 * Erros (extensão inválida, título vazio, banco fora) chegam como mensagem
 * legível dentro do modal — o detail JSON da API, não um stacktrace.
 */
import { getVideoStatus, uploadVideo } from "./api.js";

const INTERVALO_PADRAO_MS = 2000;
const TIMEOUT_PADRAO_MS = 10 * 60 * 1000;

/**
 * Polling de /status/{video_id} até completed/failed.
 * 404 é esperado nos primeiros segundos (o worker ainda não marcou o
 * status) — por isso ele é ignorado em vez de derrubar o polling.
 */
export async function aguardarProcessamento(
  videoId,
  { onStatus, intervaloMs = INTERVALO_PADRAO_MS, timeoutMs = TIMEOUT_PADRAO_MS } = {}
) {
  const inicio = Date.now();
  let ultimo = null;

  while (Date.now() - inicio < timeoutMs) {
    let status = null;
    try {
      status = await getVideoStatus(videoId);
    } catch (error) {
      if (!error.message.includes("HTTP 404")) throw error;
    }

    if (status && status.status !== ultimo) {
      ultimo = status.status;
      onStatus?.(status);
    }
    if (status?.status === "completed") return status;
    if (status?.status === "failed") {
      throw new Error(status.erro || "A transcodificação falhou no servidor");
    }

    await new Promise((resolver) => setTimeout(resolver, intervaloMs));
  }

  throw new Error(
    `Tempo esgotado (${Math.round(timeoutMs / 1000)}s) aguardando a transcodificação`
  );
}

/** Envia o FormData e acompanha o processamento até o fim. */
export async function enviarEAcompanhar(formData, callbacks = {}, opcoes = {}) {
  callbacks.onEnviando?.();
  const corpo = await uploadVideo(formData);
  callbacks.onProcessando?.(corpo);
  const status = await aguardarProcessamento(corpo.video_id, {
    onStatus: callbacks.onStatus,
    ...opcoes,
  });
  return { corpo, status };
}

/**
 * Liga o modal de upload da home (se existir na página).
 * Devolve { abrir, fechar } ou null quando a página não tem o modal
 * (a watch page index.html não tem — e está tudo bem).
 */
export function iniciarUiUpload({ onSucesso, intervaloMs, timeoutMs, delayFecharMs = 1200 } = {}) {
  const modal = document.querySelector("#uploadModal");
  const form = document.querySelector("#uploadForm");
  if (!modal || !form) return null;

  const botaoAbrir = document.querySelector("#uploadOpenButton");
  const botaoFechar = document.querySelector("#uploadClose");
  const statusEl = document.querySelector("#uploadStatus");
  const botaoSubmit = document.querySelector("#uploadSubmit");

  const abrir = () => modal.classList.remove("hidden");
  const fechar = () => modal.classList.add("hidden");

  botaoAbrir?.addEventListener("click", abrir);
  botaoFechar?.addEventListener("click", fechar);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) fechar();
  });

  function setStatus(texto, classe = "") {
    statusEl.textContent = texto;
    statusEl.className = `upload-status ${classe}`.trim();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const arquivo = document.querySelector("#uploadFile").files?.[0];
    if (!arquivo) {
      setStatus("Escolha um arquivo de vídeo (.mp4, .avi, .mov ou .webm).", "erro");
      return;
    }

    const dados = new FormData();
    dados.append("file", arquivo);
    dados.append("titulo", document.querySelector("#uploadTitulo").value.trim());
    dados.append("autor", document.querySelector("#uploadAutor").value.trim());
    dados.append("descricao", document.querySelector("#uploadDescricao").value.trim());
    dados.append("tags", document.querySelector("#uploadTags").value.trim());
    dados.append("categoria", document.querySelector("#uploadCategoria").value.trim());

    botaoSubmit.disabled = true;
    try {
      await enviarEAcompanhar(
        dados,
        {
          onEnviando: () => setStatus("Enviando arquivo para a API..."),
          onProcessando: () =>
            setStatus(
              "Upload concluído! Transcodificando em HLS — de segundos a alguns minutos..."
            ),
          onStatus: (status) => setStatus(`Processando... status: ${status.status}`),
        },
        { intervaloMs, timeoutMs }
      );

      setStatus("Vídeo pronto e publicado no catálogo!", "ok");
      form.reset();
      onSucesso?.();
      setTimeout(fechar, delayFecharMs);
    } catch (error) {
      setStatus(error.message, "erro");
    } finally {
      botaoSubmit.disabled = false;
    }
  });

  return { abrir, fechar };
}
