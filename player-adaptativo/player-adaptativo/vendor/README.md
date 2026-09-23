# `vendor/` — bibliotecas de terceiros

Arquivos de terceiros que o player precisa em tempo de execução e que ficam
**versionados no repositório** de propósito.

## Por que não usar CDN?

O `index.html` carregava o HLS.js de `cdn.jsdelivr.net`. Isso cria três riscos
no dia da apresentação:

1. **Sem internet, sem player.** A sala pode não ter rede, ou a rede pode cair.
2. **CDN bloqueado.** Rede institucional/firewall costuma barrar CDN de terceiros.
3. **Versão flutuante.** Se alguém apontar para `hls.js@1` em vez de `@1.6.13`,
   o comportamento muda sem nenhum commit no repositório.

Com a lib no repositório o player abre direto do arquivo, offline.

---

## `hls.min.js`

| | |
|---|---|
| Biblioteca | [hls.js](https://github.com/video-dev/hls.js) — reprodução de HLS (`.m3u8`) em navegadores sem suporte nativo |
| Versão | **1.6.13** (fixada) |
| Licença | **Apache-2.0** — cópia em [`LICENSE-hls.js.txt`](./LICENSE-hls.js.txt) |
| Copyright | © 2017 Dailymotion |
| Tamanho | 541.012 bytes |
| SHA-256 | `7c47cd97d7a6e7b98d9623dd8ed9a6d45af4be4085e0c2001cd7175c2b4cfb07` |

### Proveniência (como foi verificado)

Baixado do npm oficial e **conferido contra dois CDNs independentes** — os dois
devolvem o mesmo SHA-256, então o arquivo não foi adulterado no caminho:

```
https://cdn.jsdelivr.net/npm/hls.js@1.6.13/dist/hls.min.js  → 7c47cd97…cfb07
https://unpkg.com/hls.js@1.6.13/dist/hls.min.js             → 7c47cd97…cfb07   (idêntico)
https://registry.npmjs.org/hls.js/1.6.13                    → version 1.6.13, license Apache-2.0
```

### Para conferir de novo

```bash
sha256sum vendor/hls.min.js
# esperado: 7c47cd97d7a6e7b98d9623dd8ed9a6d45af4be4085e0c2001cd7175c2b4cfb07
```

### Para atualizar a versão

```bash
# 1. baixe a nova versão
curl -o vendor/hls.min.js https://cdn.jsdelivr.net/npm/hls.js@NOVA_VERSAO/dist/hls.min.js

# 2. confira o hash contra um segundo CDN
sha256sum vendor/hls.min.js
curl -s https://unpkg.com/hls.js@NOVA_VERSAO/dist/hls.min.js | sha256sum

# 3. atualize a versão e o hash neste arquivo
# 4. rode os testes:  cd player-adaptativo/player-adaptativo && npm test
```

---

## O que garante que isso não regride

`tests/vendor.test.js` verifica automaticamente:

* o arquivo `vendor/hls.min.js` existe e não está vazio/truncado;
* o SHA-256 confere com o valor documentado acima;
* o `index.html` referencia o arquivo **local**;
* o `index.html` **não** referencia nenhum recurso externo (`http://`, `https://`,
  `//cdn…`) — assim ninguém reintroduz um CDN sem o teste quebrar.
