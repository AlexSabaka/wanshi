---
id: supported-inputs
title: Supported inputs
description: Every file format wanshi reads and how each is handled.
---

# Supported inputs

| Format | Extensions | Handling |
| ------ | ---------- | -------- |
| Text / source code | `.txt`, `.ts`, `.js`, `.py`, `.go`, `.rs`, … | Direct / code-aware extraction |
| Markdown | `.md` | Markdown-aware parsing |
| LaTeX | `.tex` | De-TeX'd to readable prose; `\cite{}` keys feed the citation pipeline |
| EPUB | `.epub` | Unzipped and parsed per chapter (adm-zip + cheerio + html-to-text) |
| Jupyter | `.ipynb` | Cell-aware (markdown narrative + fenced code); cell outputs opt-in |
| Transcripts | speaker-labeled `*.parakeet.txt`/`*.whisper.txt`, transcript/turn JSON, Claude/ChatGPT exports | Speaker-pure chunks with per-fact `speaker`/`occurredAt` |
| Email | `.eml`, `.mbox` | Per-message turns (sender → `speaker`, `Date` → `validAt`); thread-aware; quoted replies stripped |
| Chat exports | WhatsApp `.txt`, Telegram/Discord/Slack `.json` | Per-message speaker-pure turns via a per-platform parser |
| Subtitles | `.srt`, `.vtt` | Caption text (timecodes/styling stripped); VTT `<v>` voice tags → speakers |
| JSON | `.json`, `.jsonl`, `.geojson` | Structure-aware chunking (splits on JSON structure, never mid-object) |
| PDF | `.pdf` | Page text (`pdf2json`), or a richer engine via `--pdf-engine tesseract\|docling\|marker\|chandra\|mistral` |
| Office | `.docx`, `.xlsx`, `.pptx` | Via officeparser |
| HTML / RTF | `.html`, `.htm`, `.rtf` | cheerio / RTF parsing |
| Images | `.jpg`, `.png`, `.gif`, `.webp`, `.tiff`, `.heic`, `.avif` | Vision model required |
| Audio / Video | `.mp3`, `.wav`, `.m4a`, `.flac`, `.mp4`, `.mkv`, `.webm`, … | Whisper transcription, or `--asr-engine dual` (VAD + dual-STT + diarization) |

Images can additionally be enriched with EXIF/C2PA metadata and a CV object-detection pre-pass; PDFs choose an OCR/parse engine via `--pdf-engine`. See the **[CLI reference](../reference/cli.md)** for those flags.
