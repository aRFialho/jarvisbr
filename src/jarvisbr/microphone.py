from __future__ import annotations

import queue
import time

import numpy as np


class MicrophoneRecorder:
    def __init__(
        self,
        samplerate: int = 16000,
        blocksize: int = 1024,
        speech_rms: float = 0.012,
        silence_seconds: float = 1.0,
        wait_for_speech: float = 3.5,
        max_seconds: float = 12.0,
        device: int | str | None = None,
    ) -> None:
        self.samplerate = samplerate
        self.blocksize = blocksize
        self.speech_rms = speech_rms
        self.silence_seconds = silence_seconds
        self.wait_for_speech = wait_for_speech
        self.max_seconds = max_seconds
        self.device = device

    def record_utterance(self) -> np.ndarray:
        import sounddevice as sd

        chunks: "queue.Queue[np.ndarray]" = queue.Queue()

        def callback(indata, frames, time_info, status) -> None:
            chunks.put(np.asarray(indata[:, 0], dtype=np.float32).copy())

        started = time.monotonic()
        heard = False
        last_voice = started
        captured: list[np.ndarray] = []

        with sd.InputStream(
            device=self.device,
            channels=1,
            samplerate=self.samplerate,
            blocksize=self.blocksize,
            dtype="float32",
            callback=callback,
        ):
            while time.monotonic() - started < self.max_seconds:
                try:
                    block = chunks.get(timeout=0.25)
                except queue.Empty:
                    continue

                rms = float(np.sqrt(np.mean(np.square(block))))
                if rms >= self.speech_rms:
                    heard = True
                    last_voice = time.monotonic()

                if heard:
                    captured.append(block)
                    if time.monotonic() - last_voice >= self.silence_seconds:
                        break
                elif time.monotonic() - started >= self.wait_for_speech:
                    break

        if not captured:
            return np.empty(0, dtype=np.float32)
        return np.concatenate(captured).astype(np.float32, copy=False)
