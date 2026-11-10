# Projeto A3 — EduStream: Streaming de Vídeo Educacional

Plataforma de streaming de vídeo com processamento assíncrono e qualidade adaptativa, desenvolvida para a disciplina de **Garantia e Gestão da Qualidade de Software** (ODS 4 — Educação de Qualidade).

O **EduStream** permite que um professor faça upload de um vídeo, o sistema transcodifique para HLS multi-resolução (360p/480p/720p) em fila assíncrona e o aluno assista com qualidade adaptativa — o player troca de resolução conforme a conexão, sem interromper a aula. Tem ainda catálogo com busca, recomendações por tags e login/cadastro.

## 📦 Os repositórios do projeto

O projeto é dividido em **três repositórios** (front e back separados para o deploy e a evolução de cada camada):

| Repositório | O que tem |
| --- | --- |
| 🖥️ [`projeto-a3-backend`](https://github.com/Pietro2820/projeto-a3-backend) | API FastAPI: upload, fila Redis/Celery, transcodificação FFmpeg, recomendações, autenticação (login/cadastro). 330+ testes pytest no CI. |
| 📺 [`projeto-a3-frontend`](https://github.com/Pietro2820/projeto-a3-frontend) | Player HLS.js com qualidade adaptativa, catálogo, tela de login/cadastro. 240+ testes Jest no CI. |
| 📄 **Este repositório** | Visão geral do trabalho: objetivo, arquitetura, qualidade e links. |

## Stack

| Camada | Tecnologia |
| --- | --- |
| API / Backend | Python + FastAPI |
| Processamento assíncrono | Redis + Celery |
| Transcodificação | FFmpeg → HLS (360p / 480p / 720p) |
| Player | HLS.js + HTML5 Video (ABR — Adaptive Bitrate) |
| Autenticação | `POST /login` / `POST /cadastro` + PBKDF2-SHA256 (stdlib) |
| Banco de dados | Supabase (Postgres gerenciado) |
| Testes | Pytest (backend) · Jest + jsdom (frontend) |
| CI/CD | GitHub Actions (suíte completa em cada push/PR) |

## Arquitetura (o fluxo de um vídeo)

```
Professor                      Backend                          Aluno
────────                       ───────                          ─────
upload (home.html)
  │
  ▼
POST /upload ──────────► salva original + metadados
                          │  (tabela `videos` no Supabase)
                          ▼
                        enfileira (Redis/Celery)
                          │
                          ▼
                        worker FFmpeg ──► HLS multi-resolução
                          │                master.m3u8 + segmentos
                          ▼
                        status: pending → processing → completed
                                                   │
aluno (login.html → home.html)                     ▼
  busca / catálogo ◄──── GET /catalogo (status='completed')
  play ─────────────────► GET /videos/{id}/master.m3u8
                          ▼
                        player HLS.js troca de qualidade
                        conforme a banda (ABR)
```

- **Front ↔ Back**: só HTTP/JSON (CORS liberado em dev). O front descobre a API sozinho (`config.js`): servido pelo backend, mesma origem; senão `http://localhost:8000`.
- **Banco**: Supabase Postgres com duas tabelas — `videos` (catálogo/status) e `usuarios` (login). Sem credenciais, o backend cai para um banco JSON local de desenvolvimento.
- **Contratos documentados**: os estados do processamento (`pending/processing/completed/failed`) e o formato das respostas do catálogo são o contrato entre as camadas — cobertos por teste dos dois lados.

## Qualidade de software (o coração da disciplina)

| Prática | Onde |
| --- | --- |
| Testes unitários + integração backend | 330+ testes pytest (upload, fila, transcodificação, recomendações, status, auth) |
| Testes frontend | 240+ testes Jest/jsdom (player, qualidade, catálogo, login) + E2E contra a API real |
| CI em cada push/PR | GitHub Actions: pytest com Redis de verdade + Jest com cobertura |
| Cobertura publicada | Artefatos do CI (`coverage.xml` backend, `coverage/` front) |
| Trunk-based com branches por feature | `feature/*`, `fix/*` → PRs revisados → `develop` → `main` |
| Segurança da autenticação | Senha nunca em texto plano (PBKDF2-SHA256, salt por usuário, comparação em tempo constante); mensagem única para e-mail/senha errados (não enumera contas) |
| Diagnóstico de falhas | `scripts/verificar_player.py` aponta exatamente o que está fora (API, banco, mídia) |

## Como rodar (resumo rápido)

**Backend** (Docker, na pasta do clone de `projeto-a3-backend`):
```bash
cp .env.example .env          # preencha SUPABASE_URL/SUPABASE_KEY
docker compose up --build     # sobe Redis + worker + API na :8000
```

**Frontend** (na pasta do clone de `projeto-a3-frontend`):
```bash
# com a API rodando, abra login.html via Live Server (ou python -m http.server 5500)
```

Login de teste (após rodar os SQLs no Supabase): `teste@edustream.com` / `senha12345`.

Passo a passo completo (Docker, local, Supabase, testes): veja o README de **cada repositório** — eles são auto-suficientes.

## Setup do banco (uma vez)

Painel do Supabase → SQL Editor → executar, na ordem:
1. `supabase/schema.sql` (repo do backend) — tabela `videos`;
2. `supabase/schema_usuarios.sql` (repo do backend) — tabela `usuarios` + usuário de teste.

## Equipe

Projeto da disciplina A3 — Garantia e Gestão da Qualidade de Software (2026.2).

## Licença

MIT — veja [LICENSE](LICENSE).
