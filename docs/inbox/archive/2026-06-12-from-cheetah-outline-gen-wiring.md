# Heads-up: `document-outline-gen` got rebuilt — wiring notes for kg-gen

**From:** Cheetah 🐆 (working in the `document-outline-gen` repo)
**To:** Cheetah 🐆 (future, opened cold here in kg-gen) / Sabaka 🐕
**Date:** 2026-06-12
**Status:** correspondence — a to-do heads-up, not canon. Graduate the durable bits into
`docs/` or a `CLAUDE.md` once acted on.

---

## TL;DR

`document-outline-gen` (kg-gen's outline dependency) was rebuilt across ROADMAP Phases 0–7:
a unified **tree-sitter WASM engine**, now **45 file extensions** + **11 output formats**, with a
proper formatter layer and typed errors. The `OutlineNode` contract kg-gen depends on was held
**strictly additive** the whole way — nothing kg-gen reads today changed shape. There are a few
concrete wiring upgrades kg-gen should make to cash in, and one design coordination for the
upcoming Phase 8.

## ⚠️ Gating fact — none of this is live yet

All of it sits on branch **`feat/wasm-engine-phase-0-1`** in `document-outline-gen`, **unpushed**
(Sabaka's call: "push after the roadmap is complete"). kg-gen's `package.json` tracks the default
branch:

```
"document-outline-gen": "github:AlexSabaka/document-outline-gen",   // → master
```

So kg-gen sees **zero** of this until that branch is pushed + merged to `master`, after which
kg-gen's next install (`prepare` builds on install) picks it up. **Do the wiring tasks below only
after the merge** (or they'll reference APIs that aren't in kg-gen's installed copy yet).

## Wiring tasks in kg-gen (all in `src/shared/utils/documentOutline.ts`)

That file currently (a) calls the **throwing** generate path and (b) carries its **own private
copy** of the ascii-tree renderer. Both are now better-served upstream:

1. **Stop the per-chunk warning noise (KG-17).** Switch
   `generator.generateFromContent(content, extension, options)` →
   **`generateFromContentSafe(...)`**. The Safe variant returns `[]` for unknown extensions / parse
   failures instead of throwing, which is exactly what a heterogeneous reader wants. (There's also
   `generateFromFileSafe`.)

2. **Delete kg-gen's `formatAsTree`/`formatMetadata` (lines ~22–69).** They are **byte-identical**
   to what's now the canonical formatter upstream. Replace with the exported renderer:
   ```ts
   import { formatOutline } from 'document-outline-gen';
   // ...
   return formatOutline(outline, 'ascii-tree');           // same output as today
   // or, for token-lean prompts:
   return formatOutline(outline, 'ascii-tree', { compact: true });
   ```
   This makes upstream the single source of truth and gives kg-gen the new `compact` mode + any
   future tree improvements for free.

3. **New coverage you can now lean on.** Extensions that used to warn now produce real outlines:
   Go, Rust, Ruby, PHP, Kotlin, Swift, Scala, Lua; TOML, INI/CFG/CONF, Properties/`.env`; and the
   markup set RST, AsciiDoc, LaTeX, Org, Wiki. CSV column nodes now carry **`metadata.dataType`**
   (the key the tree renderer already prints).

4. **Token/context toggle.** kg-gen's "outline trades context for tokens" lever is now covered by
   `compact` (ascii-tree) **+** the existing `maxDepth`. Wire `compact` into `OutlineOptions` /
   `readers.outline` so it's tunable next to `maxDepth`. (Consumed at
   `src/core/llm/prompts/PromptTemplateEngine.ts:239` → `enhanced.fileOutline` → `{{fileOutline}}`
   in the v4/v4.5/v5 user templates.)

5. **Pin once tagged.** Outline-gen will start tagging (`v1.x`) after this lands. Recommend kg-gen
   pin `github:AlexSabaka/document-outline-gen#semver:^1.x` rather than tracking the default branch,
   so a future outline-gen push doesn't silently change kg-gen's next install.

## 🔗 Phase 8 coordination — the one that needs YOUR taxonomy (do not let it fork)

The final outline-gen phase (8) adds a deterministic **Symbol API** purpose-built to seed kg-gen's
own roadmap Phase 8 ("AST-seeded code extraction"):

- `extractSymbols(content, ext, opts) → SymbolTable` — flat `{ name, qualifiedName, kind, span,
  exported, signature? }`.
- within-file reference edges `{ from, to, kind: 'calls' | 'imports', line }` (cross-file
  resolution stays kg-gen's job).
- a content-hash helper for incremental skip, and a **versioned `SymbolTable` schema** kg-gen pins.

**Critical:** the symbol `kind` enum must **map 1:1 into kg-gen's Phase-2 type vocabulary, not
become a parallel taxonomy.** When we plan outline-gen Phase 8, the first job is to read kg-gen's
existing entity/type taxonomy and design the enum to fit it. Candidate places to look here (verify,
don't trust this list blindly — it's a starting map): `src/types/ContentClass.ts`,
`src/types/CorpusProfile.ts`, `src/core/processor/classifier/`, and the glossary/entity-type
definitions under `src/core/corpus/`. Bring the actual kg-gen kind list to the outline-gen Phase-8
planning session.

## The contract (so nobody breaks it from either side)

kg-gen reads exactly: `title`, `type`, `line`, `children`, and
`metadata.{visibility, isStatic, isAbstract, parameters[].name, dataType}`; and passes options
`{ maxDepth, includeLineNumbers, includePrivate, includeComments }`. Every outline-gen phase was
additive to this. Keep it that way when wiring.
