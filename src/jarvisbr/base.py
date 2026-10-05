from __future__ import annotations

from abc import ABC, abstractmethod

from jarvisbr.memory import Turn


class ChatProvider(ABC):
    name = "provider"

    @abstractmethod
    def complete(
        self,
        prompt: str,
        *,
        system: str | None = None,
        history: list[Turn] | None = None,
    ) -> str:
        raise NotImplementedError

    def health(self) -> tuple[bool, str]:
        return True, self.name
