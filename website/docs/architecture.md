---
id: architecture
title: Architecture
description: The source layout and the importable quality-metric evaluators.
---

# Architecture

```text
src/
├── cli/           # Commander.js CLI (process/watch/export; --export-only)
├── config/        # Single nested Zod schema — defaults, validation, `wanshi schema`
├── core/
│   ├── di/         # Async DI container + service registrations
│   ├── processor/  # File readers (transcript, email, chat, PDF/OCR, audio, …) + chunking + classifiers + AST seed
│   ├── corpus/     # Corpus pre-pass: term frequency + LLM glossary (closed vocab)
│   ├── checkpoint/ # Per-chunk resume sidecar
│   ├── llm/        # Ollama / OpenAI-compatible providers, embeddings, Handlebars prompts
│   ├── knowledge/  # KG build (LLM+Zod, provenance + grounding gate), 3-level merge, canon, references, images, vector search
│   ├── adapters/   # Structured-emit adapters (SQLite → graph fragments, no LLM)
│   ├── cv/         # Object-detection pre-pass (a signal for the model, not a verdict)
│   ├── cost/       # Token/cost metering + `--max-cost` cap
│   ├── trace/      # Debug run-trace sidecar (observability, off by default)
│   ├── pipeline/   # Post-merge transform stages
│   └── export/     # Strategy pattern: json, jsonl, mcp-jsonl, dot, kblam, lora, graphiti
├── quality/       # Importable metrics (structural, semantic, factual, consistency, composite)
├── evaluation/    # Benchmark harness (CrossRE / REBEL / RE-DocRED / SemEval-2010 T8 / MINE)
├── types/         # Interfaces and data models
└── shared/        # Logger, graceful shutdown, utilities (Jaro-Winkler, cosine, config)
```

Tests use Jest (`npm test`); mock the LLM via `ILLMProvider` for network-free unit tests.

## Quality metrics

Importable evaluators in `src/quality/` (also wired into `npm run benchmark`): **structural** (counts, density, type distribution), **semantic** (name quality, observation specificity, coverage), **factual** (grounding, hallucination, contradiction — this one also backs the inline grounding gate), and **consistency** (cross-file naming, type coherence), rolled into a 0–100 composite that can gate which graphs are harvested for `kblam`/`lora` training data.
