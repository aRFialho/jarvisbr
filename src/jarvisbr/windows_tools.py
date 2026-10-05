from __future__ import annotations

import ctypes
import json
import os
import subprocess
import webbrowser
from datetime import datetime
from pathlib import Path
from typing import Any

from PIL import ImageGrab

from jarvisbr.config import Settings


class ToolError(RuntimeError):
    pass


class WindowsTools:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def _assert_allowed_path(self, path: Path) -> None:
        for root in self.settings.allowed_dirs:
            try:
                path.relative_to(root)
                return
            except ValueError:
                continue
        raise ToolError("Caminho fora das pastas permitidas")

    def execute(self, tool: str, args: dict[str, Any]) -> str:
        method = getattr(self, f"tool_{tool}", None)
        if method is None:
            raise ToolError(f"Ferramenta desconhecida: {tool}")
        return str(method(**args))

    def tool_open_app(self, name: str) -> str:
        key = name.strip().lower()
        command = self.settings.apps.get(key)
        if not command:
            allowed = ", ".join(sorted(self.settings.apps))
            raise ToolError(f"Aplicativo não permitido. Opções: {allowed}")
        subprocess.Popen([command], shell=False)
        return f"Abri {name}."

    def tool_open_url(self, url: str) -> str:
        clean = url.strip()
        if not clean.startswith(("https://", "http://")):
            clean = "https://" + clean
        if not clean.startswith(("https://", "http://")):
            raise ToolError("URL inválida")
        webbrowser.open(clean)
        return "Abri o endereço no navegador."

    def tool_volume(self, action: str, steps: int = 1) -> str:
        if not hasattr(ctypes, "windll"):
            raise ToolError("Controle de volume disponível apenas no Windows")
        vk = {"mute": 0xAD, "down": 0xAE, "up": 0xAF}.get(action.lower())
        if vk is None:
            raise ToolError("Ação de volume inválida")
        user32 = ctypes.windll.user32
        for _ in range(max(1, min(int(steps), 20))):
            user32.keybd_event(vk, 0, 0, 0)
            user32.keybd_event(vk, 0, 2, 0)
        return "Volume ajustado."

    def tool_screenshot(self) -> str:
        folder = self.settings.data_dir / "screenshots"
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"screenshot-{datetime.now():%Y%m%d-%H%M%S}.png"
        ImageGrab.grab(all_screens=True).save(path)
        return f"Captura salva em {path}."

    def tool_read_file(self, path: str) -> str:
        p = Path(os.path.expandvars(os.path.expanduser(path))).resolve()
        self._assert_allowed_path(p)
        if not p.is_file():
            raise ToolError("Arquivo não encontrado")
        if p.stat().st_size > 2_000_000:
            raise ToolError("Arquivo grande demais para leitura direta")
        try:
            return p.read_text(encoding="utf-8")[:12000]
        except UnicodeDecodeError as exc:
            raise ToolError("Arquivo não é texto UTF-8") from exc

    def tool_write_file(self, path: str, content: str) -> str:
        p = Path(os.path.expandvars(os.path.expanduser(path))).resolve()
        self._assert_allowed_path(p)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return f"Arquivo salvo em {p}."

    def tool_run_shell(self, command: list[str]) -> str:
        if not isinstance(command, list) or not command:
            raise ToolError("Comando inválido")
        completed = subprocess.run(
            [str(part) for part in command],
            capture_output=True,
            text=True,
            timeout=90,
            shell=False,
        )
        output = (completed.stdout or completed.stderr or "").strip()
        payload = {"exit_code": completed.returncode, "output": output[:6000]}
        return json.dumps(payload, ensure_ascii=False)
