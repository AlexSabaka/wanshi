"""Pure-logic tests: turn merge + CLI serialization. No models, no network."""
from audio_pipeline.asr import AsrSegment
from audio_pipeline.pipeline import Turn, _max_overlap_merge
from audio_pipeline.cli import _turn_to_dict


def test_max_overlap_merge_assigns_each_segment_to_best_turn():
    turn_specs = [(0.0, 2.0, "SPEAKER_00"), (2.0, 4.0, "SPEAKER_01")]
    asr = {
        "parakeet": [AsrSegment("hello", 0.1, 1.9), AsrSegment("world", 2.1, 3.9)],
        "whisper": [AsrSegment("hallo", 0.0, 2.0), AsrSegment("word", 2.0, 4.0)],
    }
    turns = _max_overlap_merge(turn_specs, asr)
    assert len(turns) == 2
    assert turns[0].speaker == "SPEAKER_00"
    assert turns[0].texts["parakeet"] == "hello"
    assert turns[0].texts["whisper"] == "hallo"
    assert turns[1].texts["parakeet"] == "world"
    assert turns[1].texts["whisper"] == "word"


def test_max_overlap_merge_no_double_assignment_on_overlapping_turns():
    # one ASR segment, two turns that both overlap it — must land in exactly one
    turn_specs = [(0.0, 3.0, "SPEAKER_00"), (1.0, 4.0, "SPEAKER_01")]
    asr = {"parakeet": [AsrSegment("solo", 0.5, 1.4)]}
    turns = _max_overlap_merge(turn_specs, asr)
    placed = [t.texts.get("parakeet", "") for t in turns]
    assert placed.count("solo") == 1


def test_turn_to_dict_diarized_keeps_speaker_and_drops_empty_backends():
    t = Turn(0.0, 2.0, "SPEAKER_03", {"parakeet": "alpha", "whisper": ""})
    d = _turn_to_dict(t, single_speaker=False)
    assert d["speaker"] == "SPEAKER_03"
    assert d["parakeet"] == "alpha"
    assert "whisper" not in d  # empty hypothesis dropped


def test_turn_to_dict_no_diarize_normalizes_speaker():
    t = Turn(0.0, 2.0, "speech", {"parakeet": "alpha", "whisper": "alpha!"})
    d = _turn_to_dict(t, single_speaker=True)
    assert d["speaker"] == "SPEAKER_00"
    assert d["parakeet"] == "alpha"
    assert d["whisper"] == "alpha!"
