#! /usr/bin/env node

import { Command } from "commander";
import * as info from "../../package.json";
import { processCommand, watchCommand } from "./commands";
import { ProcessingOptions } from "../types/ProcessingOptions";
import { logger } from "../shared/logger";

const program = new Command();

program
  .name(info.name)
  .description(info.description)
  .option("-i, --input <path>", "input directory", ".")
  .option("-f, --filter <filter>", "files filter", "**/*")
  .option("-o, --output <path>", "output knowledge graph file", "knowledge-graph.json")
  .option("-m, --model <n>", "LLM to use with Ollama", "llama3.2")
  .option("-s, --system <prompt>", "LLM system prompt")
  .option("-h, --host <url>", "Ollama host URL", "http://localhost:11434")
  .option("-L, --log-level <level>", "log level", "info")
  .option("-c, --chunk-size <size>", "maximum chunk size in characters", "2000")
  .option("-l, --log-file <path>", "log file")
  .option("-w, --watch", "watch for changes and update knowledge graph", false)
  .option("-d, --description <text>", "short description for the files being processed", "")
  .option("-D, --debug", "debug mode", false)
  .option("-S, --silent", "silent mode", false)
  .option("--context-length <number>", "model context length, should be long enough to fit system prompt, file content (chunk), response", "8192")
  .option("--repeat-penalty <number>", "repeat penalty (higher value promotes more diverse results)", "0.3")
  .option("--retrieval-limit <number>", "context retrieval limit", "3")
  .option("--disable-retrieval", "disable context retrieval", false)
  .option("--temperature <number>", "model temperature", "0.1")
  .option("--seed <number>", "model seed", "")
  .option("--embeddings-model <n>", "embeddings model used for observations similarity merging", "mxbai-embed-large:335m")
  .option("--entity-similarity-threshold <number>", "Jaro-Winkler similarity threshold for entity names merging", "0.9")
  .option("--observation-similarity-threshold <number>", "how similar observation embeddings needs to be so they are considered same", "0.9")
  .option("--disable-similarity-merging", "disable similarity merging for entities and observations", false)
  .option("--overlap-size <size>", "overlap size between chunks in characters", "100") 
  .option("--disable-chunking", "disable text chunking for large files", false)
  .option("--export-format <format>", "export format (json|jsonl|mcp-jsonl)", "json")
  .version(info.version)
  .action(async (options: ProcessingOptions) => {
    // // Configure logger
    // if (options.silent) {
    //   logger.level = 'error';
    // } else if (options.debug) {
    //   logger.level = 'debug';
    // } else {
    //   logger.level = options.logLevel || 'info';
    // }

    // Enable retrieval by default
    options.enableRetrieval = !options.disableRetrieval;

    try {
      if (options.watch) {
        await watchCommand(options);
      } else {
        await processCommand(options);
      }
    } catch (error) {
      logger.error(`Command failed: ${error}`);
      process.exit(1);
    }
  });

program.parse();