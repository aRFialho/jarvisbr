from __future__ import annotations

import queue
import time
from dataclasses import dataclass
from typing import Callable

import numpy as np

from jarvisbr.events import Gesture


@dataclass(slots=True)
class ClapMetrics:
    peak: float
    rms: float


class ClapSequenceDetector:
    def __init__(self, threshold: float = 0.24, spike_ratio: float = 3.5, max_rms: float = 0.18, min_gap: float = 0.12, max_gap: float = 0.95, settle: float = 0.55, cooldown: float = 1.8, refractory: float = 0.07) -> None:
        self.threshold = threshold
        self.spike_ratio = spike_ratio
        self.max_rms = max_rms
        self.min_gap = min_gap
        self.max_gap = max_gap
        self.settle = settle
        self.cooldown = cooldown
        self.refractory = refractory
        self.count = 0
        self.first_at = 0.0
        self.last_at = 0.0
        self.cool_until = 0.0

    @staticmethod
    def metrics(block: np.ndarray) -> ClapMetrics:
        data = np.asarray(block, dtype=np.float32).reshape(-1)
        if not data.size: return ClapMetrics(0.0, 0.0)
        return ClapMetrics(float(np.max(np.abs(data))), float(np.sqrt(np.mean(np.square(data)))))

    def reset(self) -> None:
        self.count = 0; self.first_at = 0.0; self.last_at = 0.0

    def _is_clap(self, peak: float, rms: float) -> bool:
        return peak >= self.threshold and rms <= self.max_rms and peak / max(rms, 1e-6) >= self.spike_ratio

    def feed_metrics(self, peak: float, rms: float, now: float) -> Gesture | None:
        if now < self.cool_until: return None
        if self.count >= 2 and now - self.last_at >= self.settle:
            gesture = Gesture.TRIPLE_CLAP if self.count >= 3 else Gesture.DOUBLE_CLAP
            self.reset(); self.cool_until = now + self.cooldown; return gesture
        if not self._is_clap(peak, rms):
            if self.count and now - self.last_at > self.max_gap + self.settle: self.reset()
            return None
        if self.last_at and now - self.last_at < self.refractory: return None
        if self.count == 0:
            self.count = 1; self.first_at = self.last_at = now; return None
        gap = now - self.last_at
        if self.min_gap <= gap <= self.max_gap:
            self.count += 1; self.last_at = now
        elif gap > self.max_gap:
            self.count = 1; self.first_at = self.last_at = now
        return None

    def feed_block(self, block: np.ndarray, now: float | None = None) -> Gesture | None:
        m = self.metrics(block)
        return self.feed_metrics(m.peak, m.rms, time.monotonic() if now is None else now)


class ClapListener:
    def __init__(self, detector: ClapSequenceDetector, samplerate: int = 16000, blocksize: int = 512) -> None:
        self.detector = detector; self.samplerate = samplerate; self.blocksize = blocksize

    def wait(self, external_triggers: "queue.Queue[Gesture] | None" = None, on_level: Callable[[float], None] | None = None) -> Gesture:
        result: "queue.Queue[Gesture]" = queue.Queue(maxsize=1)
        def callback(indata, frames, time_info, status) -> None:
            block = np.asarray(indata[:, 0], dtype=np.float32)
            metrics = self.detector.metrics(block)
            if on_level: on_level(metrics.rms)
            gesture = self.detector.feed_metrics(metrics.peak, metrics.rms, time.monotonic())
            if gesture and result.empty(): result.put_nowait(gesture)
        import sounddevice as sd
        with sd.InputStream(channels=1, samplerate=self.samplerate, blocksize=self.blocksize, dtype="float32", callback=callback):
            while True:
                try: return result.get(timeout=0.05)
                except queue.Empty:
                    if external_triggers is not None:
                        try: return external_triggers.get_nowait()
                        except queue.Empty: pass
