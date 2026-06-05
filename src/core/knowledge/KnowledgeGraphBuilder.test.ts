import { KnowledgeGraphBuilder } from "./KnowledgeGraphBuilder";
import { stubLogger } from "../../__tests__/helpers";

describe("KnowledgeGraphBuilder", () => {
  function makeBuilder(captured: any[]) {
    const promptManager = {
      getUserPrompt: async (ctx: any) => {
        captured.push(ctx);
        return "user-prompt";
      },
      getSystemPrompt: async () => "system",
    } as any;
    const llmService = {
      generateStructured: async () => ({ entities: [], relations: [] }),
      getModelCapabilities: async () => [],
    } as any;
    return new KnowledgeGraphBuilder(
      { llmService, promptManager, model: "m" },
      stubLogger()
    );
  }

  it("threads full file content into the prompt context for multi-chunk files", async () => {
    const captured: any[] = [];
    const builder = makeBuilder(captured);

    const processedFile = {
      path: "f.txt",
      content: "FULL FILE TEXT",
      chunks: [
        { content: "chunk one", index: 1, totalChunks: 2, startOffset: 0, endOffset: 9 },
        { content: "chunk two", index: 2, totalChunks: 2, startOffset: 9, endOffset: 18 },
      ],
    } as any;

    const graphs = await builder.build(processedFile, "system");

    // one graph produced per chunk (mocked end-to-end through the LLM stub)
    expect(graphs).toHaveLength(2);
    // every chunk's prompt context carried the full file text for grounding/outline
    expect(captured).toHaveLength(2);
    expect(captured.every((c) => c.fileContent === "FULL FILE TEXT")).toBe(true);
    expect(captured[0].chunkContent).toBe("chunk one");
    expect(captured[1].chunkContent).toBe("chunk two");
  });

  it("scopes entityType to a per-domain Zod enum when a content class is detected", async () => {
    let capturedSchema: any;
    const promptManager = {
      getUserPrompt: async () => "u",
      getSystemPrompt: async () => "s",
    } as any;
    const llmService = {
      generateStructured: async (_m: any, schema: any) => {
        capturedSchema = schema;
        return { entities: [], relations: [] };
      },
      getModelCapabilities: async () => [],
    } as any;
    const builder = new KnowledgeGraphBuilder(
      { llmService, promptManager, model: "m" },
      stubLogger()
    );

    const processedFile = {
      path: "f.ts",
      content: "x",
      metadata: { classes: [{ class: "code", confidence: 0.9 }] },
      chunks: [{ content: "c", index: 1, totalChunks: 1, startOffset: 0, endOffset: 1 }],
    } as any;

    await builder.build(processedFile, "s");

    const entityType = capturedSchema.shape.entities.element.shape.entityType;
    // a ZodEnum exposes .options; ZodString does not
    expect(Array.isArray(entityType.options)).toBe(true);
    expect(entityType.options).toEqual(
      expect.arrayContaining(["function", "other"])
    );
  });
});
