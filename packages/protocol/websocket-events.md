# Eventos WebSocket Jarvis

Todos os eventos que podem causar efeito externo dependem de `confirmation_request` confirmada e `executionToken` curto.

## Cliente para API

```json
{ "type": "command.created", "commandId": "uuid", "rawText": "Jarvis, procure logo azul no computador Casa" }
```

## API para Agent

```json
{ "type": "file.search.request", "requestId": "uuid", "query": "logo azul", "requestedKind": "image", "limit": 10 }
```

## Agent para API

```json
{
  "type": "file.search.results",
  "requestId": "uuid",
  "results": [
    {
      "localFileId": "abc",
      "fileName": "logo_azul_final.png",
      "fileKind": "image",
      "fileSize": 2100000,
      "filePathHint": "Desktop/Clientes",
      "modifiedAt": "2026-06-16T12:00:00Z",
      "thumbnailToken": "local-thumb:abc",
      "score": 0.94
    }
  ]
}
```

## API para Cliente

```json
{
  "type": "confirmation.required",
  "commandId": "uuid",
  "confirmation": {
    "id": "uuid",
    "summary": "Vou baixar \"logo_azul_final.png\" do aparelho \"Casa\" para \"Painel Web\". Confirma esta acao?",
    "confirmation_phrase": "Confirmo",
    "status": "pending"
  }
}
```

## API para Agent apos confirmacao

```json
{
  "type": "action.execute",
  "commandId": "uuid",
  "executionToken": "token-curto",
  "step": {
    "tool_name": "file.download",
    "payload_json": {
      "sourceDeviceId": "uuid",
      "destinationDeviceId": "uuid",
      "localFileId": "abc",
      "fileName": "logo_azul_final.png"
    }
  }
}
```
