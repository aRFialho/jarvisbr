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
    """Detecta 2x/3x impactos acústicos por ataque + vale relativo de energia.

    Alguns notebooks com Intel Smart Sound/AGC não retornam silêncio absoluto
    entre palmas. Por isso o detector rearma quando o sinal cai em relação ao
    próprio impacto anterior, em vez de esperar amplitude quase zero.
    """

    def __init__(
        self,
        threshold: float = 0.04,
        spike_ratio: float = 1.55,
        max_rms: float = 0.55,
        min_gap: float = 0.12,
        max_gap: float = 0.95,
        settle: float = 0.45,
        cooldown: float = 1.8,
        refractory: float = 0.08,
        high_freq_ratio: float = 0.0,
        max_event_ms: float = 320.0,
        min_event_ms: float = 0.0,
        attack_ratio: float = 1.65,
        release_ms: float = 32.0,
        release_ratio: float = 0.48,
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
        self.release_ratio = release_ratio

        self.count = 0
        self.first_at = 0.0
        self.last_at = 0.0
        self.cool_until = 0.0

        self.noise_rms = 0.003
        self.prev_rms = 0.003
        self.prev_peak = 0.003

        self.armed = True
        self.hit_peak = 0.0
        self.hit_rms = 0.0
        self.hit_started = 0.0
        self.release_since = 0.0

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
            total = float(np.sum(spectrum[useful]))
            high_ratio = float(np.sum(spectrum[high])) / max(total, 1e-12)
        else:
            high_ratio = 0.0

        return ClapMetrics(peak, rms, high_ratio, zcr)

    def reset_sequence(self) -> None:
        self.count = 0
        self.first_at = 0.0
        self.last_at = 0.0

    def _maybe_emit_sequence(self, now: float) -> Gesture | None:
        if self.count >= 2 and now - self.last_at >= self.settle:
            gesture = Gesture.TRIPLE_CLAP if self.count >= 3 else Gesture.DOUBLE_CLAP
            self.reset_sequence()
            self.cool_until = now + self.cooldown
            return gesture

        if self.count and now - self.last_at > self.max_gap + self.settle:
            self.reset_sequence()
        return None

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

    def _record_event(
        self,
        accepted: bool,
        metrics: ClapMetrics,
        attack: float,
        reason: str,
        now: float,
    ) -> None:
        duration_ms = max(0.0, (now - self.hit_started) * 1000.0) if self.hit_started else 0.0
        self.last_event = ClapEvent(
            accepted=accepted,
            duration_ms=duration_ms,
            peak=metrics.peak,
            rms=metrics.rms,
            crest=metrics.crest,
            high_ratio=metrics.high_ratio,
            zcr=metrics.zcr,
            attack_ratio=attack,
            reason=reason,
        )
        self.event_serial += 1

    def _onset_candidate(self, metrics: ClapMetrics) -> tuple[bool, float, str]:
        local_floor = max(self.noise_rms, self.prev_rms * 0.72, 0.001)
        attack = metrics.rms / max(local_floor, 1e-4)
        peak_rise = metrics.peak / max(self.prev_peak, self.threshold * 0.20, 1e-4)

        reasons: list[str] = []
        if metrics.peak < self.threshold:
            reasons.append("pico baixo")
        if metrics.rms > self.max_rms:
            reasons.append("RMS alto")
        if metrics.crest < self.spike_ratio:
            reasons.append("pouco impulsivo")
        if attack < self.attack_ratio and peak_rise < self.attack_ratio:
            reasons.append("sem ataque brusco")

        return not reasons, max(attack, peak_rise), ", ".join(reasons) or "ok"

    def feed_block(
        self,
        block: np.ndarray,
        now: float | None = None,
        samplerate: int = 16000,
    ) -> Gesture | None:
        current = time.monotonic() if now is None else now
        metrics = self.metrics(block, samplerate)

        if current < self.cool_until:
            self.prev_rms = metrics.rms
            self.prev_peak = metrics.peak
            return None

        gesture = self._maybe_emit_sequence(current)
        if gesture is not None:
            return gesture

        if self.armed:
            accepted, attack, reason = self._onset_candidate(metrics)
            if accepted:
                self.armed = False
                self.hit_peak = max(metrics.peak, self.threshold)
                self.hit_rms = max(metrics.rms, 0.001)
                self.hit_started = current
                self.release_since = 0.0
                self._register_hit(current)
                self._record_event(True, metrics, attack, "impacto aceito", current)
            elif metrics.peak >= self.threshold:
                # Diagnóstico útil sem poluir com cada bloco de silêncio.
                self._record_event(False, metrics, attack, reason, current)

        else:
            # Rearma pela QUEDA RELATIVA ao impacto anterior. Essa é a parte
            # importante para AGC/Intel Smart Sound, que mantém uma cauda alta.
            relative_release = (
                metrics.rms <= self.hit_rms * self.release_ratio
                or metrics.peak <= self.hit_peak * self.release_ratio
            )
            absolute_release = metrics.rms <= max(self.noise_rms * 2.5, 0.008)

            if relative_release or absolute_release:
                if self.release_since == 0.0:
                    self.release_since = current
                elif (current - self.release_since) * 1000.0 >= self.release_ms:
                    self.armed = True
                    self.release_since = 0.0
            else:
                self.release_since = 0.0

            # Failsafe: nunca fica preso indefinidamente após um impacto.
            if (current - self.hit_started) * 1000.0 >= self.max_event_ms:
                self.armed = True
                self.release_since = 0.0

        # Atualiza ruído somente em blocos baixos.
        if metrics.peak < self.threshold * 0.75:
            self.noise_rms = 0.96 * self.noise_rms + 0.04 * min(metrics.rms, self.threshold)

        self.prev_rms = metrics.rms
        self.prev_peak = metrics.peak
        return self._maybe_emit_sequence(current)


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
                block, now=time.monotonic(), samplerate=self.samplerate
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
