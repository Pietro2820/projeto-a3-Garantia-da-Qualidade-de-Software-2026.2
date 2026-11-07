/**
 * Lógica compartilhada do upload pela interface — js/upload.js.
 *
 * A home tem o botão "Enviar vídeo", que abre a página dedicada
 * upload.html em NOVA ABA (controlada por js/upload-page.js). Lá:
 *
 *   1. o formulário monta um FormData e chama POST /upload (multipart) via
 *      XHR — os eventos de progresso alimentam a fase ENVIO da barra;
 *   2. com o video_id da resposta, acompanha GET /status/{id} em polling
 *      (pending → processing → completed) — fase TRANSCODIFICAÇÃO;
 *   3. completed → fase PUBLICADO (100% verde) + painel "Assistir agora".
 *
 * Este módulo guarda as peças reutilizadas pela página: o polling
 * (aguardarProcessamento), o envio com acompanhamento (enviarEAcompanhar),
 * a formatação de bytes e a fábrica da barra de 3 fases (criarBarraFases).
 *
 * Erros (extensão inválida, título vazio, banco fora) chegam como mensagem
 * legível na página — o detail JSON da API, não um stacktrace.
 */
import { getVideoStatus, uploadVideo } from "./api.js";

const INTERVALO_PADRAO_MS = 2000;
const TIMEOUT_PADRAO_MS = 10 * 60 * 1000;
// "pending" por muito tempo significa que NENHUM worker pegou a tarefa
// (Redis/Celery desligados, worker sem acesso ao arquivo, etc.). Não faz
// sentido prender o usuário no modal pelos 10 min do timeout de
// transcodificação: depois deste prazo, avisamos o que verificar.
const TIMEOUT_FILA_PADRAO_MS = 90 * 1000;

/**
 * Polling de /status/{video_id} até completed/failed.
 * 404 é esperado nos primeiros segundos (o worker ainda não marcou o
 * status) — por isso ele é ignorado em vez de derrubar o polling.
 */
export async function aguardarProcessamento(
  videoId,
  {
    onStatus,
    intervaloMs = INTERVALO_PADRAO_MS,
    timeoutMs = TIMEOUT_PADRAO_MS,
    timeoutFilaMs = TIMEOUT_FILA_PADRAO_MS,
  } = {}
) {
  const inicio = Date.now();
  let ultimo = null;
  let inicioPendente = null;

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

    // Watchdog da fila: enquanto o status não sai de "pending" (ou o vídeo
    // nem aparece no /status), ninguém está processando. Esperar os 10 min
    // inteiros só deixa o modal "travado" sem explicação.
    if (!status || status.status === "pending") {
      if (inicioPendente === null) inicioPendente = Date.now();
      if (Date.now() - inicioPendente >= timeoutFilaMs) {
        throw new Error(
          `Nenhum worker processou o vídeo em ${Math.round(timeoutFilaMs / 1000)}s ` +
            '(status parado em "pending"). Verifique se o Redis e o worker Celery ' +
            "estão rodando: `docker compose up -d` (ou `python scripts/subir_tudo.py`)."
        );
      }
    } else {
      inicioPendente = null;
    }

    await new Promise((resolver) => setTimeout(resolver, intervaloMs));
  }

  throw new Error(
    `Tempo esgotado (${Math.round(timeoutMs / 1000)}s) aguardando a transcodificação`
  );
}

/** Formata bytes para texto curto do modal ("4.2 MB de 120.0 MB"). */
export function formatarBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "?";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

/** Envia o FormData e acompanha o processamento até o fim. */
export async function enviarEAcompanhar(formData, callbacks = {}, opcoes = {}) {
  callbacks.onEnviando?.();
  const corpo = await uploadVideo(formData, callbacks.onProgress);
  // A API responde fila="indisponivel" quando não conseguiu publicar a task
  // (Redis/broker fora do ar). O arquivo até foi salvo, mas NADA vai
  // transcodificá-lo — seguir para o polling deixaria o modal 10 min travado.
  if (corpo?.fila === "indisponivel") {
    throw new Error(
      "Arquivo recebido pela API, mas a fila de processamento está fora do ar " +
        "(Redis/Celery). Suba os serviços com `docker compose up -d` (ou " +
        "`python scripts/subir_tudo.py`) e envie o vídeo novamente."
    );
  }
  callbacks.onProcessando?.(corpo);
  const status = await aguardarProcessamento(corpo.video_id, {
    onStatus: callbacks.onStatus,
    ...opcoes,
  });
  return { corpo, status };
}

/**
 * Fábrica da barra de progresso de 3 fases (usada pela página de upload).
 *
 *   1. ENVIO      — preenchida pelo % real do XHR, com gradiente fluindo e
 *                   brilho percorrendo o preenchimento;
 *   2. TRANSCODE  — modo "indeterminada": segmento deslizante no trilho
 *                   (o FFmpeg não informa %);
 *   3. PUBLICADO  — estado "concluida": 100%, verde, sem animação.
 *
 * Recebe os elementos do DOM da barra e um `setStatus(texto, classe)` para
 * o texto de apoio, e devolve as funções de cada fase. A largura usa o
 * valor EXATO da fração vinda do XHR (2 casas decimais) — não o % inteiro
 * do rótulo — para a barra acompanhar a evolução real byte a byte do
 * upload; o rótulo mostra 1 casa decimal abaixo de 100%.
 */
export function criarBarraFases({ barra, fill, rotulo, valor, setStatus } = {}) {
  function textoPorcentagem(fracao) {
    const pct = Math.round(fracao * 1000) / 10; // 1 casa decimal
    return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
  }

  /** Fase 1 — ENVIO: barra preenchida pelo % real do XHR, com animação. */
  function atualizarBarra({ fracao = 0, enviado = 0, total = 0 } = {}) {
    const fracaoLimitada = Math.max(0, Math.min(1, fracao));
    if (barra) {
      barra.classList.remove("hidden", "indeterminada", "concluida");
      barra.setAttribute("aria-valuenow", String(Math.round(fracaoLimitada * 100)));
    }
    if (fill) fill.style.width = `${Math.round(fracaoLimitada * 10000) / 100}%`;
    if (valor) valor.textContent = textoPorcentagem(fracaoLimitada);
    setStatus?.(
      total > 0
        ? `Enviando arquivo... ${textoPorcentagem(fracaoLimitada)} (${formatarBytes(enviado)} de ${formatarBytes(total)})`
        : `Enviando arquivo... ${textoPorcentagem(fracaoLimitada)} (${formatarBytes(enviado)} enviados)`
    );
  }

  /** Fase 2 — TRANSCODIFICAÇÃO: o FFmpeg não informa %, então a barra entra
   *  no modo indeterminado (segmento deslizante) até o status mudar. */
  function modoIndeterminado(textoRotulo) {
    if (!barra) return;
    barra.classList.remove("hidden", "concluida");
    barra.classList.add("indeterminada");
    barra.removeAttribute("aria-valuenow");
    if (valor) valor.textContent = "—";
    if (rotulo) rotulo.textContent = textoRotulo;
  }

  /** Fase 3 — PUBLICADO: 100% verde. */
  function marcarConcluida(textoRotulo = "Publicado no catálogo!") {
    if (!barra) return;
    barra.classList.remove("indeterminada");
    barra.classList.add("concluida");
    barra.setAttribute("aria-valuenow", "100");
    if (fill) fill.style.width = "100%";
    if (valor) valor.textContent = "100%";
    if (rotulo) rotulo.textContent = textoRotulo;
  }

  /** Volta ao estado inicial (erro no envio ou reset do formulário). */
  function esconderBarra() {
    barra?.classList.add("hidden");
    barra?.classList.remove("indeterminada", "concluida");
    barra?.setAttribute("aria-valuenow", "0");
    if (fill) fill.style.width = "0%";
    if (valor) valor.textContent = "0%";
    if (rotulo) rotulo.textContent = "Enviando arquivo...";
  }

  return { atualizarBarra, modoIndeterminado, marcarConcluida, esconderBarra };
}
