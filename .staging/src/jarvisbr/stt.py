from __future__ import annotations

import tempfile
import wave
from pathlib import Path
import numpy as np


class WhisperSTT:
    def __init__(self, model_name: str="small", language: str="pt") -> None:
        self.model_name=model_name; self.language=language; self._model=None
    def _load(self):
        if self._model is None:
            try: from faster_whisper import WhisperModel
            except ImportError as exc: raise RuntimeError('Reconhecimento de voz não instalado. Rode: pip install -e ".[voice]"') from exc
            self._model=WhisperModel(self.model_name,device="auto",compute_type="int8")
        return self._model
    @staticmethod
    def _write_wav(samples: np.ndarray,samplerate:int,path:Path)->None:
        pcm16=(np.clip(samples,-1.0,1.0)*32767.0).astype(np.int16)
        with wave.open(str(path),"wb") as wf:
            wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(samplerate); wf.writeframes(pcm16.tobytes())
    def transcribe(self,samples:np.ndarray,samplerate:int=16000)->str:
        if samples.size==0:return ""
        with tempfile.NamedTemporaryFile(suffix=".wav",delete=False) as tmp:path=Path(tmp.name)
        try:
            self._write_wav(samples,samplerate,path)
            segments,_=self._load().transcribe(str(path),language=self.language,vad_filter=True,beam_size=3)
            return " ".join(segment.text.strip() for segment in segments).strip()
        finally:path.unlink(missing_ok=True)
