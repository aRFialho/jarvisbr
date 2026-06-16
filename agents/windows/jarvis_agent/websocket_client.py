from __future__ import annotations

import asyncio
import json

import websockets

from .confirmation_guard import ConfirmationBlocked, ConfirmationGuard
from .file_indexer import FileIndexer
from .tools.file_actions import FileActions


class AgentWebSocketClient:
    def __init__(self, ws_url: str, indexer: FileIndexer, guard: ConfirmationGuard, file_actions: FileActions, api) -> None:
        self.ws_url = ws_url
        self.indexer = indexer
        self.guard = guard
        self.file_actions = file_actions
        self.api = api

    async def run_forever(self) -> None:
        while True:
            try:
                async with websockets.connect(self.ws_url, ping_interval=25) as socket:
                    async for message in socket:
                        await self._handle_message(socket, json.loads(message))
            except Exception as exc:
                print(f"websocket reconnecting: {exc}")
                await asyncio.sleep(5)

    async def _handle_message(self, socket, message: dict) -> None:
        msg_type = message.get("type")
        if msg_type == "file.search.request":
            results = self.indexer.search(
                query=message.get("query", ""),
                requested_kind=message.get("requestedKind"),
                limit=int(message.get("limit", 10)),
            )
            await socket.send(json.dumps({"type": "file.search.results", "requestId": message.get("requestId"), "results": results}))
            return

        if msg_type == "action.execute":
            command_id = message.get("commandId")
            execution_token = message.get("executionToken")
            step = message.get("step") or {}
            payload = step.get("payload_json") or step.get("payloadJson") or {}
            try:
                self.guard.ensure_can_execute(command_id, execution_token)
                if step.get("tool_name") == "file.download" or step.get("toolName") == "file.download":
                    result = self.file_actions.download(payload)
                else:
                    raise ConfirmationBlocked("Ferramenta nao autorizada no MVP.")
                self.api.complete_execution(command_id, execution_token, "completed", result.get("message", "ok"))
                await socket.send(json.dumps({"type": "action.completed", "commandId": command_id, "result": result}))
            except Exception as exc:
                status = "blocked" if isinstance(exc, ConfirmationBlocked) else "failed"
                try:
                    if command_id and execution_token:
                        self.api.complete_execution(command_id, execution_token, status, str(exc))
                finally:
                    await socket.send(json.dumps({"type": f"action.{status}", "commandId": command_id, "error": str(exc)}))
