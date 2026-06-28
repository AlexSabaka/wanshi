# Brief — supported input formats & how each is handled (reader pipeline)

**From:** Cheetah 🐆 · **To:** Dove 🕊️ / Sabaka 🐕 · **Date:** 2026-06-14
**Type:** reference (code-verified, file:line). The map of "file → reader → library → text → chunks"
for every supported format, plus the dispatch rules and the shared downstream.

## The pipeline in one line

```
file → FileReaderFactory.canRead (first-match-wins) → reader.read() → FileReadResult{chunks[],metadata?}
     → FileProcessor (reconstruct content + carry per-chunk provenance + classify)
     → KnowledgeGraphBuilder (per-chunk LLM extraction; observations stamped with provenance)
```

- Every reader extends `FileReader` (`src/core/processor/readers/FileReader.ts`) and returns
  **`FileReadResult { chunks: ChunkResult[], metadata? }`** — i.e. **each reader does its own chunking**
  (they share one `TextChunker`). A `ChunkResult` is `{content, images?, index, totalChunks,
  startOffset, endOffset, provenance?}` (`FileReader.ts:10-24`).
- **Dispatch is first-match-wins** over the *registration order* in `ContainerFactory.ts:244-306`, matched
  by exact extension or full basename (`FileReader.canRead`, `:50-58` — never a prefix, so `.mp3` can't be
  read as text). `FileProcessor.processFile` picks the first reader, calls `read()`, then attaches
  `metadata.classes` from the classifier/corpus cache (`FileProcessor.ts:59-89`).
- **Chunking** = `TextChunker` over LangChain `RecursiveCharacterTextSplitter`, sized by
  `chunking.size`/`chunking.overlap`. JSON & transcript readers size-pack to their own `maxChunkSize`
  (defaults to `chunking.size`).

## Registration order (default mode) — the dispatch table

| # | Reader | Claims (ext / sniff) | Library | Produces |
|---|--------|----------------------|---------|----------|
| 1 | `RtfReader` | `.rtf` | `rtf-parser` | plain text → chunked |
| 2 | `MarkdownReader` | `.md` `.markdown` | built-in (+ optional `stripReferences`) | text → chunked |
| 3 | `HtmlReader` | `.html` `.htm` `.xhtml` `.php` | `iconv` (encoding) → `cheerio` + `html-to-text` | clean text → chunked |
| 4 | `ImageReader` | ~20 image exts (`.jpg`/`.png`/`.gif`/`.webp`/`.tiff`/`.heic`/`.avif`/…) | none (defers to vision LLM) | **1 chunk**: `[Image file: …]` placeholder **+ raw image buffer** |
| 5 | `OfficeReader` | `.docx` `.pptx` `.xlsx` `.odt` `.odp` `.ods` | `officeparser` | text → chunked |
| 6 | `PdfReader` | `.pdf` | `pdf2json` (+ optional `stripReferences`, arXiv-id capture) | per-page text → chunked |
| 7 | `TranscriptReader` | **content-sniffed**: `*.parakeet/whisper/corrected.txt`, transcript/turn JSON, Claude/ChatGPT chat exports | built-in | turn-packed chunks (+ provenance) |
| 8 | `JsonFileReader` | `.json` `.jsonl` `.geojson` | built-in | **structural** chunks |
| 9 | `AudioReader` *(only if `asr` enabled)* | `.mp3` `.wav` `.m4a` `.flac` `.ogg` `.aac` `.mp4` `.mkv` `.webm` `.avi` | `fluent-ffmpeg` → `nodejs-whisper` | transcript text → chunked |
| 10 | `TextReader` | `.txt` + ~100 code/config exts + named files (`Dockerfile`, `Makefile`, `LICENSE`, `.gitignore`…) | built-in (UTF-8) | text → chunked |
| 11 | `BinaryReader` | **catch-all (last)** | none | **0 chunks** — skipped gracefully |

**Docling mode** (`readers.docling: true`, opt-in): readers 1–6 are *replaced* by a single `DoclingReader`
that `spawn`s the Python **Docling** pipeline (`pip install docling`) → markdown + extracted images →
chunked, for `.pdf/.doc/.docx/.ppt/.pptx`. (Audio/transcript/json/text still register normally.)

## Per-format data flow (the "X → lib → text → chunks" the question asked)

- **PDF** → `PdfReader` → `pdf2json` per-page text → [`stripReferences` quarantines a trailing
  bibliography] → `chunker` → chunks.  *Docling on:* → `DoclingReader` → Docling → markdown + images → chunks.
- **DOCX / PPTX / XLSX / ODT / ODP / ODS** → `OfficeReader` → `officeparser` → plain text → chunker.
  *(Docling on: doc/docx/ppt/pptx route through Docling instead.)*
- **RTF** → `RtfReader` → `rtf-parser` → text → chunker.
- **HTML / HTM / XHTML / PHP** → `HtmlReader` → detect encoding (`iconv`) → `cheerio` + `html-to-text`
  → clean text → chunker.
- **Markdown** → `MarkdownReader` → [`stripReferences`] → chunker (heading-aware splitting via the splitter).
- **Images** (`.jpg/.png/.gif/.webp/.tiff/.heic/.avif/…`) → `ImageReader` → **one chunk carrying the raw
  image buffer**; the buffer is base64'd and sent to a **vision LLM at extraction time** (`ImageReader.ts:59-67`)
  — there is *no* separate OCR/caption-to-text step.
- **Audio / Video** (`.mp3/.wav/.m4a/.flac/.ogg/.aac/.mp4/.mkv/.webm/.avi`) → `AudioReader` → `fluent-ffmpeg`
  decode/normalize → `nodejs-whisper` transcribe (model/language/translate from `asr.*`) → transcript text →
  chunker. **Only when `asr` is enabled**; otherwise audio/video falls through to `BinaryReader` and is skipped.
- **Transcripts** (speaker-labeled text, recua turns JSON, chat exports) → `TranscriptReader` → normalize to
  `Turn[]` → **size-pack** into chunks (speaker rendered inline; a single-speaker chunk also gets
  `provenance.speaker`); every chunk carries `ChunkProvenance{source, occurredAt}`.
- **JSON / JSONL / GeoJSON** → `JsonFileReader` → compact re-serialize → **structural chunking** (top-level
  array elements, an object's dominant array with sibling-key header, or JSONL lines; recurse one level into
  oversized elements) → chunks. Malformed JSON → raw-text fallback (never throws).
- **Text & source code** (`.txt` + ~100 code/markup/config exts + named files) → `TextReader` → UTF-8 read
  → chunker.
- **Anything else / binary** → `BinaryReader` → 0 chunks, skipped (no UTF-8 mojibake, no LLM call).

## Dispatch nuances worth knowing

- **Order matters.** `TranscriptReader` (7) and `JsonFileReader` (8) and `AudioReader` (9) are all
  registered *before* `TextReader` (10) so transcripts/JSON/audio don't get read as raw UTF-8.
  `TranscriptReader` overrides `canRead` to **content-sniff** — it claims only files that *look* like
  transcripts and defers everything else (so a normal `.txt` flows on to `TextReader`).
- **Overlapping extension lists are resolved by order, not exclusivity.** `TextReader`'s list *also*
  contains `.html/.json/.php` etc., but `HtmlReader`/`JsonFileReader` are earlier and win. Caveat: in
  **Docling mode** the Html/Office/etc. readers aren't registered, so an `.html` then falls through to
  `TextReader` (raw text, not cheerio-cleaned) — a known mode side-effect.
- **Provenance is reader-supplied, stamped downstream.** Readers set `ChunkResult.provenance`
  (`source`/`speaker`/`occurredAt`); `KnowledgeGraphBuilder.toGraph()` wraps each emitted observation into
  an `Observation` stamped with that provenance + `createdAt`. Most readers leave provenance unset (only
  `TranscriptReader` populates it today) — a seam for richer per-format provenance (PDF page, slide #, …).

## Possible brainstorm hooks (not asked, flagged for Dove)

- Per-format **provenance enrichment** (PDF page / PPTX slide / HTML heading path → `ChunkResult.provenance`)
  — the `Observation` already has the fields; only `TranscriptReader` fills them.
- **Images are vision-LLM-only**; no OCR fallback when generation isn't vision-capable (then an image
  yields just the placeholder). An OCR reader (tesseract) could be a non-vision path.
- **Docling-mode HTML/RTF/MD gap** (fall through to raw `TextReader`) — register the lightweight readers
  alongside Docling instead of replacing all six.
- Structure-aware **Markdown/HTML chunking** (split on headings/sections, like JSON's structural split)
  vs the current character splitter.
