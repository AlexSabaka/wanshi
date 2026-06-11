import { LlmContentClassifier } from "./LlmContentClassifier";
import { stubLogger } from "../../../__tests__/helpers";

describe("LlmContentClassifier (KG-15)", () => {
  it("routes classification through the injected ILLMProvider (no hardcoded Ollama)", async () => {
    const calls: { messages: any; schema: any }[] = [];
    const llm = {
      generateStructured: async (messages: any, schema: any) => {
        calls.push({ messages, schema });
        return { class: "medical", confidence: 0.91 };
      },
      getModelCapabilities: async () => [],
    } as any;

    const classifier = new LlmContentClassifier(llm, stubLogger());
    const result = await classifier.classify("patient chart text", "chart.txt");

    expect(result).toEqual([{ class: "medical", confidence: 0.91 }]);
    // Going through the provider abstraction is the whole fix: a cloud provider
    // is used on cloud runs instead of a hardcoded Ollama client that 404s.
    expect(calls).toHaveLength(1);
    expect(calls[0].messages[0].role).toBe("system");
    expect(calls[0].messages[1].content).toContain("chart.txt");
  });

  it("propagates a provider failure instead of swallowing it", async () => {
    const llm = {
      generateStructured: async () => {
        throw new Error("provider boom");
      },
      getModelCapabilities: async () => [],
    } as any;

    const classifier = new LlmContentClassifier(llm, stubLogger());
    await expect(classifier.classify("x", "f.txt")).rejects.toThrow(
      "provider boom"
    );
  });
});
