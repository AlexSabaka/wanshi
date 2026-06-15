"""Subprocess entry for memory-isolated pipeline stages.

Invoked by `audio_pipeline.pipeline.transcribe()` as one of:

    python -m audio_pipeline._worker diarize <audio> <out_json> [--num-speakers N] [--device D]
    python -m audio_pipeline._worker asr <backend> <audio> <out_json> [knobs...]
    python -m audio_pipeline._worker chunk <audio> <out_dir> [knobs...]
    python -m audio_pipeline._worker vad <audio> <out_json> [knobs...]

Each invocation loads exactly one heavy model, runs it, writes JSON, exits.
Process exit is the reclamation mechanism — the OS frees all MPS / MLX allocator
state unconditionally, so the next stage starts from zero. (Vendored from
transcript-ua; the YAMNet sound-tagging stage is dropped for kg-gen.)
"""
from __future__ import annotations

import argparse
import json
import logging
import time
from pathlib import Path

log = logging.getLogger("audio_pipeline.worker")

# Soft cap so the kernel always keeps headroom on 16 GB unified memory.
_MLX_MEMORY_LIMIT_BYTES = 11 * 1024 ** 3  # 11 GiB


def _asr_segment_to_dict(s) -> dict:
    out: dict = {"start": s.start, "end": s.end, "text": s.text}
    if s.avg_logprob is not None:
        out["avg_logprob"] = s.avg_logprob
    if s.no_speech_prob is not None:
        out["no_speech_prob"] = s.no_speech_prob
    if s.compression_ratio is not None:
        out["compression_ratio"] = s.compression_ratio
    return out


def _run_diarize(
    audio: Path, out: Path, *, num_speakers: int | None = None, device: str | None = None
) -> None:
    from .diarize import Diarizer

    t0 = time.monotonic()
    diarizer = Diarizer(device=device)
    turns, embeddings = diarizer.diarize(audio, num_speakers=num_speakers)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(
            {
                "turns": [
                    {"start": s, "end": e, "speaker": spk} for (s, e, spk) in turns
                ],
                "embeddings": {k: v.tolist() for k, v in embeddings.items()},
            },
            ensure_ascii=False,
        )
    )
    log.info(
        "diarize: %d turns, %d speaker embeddings → %s (%.1fs)",
        len(turns), len(embeddings), out, time.monotonic() - t0,
    )

    try:
        import torch

        if torch.backends.mps.is_available():
            peak_mb = torch.mps.driver_allocated_memory() / 1024 ** 2
            log.info("diarize peak MPS allocated: %.0f MiB", peak_mb)
            torch.mps.empty_cache()
    except Exception:
        log.exception("diarize: peak-memory report failed")


def _run_asr(
    backend_name: str,
    audio: Path,
    out: Path,
    *,
    backend_options: dict | None = None,
) -> None:
    import mlx.core as mx

    mx.set_memory_limit(_MLX_MEMORY_LIMIT_BYTES)

    from .asr import BACKENDS

    if backend_name not in BACKENDS:
        raise SystemExit(f"unknown backend: {backend_name!r} (have: {sorted(BACKENDS)})")

    t0 = time.monotonic()
    backend = BACKENDS[backend_name]()
    segs = backend.transcribe(audio, **(backend_options or {}))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps([_asr_segment_to_dict(s) for s in segs], ensure_ascii=False)
    )
    log.info(
        "asr/%s: %d segments → %s (%.1fs)",
        backend_name, len(segs), out, time.monotonic() - t0,
    )

    try:
        peak_mb = mx.get_peak_memory() / 1024 ** 2
        log.info("asr/%s peak MLX allocated: %.0f MiB", backend_name, peak_mb)
        mx.clear_cache()
    except Exception:
        log.exception("asr/%s: peak-memory report failed", backend_name)


def _run_chunk(
    audio: Path,
    out_dir: Path,
    *,
    target_minutes: float,
    max_minutes: float,
    min_silence_seconds: float,
) -> None:
    import soundfile as sf

    from . import audio as audio_mod
    from .chunker import find_chunk_boundaries

    t0 = time.monotonic()
    samples, sr = audio_mod.load_mono_16khz(audio)
    boundaries = find_chunk_boundaries(
        samples,
        sr,
        target_seconds=target_minutes * 60.0,
        max_seconds=max_minutes * 60.0,
        min_silence_seconds=min_silence_seconds,
    )

    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = []
    for i, (start, end) in enumerate(zip(boundaries[:-1], boundaries[1:])):
        chunk_path = out_dir / f"{i}.wav"
        s_idx, e_idx = int(start * sr), int(end * sr)
        sf.write(str(chunk_path), samples[s_idx:e_idx], sr, subtype="PCM_16")
        manifest.append({
            "idx": i,
            "start": float(start),
            "end": float(end),
            "path": chunk_path.name,
        })
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False))
    log.info(
        "chunk: %d chunks (%.0f s total) → %s (%.1fs)",
        len(manifest), boundaries[-1], out_dir, time.monotonic() - t0,
    )


def _run_vad(
    audio: Path,
    out: Path,
    *,
    vad_threshold: float,
    merge_gap_ms: int,
    min_speech_ms: int = 250,
) -> None:
    """Run Silero VAD standalone. Emits the {turns, embeddings} schema with speaker
    label "speech" so speech regions become the turn skeleton without paying for
    diarization (the --no-diarize path)."""
    from . import audio as audio_mod
    from .vad import SileroVAD

    t0 = time.monotonic()
    samples, sr = audio_mod.load_mono_16khz(audio)
    segments = SileroVAD().detect(
        samples, sr,
        threshold=vad_threshold,
        merge_gap_ms=merge_gap_ms,
        min_speech_ms=min_speech_ms,
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(
            {
                "turns": [
                    {"start": float(s.start), "end": float(s.end), "speaker": "speech"}
                    for s in segments
                ],
                "embeddings": {},
            },
            ensure_ascii=False,
        )
    )
    log.info("vad: %d speech segments → %s (%.1fs)", len(segments), out, time.monotonic() - t0)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="audio_pipeline._worker")
    sub = parser.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("diarize", help="Full pyannote diarization")
    d.add_argument("audio", type=Path)
    d.add_argument("out", type=Path)
    d.add_argument("--num-speakers", type=int, default=None,
                   help="Constrain pyannote to exactly N speakers (default: estimate)")
    d.add_argument("--device", type=str, default=None,
                   help="Torch device override (mps|cpu|cuda); default: autodetect")

    a = sub.add_parser("asr", help="Run one ASR backend over the whole file")
    a.add_argument("backend", type=str)
    a.add_argument("audio", type=Path)
    a.add_argument("out", type=Path)
    a.add_argument("--whisper-language", type=str, default=None)
    a.add_argument("--whisper-compression-ratio-threshold", type=float, default=None)
    a.add_argument("--whisper-logprob-threshold", type=float, default=None)
    a.add_argument("--whisper-no-speech-threshold", type=float, default=None)
    a.add_argument("--parakeet-chunk-duration", type=float, default=None)
    a.add_argument("--parakeet-overlap-duration", type=float, default=None)

    c = sub.add_parser("chunk", help="Silence-based slice into per-chunk WAVs + manifest")
    c.add_argument("audio", type=Path)
    c.add_argument("out_dir", type=Path)
    c.add_argument("--target-minutes", type=float, default=25.0)
    c.add_argument("--max-minutes", type=float, default=35.0)
    c.add_argument("--min-silence-seconds", type=float, default=1.5)

    v = sub.add_parser("vad", help="Silero VAD standalone (no diarization)")
    v.add_argument("audio", type=Path)
    v.add_argument("out", type=Path)
    v.add_argument("--vad-threshold", type=float, default=0.5)
    v.add_argument("--merge-gap-ms", type=int, default=300)
    v.add_argument("--min-speech-ms", type=int, default=250)

    return parser


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )
    args = _build_parser().parse_args(argv)

    if args.cmd == "diarize":
        _run_diarize(args.audio, args.out, num_speakers=args.num_speakers, device=args.device)
    elif args.cmd == "asr":
        _run_asr(args.backend, args.audio, args.out, backend_options=_asr_backend_options(args))
    elif args.cmd == "chunk":
        _run_chunk(
            args.audio, args.out_dir,
            target_minutes=args.target_minutes,
            max_minutes=args.max_minutes,
            min_silence_seconds=args.min_silence_seconds,
        )
    elif args.cmd == "vad":
        _run_vad(
            args.audio, args.out,
            vad_threshold=args.vad_threshold,
            merge_gap_ms=args.merge_gap_ms,
            min_speech_ms=args.min_speech_ms,
        )
    else:
        return 1
    return 0


def _asr_backend_options(args) -> dict:
    """Pull only the kwargs that apply to the selected backend. None values are
    skipped to preserve module-level defaults."""
    opts: dict = {}
    if args.backend == "whisper":
        if args.whisper_language is not None:
            opts["language"] = args.whisper_language
        if args.whisper_compression_ratio_threshold is not None:
            opts["compression_ratio_threshold"] = args.whisper_compression_ratio_threshold
        if args.whisper_logprob_threshold is not None:
            opts["logprob_threshold"] = args.whisper_logprob_threshold
        if args.whisper_no_speech_threshold is not None:
            opts["no_speech_threshold"] = args.whisper_no_speech_threshold
    elif args.backend == "parakeet":
        if args.parakeet_chunk_duration is not None:
            opts["chunk_duration"] = args.parakeet_chunk_duration
        if args.parakeet_overlap_duration is not None:
            opts["overlap_duration"] = args.parakeet_overlap_duration
    return opts


if __name__ == "__main__":
    raise SystemExit(main())
