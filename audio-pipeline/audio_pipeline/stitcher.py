"""Cross-chunk speaker re-identification via greedy embedding matching.

Each chunked diarization gives a *local* SPEAKER_XX namespace — chunk 0's
SPEAKER_00 may be the same voice as chunk 1's SPEAKER_01. We unify them by
matching each new chunk's local speakers against a running list of global
centroids by cosine similarity. Greedy (no sklearn). Threshold 0.45 is
conservative on pyannote/embedding's scale (~0.4 is the EER operating point).
"""
from __future__ import annotations

import logging

import numpy as np

from .diarize import cosine_similarity

log = logging.getLogger(__name__)

DEFAULT_SIMILARITY_THRESHOLD = 0.45


def stitch_speakers(
    per_chunk: list[dict[str, np.ndarray]],
    *,
    threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
) -> tuple[list[dict[str, str]], dict[str, np.ndarray]]:
    """Map each chunk's local speaker labels to global labels.

    Input: a list of {local_label: embedding} dicts, one per chunk.
    Output: (per-chunk {local_label: global_label} mappings, {global_label:
    running-mean embedding} centroid dict). Global labels are minted
    `SPEAKER_00`, `SPEAKER_01`, … in encounter order.
    """
    global_centroids: list[np.ndarray] = []
    global_counts: list[int] = []
    mappings: list[dict[str, str]] = []

    for chunk_idx, embeddings in enumerate(per_chunk):
        mapping: dict[str, str] = {}
        for local_label, emb in embeddings.items():
            if not global_centroids:
                global_centroids.append(emb.astype(np.float32))
                global_counts.append(1)
                mapping[local_label] = _global_name(0)
                continue

            sims = [cosine_similarity(emb, c) for c in global_centroids]
            best_idx = int(np.argmax(sims))
            best_sim = sims[best_idx]
            if best_sim >= threshold:
                global_label = _global_name(best_idx)
                n = global_counts[best_idx]
                global_centroids[best_idx] = (
                    global_centroids[best_idx] * n + emb.astype(np.float32)
                ) / (n + 1)
                global_counts[best_idx] = n + 1
            else:
                new_idx = len(global_centroids)
                global_centroids.append(emb.astype(np.float32))
                global_counts.append(1)
                global_label = _global_name(new_idx)

            mapping[local_label] = global_label
            log.debug(
                "chunk %d %s → %s (best_sim=%.3f)",
                chunk_idx, local_label, mapping[local_label], best_sim,
            )
        mappings.append(mapping)

    log.info("stitched %d chunks into %d global speakers", len(per_chunk), len(global_centroids))
    centroid_dict = {
        _global_name(i): global_centroids[i] for i in range(len(global_centroids))
    }
    return mappings, centroid_dict


def _global_name(idx: int) -> str:
    return f"SPEAKER_{idx:02d}"
