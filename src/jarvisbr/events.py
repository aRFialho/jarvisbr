from __future__ import annotations

from enum import Enum


class Gesture(str, Enum):
    DOUBLE_CLAP = "double_clap"
    TRIPLE_CLAP = "triple_clap"
    HOTKEY = "hotkey"
    HOTKEY_AGENT = "hotkey_agent"


class AssistantState(str, Enum):
    IDLE = "idle"
    LISTENING = "listening"
    THINKING = "thinking"
    SPEAKING = "speaking"
    CONFIRMING = "confirming"
    ERROR = "error"
