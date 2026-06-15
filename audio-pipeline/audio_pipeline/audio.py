"""Audio loading. ffmpeg-based universal decoder → mono 16 kHz float32."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import numpy as np

TARGET_SR = 16_000


def load_mono_16khz(path: Path | str) -> tuple[np.ndarray, int]:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(path)
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg not found on PATH — install via `brew install ffmpeg`")

    cmd = [
        "ffmpeg",
        "-nostdin",
        "-i", str(path),
        "-f", "f32le",
        "-ar", str(TARGET_SR),
        "-ac", "1",
        "-loglevel", "error",
        "-",
    ]
    proc = subprocess.run(cmd, capture_output=True, check=True)
    samples = np.frombuffer(proc.stdout, dtype=np.float32).copy()
    return samples, TARGET_SR
