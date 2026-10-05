from __future__ import annotations

from jarvisbr.config import Settings
from jarvisbr.base import ChatProvider
from jarvisbr.http_providers import (
    GeminiProvider,
    OfflineProvider,
    OllamaProvider,
    OpenJarvisProvider,
)


def build_provider(settings: Settings) -> ChatProvider:
    providers: dict[str, ChatProvider] = {
        "openjarvis": OpenJarvisProvider(settings),
        "ollama": OllamaProvider(settings),
        "gemini": GeminiProvider(settings),
        "offline": OfflineProvider(),
    }
    if settings.provider != "auto":
        return providers.get(settings.provider, providers["offline"])

    # Local-first: OpenJarvis -> Ollama -> Gemini -> offline.
    for name in ("openjarvis", "ollama"):
        candidate = providers[name]
        ok, _ = candidate.health()
        if ok:
            return candidate
    if settings.gemini_api_key:
        return providers["gemini"]
    return providers["offline"]
