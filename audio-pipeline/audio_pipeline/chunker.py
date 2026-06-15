"""Silence-based audio chunker for long files.

Long recordings (≥ ~1 h) are split into per-stage subprocess units so each
unit's peak GPU footprint stays well below the unified-memory budget. We slice
at natural silences (≥ 1.5 s by default) closest to each target chunk length,
with a hard ceiling so we never produce chunks that themselves blow the budget.
"""
from __future__ import annotations

import logging
from typing import Sequence

import numpy as np

from .vad import Segment, SileroVAD

log = logging.getLogger(__name__)

DEFAULT_TARGET_SECONDS = 25 * 60.0
DEFAULT_MAX_SECONDS = 35 * 60.0
DEFAULT_MIN_SILENCE_SECONDS = 1.5
CHUNK_THRESHOLD_SECONDS = 60 * 60.0  # files at or under this stay whole


def find_chunk_boundaries(
    samples: np.ndarray,
    sr: int,
    *,
    target_seconds: float = DEFAULT_TARGET_SECONDS,
    max_seconds: float = DEFAULT_MAX_SECONDS,
    min_silence_seconds: float = DEFAULT_MIN_SILENCE_SECONDS,
) -> list[float]:
    """Return boundary timestamps in seconds. Always starts with 0.0 and ends
    with the audio duration. Each consecutive pair bounds one chunk."""
    duration = len(samples) / sr
    if duration <= max_seconds:
        return [0.0, duration]

    speech = SileroVAD().detect(samples, sr, threshold=0.5, merge_gap_ms=100)
    silences = _invert_speech_to_silences(speech, duration, min_silence_seconds)
    return _walk_boundaries(
        duration,
        silences,
        target_seconds=target_seconds,
        max_seconds=max_seconds,
    )


def _invert_speech_to_silences(
    speech: Sequence[Segment], duration: float, min_silence_seconds: float
) -> list[tuple[float, float]]:
    if not speech:
        return [(0.0, duration)] if duration >= min_silence_seconds else []
    silences: list[tuple[float, float]] = []
    prev_end = 0.0
    for seg in speech:
        if seg.start - prev_end >= min_silence_seconds:
            silences.append((prev_end, seg.start))
        prev_end = seg.end
    if duration - prev_end >= min_silence_seconds:
        silences.append((prev_end, duration))
    return silences


def _walk_boundaries(
    duration: float,
    silences: list[tuple[float, float]],
    *,
    target_seconds: float,
    max_seconds: float,
) -> list[float]:
    boundaries = [0.0]
    while boundaries[-1] + max_seconds < duration:
        target = boundaries[-1] + target_seconds
        hard_limit = boundaries[-1] + max_seconds
        candidates = [
            (s, e) for (s, e) in silences
            if boundaries[-1] < (s + e) / 2 <= hard_limit
        ]
        if candidates:
            best = min(candidates, key=lambda se: abs((se[0] + se[1]) / 2 - target))
            boundaries.append((best[0] + best[1]) / 2)
        else:
            log.warning(
                "no silence available in [%.1f, %.1f]; hard-cutting at %.1f (mid-speech)",
                boundaries[-1], hard_limit, hard_limit,
            )
            boundaries.append(hard_limit)
    boundaries.append(duration)
    return boundaries
