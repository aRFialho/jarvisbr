from __future__ import annotations

from collections.abc import Callable

from jarvisbr.config import Settings
from jarvisbr.dispatcher import Dispatcher
from jarvisbr.memory import MemoryStore
from jarvisbr.policy import Risk, SecurityPolicy
from jarvisbr.windows_tools import ToolError, WindowsTools

ConfirmCallback = Callable[[str], bool]


class Assistant:
    def __init__(self, settings: Settings, confirm: ConfirmCallback) -> None:
        from jarvisbr.factory import build_provider
        self.settings = settings
        self.provider = build_provider(settings)
        self.dispatcher = Dispatcher(settings, self.provider)
        self.policy = SecurityPolicy(settings)
        self.tools = WindowsTools(settings)
        self.memory = MemoryStore(settings.data_dir / "memory.sqlite3")
        self.confirm = confirm

    def handle(self, text: str, *, agent_mode: bool = False) -> str:
        self.memory.add("user", text)
        result = self.dispatcher.dispatch(text, agent_mode=agent_mode, history=self.memory.recent(12))
        notes: list[str] = []
        for action in result.actions:
            decision = self.policy.decide(action.tool, action.args)
            if not decision.allowed:
                notes.append(f"Bloqueei {action.tool}: {decision.reason}.")
                continue
            if decision.risk == Risk.HIGH and not self.confirm(self._describe(action.tool, action.args)):
                notes.append(f"Cancelei {action.tool}.")
                continue
            try:
                notes.append(self.tools.execute(action.tool, action.args))
            except (ToolError, OSError, ValueError) as exc:
                notes.append(f"Falha em {action.tool}: {exc}.")
        reply = result.reply.strip()
        if notes:
            reply = " ".join([reply, *notes]).strip()
        self.memory.add("assistant", reply)
        return reply

    @staticmethod
    def _describe(tool: str, args: dict) -> str:
        if tool == "write_file": return f"escrever no arquivo {args.get('path', '')}"
        if tool == "run_shell": return "executar no terminal: " + " ".join(str(x) for x in args.get("command", []))
        return f"executar {tool}"
