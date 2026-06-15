/**
 * Phase-2 LIVE integration probe (throwaway). Drives the REAL
 * CitationEvidenceProcessor against live services — GROBID (localhost:8070),
 * arXiv/Unpaywall, local embeddinggemma, local MiniCheck — on a real arXiv PDF.
 * Skips the slow LLM extraction of fetched works (span-select only needs the
 * PdfReader chunks), so it verifies the citation pipeline end-to-end in minutes
 * instead of grinding through full-corpus KG extraction.
 *
 *   npx ts-node examples/sandbox/phase2-live-probe.ts /tmp/phase2-corpus/2305.13048.pdf
 */
import { CitationEvidenceProcessor, CitationExtractFn } from "../../src/core/knowledge/references/citations/CitationEvidenceProcessor";
import { CitationResolver } from "../../src/core/knowledge/references/citations/CitationResolver";
import { GrobidClient } from "../../src/core/knowledge/references/citations/GrobidClient";
import { GatedFetcher } from "../../src/core/knowledge/references/web/GatedFetcher";
import { FetchCacheService } from "../../src/core/knowledge/references/web/FetchCacheService";
import { MiniCheckGroundingChecker } from "../../src/core/knowledge/grounding/MiniCheckGroundingChecker";
import { EmbeddingService } from "../../src/core/llm/EmbeddingService";
import { PdfReader } from "../../src/core/processor/readers/PdfReader";
import { TextChunker } from "../../src/core/processor/chunking/TextChunker";

const file = process.argv[2] || "/tmp/phase2-corpus/2305.13048.pdf";
const EMAIL = process.env.UNPAYWALL_EMAIL || "alex.love.broadcast@gmail.com";
const OLLAMA = "http://127.0.0.1:11434";

const logger = {
  info: (m: string) => console.log("·", m),
  warn: (m: string) => console.log("⚠", m),
  error: (m: string) => console.log("✖", m),
  debug: () => undefined,
  trace: () => undefined,
  fatal: (m: string) => console.log("✖✖", m),
} as any;

const llmStub = { generateStructured: async () => ({}), getModelCapabilities: async () => [] } as any;

(async () => {
  const fetcher = new GatedFetcher(
    {
      allowlist: ["arxiv.org", "ncbi.nlm.nih.gov", "aclanthology.org", "openreview.net", "proceedings.mlr.press"],
      rejectlist: [],
      maxFetches: 3,
      timeoutMs: 30000,
      maxBytes: 30_000_000,
      relevanceCheck: false,
      robots: true,
      allowPdf: true,
    },
    llmStub,
    logger
  );
  const cache = new FetchCacheService("/tmp/phase2-live/probe-cache.jsonl", logger);
  await cache.load();
  const resolver = new CitationResolver({ unpaywallEmail: EMAIL }, logger, null);
  const grobid = new GrobidClient("http://localhost:8070", logger);
  const embeddings = new EmbeddingService(
    { model: "hf.co/unsloth/embeddinggemma-300m-GGUF:BF16", host: OLLAMA, maxInputChars: 1024 },
    logger
  );
  const faithfulness = new MiniCheckGroundingChecker(
    { model: "bespoke-minicheck:7b", host: OLLAMA, min: 0.5, escalateAbove: 1.1 },
    logger
  );

  const pdf = new PdfReader(new TextChunker({ enabled: true, maxChunkSize: 4000, overlapSize: 0 } as any, logger), logger, false, false);
  const extract: CitationExtractFn = async (tempPath) => {
    const pf = await pdf.read(tempPath);
    return { chunks: pf.chunks.map((c) => c.content), graphs: [] }; // chunks for span-select; no LLM build
  };

  console.log(`\n=== Phase-2 live probe on ${file} ===`);
  console.log(`GROBID alive: ${await grobid.isAlive()}\n`);

  const proc = new CitationEvidenceProcessor(fetcher, cache, resolver, extract, embeddings, logger, {
    grobid,
    faithfulness,
    uncertainBand: [0.34, 0.67],
  });

  const t0 = Date.now();
  const g = await proc.process("2305.13048.pdf", file, []);
  console.log(`\n=== done in ${((Date.now() - t0) / 1000).toFixed(0)}s ===`);
  if (!g) return console.log("no graph");

  const cites = g.relations.filter((r) => r.relationType.includes("cites"));
  const resolved = cites.filter((r) => r.resolved);
  const labeled = cites.filter((r) => r.faithfulness);
  console.log(`cites edges: ${cites.length} | resolved(fetched OA): ${resolved.length} | faithfulness-labeled: ${labeled.length}`);
  const byLabel = (l: string) => labeled.filter((r) => r.faithfulness === l).length;
  console.log(`labels → supported:${byLabel("supported")} uncertain:${byLabel("uncertain")} unsupported:${byLabel("unsupported")}\n`);

  for (const r of resolved) {
    console.log(`▶ ${r.from}  --cites-->  ${r.to}`);
    console.log(`   resolved=${r.resolved}  faithfulness=${r.faithfulness ?? "(none)"}  score=${r.faithfulnessScore?.toFixed(2) ?? "-"}`);
    if (r.supportingSpan) console.log(`   span: ${r.supportingSpan.replace(/\s+/g, " ").slice(0, 200)}…`);
    const node = g.entities.find((e) => e.name === r.to);
    const claim = node?.observations.find((o) => /faithfulness/i.test(o.text));
    console.log("");
  }
})().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
