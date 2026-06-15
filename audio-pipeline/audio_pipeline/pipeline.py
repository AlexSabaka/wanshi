"""Pipeline orchestrator: subprocess-isolated stages + optional chunking + merge.

Vendored, slimmed copy of transcript-ua's pipeline for kg-gen's `dual` ASR engine.
The LLM fusion/correction stage is intentionally dropped — kg-gen runs its own LLM
extraction downstream, so each `Turn` keeps BOTH raw ASR hypotheses in `texts`
(`{"parakeet": ..., "whisper": ...}`) and the consumer picks one.

Each heavy stage (diarize, parakeet ASR, whisper ASR) runs in its own short-lived
`python -m audio_pipeline._worker` subprocess. Process exit is the
memory-reclamation mechanism — the OS frees MPS and MLX allocator state
unconditionally, so the next stage starts from a clean unified-memory baseline
(the whole reason this design exists on a 16 GB machine).

When diarization is disabled, the turn skeleton comes from Silero VAD instead
(speech segments, single speaker) — so audio still segments into turns.

Files longer than `chunker.CHUNK_THRESHOLD_SECONDS` are silence-sliced into
~25-min chunks first; each chunk's diarize + ASR runs independently, then per-chunk
anonymous speaker labels are stitched into a global namespace via embedding cosine
similarity. Each stage's JSON output lives in `<audio>.workdir/`; on re-run, any
stage whose output already exists is skipped — delete the workdir for a clean run.
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

import numpy as np

from .asr import AsrSegment
from .chunker import CHUNK_THRESHOLD_SECONDS

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class PipelineExtras:
    """Optional knobs bundle. None means: use the worker's compiled default;
    do not emit a flag."""

    num_speakers: int | None = None
    device: str | None = None
    whisper_language: str | None = None
    whisper_compression_ratio_threshold: float | None = None
    whisper_logprob_threshold: float | None = None
    whisper_no_speech_threshold: float | None = None
    parakeet_chunk_duration: float | None = None
    parakeet_overlap_duration: float | None = None

    def asr_flags(self, backend: str) -> list[str]:
        out: list[str] = []
        if backend == "whisper":
            if self.whisper_language is not None:
                out += ["--whisper-language", str(self.whisper_language)]
            if self.whisper_compression_ratio_threshold is not None:
                out += ["--whisper-compression-ratio-threshold",
                        str(self.whisper_compression_ratio_threshold)]
            if self.whisper_logprob_threshold is not None:
                out += ["--whisper-logprob-threshold", str(self.whisper_logprob_threshold)]
            if self.whisper_no_speech_threshold is not None:
                out += ["--whisper-no-speech-threshold", str(self.whisper_no_speech_threshold)]
        elif backend == "parakeet":
            if self.parakeet_chunk_duration is not None:
                out += ["--parakeet-chunk-duration", str(self.parakeet_chunk_duration)]
            if self.parakeet_overlap_duration is not None:
                out += ["--parakeet-overlap-duration", str(self.parakeet_overlap_duration)]
        return out

    def diarize_flags(self) -> list[str]:
        out: list[str] = []
        if self.num_speakers is not None:
            out += ["--num-speakers", str(int(self.num_speakers))]
        if self.device is not None:
            out += ["--device", str(self.device)]
        return out


@dataclass
class Turn:
    start: float
    end: float
    speaker: str
    texts: dict[str, str] = field(default_factory=dict)


def transcribe(
    audio_path: Path,
    *,
    asr_names: Sequence[str] = ("parakeet", "whisper"),
    diarize: bool = True,
    extras: PipelineExtras | None = None,
) -> list[Turn]:
    audio_path = Path(audio_path)
    extras = extras or PipelineExtras()
    workdir = _workdir_for(audio_path)
    workdir.mkdir(parents=True, exist_ok=True)
    log.info("workdir: %s", workdir)

    duration = _probe_duration_seconds(audio_path)
    log.info("audio duration: %.1f s (%.1f min)", duration, duration / 60.0)

    if duration > CHUNK_THRESHOLD_SECONDS:
        turn_specs, asr_results = _run_chunked(audio_path, workdir, asr_names, diarize, extras)
    else:
        turn_specs, asr_results = _run_single(audio_path, workdir, asr_names, diarize, extras)

    log.info("%d speaker turns total", len(turn_specs))
    if not turn_specs:
        return []
    return _max_overlap_merge(turn_specs, asr_results)


def _run_speaker_worker(audio: Path, out: Path, diarize: bool, extras: PipelineExtras) -> None:
    """Produce the turn skeleton: full pyannote diarization, or — when diarize is
    off — Silero VAD speech segments (single speaker). Both write the same
    `{turns: [...], embeddings: {...}}` schema that `_load_speaker_json` reads."""
    if diarize:
        _run_worker(["diarize", str(audio), str(out), *extras.diarize_flags()])
    else:
        _run_worker(["vad", str(audio), str(out)])


def _run_single(
    audio_path: Path,
    workdir: Path,
    asr_names: Sequence[str],
    diarize: bool,
    extras: PipelineExtras,
) -> tuple[list[tuple[float, float, str]], dict[str, list[AsrSegment]]]:
    speaker_json = workdir / "diarize.json"
    if not speaker_json.exists():
        _run_speaker_worker(audio_path, speaker_json, diarize, extras)
    turns, _embeddings = _load_speaker_json(speaker_json)

    asr_results: dict[str, list[AsrSegment]] = {}
    for name in asr_names:
        asr_json = workdir / f"asr.{name}.json"
        if asr_json.exists():
            log.info("resume: %s exists, skipping asr/%s worker", asr_json, name)
        else:
            _run_worker(["asr", name, str(audio_path), str(asr_json), *extras.asr_flags(name)])
        asr_results[name] = _load_asr_json(asr_json)
        log.info("asr/%s loaded %d sub-segments", name, len(asr_results[name]))

    return turns, asr_results


def _run_chunked(
    audio_path: Path,
    workdir: Path,
    asr_names: Sequence[str],
    diarize: bool,
    extras: PipelineExtras,
) -> tuple[list[tuple[float, float, str]], dict[str, list[AsrSegment]]]:
    chunks_dir = workdir / "chunks"
    manifest_path = chunks_dir / "manifest.json"
    if not manifest_path.exists():
        _run_worker(["chunk", str(audio_path), str(chunks_dir)])
    manifest = json.loads(manifest_path.read_text())
    log.info("chunked into %d segments", len(manifest))

    per_chunk_speaker: list[tuple[list[tuple[float, float, str]], dict[str, np.ndarray]]] = []
    per_chunk_asr: list[dict[str, list[AsrSegment]]] = []

    for entry in manifest:
        idx = entry["idx"]
        chunk_path = chunks_dir / entry["path"]

        speaker_json = chunks_dir / f"{idx}.diarize.json"
        if not speaker_json.exists():
            _run_speaker_worker(chunk_path, speaker_json, diarize, extras)
        per_chunk_speaker.append(_load_speaker_json(speaker_json))

        asr_for_chunk: dict[str, list[AsrSegment]] = {}
        for name in asr_names:
            asr_json = chunks_dir / f"{idx}.asr.{name}.json"
            if not asr_json.exists():
                _run_worker(["asr", name, str(chunk_path), str(asr_json), *extras.asr_flags(name)])
            asr_for_chunk[name] = _load_asr_json(asr_json)
        per_chunk_asr.append(asr_for_chunk)

    mappings, global_embeddings = _build_speaker_mappings(per_chunk_speaker)

    turn_specs: list[tuple[float, float, str]] = []
    combined_asr: dict[str, list[AsrSegment]] = {name: [] for name in asr_names}
    for entry, (local_turns, _), asr_for_chunk, mapping in zip(
        manifest, per_chunk_speaker, per_chunk_asr, mappings
    ):
        offset = float(entry["start"])
        for (start, end, local_label) in local_turns:
            global_label = mapping.get(local_label, local_label)
            turn_specs.append((start + offset, end + offset, global_label))
        for name, segs in asr_for_chunk.items():
            for s in segs:
                combined_asr[name].append(
                    AsrSegment(
                        text=s.text,
                        start=s.start + offset,
                        end=s.end + offset,
                        avg_logprob=s.avg_logprob,
                        no_speech_prob=s.no_speech_prob,
                        compression_ratio=s.compression_ratio,
                    )
                )

    return turn_specs, combined_asr


def _build_speaker_mappings(
    per_chunk_speaker: list[tuple[list[tuple[float, float, str]], dict[str, np.ndarray]]],
) -> tuple[list[dict[str, str]], dict[str, np.ndarray]]:
    """Map each chunk's local labels to global labels via the embedding cosine
    stitcher. Falls back to per-chunk anonymous labels when no embeddings exist
    (e.g. the VAD/no-diarize skeleton, which carries no speaker embeddings)."""
    from .stitcher import stitch_speakers

    embeddings_per_chunk = [e for (_, e) in per_chunk_speaker]
    has_embeddings = any(e for e in embeddings_per_chunk)
    if not has_embeddings:
        log.warning(
            "no speaker embeddings available in any chunk — falling back to "
            "per-chunk anonymous labels (cross-chunk continuity lost)"
        )
        fallback = [
            {label: f"chunk{i}_{label}" for (_, _, label) in turns}
            for i, (turns, _) in enumerate(per_chunk_speaker)
        ]
        return fallback, {}
    return stitch_speakers(embeddings_per_chunk)


def _max_overlap_merge(
    turn_specs: list[tuple[float, float, str]],
    asr_results: dict[str, list[AsrSegment]],
) -> list[Turn]:
    """Each ASR sub-segment goes to exactly one VAD/diarization turn — the one it
    overlaps most in time. Pyannote can emit overlapping speaker turns; a midpoint
    filter would assign the same sub-segment to multiple turns, duplicating text."""
    assignments: dict[str, list[int]] = {}
    for name, sub_segs in asr_results.items():
        asg: list[int] = []
        for s in sub_segs:
            best_idx, best_ov = -1, 0.0
            for i, (ts, te, _) in enumerate(turn_specs):
                ov = _overlap_seconds(s.start, s.end, ts, te)
                if ov > best_ov:
                    best_idx, best_ov = i, ov
            asg.append(best_idx)
        assignments[name] = asg

    turns: list[Turn] = []
    for i, (start, end, spk) in enumerate(turn_specs):
        texts: dict[str, str] = {}
        for name, sub_segs in asr_results.items():
            collected = [
                sub_segs[j].text.strip()
                for j in range(len(sub_segs))
                if assignments[name][j] == i
            ]
            texts[name] = " ".join(t for t in collected if t).strip()
        turns.append(Turn(start=start, end=end, speaker=spk, texts=texts))
    return turns


def _workdir_for(audio_path: Path) -> Path:
    return audio_path.parent / f"{audio_path.stem}.workdir"


def _probe_duration_seconds(audio_path: Path) -> float:
    out = subprocess.check_output(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(audio_path),
        ],
        text=True,
    )
    return float(out.strip())


def _run_worker(args: list[str]) -> None:
    cmd = [sys.executable, "-m", "audio_pipeline._worker", *args]
    env = os.environ.copy()
    env.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
    # PyTorch MPS validates LOW ≤ HIGH at module load. Set both watermarks to
    # avoid overcommitting unified memory: 0.5 reclaim threshold, 0.7 hard cap.
    env.setdefault("PYTORCH_MPS_HIGH_WATERMARK_RATIO", "0.7")
    env.setdefault("PYTORCH_MPS_LOW_WATERMARK_RATIO", "0.5")
    log.info("spawn worker: %s", " ".join(args[:3]))
    subprocess.run(cmd, env=env, check=True)


def _load_speaker_json(
    path: Path,
) -> tuple[list[tuple[float, float, str]], dict[str, np.ndarray]]:
    data = json.loads(path.read_text())
    if isinstance(data, list):
        turns_raw = data
        embeddings_raw: dict[str, list[float]] = {}
    else:
        turns_raw = data.get("turns", [])
        embeddings_raw = data.get("embeddings", {}) or {}

    turns = [
        (float(item["start"]), float(item["end"]), str(item["speaker"]))
        for item in turns_raw
    ]
    embeddings = {
        str(k): np.asarray(v, dtype=np.float32) for k, v in embeddings_raw.items()
    }
    return turns, embeddings


def _load_asr_json(path: Path) -> list[AsrSegment]:
    data = json.loads(path.read_text())

    def _opt(v):
        return float(v) if v is not None else None

    return [
        AsrSegment(
            text=str(item["text"]),
            start=float(item["start"]),
            end=float(item["end"]),
            avg_logprob=_opt(item.get("avg_logprob")),
            no_speech_prob=_opt(item.get("no_speech_prob")),
            compression_ratio=_opt(item.get("compression_ratio")),
        )
        for item in data
    ]


def _overlap_seconds(a_start: float, a_end: float, b_start: float, b_end: float) -> float:
    return max(0.0, min(a_end, b_end) - max(a_start, b_start))
