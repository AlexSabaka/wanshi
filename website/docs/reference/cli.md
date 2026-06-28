---
id: cli
title: CLI reference
description: Every wanshi command-line flag, grouped by feature.
---

# CLI reference

CLI flags are flat and ergonomic; config **files** use the [nested shape](../getting-started/configuration.md). For the complete, authoritative option surface (generated from the schema) see the **[configuration reference](./configuration.md)**.

## Core

| Option | Default | Description |
| ------ | ------- | ----------- |
| `-i, --input <path>` | `.` | Input directory |
| `-f, --filter <glob>` | `**/*` | Include pattern |
| `-e, --exclude <glob...>` | — | Exclude patterns |
| `-o, --output <path>` | `knowledge-graph.json` | Output file |
| `-d, --description <text>` | — | Content description for LLM context |
| `--config <file>` | — | YAML/JSON config file |

## LLM

| Option | Default | Description |
| ------ | ------- | ----------- |
| `--provider <name>` | `ollama` | `ollama` or `openai` (any OpenAI-compatible endpoint) |
| `-m, --model <name>` | `llama3.2` | Ollama tag or provider model id |
| `-h, --host <url>` | `http://localhost:11434` | Ollama host, or OpenAI-compatible base URL |
| `--api-key <key>` | — | Falls back to `$OPENAI_API_KEY` / `$WANSHI_API_KEY` (or `$KG_API_KEY`, legacy) |
| `--temperature <n>` | `0.1` | Sampling temperature |
| `--repeat-penalty <n>` | `1.1` | Ollama only (>1.0 discourages repetition) |
| `--context-length <n>` | `8192` | Context window (Ollama only) |
| `--max-tokens <n>` | provider default | Raise (or lower `--chunk-size`) if graph JSON truncates mid-output |
| `--seed <n>` | — | Reproducibility seed (Ollama only) |
| `-s, --system <prompt\|path>` | — | Custom system prompt or template path |

## Embeddings (independent from generation)

| Option | Default | Description |
| ------ | ------- | ----------- |
| `--embeddings-provider <name>` | `ollama` | `ollama` or `openai` |
| `--embeddings-model <name>` | `nomic-embed-text` | Embeddings model |
| `--embeddings-host <url>` | `http://localhost:11434` | Host / base URL |
| `--embeddings-max-input-chars <n>` | `1024` | Truncate embedding inputs (safe for 512-token models; raise for cloud) |

## Processing & retrieval

| Option | Default | Description |
| ------ | ------- | ----------- |
| `--chunking <mode>` | `enabled` | `enabled\|disabled\|auto` |
| `-c, --chunk-size <n>` | `2000` | Max chunk size (chars) |
| `--overlap-size <n>` | `100` | Chunk overlap |
| `--retrieval <mode>` | `enabled` | `enabled\|disabled\|auto` |
| `--retrieval-limit <n>` | `3` | Retrieved context entities per chunk |
| `--retrieval-scope <mode>` | `chunk` | `chunk` (per-chunk) or `file` (once, reused) |
| `--json-strategy <mode>` | `structural` | `structural` (split on JSON structure) or `raw` |

## Media & classification

| Option | Default | Description |
| ------ | ------- | ----------- |
| `--asr <mode>` | `enabled` | `enabled\|disabled\|auto` |
| `--whisper-model <name>` | `medium` | `tiny\|base\|small\|medium\|large` |
| `--language <lang>` | `auto` | Language code or `auto` |
| `--translate` | `false` | Translate audio to English |
| `--images <mode>` | `auto` | `enabled\|disabled\|auto` (vision model required) |
| `--pdf-engine <engine>` | `pdf2json` | `pdf2json\|tesseract\|docling\|marker\|chandra\|mistral` — PDF reading engine; hardware-aware ladder tesseract (CPU/WASM) → pdf2json → docling → marker → chandra (handwriting VLM) → mistral (cloud). Non-default engines degrade to `pdf2json` on failure |
| `--asr-engine <engine>` | `whisper` | `whisper\|dual` — `dual` = vendored Python VAD + Parakeet/Whisper dual-STT + diarization (Apple-Silicon) |
| `--classifier <mode>` | `disabled` | `disabled\|heuristic\|llm\|cascade` — drives domain prompt hints and scopes `entityType` to a per-domain enum *(experimental)* |
| `--trace` | `false` | Emit a structured decision run-trace to `<output>.trace.jsonl` *(debug/observability)* |

## Merging, grounding, corpus glossary

| Option | Default | Description |
| ------ | ------- | ----------- |
| `--entity-similarity-threshold <n>` | `0.9` | Jaro-Winkler entity dedup (0–1) |
| `--observation-similarity-threshold <n>` | `0.9` | Embedding similarity (0–1) |
| `--enable-similarity-merging` | `true` | Enable entity deduplication |
| `--grounding <mode>` | `disabled` | `disabled` · `flag` (annotate `grounded`/`groundingScore`) · `drop` (remove below threshold) |
| `--grounding-min-score <n>` | `0.5` | Min grounding score; also gates which facts the `lora` export keeps |
| `--corpus-profiling <mode>` | `disabled` | Pre-pass that builds an authoritative corpus glossary (closed vocab under v5) *(experimental)* |
| `--prompt-version <version>` | `v5` | `v5` (closed-vocab + topology hygiene) or `v4.5` (legacy) |

## Export, resume, logging

| Option | Default | Description |
| ------ | ------- | ----------- |
| `--export-format <format>` | `json` | `json\|jsonl\|mcp-jsonl\|dot\|kblam\|lora\|graphiti` |
| `--export-only` | `false` | Convert an existing graph (`--input`) to `--export-format` — no extraction |
| `--resume` | `false` | Checkpoint chunks; skip done ones on re-run |
| `--checkpoint <path>` | `<output>.checkpoint.jsonl` | Checkpoint sidecar |
| `-L, --log-level <level>` | `info` | `debug\|info\|warning\|error` |
| `-l, --log-file <path>` | — | Write logs to file |
| `-w, --watch` | `false` | Watch mode |

:::note
Document-outline injection (`readers.outline`) and DOT styling (`export.dot`) are config-only (no CLI flags) — see the [configuration reference](./configuration.md).
:::

## References & citations (opt-in; network only for web/citation fetch)

Turn the references a document already contains into deterministic edges — and, opt-in, fetch the cited work to make a citation evidence-bearing. All default **off** (offline, byte-identical run).

| Option | Default | Description |
| ------ | ------- | ----------- |
| `--reference-links` | `false` | Resolve internal links + `[[wikilinks]]` → `links_to` edges |
| `--reference-citations` | `false` | Parse bibliographies + inline ids → `cites` edges |
| `--reference-follow` | `false` | Follow resolved internal links to discover & ingest more files |
| `--reference-web` | `false` | Fetch external links (allowlist + robots + budget gated) → `references` edges |
| `--reference-citation-fetch` | `false` | Fetch a cited work's OA full text, then span-select + grounding-check the citing claim |
| `--reference-title-resolver` | `false` | Resolve id-less citations via Crossref → Semantic Scholar → OpenAlex |
| `--grobid` / `--grobid-url <url>` | `false` | Link in-text citations to their claim sentence via a local GROBID service |
| `--unpaywall-email <email>` | — | Unpaywall polite-pool email for DOI→OA (or `$UNPAYWALL_EMAIL`) |
| `--strip-references` | `false` | Quarantine a document's trailing bibliography before extraction |

## Cost & token metering

| Option | Default | Description |
| ------ | ------- | ----------- |
| `--cost` | `false` | Meter token usage + USD cost (rough pre-run estimate + exact end-of-run tally) |
| `--max-cost <n>` | — | Hard spend cap — graceful stop + checkpoint when exceeded (auto-enables `--cost`) |
| `--cost-ledger <path>` | `<output>.cost.json` | Resume-safe cumulative cost ledger |

## Image enrichment & CV (opt-in; augments the vision read, never replaces it)

| Option | Default | Description |
| ------ | ------- | ----------- |
| `--exif` | `false` | EXIF → GPS `location`, capture-time `validAt`, camera/author facts |
| `--c2pa` | `false` | C2PA content credentials → a fact-not-verdict trust observation |
| `--object-detection` | `false` | CV detector pre-pass → a VLM context line + `depicts` edges |
| `--detection-mode <mode>` | `closed` | `closed` (COCO-80) or `zero-shot` (open-vocab labels) |

## Structured-source adapters

| Option | Default | Description |
| ------ | ------- | ----------- |
| `--sqlite` | `false` | Map a `.db`/`.sqlite` directly to graph — tables → types, rows → entities, FKs → edges (no LLM) |

:::tip More flags
AST seeding (`--ast`), corpus tuning (`--corpus-top-terms`, `--corpus-profile-path`), dual-ASR backends (`--asr-models`, `--num-speakers`), PDF-engine tuning (`--marker-use-llm`, `--tesseract-lang`, `--chandra-method`), grounding internals (`--grounding-checker`, `--grounding-model`, `--supersession`), and `--trace-path` round out the surface. Run **`wanshi schema`** to print the complete, authoritative option set — it's generated from the Zod config schema, so it never drifts from the code. See the [configuration reference](./configuration.md).
:::
