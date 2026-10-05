from jarvisbr.clap import ClapSequenceDetector
from jarvisbr.events import Gesture

def detector():return ClapSequenceDetector(threshold=0.2,spike_ratio=3.0,max_rms=0.15,min_gap=0.1,max_gap=0.9,settle=0.5,cooldown=1.0)
def test_double_clap_waits_then_emits():
 d=detector();assert d.feed_metrics(0.7,0.08,1.0) is None;assert d.feed_metrics(0.7,0.08,1.3) is None;assert d.feed_metrics(0.01,0.01,1.81)==Gesture.DOUBLE_CLAP
def test_triple_clap_becomes_agent_mode():
 d=detector();d.feed_metrics(0.7,0.08,1.0);d.feed_metrics(0.7,0.08,1.3);d.feed_metrics(0.7,0.08,1.6);assert d.feed_metrics(0.01,0.01,2.11)==Gesture.TRIPLE_CLAP
def test_sustained_audio_is_not_a_clap():
 d=detector();assert d.feed_metrics(0.4,0.25,1.0) is None;assert d.count==0
