#!/usr/bin/env node

console.log("Testing wanshi dynamic require...\n");

try {
  console.log("1. Attempting to load ContainerFactory...");
  const ContainerFactory = require("wanshi/src/core/di/ContainerFactory").ContainerFactory;
  console.log("   ✅ ContainerFactory loaded:", typeof ContainerFactory);

  console.log("\n2. Attempting to load TYPES...");
  const TYPES = require("wanshi/src/core/di/index").TYPES;
  console.log("   ✅ TYPES loaded:", typeof TYPES);
  console.log("   ✅ TYPES.FileProcessor:", TYPES.FileProcessor);

  console.log("\n3. Creating container...");
  const container = ContainerFactory.createContainer({
    processingOptions: {
      input: "./data/emails",
      filter: ["**/*.txt", "**/*.md"],
      classifier: "heuristic",
    },
  });
  console.log("   ✅ Container created:", typeof container);

  console.log("\n4. Resolving FileProcessor...");
  container.resolve(TYPES.FileProcessor).then((fileProcessor) => {
    console.log("   ✅ FileProcessor resolved:", typeof fileProcessor);
    console.log("\n✅ All wanshi dependencies loaded successfully!");
  });
} catch (error) {
  console.error("\n❌ Error loading wanshi:");
  console.error(error);
  process.exit(1);
}
