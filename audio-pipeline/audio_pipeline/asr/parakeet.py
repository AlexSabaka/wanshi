"""Parakeet TDT v3 backend via parakeet-mlx."""
from __future__ import annotations

from pathlib import Path

from .types import AsrSegment

DEFAULT_MODEL = "mlx-community/parakeet-tdt-0.6b-v3"

# chunk_duration + overlap_duration engage parakeet-mlx's internal long-audio
# chunking. Without these the whole mel-spectrogram is eval'd in one tensor
# and busts Metal's buffer limit on long files.
DEFAULT_CHUNK_DURATION = 120.0
DEFAULT_OVERLAP_DURATION = 15.0


class ParakeetBackend:
    name = "parakeet"

    def __init__(self, model_id: str = DEFAULT_MODEL):
        from parakeet_mlx import from_pretrained

        self.model = from_pretrained(model_id)

    def transcribe(
        self,
        audio_path: Path,
        *,
        chunk_duration: float = DEFAULT_CHUNK_DURATION,
        overlap_duration: float = DEFAULT_OVERLAP_DURATION,
    ) -> list[AsrSegment]:
        result = self.model.transcribe(
            str(audio_path),
            chunk_duration=chunk_duration,
            overlap_duration=overlap_duration,
        )
        sentences = getattr(result, "sentences", None) or []
        if sentences:
            return [AsrSegment(s.text, float(s.start), float(s.end)) for s in sentences]
        # fallback: single segment with full text and unknown bounds
        return [AsrSegment(result.text, 0.0, float("inf"))]
