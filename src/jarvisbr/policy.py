from __future__ import annotations

import os
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any

from jarvisbr.config import Settings


class Risk(str, Enum):
    LOW = "low"
    HIGH = "high"
    BLOCKED = "blocked"


@dataclass(slots=True)
class Decision:
    allowed: bool
    risk: Risk
    reason: str = ""


class SecurityPolicy:
    LOW_RISK = {"open_app", "open_url", "volume", "screenshot", "read_file"}
    HIGH_RISK = {"write_file", "run_shell"}

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def decide(self, tool: str, args: dict[str, Any]) -> Decision:
        if tool in self.LOW_RISK:
            if tool == "read_file" and not self.path_allowed(str(args.get("path", ""))):
                return Decision(False, Risk.BLOCKED, "arquivo fora das pastas permitidas")
            return Decision(True, Risk.LOW)
        if tool == "write_file":
            if not self.path_allowed(str(args.get("path", ""))):
                return Decision(False, Risk.BLOCKED, "arquivo fora das pastas permitidas")
            return Decision(True, Risk.HIGH)
        if tool == "run_shell":
            if not self.settings.allow_shell:
                return Decision(False, Risk.BLOCKED, "shell desativado na configuração")
            command = args.get("command")
            if not isinstance(command, list) or not command:
                return Decision(False, Risk.BLOCKED, "comando inválido")
            executable = os.path.basename(str(command[0])).lower()
            if executable not in self.settings.shell_allowlist:
                return Decision(False, Risk.BLOCKED, "executável fora da allowlist")
            return Decision(True, Risk.HIGH)
        return Decision(False, Risk.BLOCKED, "ferramenta não reconhecida")

    def path_allowed(self, raw: str) -> bool:
        if not raw:
            return False
        candidate = Path(os.path.expandvars(os.path.expanduser(raw))).resolve()
        for root in self.settings.allowed_dirs:
            try:
                candidate.relative_to(root)
                return True
            except ValueError:
                continue
        return False
