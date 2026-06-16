import { FileProcessor } from "./FileProcessor";
import { FileReaderFactory } from "./readers";
import { stubLogger } from "../../__tests__/helpers";

const stubReader = (adapterId: string, chunks: any[]) =>
  ({
    canRead: () => true,
    getName: () => "Stub",
    adapterId: () => adapterId,
    read: async () => ({ chunks, metadata: {} }),
  } as any);

const make = (reader: any) => {
  const factory = new FileReaderFactory(stubLogger());
  factory.registerReader(reader);
  return new FileProcessor(factory, undefined, false, stubLogger());
};

const chunk = (provenance?: any) => ({
  content: "c",
  index: 1,
  totalChunks: 1,
  startOffset: 0,
  endOffset: 1,
  ...(provenance ? { provenance } : {}),
});

describe("FileProcessor — central ECS source-tagging", () => {
  it("stamps sourceAdapter from the matched reader onto every chunk", async () => {
    const pf = await make(stubReader("sqlite", [chunk({ locator: "table:x/row:1" })])).processFile("f.db");
    expect(pf.chunks[0].provenance?.sourceAdapter).toBe("sqlite");
    expect(pf.chunks[0].provenance?.locator).toBe("table:x/row:1"); // reader-supplied locator preserved
  });

  it("stamps sourceAdapter even when the reader sets no provenance at all", async () => {
    const pf = await make(stubReader("markdown", [chunk()])).processFile("f.md");
    expect(pf.chunks[0].provenance?.sourceAdapter).toBe("markdown");
  });

  it("does not override a reader-set sourceAdapter (finer id wins)", async () => {
    const pf = await make(
      stubReader("generic", [chunk({ sourceAdapter: "pdf:mistral", locator: "p.7" })])
    ).processFile("f.pdf");
    expect(pf.chunks[0].provenance?.sourceAdapter).toBe("pdf:mistral");
    expect(pf.chunks[0].provenance?.locator).toBe("p.7");
  });
});
