import {
  parseConfig,
  ConfigError,
  configJsonSchema,
  configSchemaPayload,
} from "./index";
import { cliArgsToConfig, deepMerge } from "../cli/optionsToConfig";

describe("config schema", () => {
  it("applies nested defaults from an empty config", () => {
    const c = parseConfig({});
    expect(c.input).toBe(".");
    expect(c.filter).toEqual(["**/*"]);
    expect(c.llm.model).toBe("llama3.2");
    expect(c.llm.provider).toBe("ollama");
    expect(c.llm.promptVersion).toBe("v5");
    expect(c.embeddings.model).toBe("mxbai-embed-large:335m");
    expect(c.chunking.size).toBe(2000);
    expect(c.chunking.overlap).toBe(100);
    expect(c.retrieval.scope).toBe("chunk");
    expect(c.export.format).toBe("json");
    expect(c.export.dot.layout).toBe("dot");
    expect(c.logging.level).toBe("info");
    expect(c.resume.enabled).toBe(false);
  });

  it("coerces CLI string numbers and a single filter string", () => {
    const c = parseConfig({ chunking: { size: "3000" }, filter: "**/*.ts" });
    expect(c.chunking.size).toBe(3000);
    expect(c.filter).toEqual(["**/*.ts"]);
  });

  it("rejects an out-of-vocab enum value", () => {
    expect(() => parseConfig({ llm: { provider: "bogus" } })).toThrow(ConfigError);
  });

  it("rejects a legacy flat key and names the new nested path", () => {
    let message = "";
    try {
      parseConfig({ chunkSize: 2000 });
    } catch (e) {
      message = (e as ConfigError).message;
    }
    expect(message).toContain("chunkSize");
    expect(message).toContain("chunking.size");
    expect(message).toContain("MIGRATION.md");
  });

  it("resolves precedence defaults < file < CLI", () => {
    const file = { llm: { model: "file-model", host: "file-host" } };
    const cli = cliArgsToConfig({ model: "cli-model" });
    const c = parseConfig(deepMerge(file, cli));
    // CLI overrides the file value...
    expect(c.llm.model).toBe("cli-model");
    // ...but a file-only sibling survives the deep merge.
    expect(c.llm.host).toBe("file-host");
  });

  it("exposes a JSON Schema + UI groups for the frontend", () => {
    const schema = configJsonSchema() as any;
    const props = schema.properties ?? schema.definitions?.KgGenConfig?.properties;
    expect(props).toBeDefined();
    expect(props.llm).toBeDefined();
    expect(props.chunking).toBeDefined();

    const payload = configSchemaPayload();
    expect(payload.jsonSchema).toBeDefined();
    expect(payload.groups.length).toBeGreaterThan(0);
    expect(payload.groups.some((g) => g.id === "generation")).toBe(true);
    expect(payload.controlledPaths).toContain("resume.enabled");
  });
});
