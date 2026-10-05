from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from jarvisbr.memory import Turn
from jarvisbr.base import ChatProvider


@dataclass(slots=True)
class PlannedAction:
    tool: str
    args: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class Plan:
    reply: str
    actions: list[PlannedAction] = field(default_factory=list)


SYSTEM_PROMPT = """Você é o planejador do Jarvis BR no Windows.
Responda APENAS JSON válido neste formato:
{"reply":"frase curta em pt-BR","actions":[{"tool":"nome","args":{}}]}

Ferramentas permitidas:
- open_app {"name":"alias"}
- open_url {"url":"https://..."}
- volume {"action":"up|down|mute","steps":1}
- screenshot {}
- read_file {"path":"caminho"}
- write_file {"path":"caminho","content":"texto"}
- run_shell {"command":["executavel","arg1"]}

Nunca invente uma ferramenta. Prefira nenhuma ação quando só for conversa.
Ações perigosas serão confirmadas por uma camada separada. Não tente contornar segurança.
"""


class Planner:
    def __init__(self, provider: ChatProvider) -> None:
        self.provider = provider

    def plan(self, request: str, history: list[Turn] | None = None) -> Plan:
        raw = self.provider.complete(request, system=SYSTEM_PROMPT, history=history)
        data = self._parse_json(raw)
        actions = []
        for item in data.get("actions", []) if isinstance(data, dict) else []:
            if not isinstance(item, dict) or not isinstance(item.get("tool"), str):
                continue
            args = item.get("args") if isinstance(item.get("args"), dict) else {}
            actions.append(PlannedAction(tool=item["tool"], args=args))
        reply = str(data.get("reply", "Certo.")) if isinstance(data, dict) else "Certo."
        return Plan(reply=reply.strip() or "Certo.", actions=actions)

    @staticmethod
    def _parse_json(raw: str) -> dict[str, Any]:
        text = raw.strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:].lstrip()
        try:
            value = json.loads(text)
            return value if isinstance(value, dict) else {}
        except json.JSONDecodeError:
            start, end = text.find("{"), text.rfind("}")
            if start >= 0 and end > start:
                try:
                    value = json.loads(text[start : end + 1])
                    return value if isinstance(value, dict) else {}
                except json.JSONDecodeError:
                    pass
        return {"reply": raw.strip() or "Não consegui montar um plano seguro.", "actions": []}
