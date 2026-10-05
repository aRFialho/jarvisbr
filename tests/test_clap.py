import numpy as np

from jarvisbr.clap import ClapSequenceDetector
from jarvisbr.events import Gesture


def detector():
    return ClapSequenceDetector(
        threshold=0.04,
        spike_ratio=1.4,
        max_rms=0.7,
        min_gap=0.1,
        max_gap=0.9,
        settle=0.4,
        cooldown=1.0,
        attack_ratio=1.45,
        release_ms=16,
        release_ratio=0.55,
    )


def impulse_block(amp=0.8, size=256):
    x = np.zeros(size, dtype=np.float32)
    x[10] = amp
    x[11] = -amp * 0.8
    x[12] = amp * 0.5
    x[20] = -amp * 0.35
    return x


def tail_block(amp=0.15, size=256):
    x = np.zeros(size, dtype=np.float32)
    x[20:40] = amp
    return x


def quiet_block(size=256):
    return np.zeros(size, dtype=np.float32)


def voice_like_block(size=256, sr=16000, amp=0.18, phase=0.0):
    t = np.arange(size, dtype=np.float32) / sr
    return (
        amp * np.sin(2 * np.pi * 180 * t + phase)
        + amp * 0.35 * np.sin(2 * np.pi * 360 * t + phase)
    ).astype(np.float32)


def test_single_impulse_counts_once():
    d = detector()
    d.feed_block(quiet_block(), 0.90)
    d.feed_block(impulse_block(), 1.00)
    assert d.count == 1
    for i in range(5):
        d.feed_block(tail_block(0.20), 1.02 + i * 0.016)
    assert d.count == 1


def test_relative_drop_rearms_without_absolute_silence():
    d = detector()
    d.feed_block(quiet_block(), 0.90)
    d.feed_block(impulse_block(0.8), 1.00)
    assert d.count == 1

    # AGC deixa uma cauda acima de silêncio absoluto, mas bem menor que o impacto.
    d.feed_block(tail_block(0.12), 1.05)
    d.feed_block(tail_block(0.10), 1.08)
    d.feed_block(impulse_block(0.7), 1.30)
    assert d.count == 2


def test_double_impacts_emit_conversation():
    d = detector()
    d.feed_block(quiet_block(), 0.90)
    d.feed_block(impulse_block(), 1.00)
    d.feed_block(tail_block(0.10), 1.05)
    d.feed_block(tail_block(0.08), 1.08)

    d.feed_block(impulse_block(), 1.30)
    d.feed_block(tail_block(0.10), 1.35)
    d.feed_block(tail_block(0.08), 1.38)

    assert d.feed_block(quiet_block(), 1.75) == Gesture.DOUBLE_CLAP


def test_triple_impacts_emit_agent():
    d = detector()
    d.feed_block(quiet_block(), 0.90)
    for start in (1.00, 1.25, 1.50):
        d.feed_block(impulse_block(), start)
        d.feed_block(tail_block(0.10), start + 0.05)
        d.feed_block(tail_block(0.08), start + 0.08)
    assert d.feed_block(quiet_block(), 1.95) == Gesture.TRIPLE_CLAP


def test_continuous_voice_does_not_increment_every_block():
    d = detector()
    d.feed_block(quiet_block(), 0.90)
    for i in range(20):
        d.feed_block(voice_like_block(phase=i * 0.05), 1.0 + i * 0.016)
    assert d.count <= 1
