/**
 * Página dedicada de upload (upload.html) — aberta em NOVA ABA pelo botão
 * "Enviar vídeo" da home.
 *
 * Por que uma página inteira e não o modal antigo da home:
 *   - espaço de sobra para a barra GRANDE acompanhando o envio byte a byte
 *     (o % e os MB vêm dos eventos de progresso reais do XHR);
 *   - prévia local do arquivo escolhido antes de publicar;
 *   - o usuário acompanha a transcodificação sem perder o catálogo: quando
 *     a aba da home volta ao foco, a grade recarrega sozinha (home.js).
 *
 * Fluxo (mesma API que o modal usava):
 *   1. formulário monta FormData → POST /upload via XHR com eventos de
 *      progresso reais (fase ENVIO da barra);
 *   2. com o video_id, polling de GET /status/{id} (fase TRANSCODIFICAÇÃO,
 *      modo indeterminado — o FFmpeg não informa %);
 *   3. completed → fase PUBLICADO + painel com "Assistir agora" e
 *      "Enviar outro vídeo" para publicar o próximo sem sair da página.
 */
import { enviarEAcompanhar, formatarBytes, criarBarraFases } from "./upload.js";

const EXTENSOES_VALIDAS = [".mp4", ".avi", ".mov", ".webm"];

export function iniciarPaginaUpload({
  intervaloMs,
  timeoutMs,
  timeoutFilaMs,
} = {}) {
  const form = document.querySelector("#uploadForm");
  if (!form) return null;

  const entradaArquivo = document.querySelector("#uploadFile");
  const dropzone = document.querySelector("#uploadDropzone");
  const previewBox = document.querySelector("#uploadPreviewBox");
  const preview = document.querySelector("#uploadPreview");
  const infoArquivo = document.querySelector("#uploadArquivoInfo");
  const statusEl = document.querySelector("#uploadStatus");
  const botaoSubmit = document.querySelector("#uploadSubmit");
  const resultado = document.querySelector("#uploadResultado");
  const assistir = document.querySelector("#uploadAssistir");
  const botaoNovo = document.querySelector("#uploadNovo");
  const passos = document.querySelector("#uploadPassos");
  const rotuloBarra = document.querySelector("#uploadProgressRotulo");

  const barra = criarBarraFases({
    barra: document.querySelector("#uploadProgress"),
    fill: document.querySelector("#uploadProgressFill"),
    rotulo: rotuloBarra,
    valor: document.querySelector("#uploadProgressValor"),
    setStatus,
  });

  let urlPreview = null;

  function setStatus(texto, classe = "") {
    statusEl.textContent = texto;
    statusEl.className = `upload-status ${classe}`.trim();
  }

  /** Marcador de etapas: 1 Envio → 2 Transcodificação → 3 Publicado. */
  function definirFase(nome) {
    if (!passos) return;
    const ordem = ["envio", "transcode", "publicado"];
    const atual = ordem.indexOf(nome);
    for (const item of passos.querySelectorAll("li")) {
      const indice = ordem.indexOf(item.dataset.fase);
      item.classList.toggle("ativo", indice === atual);
      item.classList.toggle("feito", atual >= 0 && indice < atual);
    }
  }

  /** Solta a prévia local (blob:) do arquivo anterior. */
  function limparPreview() {
    if (urlPreview) {
      URL.revokeObjectURL(urlPreview);
      urlPreview = null;
    }
    preview?.removeAttribute("src");
    previewBox?.classList.add("hidden");
    if (infoArquivo) infoArquivo.textContent = "";
  }

  /** Escolha de arquivo (input ou arrastar): mostra prévia + nome + tamanho. */
  function aceitarArquivo(arquivo) {
    if (!arquivo) return;

    const nome = arquivo.name.toLowerCase();
    if (!EXTENSOES_VALIDAS.some((extensao) => nome.endsWith(extensao))) {
      setStatus(
        `Formato inválido (${arquivo.name}). Use mp4, avi, mov ou webm.`,
        "erro"
      );
      return;
    }

    limparPreview();
    urlPreview = URL.createObjectURL(arquivo);
    preview.src = urlPreview;
    previewBox?.classList.remove("hidden");
    if (infoArquivo) {
      infoArquivo.textContent = `${arquivo.name} — ${formatarBytes(arquivo.size)}`;
    }
    // Novo arquivo, nova chance: limpa erro/status de um envio anterior.
    resultado?.classList.add("hidden");
    setStatus(
      `Arquivo escolhido: ${arquivo.name}. Preencha título e autor e clique em Enviar vídeo.`
    );
  }

  entradaArquivo?.addEventListener("change", () => {
    aceitarArquivo(entradaArquivo.files?.[0]);
  });

  if (dropzone) {
    dropzone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropzone.classList.add("arrastando");
    });
    dropzone.addEventListener("dragleave", () =>
      dropzone.classList.remove("arrastando")
    );
    dropzone.addEventListener("drop", (event) => {
      event.preventDefault();
      dropzone.classList.remove("arrastando");
      const arquivo = event.dataTransfer?.files?.[0];
      if (arquivo && typeof DataTransfer === "function") {
        // Espelha o arquivo solto no input (para o FormData pegar de lá).
        const transferencia = new DataTransfer();
        transferencia.items.add(arquivo);
        entradaArquivo.files = transferencia.files;
      }
      aceitarArquivo(arquivo);
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const arquivo = entradaArquivo.files?.[0];
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
    resultado?.classList.add("hidden");
    // A barra fica VISÍVEL desde o primeiro instante (0 B de N) — a página
    // existe para mostrar a evolução exata, então começa a contar já.
    definirFase("envio");
    barra.atualizarBarra({ fracao: 0, enviado: 0, total: arquivo.size });
    try {
      const { corpo } = await enviarEAcompanhar(
        dados,
        {
          // Sem onEnviando: a barra já nasce visível em 0% com o total exato
          // do arquivo ("0% (0 B de N)") — mensagem redundante a esconderia.
          onProgress: barra.atualizarBarra,
          onProcessando: () => {
            // Fase 2: a barra NÃO some — entra no modo indeterminado e anima
            // enquanto a transcodificação roda (FFmpeg não informa %).
            definirFase("transcode");
            barra.modoIndeterminado("Transcodificando em HLS...");
            setStatus(
              "Upload concluído! Transcodificando em HLS — de segundos a alguns minutos..."
            );
          },
          onStatus: (status) => {
            setStatus(
              status.status === "pending"
                ? "Na fila, aguardando um worker iniciar o processamento..."
                : `Processando... status: ${status.status}`
            );
            if (rotuloBarra) {
              rotuloBarra.textContent =
                status.status === "pending"
                  ? "Na fila, aguardando um worker..."
                  : "Transcodificando em HLS...";
            }
          },
        },
        { intervaloMs, timeoutMs, timeoutFilaMs }
      );

      // Fase 3: 100% verde + painel de sucesso com o link da watch page.
      definirFase("publicado");
      barra.marcarConcluida();
      setStatus("Vídeo pronto e publicado no catálogo!", "ok");
      if (assistir && corpo?.video_id) {
        assistir.href = `index.html?video=${encodeURIComponent(corpo.video_id)}`;
        resultado?.classList.remove("hidden");
      }
      form.reset();
      limparPreview();
    } catch (error) {
      definirFase("envio");
      barra.esconderBarra();
      setStatus(error.message, "erro");
    } finally {
      botaoSubmit.disabled = false;
    }
  });

  // "Enviar outro vídeo": volta ao estado inicial sem recarregar a página.
  botaoNovo?.addEventListener("click", () => {
    barra.esconderBarra();
    definirFase("envio");
    resultado?.classList.add("hidden");
    limparPreview();
    form.reset();
    setStatus("", "hidden");
  });

  return { aceitarArquivo, definirFase };
}
