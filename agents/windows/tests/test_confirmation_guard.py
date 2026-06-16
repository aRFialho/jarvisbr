import pytest

from jarvis_agent.confirmation_guard import ConfirmationBlocked, ConfirmationGuard


class FakeApi:
    def __init__(self, ok=True):
        self.ok = ok

    def verify_execution(self, command_id, execution_token):
        if not self.ok:
            raise RuntimeError("denied")
        return {"ok": True, "commandId": command_id, "executionToken": execution_token}


def test_blocks_without_execution_token():
    guard = ConfirmationGuard(FakeApi())
    with pytest.raises(ConfirmationBlocked):
        guard.ensure_can_execute("cmd-1", "")


def test_blocks_when_backend_denies_confirmation():
    guard = ConfirmationGuard(FakeApi(ok=False))
    with pytest.raises(ConfirmationBlocked):
        guard.ensure_can_execute("cmd-1", "token")


def test_allows_after_backend_verifies():
    guard = ConfirmationGuard(FakeApi(ok=True))
    assert guard.ensure_can_execute("cmd-1", "token")["ok"] is True
