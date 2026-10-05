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

    @property
    def crest(self) -> float:
        return self.peak / max(self.rms, 1e-6)


class ClapSequenceDetector:
    """Detecta sequências de palmas tratando cada impacto físico como um único evento."""

    def __init__(
        self,
        threshold: float = 0.14,
        spike_ratio: float = 2.4,
        max_rms: float = 0.32,
        min_gap: float = 0.12,
        max_gap: float = 0.95,
        settle: float = 0.45,
        cooldown: float = 1.8,
        refractory: float = 0.06,
        rearm_seconds: float = 0.08,
        release_ratio: float = 0.55,
    ) -> None:
        self.threshold = threshold
        self.spike_ratio = spike_ratio
        self.max_rms = max_rms
        self.min_gap = min_gap
        self.max_gap = max_gap
        self.settle = settle
        self.cooldown = cooldown
        self.refractory = refractory
        self.rearm_seconds = rearm_seconds
        self.release_ratio = release_ratio

        self.count = 0
        self.first_at = 0.0
        self.last_at = 0.0
        self.cool_until = 0.0

        # Um impacto de palma ocupa vários blocos de áudio. Depois de aceitar
        # um impacto, o detector desarma até o sinal voltar perto do silêncio.
        self.armed = True
        self.quiet_since = 0.0
        self.last_hit_at = 0.0

    @staticmethod
    def metrics(block: np.ndarray) -> ClapMetrics:
        data = np.asarray(block, dtype=np.float32).reshape(-1)
        if not data.size:
            return ClapMetrics(0.0, 0.0)
        return ClapMetrics(
            float(np.max(np.abs(data))),
            float(np.sqrt(np.mean(np.square(data)))),
        )

    def reset_sequence(self) -> None:
        self.count = 0
        self.first_at = 0.0
        self.last_at = 0.0

    def reset(self) -> None:
        self.reset_sequence()
        self.armed = True
        self.quiet_since = 0.0
        self.last_hit_at = 0.0

    def is_clap(self, peak: float, rms: float) -> bool:
        crest = peak / max(rms, 1e-6)
        return (
            peak >= self.threshold
            and rms <= self.max_rms
            and crest >= self.spike_ratio
        )

    def _release_levels(self) -> tuple[float, float]:
        # Pequenos pisos evitam que thresholds muito baixos tornem impossível
        # rearmar o detector em microfones com ruído digital residual.
        peak_release = max(self.threshold * self.release_ratio, 0.003)
        rms_release = max(self.threshold * self.release_ratio * 0.65, 0.0015)
        return peak_release, rms_release

    def _update_rearm(self, peak: float, rms: float, now: float) -> None:
        if self.armed:
            return

        peak_release, rms_release = self._release_levels()
        quiet = peak <= peak_release and rms <= rms_release

        if not quiet:
            self.quiet_since = 0.0
            return

        if self.quiet_since == 0.0:
            self.quiet_since = now
            return

        if now - self.quiet_since >= self.rearm_seconds:
            self.armed = True
            self.quiet_since = 0.0

    def feed_metrics(self, peak: float, rms: float, now: float) -> Gesture | None:
        if now < self.cool_until:
            return None

        # Finaliza a sequência depois que houve tempo suficiente para uma
        # possível terceira palma.
        if self.count >= 2 and now - self.last_at >= self.settle:
            gesture = (
                Gesture.TRIPLE_CLAP
                if self.count >= 3
                else Gesture.DOUBLE_CLAP
            )
            self.reset_sequence()
            self.cool_until = now + self.cooldown
            return gesture

        self._update_rearm(peak, rms, now)

        if not self.armed:
            if self.count and now - self.last_at > self.max_gap + self.settle:
                self.reset_sequence()
            return None

        if not self.is_clap(peak, rms):
            if self.count and now - self.last_at > self.max_gap + self.settle:
                self.reset_sequence()
            return None

        if self.last_at and now - self.last_at < self.refractory:
            return None

        # Aceita exatamente um evento e desarma até o áudio voltar ao silêncio.
        self.armed = False
        self.quiet_since = 0.0
        self.last_hit_at = now

        if self.count == 0:
            self.count = 1
            self.first_at = self.last_at = now
            return None

        gap = now - self.last_at
        if self.min_gap <= gap <= self.max_gap:
            self.count += 1
            self.last_at = now
        elif gap > self.max_gap:
            self.count = 1
            self.first_at = self.last_at = now
        return None

    def feed_block(self, block: np.ndarray, now: float | None = None) -> Gesture | None:
        metrics = self.metrics(block)
        return self.feed_metrics(
            metrics.peak,
            metrics.rms,
            time.monotonic() if now is None else now,
        )


class ClapListener:
    def __init__(
        self,
        detector: ClapSequenceDetector,
        samplerate: int = 16000,
        blocksize: int = 256,
        device: int | str | None = None,
    ) -> None:
        self.detector = detector
        self.samplerate = samplerate
        self.blocksize = blocksize
        self.device = device

    def wait(
        self,
        external_triggers: "queue.Queue[Gesture] | None" = None,
        on_level: Callable[[float], None] | None = None,
    ) -> Gesture:
        result: "queue.Queue[Gesture]" = queue.Queue(maxsize=1)

        def callback(indata, frames, time_info, status) -> None:
            block = np.asarray(indata[:, 0], dtype=np.float32)
            metrics = self.detector.metrics(block)
            if on_level:
                on_level(metrics.rms)
            gesture = self.detector.feed_metrics(
                metrics.peak, metrics.rms, time.monotonic()
            )
            if gesture and result.empty():
                result.put_nowait(gesture)

        import sounddevice as sd

        with sd.InputStream(
            device=self.device,
            channels=1,
            samplerate=self.samplerate,
            blocksize=self.blocksize,
            dtype="float32",
            callback=callback,
        ):
            while True:
                try:
                    return result.get(timeout=0.05)
                except queue.Empty:
                    if external_triggers is not None:
                        try:
                            return external_triggers.get_nowait()
                        except queue.Empty:
                            pass
