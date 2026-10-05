import numpy as np

from jarvisbr.clap import ClapSequenceDetector
from jarvisbr.events import Gesture


def detector():
    return ClapSequenceDetector(
        threshold=0.04,
        spike_ratio=1.6,
        max_rms=0.6,
        min_gap=0.1,
        max_gap=0.9,
        settle=0.4,
        cooldown=1.0,
        high_freq_ratio=0.10,
        max_event_ms=220,
        min_event_ms=10,
        attack_ratio=1.5,
        release_ms=30,
    )


def impulse_block(amp=0.8, size=256):
    x = np.zeros(size, dtype=np.float32)
    x[10] = amp
    x[11] = -amp * 0.8
    x[12] = amp * 0.5
    x[20] = -amp * 0.35
    return x


def quiet_block(size=256):
    return np.zeros(size, dtype=np.float32)


def voice_like_block(size=256, sr=16000, amp=0.18):
    t = np.arange(size, dtype=np.float32) / sr
    return (
        amp * np.sin(2 * np.pi * 180 * t)
        + amp * 0.35 * np.sin(2 * np.pi * 360 * t)
        + amp * 0.15 * np.sin(2 * np.pi * 720 * t)
    ).astype(np.float32)


def finish_event(d, start):
    d.feed_block(quiet_block(), start + 0.05)
    d.feed_block(quiet_block(), start + 0.09)


def test_impulse_is_accepted_as_one_clap():
    d = detector()
    d.feed_block(impulse_block(), 1.0)
    finish_event(d, 1.0)
    assert d.last_event is not None
    assert d.last_event.accepted
    assert d.count == 1


def test_sustained_voice_is_rejected():
    d = detector()
    start = 1.0
    for i in range(20):
        d.feed_block(voice_like_block(), start + i * 0.016)
    finish_event(d, start + 0.32)
    assert d.last_event is not None
    assert not d.last_event.accepted
    assert d.count == 0


def test_double_clap_emits_conversation():
    d = detector()

    d.feed_block(impulse_block(), 1.0)
    finish_event(d, 1.0)

    d.feed_block(impulse_block(), 1.30)
    finish_event(d, 1.30)

    result = d.feed_block(quiet_block(), 1.80)
    assert result == Gesture.DOUBLE_CLAP


def test_triple_clap_emits_agent():
    d = detector()

    for start in (1.0, 1.25, 1.50):
        d.feed_block(impulse_block(), start)
        finish_event(d, start)

    result = d.feed_block(quiet_block(), 2.0)
    assert result == Gesture.TRIPLE_CLAP


def test_one_long_impact_does_not_count_multiple_times():
    d = detector()
    start = 1.0
    for i, amp in enumerate((0.8, 0.7, 0.55, 0.4, 0.25)):
        d.feed_block(impulse_block(amp), start + i * 0.016)
    finish_event(d, start + 0.08)
    assert d.count == 1
