from __future__ import annotations

import queue
import time
from collections import deque

import numpy as np


class MicrophoneRecorder:
    def __init__(
        self,
        samplerate: int | None = None,
        blocksize: int | None = None,
        speech_rms: float = 0.012,
        silence_seconds: float = 1.0,
        wait_for_speech: float = 3.5,
        max_seconds: float = 12.0,
        calibration_seconds: float = 0.20,
        speech_multiplier: float = 2.4,
        preroll_seconds: float = 0.50,
        device: int | str | None = None,
    ) -> None:
        self.samplerate = samplerate
        self.blocksize = blocksize
        self.speech_rms = speech_rms
        self.silence_seconds = silence_seconds
        self.wait_for_speech = wait_for_speech
        self.max_seconds = max_seconds
        self.calibration_seconds = calibration_seconds
        self.speech_multiplier = speech_multiplier
        self.preroll_seconds = preroll_seconds
        self.device = device
        self.last_threshold = speech_rms
        self.last_noise_rms = 0.0

    def record_utterance(self) -> np.ndarray:
        import sounddevice as sd

        chunks: "queue.Queue[np.ndarray]" = queue.Queue()

        def callback(indata, frames, time_info, status) -> None:
            chunks.put(np.asarray(indata[:, 0], dtype=np.float32).copy())

        info = sd.query_devices(self.device, "input")
        rate = int(
            self.samplerate
            or float(info.get("default_samplerate", 16000) or 16000)
        )
        blocksize = int(self.blocksize or max(256, rate * 0.064))
        self.samplerate = rate
        self.blocksize = blocksize

        blocks_per_second = rate / blocksize
        preroll_blocks = max(1, int(round(self.preroll_seconds * blocks_per_second)))
        preroll: deque[np.ndarray] = deque(maxlen=preroll_blocks)

        calibration_rms: list[float] = []
        heard = False
        captured: list[np.ndarray] = []

        with sd.InputStream(
            device=self.device,
            channels=1,
            samplerate=rate,
            blocksize=blocksize,
            dtype="float32",
            callback=callback,
        ):
            # Calibra pelo piso mais baixo do ambiente, não pela mediana.
            # Se o usuário começar a falar imediatamente, a fala não "vira ruído".
            calibration_end = time.monotonic() + self.calibration_seconds
            while time.monotonic() < calibration_end:
                try:
                    block = chunks.get(timeout=0.12)
                except queue.Empty:
                    continue
                preroll.append(block)
                rms = float(np.sqrt(np.mean(np.square(block))))
                calibration_rms.append(rms)

            noise_rms = (
                float(np.percentile(calibration_rms, 20))
                if calibration_rms
                else 0.0
            )
            threshold = max(
                self.speech_rms,
                noise_rms * self.speech_multiplier,
            )
            self.last_noise_rms = noise_rms
            self.last_threshold = threshold

            listen_started = time.monotonic()
            last_voice = listen_started

            while time.monotonic() - listen_started < self.max_seconds:
                try:
                    block = chunks.get(timeout=0.25)
                except queue.Empty:
                    continue

                rms = float(np.sqrt(np.mean(np.square(block))))

                if not heard:
                    preroll.append(block)

                if rms >= threshold:
                    if not heard:
                        heard = True
                        captured.extend(list(preroll))
                        preroll.clear()
                    else:
                        captured.append(block)
                    last_voice = time.monotonic()
                    continue

                if heard:
                    captured.append(block)
                    if time.monotonic() - last_voice >= self.silence_seconds:
                        break
                elif time.monotonic() - listen_started >= self.wait_for_speech:
                    break

        if not captured:
            return np.empty(0, dtype=np.float32)

        audio = np.concatenate(captured).astype(np.float32, copy=False)
        duration = audio.size / max(rate, 1)
        overall_rms = float(np.sqrt(np.mean(np.square(audio)))) if audio.size else 0.0

        # Conservador, mas sem descartar frases curtas reais.
        if duration < 0.25 or overall_rms < max(self.speech_rms * 0.8, threshold * 0.30):
            return np.empty(0, dtype=np.float32)

        return audio
