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
    high_ratio: float = 0.0
    zcr: float = 0.0

    @property
    def crest(self) -> float:
        return self.peak / max(self.rms, 1e-6)


@dataclass(slots=True)
class ClapEvent:
    accepted: bool
    duration_ms: float
    peak: float
    rms: float
    crest: float
    high_ratio: float
    zcr: float
    attack_ratio: float
    reason: str


class ClapSequenceDetector:
    """Detector de palmas baseado em eventos acústicos curtos e transientes."""

    def __init__(
        self,
        threshold: float = 0.04,
        spike_ratio: float = 1.8,
        max_rms: float = 0.40,
        min_gap: float = 0.12,
        max_gap: float = 0.95,
        settle: float = 0.45,
        cooldown: float = 1.8,
        refractory: float = 0.06,
        high_freq_ratio: float = 0.16,
        max_event_ms: float = 240.0,
        min_event_ms: float = 12.0,
        attack_ratio: float = 2.0,
        release_ms: float = 55.0,
    ) -> None:
        self.threshold = threshold
        self.spike_ratio = spike_ratio
        self.max_rms = max_rms
        self.min_gap = min_gap
        self.max_gap = max_gap
        self.settle = settle
        self.cooldown = cooldown
        self.refractory = refractory
        self.high_freq_ratio = high_freq_ratio
        self.max_event_ms = max_event_ms
        self.min_event_ms = min_event_ms
        self.attack_ratio = attack_ratio
        self.release_ms = release_ms

        self.count = 0
        self.first_at = 0.0
        self.last_at = 0.0
        self.cool_until = 0.0

        self.noise_rms = 0.003
        self.event_active = False
        self.event_rejected = False
        self.event_start = 0.0
        self.event_quiet_since = 0.0
        self.event_noise_rms = self.noise_rms
        self.event_peak = 0.0
        self.event_rms = 0.0
        self.event_crest = 0.0
        self.event_high = 0.0
        self.event_zcr = 0.0

        self.last_event: ClapEvent | None = None
        self.event_serial = 0
        self.last_hit_at = 0.0

    @staticmethod
    def metrics(block: np.ndarray, samplerate: int = 16000) -> ClapMetrics:
        data = np.asarray(block, dtype=np.float32).reshape(-1)
        if not data.size:
            return ClapMetrics(0.0, 0.0, 0.0, 0.0)

        peak = float(np.max(np.abs(data)))
        rms = float(np.sqrt(np.mean(np.square(data))))

        centered = data - float(np.mean(data))
        signs = np.signbit(centered)
        zcr = float(np.mean(signs[1:] != signs[:-1])) if centered.size > 1 else 0.0

        if centered.size >= 32:
            windowed = centered * np.hanning(centered.size)
            spectrum = np.abs(np.fft.rfft(windowed)) ** 2
            freqs = np.fft.rfftfreq(centered.size, d=1.0 / samplerate)
            useful = (freqs >= 250.0) & (freqs <= min(7500.0, samplerate / 2.0))
            high = (freqs >= 1800.0) & useful
            total_energy = float(np.sum(spectrum[useful]))
            high_energy = float(np.sum(spectrum[high]))
            high_ratio = high_energy / max(total_energy, 1e-12)
        else:
            high_ratio = 0.0

        return ClapMetrics(peak, rms, high_ratio, zcr)

    def reset_sequence(self) -> None:
        self.count = 0
        self.first_at = 0.0
        self.last_at = 0.0

    def _start_event(self, metrics: ClapMetrics, now: float) -> None:
        self.event_active = True
        self.event_rejected = False
        self.event_start = now
        self.event_quiet_since = 0.0
        self.event_noise_rms = max(self.noise_rms, 0.001)
        self.event_peak = metrics.peak
        self.event_rms = metrics.rms
        self.event_crest = metrics.crest
        self.event_high = metrics.high_ratio
        self.event_zcr = metrics.zcr

    def _accumulate_event(self, metrics: ClapMetrics) -> None:
        self.event_peak = max(self.event_peak, metrics.peak)
        self.event_rms = max(self.event_rms, metrics.rms)
        self.event_crest = max(self.event_crest, metrics.crest)
        self.event_high = max(self.event_high, metrics.high_ratio)
        self.event_zcr = max(self.event_zcr, metrics.zcr)

    def _release_levels(self) -> tuple[float, float]:
        peak_release = max(self.threshold * 0.35, 0.010)
        rms_release = max(self.noise_rms * 2.2, self.threshold * 0.12, 0.004)
        return peak_release, rms_release

    def _finish_event(self, now: float) -> bool:
        duration_ms = max(0.0, (now - self.event_start) * 1000.0)
        attack = self.event_rms / max(self.event_noise_rms, 1e-4)

        reasons: list[str] = []
        if duration_ms < self.min_event_ms:
            reasons.append("curto demais")
        if duration_ms > self.max_event_ms:
            reasons.append("sustentado/fala")
        if self.event_peak < self.threshold:
            reasons.append("pico baixo")
        if self.event_rms > self.max_rms:
            reasons.append("RMS alto")
        if self.event_crest < self.spike_ratio:
            reasons.append("pouco impulsivo")
        if self.event_high < self.high_freq_ratio:
            reasons.append("pouca alta frequência")
        if attack < self.attack_ratio:
            reasons.append("ataque fraco")
        if self.event_rejected:
            reasons.append("evento longo")

        accepted = not reasons
        event = ClapEvent(
            accepted=accepted,
            duration_ms=duration_ms,
            peak=self.event_peak,
            rms=self.event_rms,
            crest=self.event_crest,
            high_ratio=self.event_high,
            zcr=self.event_zcr,
            attack_ratio=attack,
            reason="ok" if accepted else ", ".join(dict.fromkeys(reasons)),
        )
        self.last_event = event
        self.event_serial += 1

        self.event_active = False
        self.event_rejected = False
        self.event_quiet_since = 0.0
        return accepted

    def _register_hit(self, now: float) -> None:
        self.last_hit_at = now
        if self.count == 0:
            self.count = 1
            self.first_at = self.last_at = now
            return

        gap = now - self.last_at
        if self.min_gap <= gap <= self.max_gap:
            self.count += 1
            self.last_at = now
        elif gap > self.max_gap:
            self.count = 1
            self.first_at = self.last_at = now

    def _maybe_emit_sequence(self, now: float) -> Gesture | None:
        if self.count >= 2 and now - self.last_at >= self.settle:
            gesture = Gesture.TRIPLE_CLAP if self.count >= 3 else Gesture.DOUBLE_CLAP
            self.reset_sequence()
            self.cool_until = now + self.cooldown
            return gesture

        if self.count and now - self.last_at > self.max_gap + self.settle:
            self.reset_sequence()
        return None

    def feed_block(
        self,
        block: np.ndarray,
        now: float | None = None,
        samplerate: int = 16000,
    ) -> Gesture | None:
        current = time.monotonic() if now is None else now
        metrics = self.metrics(block, samplerate)

        if current < self.cool_until:
            return None

        gesture = self._maybe_emit_sequence(current)
        if gesture is not None:
            return gesture

        if not self.event_active:
            if metrics.peak < self.threshold:
                # EMA lenta do piso de ruído enquanto não há evento.
                self.noise_rms = 0.97 * self.noise_rms + 0.03 * min(metrics.rms, self.threshold)
                return None

            self._start_event(metrics, current)
            return None

        self._accumulate_event(metrics)
        duration_ms = (current - self.event_start) * 1000.0
        if duration_ms > self.max_event_ms:
            self.event_rejected = True

        peak_release, rms_release = self._release_levels()
        quiet = metrics.peak <= peak_release and metrics.rms <= rms_release

        if quiet:
            if self.event_quiet_since == 0.0:
                self.event_quiet_since = current
            elif (current - self.event_quiet_since) * 1000.0 >= self.release_ms:
                accepted = self._finish_event(current)
                if accepted:
                    self._register_hit(current)
                return self._maybe_emit_sequence(current)
        else:
            self.event_quiet_since = 0.0

        return None


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
            metrics = self.detector.metrics(block, self.samplerate)
            if on_level:
                on_level(metrics.rms)
            gesture = self.detector.feed_block(
                block,
                now=time.monotonic(),
                samplerate=self.samplerate,
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
