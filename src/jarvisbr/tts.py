from __future__ import annotations

import threading


class WindowsTTS:
    def __init__(self, rate:int=185, language_hint:str="pt") -> None:
        self.rate=rate; self.language_hint=language_hint.lower(); self._lock=threading.Lock()
    def speak(self,text:str)->None:
        if not text.strip(): return
        with self._lock:
            import pyttsx3
            engine=pyttsx3.init("sapi5"); engine.setProperty("rate",self.rate)
            for voice in engine.getProperty("voices") or []:
                haystack=" ".join([str(getattr(voice,"name","")),str(getattr(voice,"languages",""))]).lower()
                if self.language_hint in haystack or "brazil" in haystack or "portugu" in haystack:
                    engine.setProperty("voice",voice.id); break
            engine.say(text); engine.runAndWait(); engine.stop()
