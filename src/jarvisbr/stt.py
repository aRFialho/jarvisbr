from __future__ import annotations

import os
from collections.abc import Callable

import numpy as np


StatusCallback = Callable[[str], None]


class WhisperSTT:
    TARGET_SAMPLE_RATE = 16000

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

    @classmethod
    def _resample_to_model_rate(
        cls,
        samples: np.ndarray,
        samplerate: int,
    ) -> np.ndarray:
        data = np.asarray(samples, dtype=np.float32).reshape(-1)
        if data.size == 0:
            return data
        if samplerate <= 0:
            raise ValueError("Taxa de amostragem inválida")
        if samplerate == cls.TARGET_SAMPLE_RATE:
            return np.ascontiguousarray(data, dtype=np.float32)

        output_size = max(
            1,
            int(round(data.size * cls.TARGET_SAMPLE_RATE / samplerate)),
        )
        source_positions = np.arange(data.size, dtype=np.float64)
        target_positions = np.linspace(
            0.0,
            float(data.size - 1),
            output_size,
            dtype=np.float64,
        )
        resampled = np.interp(target_positions, source_positions, data)
        return np.ascontiguousarray(resampled, dtype=np.float32)

    def transcribe(self, samples: np.ndarray, samplerate: int = 16000) -> str:
        if samples.size == 0:
            return ""

        audio = self._resample_to_model_rate(samples, samplerate)
        segments, _ = self._load().transcribe(
            audio,
            language=self.language,
            vad_filter=True,
            beam_size=3,
        )
        return " ".join(
            segment.text.strip()
            for segment in segments
            if segment.text.strip()
        ).strip()
