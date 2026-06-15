"""Vendored audio-pipeline for kg-gen's `dual` ASR engine.

Silero VAD + pyannote diarization + Parakeet/Whisper dual-STT → recua turns JSON.
Slimmed from transcript-ua (LLM correction, evaluation, telegram bot, and YAMNet
sound-tagging removed). Apple-Silicon (MLX) only.
"""
from .pipeline import PipelineExtras, Turn, transcribe

__all__ = ["transcribe", "Turn", "PipelineExtras"]
