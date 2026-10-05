import numpy as np

from jarvisbr.stt import WhisperSTT


def test_resample_keeps_16khz_audio_unchanged():
    audio = np.linspace(-0.5, 0.5, 1600, dtype=np.float32)
    result = WhisperSTT._resample_to_model_rate(audio, 16000)
    assert result.dtype == np.float32
    assert result.shape == audio.shape
    assert np.allclose(result, audio)


def test_resample_44100_to_16000():
    audio = np.sin(
        2 * np.pi * 440 * np.arange(44100, dtype=np.float32) / 44100
    ).astype(np.float32)
    result = WhisperSTT._resample_to_model_rate(audio, 44100)
    assert result.dtype == np.float32
    assert abs(result.size - 16000) <= 1
    assert np.max(np.abs(result)) <= 1.01


class _FakeModel:
    def __init__(self, segments):
        self._segments = segments

    def transcribe(self, audio, **kwargs):
        return iter(self._segments), object()


class _Segment:
    def __init__(self, text, no_speech_prob, avg_logprob):
        self.text = text
        self.no_speech_prob = no_speech_prob
        self.avg_logprob = avg_logprob


def test_discards_low_confidence_no_speech_hallucination():
    stt = WhisperSTT()
    stt._model = _FakeModel([
        _Segment(
            "Um abraço e até o próximo vídeo.",
            no_speech_prob=0.92,
            avg_logprob=-1.25,
        )
    ])
    audio = np.ones(16000, dtype=np.float32) * 0.02
    assert stt.transcribe(audio, 16000) == ""


def test_keeps_confident_speech_segment():
    stt = WhisperSTT()
    stt._model = _FakeModel([
        _Segment(
            "Que horas são?",
            no_speech_prob=0.08,
            avg_logprob=-0.20,
        )
    ])
    audio = np.ones(16000, dtype=np.float32) * 0.05
    assert stt.transcribe(audio, 16000) == "Que horas são?"
