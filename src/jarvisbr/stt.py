from __future__ import annotations

import os
import tempfile
import wave
from collections.abc import Callable
from pathlib import Path

import numpy as np


StatusCallback = Callable[[str], None]


class WhisperSTT:
    def __init__(
        self,
        model_name: str = "small",
        language: str = "pt",
        on_status: StatusCallback | None = None,
    ) -> None:
        self.model_name = model_name
        self.language = language
        self.on_status = on_status or (lambda _: None)
        self._model = None

    def _load(self):
        if self._model is not None:
            return self._model

        # Esse warning é apenas uma limitação de cache no Windows sem symlinks.
        # O download/cache continua funcionando normalmente.
        os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise RuntimeError(
                'Reconhecimento de voz não instalado. Rode: pip install -e ".[voice]"'
            ) from exc

        self.on_status(
            f"Preparando Whisper '{self.model_name}'. "
            "Na primeira execução o modelo pode ser baixado e armazenado em cache."
        )
        self._model = WhisperModel(
            self.model_name,
            device="auto",
            compute_type="int8",
        )
        self.on_status("Whisper pronto.")
        return self._model

    def prepare(self) -> None:
        self._load()

    @staticmethod
    def _write_wav(samples: np.ndarray, samplerate: int, path: Path) -> None:
        pcm16 = (np.clip(samples, -1.0, 1.0) * 32767.0).astype(np.int16)
        with wave.open(str(path), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(samplerate)
            wf.writeframes(pcm16.tobytes())

    def transcribe(self, samples: np.ndarray, samplerate: int = 16000) -> str:
        if samples.size == 0:
            return ""

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            path = Path(tmp.name)

        try:
            self._write_wav(samples, samplerate, path)
            segments, _ = self._load().transcribe(
                str(path),
                language=self.language,
                vad_filter=True,
                beam_size=3,
            )
            return " ".join(
                segment.text.strip()
                for segment in segments
                if segment.text.strip()
            ).strip()
        finally:
            path.unlink(missing_ok=True)
