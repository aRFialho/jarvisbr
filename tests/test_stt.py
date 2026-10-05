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
