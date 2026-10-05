from jarvisbr.clap import ClapSequenceDetector
from jarvisbr.events import Gesture


def detector():
    return ClapSequenceDetector(
        threshold=0.2,
        spike_ratio=3.0,
        max_rms=0.15,
        min_gap=0.1,
        max_gap=0.9,
        settle=0.5,
        cooldown=1.0,
        rearm_seconds=0.08,
    )


def quiet_rearm(d, start):
    d.feed_metrics(0.01, 0.005, start)
    d.feed_metrics(0.01, 0.005, start + 0.09)


def test_double_clap_waits_then_emits():
    d = detector()
    assert d.feed_metrics(0.7, 0.08, 1.0) is None
    quiet_rearm(d, 1.05)
    assert d.feed_metrics(0.7, 0.08, 1.3) is None
    quiet_rearm(d, 1.35)
    assert d.feed_metrics(0.01, 0.01, 1.81) == Gesture.DOUBLE_CLAP


def test_triple_clap_becomes_agent_mode():
    d = detector()
    d.feed_metrics(0.7, 0.08, 1.0)
    quiet_rearm(d, 1.05)
    d.feed_metrics(0.7, 0.08, 1.3)
    quiet_rearm(d, 1.35)
    d.feed_metrics(0.7, 0.08, 1.6)
    quiet_rearm(d, 1.65)
    assert d.feed_metrics(0.01, 0.01, 2.11) == Gesture.TRIPLE_CLAP


def test_sustained_audio_is_not_a_clap():
    d = detector()
    assert d.feed_metrics(0.4, 0.25, 1.0) is None
    assert d.count == 0


def test_one_physical_hit_spanning_many_blocks_counts_once():
    d = detector()
    assert d.feed_metrics(0.7, 0.08, 1.00) is None
    assert d.count == 1

    # Mesmo impacto decaindo ao longo de vários blocos.
    for t, peak, rms in [
        (1.02, 0.65, 0.09),
        (1.04, 0.50, 0.08),
        (1.06, 0.35, 0.06),
        (1.08, 0.25, 0.04),
    ]:
        assert d.feed_metrics(peak, rms, t) is None
        assert d.count == 1


def test_requires_quiet_period_before_counting_next_hit():
    d = detector()
    d.feed_metrics(0.7, 0.08, 1.0)

    # Dois blocos baixos, mas ainda menos que 80 ms de silêncio.
    d.feed_metrics(0.01, 0.005, 1.05)
    d.feed_metrics(0.01, 0.005, 1.10)
    d.feed_metrics(0.7, 0.08, 1.12)
    assert d.count == 1

    # Agora desarma/arma corretamente e aceita a próxima batida.
    d.feed_metrics(0.01, 0.005, 1.20)
    d.feed_metrics(0.01, 0.005, 1.29)
    d.feed_metrics(0.7, 0.08, 1.40)
    assert d.count == 2
