from __future__ import annotations


class ConfirmationBlocked(RuntimeError):
    pass


class ConfirmationGuard:
    def __init__(self, api) -> None:
        self.api = api

    def ensure_can_execute(self, command_id: str, execution_token: str) -> dict:
        if not execution_token:
            raise ConfirmationBlocked("Acao bloqueada: token de execucao ausente.")
        try:
            return self.api.verify_execution(command_id, execution_token)
        except Exception as exc:
            raise ConfirmationBlocked("Acao bloqueada: confirmacao obrigatoria ausente ou invalida.") from exc
