# Brief plan — file types & data sinks (the adapter track)

**From:** Dove 🕊️ · **To:** Cheetah 🐆 · **Date:** 2026-06-16
**Type:** planning roadmap (the whole track; each format expands into its own small impl brief).
**Frame (ELK/ECS lens):** every input source is an **adapter that maps source-native structure into
one canonical schema** — the graph (entities / observations / relations + provenance + bitemporal).
The LLM extractor is **one** adapter-to-schema mapping (for unstructured text), *not the only one*;
structured sources map directly. Provenance tags which adapter produced each fact.

## The organizing principle (read first)
Adding a file type is not "write a reader." It is **"write a mapping into the common schema."** Two
mapping paths exist, and recognizing which a source uses is the whole design:

- **Unstructured text → LLM-extract → schema.** The existing path (chunk → classify → extract →
  ground → merge). For prose, docs, transcripts.
- **Structured source → emit graph fragments → merge.** *New.* A SQLite foreign key, an OpenAPI
  schema, an iCal event, a wikilink — these *already are* schema-shaped. The adapter emits
  entities/edges **directly**, with the LLM used only for optional enrichment, not to invent
  structure. This is near-lossless and hallucination-free (the point of graph-native sources).

**This is the gating architectural decision** — see Phase 0. Most of the high-value sinks below need
the structured-emit path, which the pipeline does not have today (it assumes chunk → LLM-extract).

## Cross-cutting (apply to every adapter)
1. **Source-tagged provenance (the ECS import).** Generalize the OCR brief's `pdfEngine`-on-provenance
   and its page-number ask into a **general `sourceAdapter` + `locator` field** on
   `ChunkProvenance`/`Observation`. Then any fact is queryably attributable: "from the `sqlite`
   adapter, table `parts`," "datasheet p.67," "email `<msgid>`." Trust and origin become first-class,
   not PDF-specific.
2. **Adapter-boundary discipline.** Source-specific logic stays in the adapter. Nothing "email-shaped"
   or "SQLite-shaped" leaks downstream into extract/merge/export — they operate on the common schema
   only. (The Logstash input/filter/output separation, enforced.)
3. **Graph-native fragments still go through merge/canon.** Direct-emit bypasses *LLM extraction*, not
   *dedup* — emitted entities/edges still hit the merger so a SQLite `Author` and a prose-extracted
   `author` reconcile. Don't let the new path skip canonicalization.

## The sinks, by class (priority order; what's shipped flagged)

### Class A — graph-native (structure → schema, near-lossless, minimal/no LLM) — **highest value**
Map deterministically; double as **evaluation oracles** (ground-truth graphs to benchmark the LLM
extractor + seed canon/alias fixtures — feeds Phase-10 benchmarking and the parked adjudicator-recall work).
- **SQLite / relational** (`better-sqlite3`): tables → entity types, rows → entities, **FK → edges**.
  The strongest single add — a `.db` is a property graph in disguise.
- **Schema/IDL files**: OpenAPI/Swagger (`@apidevtools/swagger-parser`), `.proto` (`protobufjs`),
  GraphQL SDL (`graphql`), JSON Schema. A spec *is* a typed entity-relation graph by construction.
- **iCal `.ics` / vCard `.vcf`** (`node-ical`): events → temporal entities/edges (native to bitemporal);
  contacts → typed-attribute entities. Trivial, deterministic.
- *(Internal links + `[[wikilinks]]`: largely shipped as reference-resolution Phase 0 — verify wikilink
  coverage; do not re-brief.)*

### Class B — conversational / provenance-native (reuse the transcript+speaker machinery) — **high value, low effort**
Sender/recipient/timestamp → existing `source`/`speaker`/`occurredAt`; threads → conversation graphs.
Mostly format adapters over infrastructure that exists.
- **Email** `.eml`/`.mbox`/`.msg` (`mailparser` / `node-mbox` / `outlook-email-parser` — pure Node,
  `.msg` binary handled). The `kg-mail-assistant` example proves demand; file ingestion generalizes it.
- **Chat exports**: Slack/Discord (JSON), WhatsApp (`.txt`). *(Telegram via memory-sink, Claude/ChatGPT
  via TranscriptReader — already in.)*

### Class C — structure-rich text (LLM extracts body; structure aids chunking/edges) — **medium**
- **EPUB** (`epub2`): spine/TOC → chapter-boundary chunking; dense long-form.
- **LaTeX `.tex`**: `\cite`/`\ref` → citation/cross-ref edges PDF extraction loses; clean sections.
- **Jupyter `.ipynb`**: cell-type-aware (markdown narrative *explains* code *produces* output) ≫ flattened JSON.
- **Subtitles `.srt`/`.vtt`**: pre-transcribed timed content; map cue timestamps → `occurredAt`; skips re-ASR.

### Class D — domain-specific (the differentiator track; gated on whether you run the domain)
- **Electronics** (kcd: KiCad/SPICE/BOM) — already in your ecosystem; wire kcd in as a graph-native adapter.
- **Chem/bio** (SMILES/FASTA/PDB), **geospatial** (KML/GPX atop the shipped GeoJSON) — only if targeted.

## Phasing
- **Phase 0 — the enabling infra (gates Class A).** (a) The **structured-emit path**: a reader/adapter
  can return graph fragments (entities/edges), not only text chunks, routed into merge (optional LLM
  enrichment). (b) The **`sourceAdapter` + `locator` provenance field**. Confirm the seam: does
  `FileReadResult` / the builder support a "pre-structured graph" return today, or only `ChunkResult[]`?
  This is the recon that decides everything.
- **Phase 1 — Class A** (SQLite → schema files → iCal) on the new path. Each its own impl brief.
- **Phase 2 — Class B** (email → chat exports) reusing transcript provenance.
- **Phase 3 — Class C** (EPUB, LaTeX, Jupyter, subtitles).
- **Class D** — parallel, domain-gated; kcd first since the code exists.

## Forcing functions / out of scope
- **Do NOT build a plugin DSL/registry.** ~8 adapters, a personal tool — import ECS/separation
  *concepts*, not Logstash *machinery*. (The composable enrich-chain refactor is a separate future item.)
- **Graph-native = near-lossless.** If an adapter is LLM-inferring structure a source already encodes,
  it's in the wrong class. Direct-emit, no hallucination — that's the value.
- **Every fact carries `sourceAdapter`.** Non-negotiable; it's the ECS payoff.
- **Out:** the LLM-heavy composable-filter refactor (future); internal-link/wikilink (shipped);
  Beats-style streaming/edge collection (wrong paradigm — batch tool).

## Hand-back
Phase 0 recon answers (structured-emit seam + provenance field) decide the whole track's feasibility
and shape. With those, Class A is the highest-leverage first build — losslessly-lifted graphs that are
*also* the gold fixtures your benchmarking and canon work want.
