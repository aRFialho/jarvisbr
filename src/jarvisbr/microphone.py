from __future__ import annotations

import queue
import time

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
        calibration_seconds: float = 0.25,
        speech_multiplier: float = 3.0,
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

        started = time.monotonic()
        calibration_rms: list[float] = []
        heard = False
        last_voice = started
        captured: list[np.ndarray] = []

        with sd.InputStream(
            device=self.device,
            channels=1,
            samplerate=rate,
            blocksize=blocksize,
            dtype="float32",
            callback=callback,
        ):
            # Primeiro mede apenas o piso ambiente. Isso também absorve qualquer
            # pequeno rastro do TTS que ainda tenha ficado no ambiente.
            calibration_end = started + self.calibration_seconds
            while time.monotonic() < calibration_end:
                try:
                    block = chunks.get(timeout=0.15)
                except queue.Empty:
                    continue
                rms = float(np.sqrt(np.mean(np.square(block))))
                calibration_rms.append(rms)

            noise_rms = (
                float(np.median(calibration_rms))
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
                if rms >= threshold:
                    heard = True
                    last_voice = time.monotonic()

                if heard:
                    captured.append(block)
                    if time.monotonic() - last_voice >= self.silence_seconds:
                        break
                elif time.monotonic() - listen_started >= self.wait_for_speech:
                    break

        if not captured:
            return np.empty(0, dtype=np.float32)

        audio = np.concatenate(captured).astype(np.float32, copy=False)

        # Uma captura extremamente curta ou quase silenciosa não é uma fala.
        duration = audio.size / max(rate, 1)
        overall_rms = float(np.sqrt(np.mean(np.square(audio)))) if audio.size else 0.0
        if duration < 0.20 or overall_rms < threshold * 0.45:
            return np.empty(0, dtype=np.float32)

        return audio
