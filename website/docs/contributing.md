---
id: contributing
title: Development & contributing
description: Run wanshi from source, plus acknowledgments and license.
---

# Development

```bash
git clone https://github.com/AlexSabaka/wanshi && cd wanshi && npm install
npx ts-node ./src/index.ts --config config.yaml   # run directly
npm run build && node ./dist/index.js --config config.yaml   # or build first
```

See [`examples/`](https://github.com/AlexSabaka/wanshi/tree/master/examples) for integrations — `kg-telegram-sink` (Telegram → graph bot with an A/B canon config) and the legacy `kg-mail-assistant` (Gmail OAuth + email→KG prototype, reference-only) — plus programmatic usage via `ContainerFactory`. A few are written up under **[Examples](./examples/overview.md)**.

## Acknowledgments

- **[Ollama](https://ollama.ai)** — local LLM runtime and embeddings
- **[LangChain](https://github.com/langchain-ai/langchainjs)** — text-splitting utilities
- **[OpenAI Whisper](https://github.com/openai/whisper)** (via `nodejs-whisper`) — audio transcription
- **Anthropic** — the MCP protocol, and Claude as a build partner (Cheetah 🐆 on the code, Dove 🕊️ on the audits)
- **[KBLaM](https://github.com/microsoft/KBLaM)** and **[Graphiti](https://github.com/getzep/graphiti)** — prior work this project's training exports and temporal model lean on

## License

MIT — see [LICENSE](https://github.com/AlexSabaka/wanshi/blob/master/LICENSE).
