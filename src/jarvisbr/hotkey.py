from __future__ import annotations

import ctypes
import threading
from ctypes import wintypes
from typing import Callable


class WindowsHotkey:
    """Atalhos globais do Jarvis no Windows.

    Ctrl+Alt+J abre conversa normal.
    Ctrl+Alt+K abre modo agente.
    """

    MOD_ALT = 0x0001
    MOD_CONTROL = 0x0002
    WM_HOTKEY = 0x0312
    WM_QUIT = 0x0012

    VK_J = 0x4A
    VK_K = 0x4B

    CONVERSATION_ID = 0xBEEF
    AGENT_ID = 0xBEF0

    def __init__(
        self,
        conversation_callback: Callable[[], None],
        agent_callback: Callable[[], None] | None = None,
    ) -> None:
        self.conversation_callback = conversation_callback
        self.agent_callback = agent_callback
        self._thread: threading.Thread | None = None
        self._thread_id: int | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        if not hasattr(ctypes, "windll"):
            return
        self._thread = threading.Thread(
            target=self._run,
            daemon=True,
            name="jarvis-hotkeys",
        )
        self._thread.start()

    def stop(self) -> None:
        if not hasattr(ctypes, "windll") or not self._thread_id:
            return
        ctypes.windll.user32.PostThreadMessageW(
            self._thread_id,
            self.WM_QUIT,
            0,
            0,
        )

    def _run(self) -> None:
        user32 = ctypes.windll.user32
        kernel32 = ctypes.windll.kernel32
        self._thread_id = int(kernel32.GetCurrentThreadId())

        modifiers = self.MOD_ALT | self.MOD_CONTROL
        registered_conversation = bool(
            user32.RegisterHotKey(
                None,
                self.CONVERSATION_ID,
                modifiers,
                self.VK_J,
            )
        )
        registered_agent = bool(
            self.agent_callback
            and user32.RegisterHotKey(
                None,
                self.AGENT_ID,
                modifiers,
                self.VK_K,
            )
        )

        try:
            if not registered_conversation and not registered_agent:
                return

            msg = wintypes.MSG()
            while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
                if msg.message != self.WM_HOTKEY:
                    continue
                if msg.wParam == self.CONVERSATION_ID and registered_conversation:
                    self.conversation_callback()
                elif (
                    msg.wParam == self.AGENT_ID
                    and registered_agent
                    and self.agent_callback
                ):
                    self.agent_callback()
        finally:
            if registered_conversation:
                user32.UnregisterHotKey(None, self.CONVERSATION_ID)
            if registered_agent:
                user32.UnregisterHotKey(None, self.AGENT_ID)
            self._thread_id = None
