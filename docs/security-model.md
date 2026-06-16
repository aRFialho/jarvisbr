# Modelo de Seguranca

## Regras centrais

- O Jarvis so atua em aparelhos vinculados ao usuario dono.
- Toda acao com efeito externo cria `confirmation_requests`.
- Confirmacao expira em poucos minutos.
- A frase padrao e `Confirmo`.
- Token de execucao e curto, hash fica no banco e o valor bruto aparece apenas uma vez.
- O agent valida o token em `/agent/execution/verify` antes de chamar qualquer ferramenta local.

## Bloqueios explicitos

- Sem automacao para burlar senha, permissao, conta, WhatsApp, e-mail ou sistema operacional.
- Comando ambiguo nao executa; pede selecao visual ou textual.
- Personalidade muda linguagem, nunca permissao.
- Mock seguro nunca executa acao real; serve para desenvolver UI e fluxo.

## Auditoria

A tabela `audit_logs` registra:

- Criacao de comando.
- Busca de arquivo.
- Confirmacao requerida.
- Confirmacao aceita/rejeitada.
- Execucao verificada.
- Execucao concluida, falha ou bloqueada.

## Permissoes

`device_permissions` separa escopo por aparelho:

- `file_kind`: tipos permitidos para busca/resultado.
- `action`: acoes permitidas, como `file_download`.
- Futuro: `folder`, `app`, `website`, `automation_scope`.
