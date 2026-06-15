import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { GrobidClient } from "./GrobidClient";
import { stubLogger } from "../../../../__tests__/helpers";

const TEI = `<?xml version="1.0"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><body>
    <p>
      <s>Transformers scale well <ref type="bibr" target="#b0">[1]</ref>.</s>
      <s>Sparse MoE and attention help <ref type="bibr" target="#b1">[2]</ref> <ref type="bibr" target="#b0">[1]</ref>.</s>
    </p>
  </body>
  <back><div type="references"><listBibl>
    <biblStruct xml:id="b0"><analytic>
      <title level="a">Attention Is All You Need</title>
      <idno type="arXiv">arXiv:1706.03762</idno>
    </analytic></biblStruct>
    <biblStruct xml:id="b1"><analytic>
      <title level="a">Outrageously Large Neural Networks</title>
      <idno type="DOI">10.1234/moe.2017</idno>
    </analytic></biblStruct>
  </listBibl></div></back>
  </text>
</TEI>`;

describe("GrobidClient.parseTei", () => {
  const client = () => new GrobidClient("http://localhost:8070", stubLogger(), jest.fn() as any);

  it("links each in-text marker to its reference's ids/title + citing sentence", () => {
    const ctx = client().parseTei(TEI);
    expect(ctx).toHaveLength(2);

    const b0 = ctx.find((c) => c.ids.arxivId === "1706.03762")!;
    expect(b0.ids.title).toBe("Attention Is All You Need");
    expect(b0.citingClaim).toContain("Transformers scale well");
    expect(b0.soleReferent).toBe(true); // first cited in a single-ref sentence

    const b1 = ctx.find((c) => c.ids.doi === "10.1234/moe.2017")!;
    expect(b1.ids.title).toBe("Outrageously Large Neural Networks");
    expect(b1.ids.arxivId).toBeUndefined();
    expect(b1.citingClaim).toContain("Sparse MoE");
    expect(b1.soleReferent).toBe(false); // its sentence co-cites [2] and [1]
  });

  it("POSTs the PDF and parses the response", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kggrobid-"));
    const file = path.join(tmp, "p.pdf");
    fs.writeFileSync(file, "%PDF-1.4 fake");
    const fetchFn = jest.fn(async () => new Response(TEI, { status: 200 }));

    const ctx = await new GrobidClient("http://localhost:8070", stubLogger(), fetchFn as any).process(file);
    const call = fetchFn.mock.calls[0] as any[];
    expect(call[0]).toContain("/api/processFulltextDocument");
    expect(call[1].method).toBe("POST");
    expect(ctx).toHaveLength(2);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("throws on a non-OK GROBID response (caller degrades to regex)", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kggrobid-"));
    const file = path.join(tmp, "p.pdf");
    fs.writeFileSync(file, "%PDF");
    const fetchFn = jest.fn(async () => new Response("nope", { status: 503 }));
    await expect(
      new GrobidClient("http://localhost:8070", stubLogger(), fetchFn as any).process(file)
    ).rejects.toThrow(/GROBID 503/);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
