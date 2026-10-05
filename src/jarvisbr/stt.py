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

        try:
            from faster_whisper.vad import VadOptions, get_speech_timestamps

            speech = get_speech_timestamps(
                audio,
                VadOptions(
                    threshold=0.65,
                    min_speech_duration_ms=250,
                    min_silence_duration_ms=300,
                    speech_pad_ms=120,
                ),
                sampling_rate=self.TARGET_SAMPLE_RATE,
            )
            speech_ms = sum(
                max(0, int(item["end"]) - int(item["start"]))
                for item in speech
            ) * 1000.0 / self.TARGET_SAMPLE_RATE
            if not speech or speech_ms < 250.0:
                self.on_status("VAD: nenhuma fala confiável detectada.")
                return ""
            self.on_status(f"VAD: {speech_ms:.0f} ms de fala detectada.")
        except Exception as exc:
            self.on_status(f"VAD prévio indisponível: {exc}")

        segments, _ = self._load().transcribe(
            audio,
            language=self.language,
            vad_filter=True,
            beam_size=3,
            temperature=0.0,
            condition_on_previous_text=False,
            no_speech_threshold=0.60,
            log_prob_threshold=-1.0,
            compression_ratio_threshold=2.4,
        )

        accepted: list[str] = []
        for segment in segments:
            text = segment.text.strip()
            if not text:
                continue

            no_speech_prob = float(
                getattr(segment, "no_speech_prob", 0.0) or 0.0
            )
            avg_logprob = float(
                getattr(segment, "avg_logprob", 0.0) or 0.0
            )

            # Combinação conservadora: se o próprio Whisper diz que há grande
            # chance de não haver fala e a confiança textual também é baixa,
            # descartamos o segmento em vez de inventar uma frase.
            if no_speech_prob >= 0.60 and avg_logprob <= -0.80:
                continue

            accepted.append(text)

        return " ".join(accepted).strip()
