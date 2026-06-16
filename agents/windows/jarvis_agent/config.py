from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class AgentConfig:
    api_url: str
    device_token: str
    data_dir: Path
    allowed_dirs: tuple[Path, ...]

    @property
    def ws_url(self) -> str:
        base = self.api_url.replace("https://", "wss://").replace("http://", "ws://").rstrip("/")
        return f"{base}/ws/agent?token={self.device_token}"


def load_config() -> AgentConfig:
    data_dir = Path(os.getenv("JARVIS_AGENT_DATA_DIR", Path.home() / ".jarvis-agent")).expanduser()
    raw_dirs = os.getenv("JARVIS_ALLOWED_DIRS", str(Path.home() / "Downloads"))
    allowed_dirs = tuple(Path(part).expanduser().resolve() for part in raw_dirs.split(";") if part.strip())
    return AgentConfig(
        api_url=os.getenv("JARVIS_API_URL", "http://localhost:4000"),
        device_token=os.getenv("JARVIS_DEVICE_TOKEN", ""),
        data_dir=data_dir,
        allowed_dirs=allowed_dirs,
    )
