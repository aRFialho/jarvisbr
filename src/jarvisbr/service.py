from __future__ import annotations

import queue
import threading
import unicodedata
from collections.abc import Callable

from jarvisbr.clap import ClapListener, ClapSequenceDetector
from jarvisbr.hotkey import WindowsHotkey
from jarvisbr.microphone import MicrophoneRecorder
from jarvisbr.stt import WhisperSTT
from jarvisbr.tts import WindowsTTS
from jarvisbr.config import Settings
from jarvisbr.assistant import Assistant
from jarvisbr.events import AssistantState, Gesture


class JarvisService:
    def __init__(
        self,
        settings: Settings,
        *,
        on_state: Callable[[AssistantState], None] | None = None,
        on_level: Callable[[float], None] | None = None,
        on_text: Callable[[str], None] | None = None,
    ) -> None:
        self.settings = settings
        self.on_state = on_state or (lambda _: None)
        self.on_level = on_level or (lambda _: None)
        self.on_text = on_text or (lambda _: None)
        self.stop_event = threading.Event()
        self.external_triggers: "queue.Queue[Gesture]" = queue.Queue()

        detector = ClapSequenceDetector(
            threshold=settings.clap_threshold,
            spike_ratio=settings.clap_spike_ratio,
            max_rms=settings.clap_max_rms,
            min_gap=settings.clap_min_gap,
            max_gap=settings.clap_max_gap,
            settle=settings.clap_settle,
            cooldown=settings.clap_cooldown,
            high_freq_ratio=settings.clap_high_freq_ratio,
            max_event_ms=settings.clap_max_event_ms,
            attack_ratio=settings.clap_attack_ratio,
        )
        self.listener = ClapListener(detector, device=settings.input_device)
        self.recorder = MicrophoneRecorder(device=settings.input_device)
        self.stt = WhisperSTT(
            settings.whisper_model,
            settings.language,
            on_status=self.on_text,
        )
        self.tts = WindowsTTS(settings.tts_rate, settings.language)
        self.assistant = Assistant(settings, self._confirm)
        self.hotkey = WindowsHotkey(
            lambda: self.external_triggers.put(Gesture.HOTKEY),
            lambda: self.external_triggers.put(Gesture.HOTKEY_AGENT),
        )
        self._thread = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self.hotkey.start()
        self._thread = threading.Thread(
            target=self.run, daemon=True, name="jarvis-service"
        )
        self._thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        self.hotkey.stop()
        self.external_triggers.put(Gesture.HOTKEY)

    def _wait_trigger(self) -> Gesture:
        if self.settings.clap_enabled:
            return self.listener.wait(self.external_triggers, self.on_level)

        while not self.stop_event.is_set():
            try:
                return self.external_triggers.get(timeout=0.25)
            except queue.Empty:
                continue
        return Gesture.HOTKEY

    @staticmethod
    def _is_agent_trigger(gesture: Gesture) -> bool:
        return gesture in {Gesture.TRIPLE_CLAP, Gesture.HOTKEY_AGENT}

    def run(self) -> None:
        while not self.stop_event.is_set():
            try:
                self.on_state(AssistantState.IDLE)
                gesture = self._wait_trigger()
                if self.stop_event.is_set():
                    break
                self._interaction(agent_mode=self._is_agent_trigger(gesture))
            except Exception as exc:
                self.on_state(AssistantState.ERROR)
                self.on_text(f"Erro: {exc}")

    def interact_once(self, *, agent_mode: bool = False) -> None:
        """Executa uma interação de voz sem iniciar o loop/hotkeys."""
        self._interaction(agent_mode=agent_mode)

    def _interaction(self, *, agent_mode: bool) -> None:
        self.on_state(AssistantState.LISTENING)
        self._say("Modo agente." if agent_mode else "Sim, Mestre?")
        self.on_state(AssistantState.LISTENING)
        samples = self.recorder.record_utterance()
        if samples.size == 0:
            self._say("Não ouvi nenhum comando.")
            return

        self.on_state(AssistantState.TRANSCRIBING)
        text = self.stt.transcribe(samples, self.recorder.samplerate)
        if not text:
            self._say("Não consegui entender.")
            return

        self.on_text(f"Você: {text}")
        self.on_state(AssistantState.THINKING)
        reply = self.assistant.handle(text, agent_mode=agent_mode)
        self.on_text(f"Jarvis: {reply}")
        self._say(reply)

    def _say(self, text: str) -> None:
        self.on_state(AssistantState.SPEAKING)
        self.tts.speak(text)

    def _confirm(self, description: str) -> bool:
        self.on_state(AssistantState.CONFIRMING)
        self._say(f"Confirma {description}? Diga: confirmo.")
        self.on_state(AssistantState.LISTENING)
        samples = self.recorder.record_utterance()
        answer = (
            self.stt.transcribe(samples, self.recorder.samplerate)
            if samples.size
            else ""
        )
        normalized = "".join(
            char
            for char in unicodedata.normalize("NFD", answer.lower())
            if unicodedata.category(char) != "Mn"
        )
        return "confirmo" in normalized

    def handle_text(self, text: str, *, agent_mode: bool = False) -> str:
        return self.assistant.handle(text, agent_mode=agent_mode)
