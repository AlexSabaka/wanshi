---
id: overview
title: Examples
description: Worked integrations and experiments that ship in the wanshi repo.
---

# Examples

These walkthroughs mirror the subprojects under [`examples/`](https://github.com/AlexSabaka/wanshi/tree/master/examples) in the repo. Each is a standalone integration or experiment you can run.

- **[Telegram content sink](./telegram-sink.md)** — a Telegram bot that folds forwarded articles/videos/files into a live `mcp-jsonl` graph wired into Claude Desktop's memory server.
- **[Canonicalization experiment](./canonicalization.md)** — an A/B that isolates whether entity/relation-type sprawl comes from extraction order or the absence of a global merge pass.
- **[Knowledge injection (Phase 9)](./knowledge-injection.md)** — train a small local model (LoRA via MLX on Qwen3-0.6B) to absorb wanshi's extracted facts and measure recall / refusal / perplexity.

You can also use wanshi programmatically via `ContainerFactory` — see the [development guide](../contributing.md).
