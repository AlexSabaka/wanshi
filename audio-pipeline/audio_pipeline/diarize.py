"""Speaker diarization via the full pyannote pipeline (anonymous labels).

Emits anonymous `SPEAKER_00`, `SPEAKER_01`, … labels — no enrollment. Labels are
**not stable across sessions** (same person may be SPEAKER_00 in one recording and
SPEAKER_01 in the next). Auto-detects MPS on Apple Silicon; pyannote defaults to
CPU otherwise, which makes diarization ~real-time instead of ~10x realtime.
"""
from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

log = logging.getLogger(__name__)

DEFAULT_DIARIZATION_PIPELINE = "pyannote/speaker-diarization-3.1"


def _autodetect_device(override: str | None = None):
    import torch

    if override:
        return torch.device(override)
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    denom = float(np.linalg.norm(a)) * float(np.linalg.norm(b)) + 1e-9
    return float(np.dot(a, b) / denom)


class Diarizer:
    """Full pyannote diarization pipeline. No enrollment required."""

    def __init__(self, model_id: str = DEFAULT_DIARIZATION_PIPELINE, device: str | None = None):
        from pyannote.audio import Pipeline

        self.pipeline = Pipeline.from_pretrained(model_id)
        dev = _autodetect_device(device)
        log.info("Diarizer pipeline on %s", dev)
        self.pipeline.to(dev)

    def diarize(
        self,
        audio_path: Path,
        *,
        num_speakers: int | None = None,
    ) -> tuple[list[tuple[float, float, str]], dict[str, np.ndarray]]:
        """Return (turns, embeddings). Embeddings dict maps each speaker label
        to its centroid embedding when pyannote provides one; empty dict for
        older pyannote versions that return a bare Annotation."""
        kwargs: dict = {}
        if num_speakers is not None:
            kwargs["num_speakers"] = int(num_speakers)
        result = self.pipeline(str(audio_path), **kwargs)
        # pyannote 3.4+/community-1 wraps the Annotation in a DiarizeOutput
        # (.speaker_diarization, .speaker_embeddings). Older versions return the
        # Annotation directly. Handle both.
        annotation = getattr(result, "speaker_diarization", result)
        raw_embeddings = getattr(result, "speaker_embeddings", None)

        turns: list[tuple[float, float, str]] = []
        for turn, _, label in annotation.itertracks(yield_label=True):
            turns.append((float(turn.start), float(turn.end), str(label)))

        embeddings = _embeddings_to_dict(annotation, raw_embeddings)
        return turns, embeddings


def _embeddings_to_dict(annotation, raw) -> dict[str, np.ndarray]:
    """Normalise pyannote's speaker-embedding output to `{label: vector}`.

    Handles `None` (older pipelines), 2D `np.ndarray` of shape (n_speakers, dim)
    (pyannote 3.4+), and `dict[str, vector]` (replayed saved artifacts). Never use
    `arr or {}` on a numpy array — truthiness raises on multi-element arrays.
    """
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return {
            str(k): np.asarray(v, dtype=np.float32).flatten()
            for k, v in raw.items()
        }
    arr = np.asarray(raw)
    if arr.size == 0 or arr.ndim < 2 or arr.shape[0] == 0:
        return {}
    labels = list(annotation.labels())
    if len(labels) != arr.shape[0]:
        n = min(len(labels), arr.shape[0])
        labels = labels[:n]
        arr = arr[:n]
    return {str(label): arr[i].astype(np.float32).flatten() for i, label in enumerate(labels)}
