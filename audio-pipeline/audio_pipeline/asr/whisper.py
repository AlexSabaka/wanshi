"""Whisper large-v3-turbo backend via mlx-whisper. Language defaults to uk."""
from __future__ import annotations

from pathlib import Path

from .types import AsrSegment

DEFAULT_MODEL = "mlx-community/whisper-large-v3-turbo"

DEFAULT_LANGUAGE = "uk"
DEFAULT_COMPRESSION_RATIO_THRESHOLD = 2.0
DEFAULT_LOGPROB_THRESHOLD = -0.8
DEFAULT_NO_SPEECH_THRESHOLD = 0.6
DEFAULT_HALLUCINATION_SILENCE_THRESHOLD = 2.0


class WhisperBackend:
    name = "whisper"

    def __init__(self, model_id: str = DEFAULT_MODEL):
        self.model_id = model_id

    def transcribe(
        self,
        audio_path: Path,
        *,
        language: str = DEFAULT_LANGUAGE,
        compression_ratio_threshold: float = DEFAULT_COMPRESSION_RATIO_THRESHOLD,
        logprob_threshold: float = DEFAULT_LOGPROB_THRESHOLD,
        no_speech_threshold: float = DEFAULT_NO_SPEECH_THRESHOLD,
    ) -> list[AsrSegment]:
        import mlx_whisper

        result = mlx_whisper.transcribe(
            str(audio_path),
            path_or_hf_repo=self.model_id,
            language=language,
            word_timestamps=False,
            # Anti-hallucination kwargs. Whisper on long audio with silence
            # produces CJK loops and phrase-repetition runaway; these tighten
            # the gates.
            condition_on_previous_text=False,
            compression_ratio_threshold=compression_ratio_threshold,
            logprob_threshold=logprob_threshold,
            no_speech_threshold=no_speech_threshold,
            hallucination_silence_threshold=DEFAULT_HALLUCINATION_SILENCE_THRESHOLD,
        )
        segs = result.get("segments") or []
        if segs:
            return [
                AsrSegment(
                    text=s["text"],
                    start=float(s["start"]),
                    end=float(s["end"]),
                    avg_logprob=_opt_float(s.get("avg_logprob")),
                    no_speech_prob=_opt_float(s.get("no_speech_prob")),
                    compression_ratio=_opt_float(s.get("compression_ratio")),
                )
                for s in segs
            ]
        return [AsrSegment(result.get("text", ""), 0.0, float("inf"))]


def _opt_float(v) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
