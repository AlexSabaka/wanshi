"""Silero VAD wrapper. Returns merged speech segments in seconds."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

# Silero v5 processes audio in 512-sample windows at 16 kHz. Hardcoding the
# stride lets us reconstruct frame timestamps without round-tripping through
# the model again. See `silero_vad.utils_vad.get_speech_timestamps`.
SILERO_FRAME_SAMPLES_16K = 512


@dataclass
class Segment:
    start: float
    end: float


@dataclass
class VadProbs:
    """Frame-by-frame speech probabilities from Silero, plus the params used
    so an inspector can render a faithful ribbon. `frames_u8` is the raw
    probability quantized to uint8 (0–255) for compact JSON storage."""

    frames_u8: list[int]
    frame_stride: int
    sample_rate: int
    threshold: float


class SileroVAD:
    def __init__(self):
        from silero_vad import load_silero_vad

        self.model = load_silero_vad()

    def detect(
        self,
        samples: np.ndarray,
        sr: int = 16_000,
        threshold: float = 0.5,
        merge_gap_ms: int = 300,
        min_speech_ms: int = 250,
    ) -> list[Segment]:
        segs, _ = self.detect_with_probs(
            samples,
            sr=sr,
            threshold=threshold,
            merge_gap_ms=merge_gap_ms,
            min_speech_ms=min_speech_ms,
        )
        return segs

    def detect_with_probs(
        self,
        samples: np.ndarray,
        sr: int = 16_000,
        threshold: float = 0.5,
        merge_gap_ms: int = 300,
        min_speech_ms: int = 250,
    ) -> tuple[list[Segment], VadProbs]:
        """Same merged segments as `detect`, plus the per-frame probability
        ribbon. The model is single-pass for segments — we keep the
        intermediate scores `get_speech_timestamps` would discard."""
        import torch
        from silero_vad import get_speech_timestamps

        wav = torch.from_numpy(samples)
        raw = get_speech_timestamps(
            wav,
            self.model,
            threshold=threshold,
            sampling_rate=sr,
            return_seconds=True,
            min_speech_duration_ms=min_speech_ms,
        )
        segs = [Segment(float(s["start"]), float(s["end"])) for s in raw]
        merged = _merge_close(segs, merge_gap_ms / 1000.0)

        # Second pass for the probability ribbon. Silero's session is
        # stateful: reset_states then walk frame-by-frame.
        self.model.reset_states()
        stride = SILERO_FRAME_SAMPLES_16K
        frames_u8: list[int] = []
        for start in range(0, len(samples) - stride + 1, stride):
            frame = wav[start : start + stride]
            p = float(self.model(frame, sr).item())
            frames_u8.append(int(round(max(0.0, min(1.0, p)) * 255.0)))
        self.model.reset_states()

        return merged, VadProbs(
            frames_u8=frames_u8,
            frame_stride=stride,
            sample_rate=sr,
            threshold=threshold,
        )


def _merge_close(segs: list[Segment], gap_seconds: float) -> list[Segment]:
    if not segs:
        return segs
    out = [segs[0]]
    for s in segs[1:]:
        if s.start - out[-1].end <= gap_seconds:
            out[-1] = Segment(out[-1].start, s.end)
        else:
            out.append(s)
    return out
