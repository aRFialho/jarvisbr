from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def _bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "sim", "on"}


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _split(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(";") if item.strip()]


def _expand(path: str) -> Path:
    return Path(os.path.expandvars(os.path.expanduser(path))).resolve()


def _input_device() -> int | str | None:
    raw = os.getenv("JARVIS_INPUT_DEVICE", "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return raw


def _apps() -> dict[str, str]:
    raw = os.getenv(
        "JARVIS_APPS",
        "chrome=chrome.exe;edge=msedge.exe;bloco de notas=notepad.exe;notepad=notepad.exe;"
        "calculadora=calc.exe;explorador=explorer.exe;vscode=code;spotify=spotify.exe",
    )
    result: dict[str, str] = {}
    for item in raw.split(";"):
        if "=" not in item:
            continue
        alias, command = item.split("=", 1)
        alias, command = alias.strip().lower(), command.strip()
        if alias and command:
            result[alias] = command
    return result


@dataclass(slots=True)
class Settings:
    language: str = field(default_factory=lambda: os.getenv("JARVIS_LANGUAGE", "pt"))
    tts_rate: int = field(default_factory=lambda: int(os.getenv("JARVIS_TTS_RATE", "185")))
    whisper_model: str = field(
        default_factory=lambda: os.getenv("JARVIS_WHISPER_MODEL", "small")
    )
    input_device: int | str | None = field(default_factory=_input_device)
    clap_enabled: bool = field(default_factory=lambda: _bool("JARVIS_CLAP_ENABLED", False))

    clap_threshold: float = field(
        default_factory=lambda: _float("JARVIS_CLAP_THRESHOLD", 0.04)
    )
    clap_spike_ratio: float = field(
        default_factory=lambda: _float("JARVIS_CLAP_SPIKE_RATIO", 1.8)
    )
    clap_max_rms: float = field(default_factory=lambda: _float("JARVIS_CLAP_MAX_RMS", 0.40))
    clap_min_gap: float = field(default_factory=lambda: _float("JARVIS_CLAP_MIN_GAP", 0.12))
    clap_max_gap: float = field(default_factory=lambda: _float("JARVIS_CLAP_MAX_GAP", 0.95))
    clap_settle: float = field(default_factory=lambda: _float("JARVIS_CLAP_SETTLE", 0.45))
    clap_cooldown: float = field(default_factory=lambda: _float("JARVIS_CLAP_COOLDOWN", 1.8))
    clap_high_freq_ratio: float = field(
        default_factory=lambda: _float("JARVIS_CLAP_HIGH_FREQ_RATIO", 0.16)
    )
    clap_max_event_ms: float = field(
        default_factory=lambda: _float("JARVIS_CLAP_MAX_EVENT_MS", 240.0)
    )
    clap_attack_ratio: float = field(
        default_factory=lambda: _float("JARVIS_CLAP_ATTACK_RATIO", 2.0)
    )

    provider: str = field(default_factory=lambda: os.getenv("JARVIS_PROVIDER", "auto").lower())
    openjarvis_url: str = field(
        default_factory=lambda: os.getenv("JARVIS_OPENJARVIS_URL", "http://127.0.0.1:8000/v1")
    )
    openjarvis_model: str = field(
        default_factory=lambda: os.getenv("JARVIS_OPENJARVIS_MODEL", "qwen3.5:4b")
    )
    ollama_url: str = field(
        default_factory=lambda: os.getenv("JARVIS_OLLAMA_URL", "http://127.0.0.1:11434")
    )
    ollama_model: str = field(
        default_factory=lambda: os.getenv("JARVIS_OLLAMA_MODEL", "qwen3.5:4b")
    )
    ollama_think: bool = field(
        default_factory=lambda: _bool("JARVIS_OLLAMA_THINK", False)
    )
    ollama_num_ctx: int = field(
        default_factory=lambda: _int("JARVIS_OLLAMA_NUM_CTX", 4096)
    )
    ollama_num_predict: int = field(
        default_factory=lambda: _int("JARVIS_OLLAMA_NUM_PREDICT", 256)
    )
    ollama_timeout: float = field(
        default_factory=lambda: _float("JARVIS_OLLAMA_TIMEOUT", 45.0)
    )
    ollama_keep_alive: str = field(
        default_factory=lambda: os.getenv("JARVIS_OLLAMA_KEEP_ALIVE", "15m")
    )
    gemini_api_key: str = field(default_factory=lambda: os.getenv("GEMINI_API_KEY", ""))
    gemini_model: str = field(
        default_factory=lambda: os.getenv("JARVIS_GEMINI_MODEL", "gemini-2.5-flash")
    )

    allowed_dirs: list[Path] = field(
        default_factory=lambda: [
            _expand(p)
            for p in _split(
                "JARVIS_ALLOWED_DIRS",
                r"%USERPROFILE%\Documents;%USERPROFILE%\Downloads;%USERPROFILE%\Desktop",
            )
        ]
    )
    allow_shell: bool = field(default_factory=lambda: _bool("JARVIS_ALLOW_SHELL", False))
    shell_allowlist: set[str] = field(
        default_factory=lambda: {
            item.lower()
            for item in _split(
                "JARVIS_SHELL_ALLOWLIST",
                "python;python.exe;py;git;node;npm;pnpm;uv;ollama",
            )
        }
    )
    apps: dict[str, str] = field(default_factory=_apps)

    @property
    def data_dir(self) -> Path:
        root = os.getenv("LOCALAPPDATA") or str(Path.home() / ".local" / "share")
        path = Path(root) / "JarvisBR"
        path.mkdir(parents=True, exist_ok=True)
        return path


settings = Settings()
