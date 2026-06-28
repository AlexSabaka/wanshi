---
id: intro
title: Introduction
description: wanshi — a local-first CLI that turns a file tree into one provenance-tracked knowledge graph.
---

# wanshi

> A local-first CLI that reads ten thousand things — code, docs, PDFs, audio, transcripts — and builds one knowledge graph that remembers where every fact came from.

`wanshi` extracts entities and relations from a file tree and merges them into a single graph. It runs on local models via [Ollama](https://ollama.ai) by default, or any OpenAI-compatible endpoint. Facts carry provenance and a bi-temporal axis, an inline grounding gate filters ungrounded claims, and the graph is a drop-in producer for the MCP memory server, Graphiti, and KBLaM/LoRA training exports.

It's a working CLI and a research platform in equal measure — the long game is domain-tuned extraction feeding knowledge injection into small local models.

:::note Command shorthand
The examples throughout these docs write `wanshi` for the run command — install it globally with `npm install -g @wanshi-kg/wanshi`. From a source checkout (dev) it's `npm start --` (i.e. `npx ts-node ./src/cli/index.ts`), or `node ./dist/cli/index.js` after `npm run build`.
:::

## What's distinctive

Most text→KG tools stop at "extract triples." `wanshi` is built around the parts that come after:

- **Provenance, not just facts.** Every observation records its `source`/`speaker` and a Graphiti-style bi-temporal axis (`validAt`/`invalidAt` for world-time, `createdAt`/`expiredAt` for system-time). The same fact from two speakers stays as two attributed observations, never one flattened string.
- **A grounding gate.** Each extracted fact is scored against its source chunk and can be flagged or dropped before it reaches the output — keyword overlap as a cheap pre-filter, with an optional local NLI checker (MiniCheck) for the uncertain cases. It won't record what it can't verify against the source.
- **Closed-vocabulary extraction.** An optional corpus pre-pass builds a glossary of canonical entity/relation types, which then *constrains* extraction — so a large corpus doesn't fragment into hundreds of one-off types.
- **Transcript-aware ingestion.** Speaker-labeled transcripts and chat exports are split into speaker-pure chunks, so a speaker becomes per-fact provenance rather than a polluting entity.
- **Beyond plain text.** A structured source can map straight to graph — a SQLite `.db` becomes tables→types, rows→entities, foreign-keys→edges with no LLM — and a document's own links and citations become deterministic edges, optionally fetching the cited work to ground the claim.
- **Memory-store interop.** `mcp-jsonl` output is byte-compatible with the official [MCP memory server](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) — point it at the file and query your graph from Claude Code/Desktop. No store to build.
- **Training-data exports.** Emit KBLaM `(entity, property, value)` triples or quality-filtered LoRA/SFT chat examples straight from a graph.
- **Resumable runs.** Per-chunk checkpoints survive interrupts and exhausted API credits; re-run the same command to continue.

Ready? **[Install wanshi →](./getting-started/installation.md)**
