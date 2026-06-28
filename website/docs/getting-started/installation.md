---
id: installation
title: Installation
description: Install wanshi and pull the default local models.
---

# Installation

Requires **Node.js 18+**. The default pipeline runs entirely on local models via **[Ollama](https://ollama.ai)** (generation + embeddings) — see the note below to use a cloud provider instead.

## Install (recommended)

```bash
npm install -g @wanshi-kg/wanshi     # gives you the `wanshi` command

# Default local models
ollama pull llama3.2                 # generation
ollama pull nomic-embed-text         # embeddings
```

:::note Ollama is optional
The defaults use local models (free, offline, private). To use OpenAI / Claude / DeepSeek / OpenRouter instead, set `llm.provider: openai` and point `llm.host` at an OpenAI-compatible endpoint; embeddings can stay local (free) or go cloud too. See **[Configuration](./configuration.md)**.
:::

## From source (development)

```bash
git clone https://github.com/wanshi-kg/wanshi
cd wanshi
npm install
npm run build   # optional; `npm start` runs via ts-node directly
```

Next: **[Quick start →](./quick-start.md)**
