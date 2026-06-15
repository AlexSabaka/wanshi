"""Minimal runtime config: load a local .env so HF_TOKEN (needed by pyannote's
gated diarization model) is visible to the worker subprocesses."""
from __future__ import annotations

from pathlib import Path

# Project root = parent of the audio_pipeline package dir.
PROJECT_ROOT = Path(__file__).resolve().parents[1]


def load_env() -> None:
    """Load .env from the project root if python-dotenv is available. Real env
    vars always win over .env values."""
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(PROJECT_ROOT / ".env", override=False)
