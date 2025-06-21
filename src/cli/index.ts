#! /usr/bin/env node

import { Command } from "commander";
import * as info from "../../package.json";
import { processCommand, watchCommand } from "./commands";
import { ProcessingOptions } from "../types/ProcessingOptions";
import { ContainerFactory, TYPES } from "../core/di";
import { readConfigurationFile, Logger, LoggerFactory } from "../shared";

const program = new Command();

program
  .name(info.name)
  .description(info.description)

  .option("--config <file>", "path to yaml/json configuration file with processing options")

  // Core Processing
  .option("-i, --input <path>", "input directory (default: pwd)", ".")
  .option("-f, --filter <filter>", "files filter (default: **/*)", "**/*")
  .option(
    "-o, --output <path>",
    "output knowledge graph file",
    "knowledge-graph.json"
  )
  .option(
    "-d, --description <text>",
    "short description for the files being processed",
    ""
  )

  // LLM Configuration
  .option("-m, --model <name>", "LLM to use with Ollama", "llama3.2")
  .option("-h, --host <url>", "Ollama host URL", "http://localhost:11434")
  .option("--temperature <number>", "model temperature", "0.1")
  .option(
    "--repeat-penalty <number>",
    "repeat penalty (higher value promotes more diverse results)",
    "0.3"
  )
  .option(
    "--context-length <number>",
    "model context length, should be long enough to fit system prompt, file content/chunk and response (default: 8192)",
    "8192"
  )
  .option("--seed <number>", "model seed", "")
  .option(
    "-s, --system <prompt|path>",
    "LLM system prompt or path to handlebars template"
  )
  .option(
    "--embeddings-model <name>",
    "embeddings model used for observations similarity merging",
    "mxbai-embed-large:335m"
  )

  // Text Processing
  .option("--chunking", "set chunking mode (disabled|auto|enabled)", "enabled")
  .option("-c, --chunk-size <size>", "maximum chunk size in characters", "2000")
  .option(
    "--overlap-size <size>",
    "overlap size between chunks in characters",
    "100"
  )

  // Whisper Audio/Video Processing
  .option(
    "--asr",
    "set automatic speech recognition mode (disabled|auto|enabled)",
    "enabled"
  )
  .option("--whisper-model <name>", "set whisper model (default: medium)", "medium")
  .option(
    "--language <lang>",
    "set speech recognition language (default: auto)",
    "auto"
  )
  .option(
    "--translate",
    "translate to english (default: false)",
    false
  )

  // Enable Docling PDF/DOC/DOCX/PPT/PPTX Processing
  .option("--docling", "use docling for PDF/DOC/DOCX/PPT/PPTX documents processing (default: false)", false)

  // Context Retrieval
  .option(
    "--retrieval",
    "set retrieval mode (disabled|auto|enabled)",
    "enabled"
  )
  .option("--retrieval-limit <number>", "context retrieval limit", "3")

  // Knowledge Graph Merging
  .option(
    "--entity-similarity-threshold <number>",
    "Jaro-Winkler similarity threshold for entity names merging",
    "0.9"
  )
  .option(
    "--observation-similarity-threshold <number>",
    "how similar observation embeddings needs to be so they are considered same",
    "0.9"
  )
  .option(
    "--enable-similarity-merging",
    "set similarity merging for entities and observations",
    true
  )

  // Export Options
  .option(
    "--export-format <format>",
    "export format (json|jsonl|mcp-jsonl|dot)",
    "json"
  )

  // Logging & Debug
  .option("-L, --log-level <level>", "log level", "info")
  .option("-l, --log-file <path>", "log file")
  .option("-D, --debug", "debug mode", false)
  .option("-S, --silent", "silent mode", false)

  // Runtime Modes
  .option("-w, --watch", "watch for changes and update knowledge graph", false)

  .version(info.version)
  .action(async (options: ProcessingOptions) => {
    // Read configuration file if present
    if (options.config) {
      const tempLogger = LoggerFactory.createLogger(options);

      tempLogger.info(`Reading processing configuration file from ${options.config}`);
      const configOptions = await readConfigurationFile(options.config);

      tempLogger.debug(`Configuration file contents:`, configOptions);

      tempLogger.warn(`Merging configuration file options with CLI arguments`);
      options = {
        ...options,
        ...configOptions,
      };
    }

    // Initialize DI container
    const container = ContainerFactory.createContainer({
      processingOptions: options,
    });

    const logger = await container.resolve<Logger>(TYPES.Logger);

    try {
      if (options.watch) {
        await watchCommand(container);
      } else {
        await processCommand(container);
      }
    } catch (error) {
      logger.error(`Command failed: ${error}`);
      process.exit(1);
    }
  });

program.parse();
