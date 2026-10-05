from __future__ import annotations

import ctypes
import threading
from ctypes import wintypes
from typing import Callable


class WindowsHotkey:
    MOD_ALT=0x0001; MOD_CONTROL=0x0002; WM_HOTKEY=0x0312; VK_J=0x4A; HOTKEY_ID=0xBEEF
    def __init__(self,callback:Callable[[],None])->None:self.callback=callback;self._thread=None
    def start(self)->None:
        if self._thread or not hasattr(ctypes,"windll"):return
        self._thread=threading.Thread(target=self._run,daemon=True,name="jarvis-hotkey");self._thread.start()
    def _run(self)->None:
        user32=ctypes.windll.user32
        if not user32.RegisterHotKey(None,self.HOTKEY_ID,self.MOD_ALT|self.MOD_CONTROL,self.VK_J):return
        try:
            msg=wintypes.MSG()
            while user32.GetMessageW(ctypes.byref(msg),None,0,0)!=0:
                if msg.message==self.WM_HOTKEY and msg.wParam==self.HOTKEY_ID:self.callback()
        finally:user32.UnregisterHotKey(None,self.HOTKEY_ID)
