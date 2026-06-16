import { KnowledgeGraphBuilder } from "./KnowledgeGraphBuilder";
import { stubLogger } from "../../__tests__/helpers";

describe("KnowledgeGraphBuilder — sourceAdapter/locator flow to observations", () => {
  it("stamps a chunk's sourceAdapter + locator onto every extracted observation", async () => {
    const llmService = {
      generateStructured: async () => ({
        entities: [{ name: "Parts", entityType: "table", observations: ["row 1 exists"] }],
        relations: [],
      }),
      getModelCapabilities: async () => [],
    } as any;
    const promptManager = { getUserPrompt: async () => "u", getSystemPrompt: async () => "s" } as any;
    const builder = new KnowledgeGraphBuilder({ llmService, promptManager, model: "m" }, stubLogger());

    const processedFile = {
      path: "data.db",
      content: "x",
      chunks: [
        {
          content: "c",
          index: 1,
          totalChunks: 1,
          startOffset: 0,
          endOffset: 1,
          provenance: { sourceAdapter: "sqlite", locator: "table:parts/row:1" },
        },
      ],
    } as any;

    const graphs = await builder.build(processedFile, "s");
    const obs = graphs[0].entities[0].observations[0] as any;
    expect(obs.sourceAdapter).toBe("sqlite");
    expect(obs.locator).toBe("table:parts/row:1");
  });
});
