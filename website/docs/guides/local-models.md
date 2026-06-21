---
id: local-models
title: Local model guidance
description: Quality/speed trade-offs for picking a local Ollama model.
---

# Local model guidance

Quality/speed trade-off for local selection. For measured numbers see the **[benchmarks](../benchmarks/results.md)**.

| Model | Params | Quality | Speed | Notes |
| ----- | ------ | ------- | ----- | ----- |
| `qwen3:8b` | 8B | ★★★★★ | slower | highest extraction quality |
| `gemma3:4b` | 4B | ★★★★ | medium | best quality/speed balance |
| `qwen2.5-coder:1.5b` | 1.5B | ★★★ | fast | strong on source code |
| `qwen3:1.7b` | 1.7B | ★★★ | fast | good general purpose |
| `gemma3:1b` | 1B | ★★ | very fast | minimal resources |

Default embeddings: `nomic-embed-text`.
