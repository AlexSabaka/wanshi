"""ASR backend factory. Each backend wraps a model and emits AsrSegment lists."""
from __future__ import annotations

from .parakeet import ParakeetBackend
from .types import AsrSegment
from .whisper import WhisperBackend

BACKENDS: dict[str, type] = {
    "parakeet": ParakeetBackend,
    "whisper": WhisperBackend,
}

__all__ = ["AsrSegment", "ParakeetBackend", "WhisperBackend", "BACKENDS"]
