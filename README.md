# Jarvis BR

Assistente pessoal inteligente multidispositivo com API Node.js/Fastify, Neon Postgres com SQL puro, painel holografico React, base mobile Flutter e Agent Windows em Python.

O projeto foi criado para atuar somente em aparelhos proprios, cadastrados e autorizados. Toda acao sensivel passa por `confirmation_requests`, frase explicita `Confirmo`, token curto de execucao e verificacao tambem no agent local.

## Stack

- API: Node.js, TypeScript, Fastify, `pg`, WebSocket.
- Banco: Neon Postgres, sem Prisma.
- Migracoes: SQL puro em [api/db/migrations](api/db/migrations).
- Web: React + Vite com avatar holografico.
- Mobile: Flutter com `HoloAvatar` em `CustomPainter`.
- Agent Windows: Python, SQLite, busca fuzzy local e confirmation guard.

## Deploy Neon + Render

1. Crie um banco Postgres no Neon.
2. No Neon, clique em `Connect` e copie a `DATABASE_URL`. Use a string com `sslmode=require`; pooled connection tambem funciona.
3. No Render, crie um Blueprint apontando para este repositorio. O arquivo [render.yaml](render.yaml) fica na raiz.
4. Configure a env var `DATABASE_URL` no servico `jarvis-api`.
5. O Render gera `JWT_SECRET` e `DEVICE_TOKEN_SECRET` automaticamente pelo blueprint.
6. No primeiro deploy, o comando `preDeployCommand: npm run db:migrate` aplica as migrations SQL direto no Neon.
7. Ajuste `CORS_ORIGIN` para a URL real do `jarvis-web` quando o Render informar o dominio final.

Observacao de custo: a API usa `plan: free` e o web usa static site. O worker foi implementado, mas fica comentado no `render.yaml`, porque o plano gratuito do Render nao esta disponivel para background workers. Nada pago e ativado automaticamente.

Referencias oficiais usadas:

- Render Blueprints: https://render.com/docs/blueprint-spec
- Render free instances: https://render.com/docs/free
- Neon connection strings: https://neon.com/docs/connect/connect-from-any-app

## Rodar Local

```bash
docker compose up -d
```

Crie `api/.env` ou `.env` com base em [.env.example](.env.example):

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/jarvis
JWT_SECRET=dev-secret
DEVICE_TOKEN_SECRET=dev-device-secret
CORS_ORIGIN=http://localhost:5173
```

Instale e rode:

```bash
npm install
npm --workspace api run db:migrate
npm --workspace api run dev
npm --workspace apps/web run dev
```

URLs locais:

- API: http://localhost:4000/health
- Web: http://localhost:5173

## Fluxo Obrigatorio

Exemplo:

`Jarvis, no computador Casa tem uma imagem chamada logo azul. Baixe ela para mim.`

O sistema faz:

1. Cria um comando em `POST /commands`.
2. Identifica o aparelho `Casa` se estiver pareado.
3. Pede busca ao agent via `/ws/agent`; se o agent nao estiver online, usa cache ou mock seguro marcado.
4. Mostra opcoes com nome, tipo, tamanho, data, pasta amigavel, score e thumbnail token.
5. Ao escolher um arquivo, cria `confirmation_request`.
6. O usuario precisa digitar/falar `Confirmo`.
7. A API cria `executionToken` curto e envia `action.execute` ao agent autorizado.
8. O agent chama `/agent/execution/verify` antes de qualquer ferramenta local.
9. Auditoria registra criacao, busca, confirmacao, execucao, bloqueio ou cancelamento.

## Agent Windows

Depois de criar conta no painel, gere um codigo em `POST /devices/pairing-code` ou pelo botao do painel. O agent usa `/devices/claim` para receber `JARVIS_DEVICE_TOKEN`.

```bash
cd agents/windows
python -m venv .venv
.venv\Scripts\activate
pip install -e .[dev]
set JARVIS_API_URL=http://localhost:4000
set JARVIS_DEVICE_TOKEN=cole-o-token
set JARVIS_ALLOWED_DIRS=C:\Users\seu-usuario\Downloads;C:\Users\seu-usuario\Pictures
jarvis-agent
```

## Garantias

- Nao existe Prisma no repositorio.
- Migrations sao SQL puro.
- A API bloqueia execucao sem confirmacao.
- O agent tambem bloqueia sem token validado no backend.
- Nada tenta burlar senha, permissao, WhatsApp, conta, sistema ou aparelho de terceiros.
- Arquivos reais ficam no aparelho ate uma transferencia aprovada.

## Testes

```bash
npm --workspace api run test
cd agents/windows
pytest
```

## Proximas fases naturais

1. Conectar upload por chunks em `agents/windows/jarvis_agent/transfer.py`.
2. Adicionar STT/TTS real nos adapters de voz.
3. Publicar app Android com permissao transparente para botao flutuante e wake word opcional.
