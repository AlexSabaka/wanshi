import { Turn, packTurns, renderTurn } from "./turnPacking";
import { TextChunker } from "../../chunking/TextChunker";
import { stubLogger } from "../../../../__tests__/helpers";

const chunker = (maxChunkSize = 4000) =>
  new TextChunker({ maxChunkSize, overlapSize: 50, enabled: true }, stubLogger());

const SRC = "/audio/lesson.m4a";

describe("packTurns", () => {
  it("renders a turn as `speaker: text`", () => {
    expect(renderTurn({ speaker: "SPEAKER_00", text: "hi there" })).toBe(
      "SPEAKER_00: hi there"
    );
  });

  it("packs a small multi-speaker dialogue into one chunk without a single speaker", async () => {
    const turns: Turn[] = [
      { speaker: "SPEAKER_00", text: "alpha beta" },
      { speaker: "SPEAKER_01", text: "gamma delta" },
    ];
    const chunks = await packTurns(turns, SRC, 4000, chunker());
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("SPEAKER_00: alpha beta");
    expect(chunks[0].content).toContain("SPEAKER_01: gamma delta");
    expect(chunks[0].provenance?.speaker).toBeUndefined();
    expect(chunks[0].provenance?.source).toBe(SRC);
    expect(chunks[0].index).toBe(1);
    expect(chunks[0].totalChunks).toBe(1);
  });

  it("stamps speaker provenance when a packed chunk is single-speaker", async () => {
    const turns: Turn[] = [
      { speaker: "SPEAKER_00", text: "alpha beta" },
      { speaker: "SPEAKER_00", text: "gamma delta" },
    ];
    const chunks = await packTurns(turns, SRC, 4000, chunker());
    expect(chunks).toHaveLength(1);
    expect(chunks[0].provenance?.speaker).toBe("SPEAKER_00");
  });

  it("carries the earliest occurredAt onto a packed chunk", async () => {
    const turns: Turn[] = [
      { speaker: "A", text: "first", occurredAt: "2025-01-01T00:00:00Z" },
      { speaker: "A", text: "second", occurredAt: "2025-01-01T00:00:05Z" },
    ];
    const chunks = await packTurns(turns, SRC, 4000, chunker());
    expect(chunks[0].provenance?.occurredAt).toBe("2025-01-01T00:00:00Z");
  });

  it("splits an oversized single turn, keeping the speaker label on every piece", async () => {
    const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const turns: Turn[] = [{ speaker: "SPEAKER_07", text: long }];
    const chunks = await packTurns(turns, SRC, 120, chunker(120));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.content.startsWith("SPEAKER_07:"))).toBe(true);
    expect(chunks.every((c) => c.provenance?.speaker === "SPEAKER_07")).toBe(true);
  });

  it("never packs two conversations into one chunk (KG-10)", async () => {
    const turns: Turn[] = [
      { speaker: "human", text: "conv one alpha", conversation: 0, occurredAt: "2025-01-01T00:00:00Z" },
      { speaker: "ai", text: "conv one beta", conversation: 0 },
      { speaker: "human", text: "conv two gamma", conversation: 1, occurredAt: "2025-06-06T12:00:00Z" },
      { speaker: "ai", text: "conv two delta", conversation: 1 },
    ];
    const chunks = await packTurns(turns, SRC, 4000, chunker());
    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toContain("conv one");
    expect(chunks[0].content).not.toContain("conv two");
    expect(chunks[1].content).toContain("conv two");
    expect(chunks[0].provenance?.occurredAt).toBe("2025-01-01T00:00:00Z");
    expect(chunks[1].provenance?.occurredAt).toBe("2025-06-06T12:00:00Z");
  });

  it("skips empty-text turns", async () => {
    const turns: Turn[] = [
      { speaker: "A", text: "" },
      { speaker: "B", text: "real content" },
    ];
    const chunks = await packTurns(turns, SRC, 4000, chunker());
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe("B: real content");
  });
});
