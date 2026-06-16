# Contratos da API

Base local: `http://localhost:4000`.

## Auth

- `POST /auth/register`: cria usuario e preferencias iniciais.
- `POST /auth/login`: retorna JWT de usuario.
- `GET /me/settings`: nome, wake phrases, voz e personalidade.
- `PATCH /me/settings`: atualiza nome, wake phrases e modo de uso.

## Aparelhos

- `POST /devices/pairing-code`: usuario autenticado gera codigo temporario.
- `POST /devices/claim`: aparelho informa codigo e recebe token de device.
- `GET /devices`: lista aparelhos proprios vinculados.

## Comandos e Arquivos

- `POST /commands`: cria comando por texto/voz transcrito.
- `POST /commands/:id/search-files`: pede busca ao agent ou usa cache/mock seguro.
- `POST /commands/:id/select-file`: monta plano e cria confirmacao obrigatoria.

## Confirmacoes

- `GET /confirmations/:id`: consulta resumo e status.
- `POST /confirmations/:id/confirm`: exige frase `Confirmo`.
- `POST /confirmations/:id/reject`: cancela.

## Agent

- `WS /ws/agent?token=DEVICE_TOKEN`: busca e execucao.
- `POST /agent/execution/verify`: agent valida token antes da ferramenta.
- `POST /agent/execution/complete`: agent registra sucesso, falha ou bloqueio.

## Auditoria

- `GET /audit`: ultimas acoes do usuario.
