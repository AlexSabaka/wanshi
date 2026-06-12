/**
 * Grounding-checker bench (Phase 5 gate, throwaway).
 *
 * Compares keyword overlap vs MiniCheck (bespoke-minicheck:7b) on a small
 * hand-labeled fixture, reporting balanced accuracy and the per-kind breakdown.
 * The gate to pass: balacc(minicheck) > balacc(keyword), and the snake_case
 * canonical-name cases stop auto-failing.
 *
 * Run:  npx ts-node examples/sandbox/grounding-bench.ts
 * (local Ollama only, free. Needs `ollama pull bespoke-minicheck:7b`.)
 */
import * as fs from "fs";
import * as path from "path";
import {
  KeywordGroundingChecker,
  MiniCheckGroundingChecker,
} from "../../src/core/knowledge/grounding";
import { IGroundingChecker } from "../../src/types";

interface Case {
  id: string;
  kind: string;
  source: string;
  claim: string;
  label: "grounded" | "ungrounded";
}

const MODEL = process.env.KG_GROUNDING_MODEL || "bespoke-minicheck:7b";
const MIN = 0.5;
const ESCALATE_ABOVE = 0.8;

// Minimal logger for the checker (only used to warn on an NLI error).
const logger: any = {
  warn: (m: string) => console.warn("  [warn]", m),
  debug: () => undefined,
  info: () => undefined,
  error: (m: string) => console.error("  [error]", m),
};

const cases: Case[] = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../../src/core/knowledge/grounding/__fixtures__/grounding-fixture.json"),
    "utf8"
  )
);

interface Tally {
  tp: number;
  tn: number;
  fp: number;
  fn: number;
}
const empty = (): Tally => ({ tp: 0, tn: 0, fp: 0, fn: 0 });
const balacc = (t: Tally) => {
  const tpr = t.tp / (t.tp + t.fn || 1);
  const tnr = t.tn / (t.tn + t.fp || 1);
  return (tpr + tnr) / 2;
};
const acc = (t: Tally) => (t.tp + t.tn) / (t.tp + t.tn + t.fp + t.fn || 1);

async function score(checker: IGroundingChecker): Promise<{ tally: Tally; perCase: Map<string, boolean> }> {
  const tally = empty();
  const perCase = new Map<string, boolean>();
  for (const c of cases) {
    const predGrounded = (await checker.check(c.claim, c.source)).supported;
    perCase.set(c.id, predGrounded);
    const actualGrounded = c.label === "grounded";
    if (predGrounded && actualGrounded) tally.tp++;
    else if (!predGrounded && !actualGrounded) tally.tn++;
    else if (predGrounded && !actualGrounded) tally.fp++;
    else tally.fn++;
  }
  return { tally, perCase };
}

async function main() {
  console.log(`\nGrounding bench — ${cases.length} cases ` +
    `(${cases.filter((c) => c.label === "grounded").length} grounded / ` +
    `${cases.filter((c) => c.label === "ungrounded").length} ungrounded)\n`);

  const keyword = new KeywordGroundingChecker(MIN);
  const minicheck = new MiniCheckGroundingChecker(
    { model: MODEL, min: MIN, escalateAbove: ESCALATE_ABOVE },
    logger
  );

  console.log("  scoring keyword …");
  const kw = await score(keyword);
  console.log(`  scoring minicheck (${MODEL}) …`);
  const mc = await score(minicheck);

  const row = (name: string, t: Tally) =>
    `  ${name.padEnd(11)} balacc ${balacc(t).toFixed(3)}  acc ${acc(t).toFixed(3)}  ` +
    `TP ${t.tp} TN ${t.tn} FP ${t.fp} FN ${t.fn}`;
  console.log("\n  === results ===");
  console.log(row("keyword", kw.tally));
  console.log(row("minicheck", mc.tally));

  // The Phase-5 gate's named requirement: snake_case canonical names stop
  // auto-failing. Report how each checker does on the snake_case grounded cases.
  const snake = cases.filter((c) => c.kind === "snake_case");
  const passOf = (pc: Map<string, boolean>) => snake.filter((c) => pc.get(c.id)).length;
  console.log(
    `\n  snake_case canonical names grounded: keyword ${passOf(kw.perCase)}/${snake.length}, ` +
      `minicheck ${passOf(mc.perCase)}/${snake.length}`
  );

  // Disagreements — where MiniCheck changed the verdict (the value it adds).
  console.log("\n  === disagreements (keyword → minicheck) ===");
  for (const c of cases) {
    const k = kw.perCase.get(c.id)!;
    const m = mc.perCase.get(c.id)!;
    if (k !== m) {
      const mCorrect = (m && c.label === "grounded") || (!m && c.label === "ungrounded");
      console.log(
        `  ${c.id.padEnd(9)} [${c.kind}] truth=${c.label.padEnd(10)} ` +
          `kw=${k ? "grounded" : "ungrounded"} → mc=${m ? "grounded" : "ungrounded"} ` +
          `(${mCorrect ? "MiniCheck fixes it" : "MiniCheck regresses"})`
      );
    }
  }

  const verdict = balacc(mc.tally) > balacc(kw.tally) ? "PASS" : "FAIL";
  console.log(
    `\n  GATE: balacc(minicheck) ${balacc(mc.tally).toFixed(3)} ` +
      `${verdict === "PASS" ? ">" : "<="} balacc(keyword) ${balacc(kw.tally).toFixed(3)} → ${verdict}\n`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
