---
id: output-formats
title: Output formats
description: JSON, MCP-JSONL, GraphViz DOT, and the KBLaM / LoRA / Graphiti training-and-temporal exports.
---

# Output formats

Choose with `--export-format <format>` (or `export.format` in config). Re-export an existing graph without re-extracting via `--export-only`.

## JSON (`json`)

Observations are **objects**, not bare strings — each carries provenance and the bi-temporal axis. The LLM emits plain text; `wanshi` stamps the metadata deterministically from what it knows about the chunk. Unknown fields are omitted; legacy string-observation graphs still load.

```json
{
  "entities": [
    {
      "name": "knowledge_graph_builder",
      "entityType": "class",
      "observations": [
        {
          "text": "Extracts entities and relations from file content using an LLM",
          "source": "src/core/knowledge/KnowledgeGraphBuilder.ts",
          "createdAt": "2026-06-05T15:57:59.856Z"
        }
      ],
      "files": ["src/core/knowledge/KnowledgeGraphBuilder.ts"]
    },
    {
      "name": "SPEAKER_01",
      "entityType": "person",
      "observations": [
        {
          "text": "Explains that a Naïve Bayes classifier assumes word independence",
          "speaker": "SPEAKER_01",
          "source": "Olga Lesson P.parakeet.txt",
          "validAt": "2026-05-28T00:00:00Z",
          "createdAt": "2026-06-05T15:57:59.856Z"
        }
      ],
      "files": ["Olga Lesson P.parakeet.txt"]
    }
  ],
  "relations": [
    { "from": "knowledge_graph_builder", "to": "ollama_service", "relationType": ["uses", "depends_on"] }
  ]
}
```

## MCP-compatible JSONL (`mcp-jsonl`)

```jsonl
{"type":"entity","name":"knowledge_graph_builder","entityType":"class","observations":["Extracts entities and relations from file content using an LLM"]}
{"type":"relation","from":"knowledge_graph_builder","to":"ollama_service","relationType":"uses,depends_on"}
```

## GraphViz DOT (`dot`)

Styled, colored graph (one node per entity, colored edges per relation type, legend, config summary). Render with `dot -Tsvg graph.dot -o graph.svg` (or `neato`/`fdp`/`sfdp`/`circo`/`twopi`). Styling is config-only under `export.dot:` — layout, `rankdir`, `colorScheme` (`default\|scientific\|code\|minimal`), clustering by type or file, etc.

## KBLaM triples (`kblam`)

JSONL in the shape Microsoft [KBLaM](https://github.com/microsoft/KBLaM)'s `dataset_generation` ingests — **one `(entity, property, value)` per line**, each with the derived `Q`/`A`/`key_string` it encodes into a knowledge token. Property names are distinct per entity (relations contribute their predicate as the property), and keys are unique per `(name, property)` so rectangular-attention lookup is unambiguous.

```jsonl
{"name":"Recursion","property":"definition","value":"a function that calls itself","Q":"What is the definition of Recursion?","A":"The definition of Recursion is a function that calls itself.","key_string":"the definition of Recursion"}
{"name":"Recursion","property":"terminates_at","value":"BaseCase","Q":"What is the terminates_at of Recursion?","A":"The terminates_at of Recursion is BaseCase.","key_string":"the terminates_at of Recursion"}
```

## LoRA / SFT (`lora`)

Chat-format instruction examples derived from the same triples, **quality-filtered**: observations whose grounding score is below `--grounding-min-score` are dropped, so only grounded facts become training data.

```jsonl
{"messages":[{"role":"user","content":"What is the definition of Recursion?"},{"role":"assistant","content":"The definition of Recursion is a function that calls itself."}]}
```

## Graphiti (`graphiti`)

`add_triplet`-shaped `{ nodes, edges }` for ingestion into a [Graphiti](https://github.com/getzep/graphiti) temporal graph — entities → nodes (summary from observations), relations → `UPPER_SNAKE` edges with stable uuids. Per-fact valid-time rides along in the `json`/`kblam` exports.
