"""Shared types for ASR backends."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class AsrSegment:
    text: str
    start: float
    end: float
    # Whisper-only diagnostics: average token log-probability, the no-speech
    # head's confidence, and the gzip compression ratio of the decoded text
    # (a hallucination signal — repeating loops compress). `None` from Parakeet
    # (parakeet-mlx exposes no per-sentence confidence).
    avg_logprob: float | None = None
    no_speech_prob: float | None = None
    compression_ratio: float | None = None
