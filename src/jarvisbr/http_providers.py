from __future__ import annotations

import httpx

from jarvisbr.config import Settings
from jarvisbr.memory import Turn
from jarvisbr.base import ChatProvider


DEFAULT_SYSTEM = (
    "Você é Jarvis BR, um assistente pessoal objetivo em português do Brasil. "
    "Seja conciso, útil e nunca alegue ter executado uma ação que não executou."
)


def _messages(prompt: str, system: str | None, history: list[Turn] | None) -> list[dict]:
    result = [{"role": "system", "content": system or DEFAULT_SYSTEM}]
    for turn in (history or [])[-12:]:
        if turn.role in {"user", "assistant"} and turn.content.strip():
            result.append({"role": turn.role, "content": turn.content})
    result.append({"role": "user", "content": prompt})
    return result


class OpenJarvisProvider(ChatProvider):
    name = "openjarvis"

    def __init__(self, settings: Settings) -> None:
        self.url = settings.openjarvis_url.rstrip("/")
        self.model = settings.openjarvis_model

    def complete(self, prompt: str, *, system=None, history=None) -> str:
        response = httpx.post(
            f"{self.url}/chat/completions",
            json={"model": self.model, "messages": _messages(prompt, system, history)},
            timeout=90,
        )
        response.raise_for_status()
        data = response.json()
        return str(data["choices"][0]["message"]["content"]).strip()

    def health(self) -> tuple[bool, str]:
        base = self.url.removesuffix("/v1")
        errors = []
        for endpoint in (f"{base}/health", f"{self.url}/models"):
            try:
                response = httpx.get(endpoint, timeout=1.5)
                if response.is_success:
                    return True, f"online em {endpoint}"
                errors.append(f"{endpoint}: HTTP {response.status_code}")
            except Exception as exc:
                errors.append(f"{endpoint}: {exc}")
        return False, "; ".join(errors)


class OllamaProvider(ChatProvider):
    name = "ollama"

    def __init__(self, settings: Settings) -> None:
        self.url = settings.ollama_url.rstrip("/")
        self.model = settings.ollama_model
        self.think = settings.ollama_think
        self.num_ctx = max(1024, settings.ollama_num_ctx)
        self.num_predict = max(32, settings.ollama_num_predict)
        self.timeout = max(5.0, settings.ollama_timeout)
        self.keep_alive = settings.ollama_keep_alive
        self.last_stats: dict[str, float | int | str] = {}

    def complete(self, prompt: str, *, system=None, history=None) -> str:
        response = httpx.post(
            f"{self.url}/api/chat",
            json={
                "model": self.model,
                "messages": _messages(prompt, system, history),
                "stream": False,
                # Qwen 3.5 é um modelo de thinking. Para um assistente de voz,
                # latência importa mais que raciocínio oculto em cada frase.
                "think": self.think,
                "keep_alive": self.keep_alive,
                "options": {
                    "num_ctx": self.num_ctx,
                    "num_predict": self.num_predict,
                    "temperature": 0.2,
                },
            },
            timeout=httpx.Timeout(self.timeout, connect=3.0),
        )
        response.raise_for_status()
        data = response.json()
        self.last_stats = {
            "total_duration_ns": int(data.get("total_duration", 0) or 0),
            "load_duration_ns": int(data.get("load_duration", 0) or 0),
            "prompt_eval_count": int(data.get("prompt_eval_count", 0) or 0),
            "eval_count": int(data.get("eval_count", 0) or 0),
            "eval_duration_ns": int(data.get("eval_duration", 0) or 0),
            "done_reason": str(data.get("done_reason", "") or ""),
        }
        return str(data["message"]["content"]).strip()

    def health(self) -> tuple[bool, str]:
        try:
            response = httpx.get(f"{self.url}/api/tags", timeout=1.5)
            if not response.is_success:
                return False, f"HTTP {response.status_code}"
            models = [m.get("name", "") for m in response.json().get("models", [])]
            present = self.model in models or f"{self.model}:latest" in models
            return present, f"modelo {'presente' if present else 'não encontrado'}: {self.model}"
        except Exception as exc:
            return False, str(exc)


class GeminiProvider(ChatProvider):
    name = "gemini"

    def __init__(self, settings: Settings) -> None:
        self.key = settings.gemini_api_key
        self.model = settings.gemini_model

    def complete(self, prompt: str, *, system=None, history=None) -> str:
        if not self.key:
            raise RuntimeError("GEMINI_API_KEY não configurada")
        contents = []
        for turn in (history or [])[-12:]:
            role = "model" if turn.role == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": turn.content}]})
        contents.append({"role": "user", "parts": [{"text": prompt}]})
        response = httpx.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent",
            params={"key": self.key},
            json={
                "systemInstruction": {"parts": [{"text": system or DEFAULT_SYSTEM}]},
                "contents": contents,
            },
            timeout=90,
        )
        response.raise_for_status()
        candidates = response.json().get("candidates", [])
        if not candidates:
            return "Não recebi resposta do modelo."
        parts = candidates[0].get("content", {}).get("parts", [])
        return "\n".join(str(p.get("text", "")) for p in parts).strip()

    def health(self) -> tuple[bool, str]:
        return (bool(self.key), "chave configurada" if self.key else "sem GEMINI_API_KEY")


class OfflineProvider(ChatProvider):
    name = "offline"

    def complete(self, prompt: str, *, system=None, history=None) -> str:  # noqa: ARG002
        return (
            "Estou em modo offline sem modelo de raciocínio. "
            "Comandos locais continuam disponíveis; configure Ollama, OpenJarvis ou Gemini."
        )

    def health(self) -> tuple[bool, str]:
        return True, "somente comandos locais"
