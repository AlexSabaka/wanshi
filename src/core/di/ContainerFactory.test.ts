import { ContainerFactory, TYPES } from "./index";
import { makeConfig } from "../../__tests__/helpers";

describe("ContainerFactory — classifier gating", () => {
  it("rejects the unimplemented 'bert' classifier with a clear message", async () => {
    const container = ContainerFactory.createContainer({
      processingOptions: makeConfig({
        classifier: { mode: "bert" },
        logging: { level: "error", silent: true },
        llm: { model: "x", host: "y" },
      }),
    });

    await expect(container.resolve(TYPES.ContentClassifier)).rejects.toThrow(
      /bert.*not implemented/i
    );
  });
});
