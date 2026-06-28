---
id: installation
title: Installation
description: Install wanshi and pull the default local models.
---

# Installation

Requires **Node.js 18+** and **[Ollama](https://ollama.ai)** running locally (needed for the default local generation + embeddings path; optional only if you point *both* at an OpenAI-compatible provider).

```bash
git clone https://github.com/AlexSabaka/wanshi
cd wanshi
npm install

# Default local models
ollama pull llama3.2                 # generation
ollama pull nomic-embed-text         # embeddings

npm run build   # optional; ts-node works directly
```

Next: **[Quick start →](./quick-start.md)**
