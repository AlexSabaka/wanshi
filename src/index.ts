#! /usr/bin/env node

import { Command } from "commander";
import * as info from "../package.json";
import * as path from "path";
import * as chokidar from "chokidar";
import { Logger } from "./Logger";
import { processDirectory } from "./processDirectory";
import { ProcessingOptions } from "./types";


const program = new Command();

program
  .name(info.name)
  .description(info.description)
  .option("-i, --input <path>", "input directory", ".")
  .option("-f, --filter <filter>", "files filter", "**/*")
  .option("-o, --output <path>", "output knowledge graph file", "knowledge-graph.json")
  .option("-m, --model <name>", "LLM to use with Ollama", "llama3.2")
  .option("-s, --system <prompt>", "LLM system prompt")
  .option("-h, --host <url>", "Ollama host URL", "http://localhost:11434")
  .option("-L, --log-level <level>", "log level", "info")
  .option("-c, --chunk-size <size>", "maximum chunk size in characters", "2000")
  .option("-l, --log-file <path>", "log file")
  .option("-w, --watch", "watch for changes and update knowledge graph", false)
  .option("-d, --debug", "debug mode", false)
  .option("-S, --silent", "silent mode", false)
  .option("--context-length <number>", "model context length, should be long enough to fit system prompt, file content (chunk), response", "8192")
  .option("--temperature <number>", "model temperature", "0.1")
  .option("--seed <number>", "model seed", "")
  .option("--embeddings-model <name>", "embeddings model used for observations similarity merging", "mxbai-embed-large:335m")
  .option("--entity-similarity-threshold <number>", "Jaro-Winkler similarity threshold for entity names merging", "0.9")
  .option("--observation-similarity-threshold <number>", "how similar observation embeddings needs to be so they are considered same", "0.9")
  .option("--disable-similarity-merging", "disable similarity merging for entities and observations", false)
  .option("--overlap-size <size>", "overlap size between chunks in characters", "100") 
  .option("--disable-chunking", "disable text chunking for large files", false)
  .option("--export-format <format>", "export format (json|jsonl|mcp-jsonl)", "json")
  .version(info.version)
  .action(async (options: ProcessingOptions) => {
    if (options.watch) {
      const logger = new Logger(
        !!options.debug ? "debug" : options.logLevel,
        options.logFile,
        options.silent
      );
      logger.info("Watch mode enabled - monitoring for file changes...");

      const watcher = chokidar.watch(path.join(options.input, options.filter), {
        ignored: /^\./,
        persistent: true,
      });

      let processing = false;

      const processWithDebounce = async () => {
        if (processing) return;
        processing = true;

        try {
          await processDirectory(options);
        } catch (error) {
          logger.error(`Watch mode processing failed: ${error}`);
        } finally {
          processing = false;
        }
      };

      watcher
        .on("add", () => processWithDebounce())
        .on("change", () => processWithDebounce())
        .on("unlink", () => processWithDebounce());

      // Initial processing
      await processWithDebounce();

      // Keep the process running
      process.on("SIGINT", () => {
        logger.info("Stopping watch mode...");
        watcher.close();
        process.exit(0);
      });
    } else {
      await processDirectory(options);
    }
  });

program.parse();
