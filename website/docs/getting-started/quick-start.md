---
id: quick-start
title: Quick start
description: Process a directory into a knowledge graph, pick a model and format, and run the other modes.
---

# Quick start

```bash
# Process a directory with defaults
wanshi -i ./my-project -o knowledge-graph.json

# Pick a model and output format
wanshi -i ./src -m qwen3:8b --export-format jsonl -o kg.jsonl

# Config file (recommended for anything non-trivial)
wanshi --config config.yaml
```

See **[Configuration](./configuration.md)** for the config-file shape and the cloud + resume setup, and the **[CLI reference](../reference/cli.md)** for every flag.

## Other modes

```bash
# Watch: update the graph as files change
wanshi --config config.yaml --watch

# Multimedia (images + audio transcription)
wanshi -i ./media --images enabled --asr enabled --whisper-model medium -m llava:7b

# GraphViz DOT for visualization
wanshi -i ./src --export-format dot -o graph.dot && dot -Tsvg graph.dot -o graph.svg

# Re-export an existing graph (no LLM calls)
wanshi --export-only -i ./knowledge-graph.json --export-format kblam -o ./kb.jsonl
```
