from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime

from jarvisbr.config import Settings
from jarvisbr.memory import Turn
from jarvisbr.planner import Plan, PlannedAction, Planner
from jarvisbr.base import ChatProvider


@dataclass(slots=True)
class DispatchResult:
    reply: str
    actions: list[PlannedAction]


class Dispatcher:
    def __init__(self, settings: Settings, provider: ChatProvider) -> None:
        self.settings = settings
        self.provider = provider
        self.planner = Planner(provider)

    def dispatch(self, text: str, *, agent_mode: bool = False, history: list[Turn] | None = None) -> DispatchResult:
        normalized = " ".join(text.lower().strip().split())
        local = self._local(normalized)
        if local is not None:
            return local
        if agent_mode:
            plan: Plan = self.planner.plan(text, history)
            return DispatchResult(plan.reply, plan.actions)
        return DispatchResult(self.provider.complete(text, history=history), [])

    def _local(self, text: str) -> DispatchResult | None:
        if re.search(r"\b(que horas|qual a hora|horas agora|hora agora)\b", text):
            return DispatchResult(f"Agora são {datetime.now():%H:%M}.", [])
        if text in {"status", "status do jarvis", "jarvis status"}:
            ok, detail = self.provider.health()
            state = "online" if ok else "indisponível"
            return DispatchResult(f"Provider {self.provider.name} {state}: {detail}.", [])
        match = re.match(r"^(?:abra|abrir|abre)\s+(?:o\s+|a\s+)?(.+)$", text)
        if match:
            target = match.group(1).strip()
            if target.startswith(("http://", "https://", "www.")) or ".com" in target:
                return DispatchResult("Abrindo.", [PlannedAction("open_url", {"url": target})])
            return DispatchResult("Abrindo.", [PlannedAction("open_app", {"name": target})])
        if any(token in text for token in ("aumenta o volume", "aumentar volume", "volume mais")):
            return DispatchResult("Certo.", [PlannedAction("volume", {"action": "up", "steps": 2})])
        if any(token in text for token in ("abaixa o volume", "diminuir volume", "volume menos")):
            return DispatchResult("Certo.", [PlannedAction("volume", {"action": "down", "steps": 2})])
        if any(token in text for token in ("mudo", "mutar", "silenciar computador")):
            return DispatchResult("Certo.", [PlannedAction("volume", {"action": "mute", "steps": 1})])
        if any(token in text for token in ("captura de tela", "screenshot", "print da tela")):
            return DispatchResult("Vou capturar a tela.", [PlannedAction("screenshot", {})])
        return None
