"""CLI for kg-gen's `dual` ASR engine.

    python -m audio_pipeline transcribe <audio> --out <json> \
        [--asr both|parakeet|whisper] [--num-speakers N] [--no-diarize] [--device D]

Emits the "recua turns JSON" that kg-gen's TranscriptReader / AudioReader consume:

    [{"start": 0.0, "end": 2.3, "speaker": "SPEAKER_00",
      "parakeet": "…", "whisper": "…"}, …]

Both raw ASR hypotheses ride along per turn; the consumer picks one
(corrected > parakeet > whisper). No LLM correction stage.
"""
from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

from .config import load_env
from .pipeline import PipelineExtras, Turn, transcribe

log = logging.getLogger("audio_pipeline")

ASR_CHOICES = {
    "both": ("parakeet", "whisper"),
    "parakeet": ("parakeet",),
    "whisper": ("whisper",),
}


def _turn_to_dict(t: Turn, *, single_speaker: bool) -> dict:
    out: dict = {
        "start": round(float(t.start), 3),
        "end": round(float(t.end), 3),
        # In --no-diarize mode the skeleton speaker is "speech"; normalize it to a
        # single canonical speaker so the consumer stamps one provenance speaker.
        "speaker": "SPEAKER_00" if single_speaker else str(t.speaker),
    }
    for backend, text in t.texts.items():
        if text:
            out[backend] = text
    return out


def transcribe_to_file(
    audio: Path,
    out: Path,
    *,
    asr: str = "both",
    num_speakers: int | None = None,
    diarize: bool = True,
    device: str | None = None,
) -> int:
    asr_names = ASR_CHOICES[asr]
    extras = PipelineExtras(num_speakers=num_speakers, device=device)
    turns = transcribe(audio, asr_names=asr_names, diarize=diarize, extras=extras)
    payload = [_turn_to_dict(t, single_speaker=not diarize) for t in turns]
    payload = [t for t in payload if any(k in t for k in ("parakeet", "whisper", "corrected"))]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    speakers = len({t["speaker"] for t in payload})
    log.info("wrote %d turns (%d speaker(s)) → %s", len(payload), speakers, out)
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )
    load_env()

    parser = argparse.ArgumentParser(prog="audio_pipeline")
    sub = parser.add_subparsers(dest="cmd", required=True)

    t = sub.add_parser("transcribe", help="VAD/diarize + dual-STT → recua turns JSON")
    t.add_argument("audio", type=Path)
    t.add_argument("--out", type=Path, required=True, help="Output turns-JSON path")
    t.add_argument("--asr", choices=sorted(ASR_CHOICES), default="both",
                   help="Which ASR backends to run (default: both)")
    t.add_argument("--num-speakers", type=int, default=None,
                   help="Hint pyannote's speaker count when known")
    t.add_argument("--no-diarize", action="store_true",
                   help="Skip diarization; use Silero VAD speech segments (single speaker)")
    t.add_argument("--device", type=str, default=None,
                   help="Torch device override for diarization (mps|cpu|cuda)")

    args = parser.parse_args(argv)
    if args.cmd == "transcribe":
        return transcribe_to_file(
            args.audio,
            args.out,
            asr=args.asr,
            num_speakers=args.num_speakers,
            diarize=not args.no_diarize,
            device=args.device,
        )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
