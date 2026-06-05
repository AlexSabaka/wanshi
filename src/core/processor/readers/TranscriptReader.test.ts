import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { TranscriptReader } from "./TranscriptReader";
import { TextChunker } from "../chunking/TextChunker";
import { stubLogger } from "../../../__tests__/helpers";

describe("TranscriptReader", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kgtr-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const reader = () => {
    const chunker = new TextChunker(
      { maxChunkSize: 4000, overlapSize: 50, enabled: true },
      stubLogger()
    );
    return new TranscriptReader(chunker, stubLogger(), 4000);
  };

  const write = (name: string, content: string) => {
    const p = path.join(tmp, name);
    fs.writeFileSync(p, content);
    return p;
  };

  it("parses speaker-labeled text into speaker-pure chunks, merging consecutive turns", async () => {
    const p = write(
      "lesson.parakeet.txt",
      "SPEAKER_00: first part here.\n\nSPEAKER_00: second part here.\n\nSPEAKER_01: a reply from the other side."
    );
    const res = await reader().read(p);
    // two SPEAKER_00 turns merge into one chunk; SPEAKER_01 is its own chunk
    expect(res.chunks).toHaveLength(2);
    expect(res.chunks[0].provenance?.speaker).toBe("SPEAKER_00");
    expect(res.chunks[0].content).toContain("first part");
    expect(res.chunks[0].content).toContain("second part");
    expect(res.chunks[0].content).not.toMatch(/^SPEAKER_00:/); // label stripped → in provenance
    expect(res.chunks[1].provenance?.speaker).toBe("SPEAKER_01");
    expect(res.chunks.every((c) => c.provenance?.source === p)).toBe(true);
  });

  it("parses recua turns JSON with speaker provenance", async () => {
    const p = write(
      "lesson.json",
      JSON.stringify([
        { start: 0, end: 2, speaker: "SPEAKER_00", parakeet: "alpha beta gamma" },
        { start: 2, end: 4, speaker: "SPEAKER_01", parakeet: "delta epsilon zeta" },
      ])
    );
    expect(reader().canRead(p)).toBe(true);
    const res = await reader().read(p);
    expect(res.chunks).toHaveLength(2);
    expect(res.chunks.map((c) => c.provenance?.speaker)).toEqual([
      "SPEAKER_00",
      "SPEAKER_01",
    ]);
    expect(res.chunks[0].content).toContain("alpha beta gamma");
  });

  it("parses Claude chat-export JSON with sender + timestamp provenance", async () => {
    const p = write(
      "conversations.json",
      JSON.stringify([
        {
          chat_messages: [
            { sender: "human", created_at: "2025-01-01T00:00:00Z", text: "what is recursion" },
            {
              sender: "assistant",
              created_at: "2025-01-01T00:00:05Z",
              content: [{ type: "text", text: "a function that calls itself" }],
            },
          ],
        },
      ])
    );
    expect(reader().canRead(p)).toBe(true);
    const res = await reader().read(p);
    expect(res.chunks).toHaveLength(2);
    expect(res.chunks[0].provenance?.speaker).toBe("human");
    expect(res.chunks[0].provenance?.occurredAt).toBe("2025-01-01T00:00:00Z");
    expect(res.chunks[1].provenance?.speaker).toBe("assistant");
    expect(res.chunks[1].content).toContain("calls itself");
  });

  it("defers non-transcript files (plain .txt and ordinary .json)", async () => {
    const txt = write("notes.txt", "just some prose without speakers");
    const json = write("data.json", JSON.stringify({ a: 1, b: [2, 3] }));
    const r = reader();
    expect(r.canRead(txt)).toBe(false);
    expect(r.canRead(json)).toBe(false);
  });
});
