# audio-pipeline

The Python subproject behind kg-gen's **`dual` ASR engine**. Turns raw audio into a
diarized, dual-hypothesis transcript that kg-gen ingests with full speaker
provenance. Vendored and slimmed from [transcript-ua](../../transcript-ua) — the LLM
correction, evaluation, Telegram bot, and YAMNet sound-tagging stages are removed
(kg-gen runs its own LLM extraction downstream).

```
ffmpeg decode → 16 kHz mono ─┬─ pyannote diarization (or Silero VAD if --no-diarize)
                             ├─ Parakeet-TDT-v3  (MLX) ┐
                             └─ Whisper-large-v3-turbo ┘ → max-overlap merge → turns JSON
```

Each heavy stage runs in its own short-lived subprocess; process exit reclaims
MLX/MPS unified memory — the reason this is robust on a 16 GB Mac.

> **Apple Silicon only.** Parakeet/Whisper run via MLX and won't run on Linux/Intel.
> kg-gen's default `whisper` engine (`nodejs-whisper`) remains the portable path.

## Setup

```bash
cd audio-pipeline
uv sync                       # installs MLX, pyannote, silero-vad, …
cp .env.example .env          # add HF_TOKEN (only needed with diarization)
```

For diarization, get a Hugging Face token and accept the terms for
`pyannote/speaker-diarization-3.1`.

## Use

```bash
# diarized dual-STT (default)
uv run python -m audio_pipeline transcribe lesson.m4a --out lesson.transcript.json

# fast/no-token: skip diarization (Silero VAD skeleton, single speaker)
uv run python -m audio_pipeline transcribe lesson.m4a --out out.json --no-diarize

# one backend only, or a speaker-count hint
uv run python -m audio_pipeline transcribe lesson.m4a --out out.json --asr parakeet
uv run python -m audio_pipeline transcribe lesson.m4a --out out.json --num-speakers 2
```

kg-gen invokes this automatically when `readers.asr.engine: dual` — it spawns
`uv run --project ./audio-pipeline python -m audio_pipeline transcribe …` and reads
the resulting `<audio>.transcript.json`.

## Output shape (recua turns JSON)

```json
[
  {"start": 0.0, "end": 2.3, "speaker": "SPEAKER_00",
   "parakeet": "…", "whisper": "…"}
]
```

Both raw hypotheses ride along per turn; kg-gen picks one (`corrected > parakeet >
whisper`). Intermediate per-stage artifacts cache in `<audio>.workdir/` — delete it
to force a clean re-run.

## Tests

`uv run pytest` — the pure-logic tests (turn merge, CLI serialization) run without
any models or network.
