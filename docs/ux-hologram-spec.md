# UX Holograma

## Estados

- `idle`: baixa intensidade, aguardando toque ou wake phrase.
- `listening`: onda reage ao audio e mostra legenda parcial.
- `thinking`: particulas mais rapidas e texto curto de analise.
- `searching`: busca ativa e cards aparecem conforme resultados.
- `confirming`: destaque amber, resumo claro e bloqueio antes da acao.
- `executing`: ciano/verde com progresso.
- `done`: brilho estabilizado.
- `error`: vermelho controlado com mensagem de bloqueio.

## Componentes

- Web: [HoloAvatar.tsx](../apps/web/src/components/HoloAvatar.tsx).
- Mobile: [holo_avatar.dart](../apps/mobile/lib/features/hologram/holo_avatar.dart).

## Conteudo obrigatorio na confirmacao

- Acao exata.
- Aparelho origem.
- Destino.
- Arquivo/app/objeto afetado.
- Frase ou botao de cancelar.
- Frase `Confirmo` para liberar.
