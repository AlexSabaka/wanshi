import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";
import { KnowledgeGraphConverter } from "./KnowledgeGraphConverter";
import { KnowledgeGraph } from "../types/KnowledgeGraph";
import { ProcessingOptions } from "../types/ProcessingOptions";
import { default_system_prompt } from "../prompts/system-prompt-template-v3";
import { PdfReader } from "pdfreader";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import ollama, { ChatResponse } from "ollama";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { mergeKnowledgeGraphs } from "./knowledge-merging";
import { user_prompt_template } from "../prompts/user-prompt-template";
import { KnowledgeGraphSearch } from "./KnowledgeGraphSearch";
import { logger } from "../Logger";

const KnowledgeGraphSchema = z.object({
  entities: z.array(
    z.object({
      name: z.string().describe("Unique entity name"),
      entityType: z.string().describe("Entity description"),
      observations: z
        .array(z.string())
        .describe("List of facts and observations about entity"),
    })
  ),
  relations: z.array(
    z.object({
      from: z.string().describe("Relation source entity"),
      to: z.string().describe("Relation target entity"),
      relationType: z.array(z.string()).describe("List of relation types"),
    })
  ),
});

// File processing utilities
async function readTextFile(filePath: string): Promise<string> {
  return fs.readFileSync(filePath, "utf-8");
}

async function readImageFile(filePath: string): Promise<Buffer> {
  return fs.readFileSync(filePath);
}

async function readPdfFile(filePath: string): Promise<string> {
  try {
    new PdfReader().parseFileItems(filePath, (err, item) => {
      if (err) logger.error("error:" + err);
      else if (!item) logger.warn("end of file");
      else if (item.text) logger.warn(item.text);
    });
    return ""; //await readPdfText({ url: filePath });
  } catch (error) {
    throw new Error(`Failed to read PDF: ${error}`);
  }
}

function getFileType(filePath: string): "text" | "image" | "pdf" | "unknown" {
  const ext = path.extname(filePath).toLowerCase();

  if (
    [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".svg", ".webp"].includes(ext)
  ) {
    return "image";
  }

  if (ext === ".pdf") {
    return "pdf";
  }

  return "text";
}

export async function generateKnowledgeGraph(
  content: string,
  options: ProcessingOptions,
  images?: Buffer[]
): Promise<KnowledgeGraph> {
  try {
    const messages: any[] = [
      {
        role: "system",
        content: options.system,
      },
      {
        role: "user",
        content: content,
      },
    ];

    // Add images if present
    if (images && images.length > 0) {
      for (const image of images) {
        messages.push({
          role: "user",
          content: "",
          images: [image.toString("base64")],
        });
      }
    }

    const response = await ollama.chat({
      model: options.model,
      messages: messages,
      format: zodToJsonSchema(KnowledgeGraphSchema),
      options: {
        temperature: Number(options.temperature || 0.2), 
        num_ctx: Number(options.contextLength || 8192), 
        // num_predict: 2048,
        // num_gpu: 4,
        // num_thread: 8,
        // use_mmap: true,
        seed: Number(options.seed || NaN), 
        repeat_penalty: Number(options.repeatPenalty || 0.6) 
      },
    });

    const response_stats = (response: ChatResponse) =>
      `eval_count: ${response.eval_count}, prompt_eval_count: ${
        response.prompt_eval_count
      }, total_duration: ${response.total_duration / 1000000} ms, eval_speed: ${
        (60000000 * response.prompt_eval_count + response.eval_count) /
        response.total_duration
      } t/s`;

    logger?.info(`Received LLM response stats: ${response_stats(response)}`);

    let responseContent = response.message.content.trim();
    logger?.debug(`Raw LLM response: ${responseContent}`);

    if (responseContent.startsWith("```")) {
      responseContent = responseContent.slice(
        responseContent.indexOf("\n"),
        responseContent.lastIndexOf("\n")
      );
    }

    let parsed = undefined;
    try {
      // Parse JSON response
      parsed = JSON.parse(responseContent);
    } catch (err: any) {
      fs.appendFileSync("./failed-responses.log", responseContent + "\n\n\n\n\n");
      throw err;
    }

    parsed.entities ??= [];
    parsed.relations ??= [];

    return parsed as KnowledgeGraph;
  } catch (error) {
    logger?.error(`Failed to generate knowledge graph: ${error}`);
    throw error;
  }
}

// Add these interfaces to your types file
interface ChunkingOptions {
  maxChunkSize: number;
  overlapSize: number;
  enabled: boolean;
}

interface ProcessedChunk {
  content: string;
  chunkIndex: number;
  totalChunks: number;
  images?: Buffer[];
}

// Smart text chunking function using LangChain's text splitter
async function chunkText(
  text: string,
  maxChunkSize: number,
  overlapSize: number
): Promise<string[]> {
  if (text.length <= maxChunkSize) {
    return [text];
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: maxChunkSize,
    chunkOverlap: overlapSize,
    separators: [
      // Try to split on these in order of preference
      "\n\n", // Paragraph breaks
      "\n", // Line breaks
      ". ", // Sentence endings
      "? ", // Question endings
      "! ", // Exclamation endings
      "; ", // Semicolons
      ", ", // Commas
      " ", // Spaces
      "", // Character level as last resort
    ],
  });

  return await splitter.splitText(text);
}

// Updated processFile function with chunking support
export async function processFile(
  filePath: string,
  chunkingOptions?: ChunkingOptions
): Promise<{ content: string; images?: Buffer[]; chunks?: ProcessedChunk[] }> {
  const fileType = getFileType(filePath);
  logger.debug(`Processing file: ${filePath} (type: ${fileType})`);

  let baseResult: { content: string; images?: Buffer[] };

  switch (fileType) {
    case "text":
      baseResult = { content: await readTextFile(filePath) };
      break;

    case "image":
      const imageBuffer = await readImageFile(filePath);
      baseResult = {
        content: `[Image file: ${path.basename(filePath)}]`,
        images: [imageBuffer],
      };
      break;

    case "pdf":
      baseResult = { content: await readPdfFile(filePath) };
      break;

    default:
      logger.warn(`Unsupported file type: ${filePath}`);
      baseResult = { content: "" };
  }

  // Apply chunking if enabled and content is large enough
  if (
    chunkingOptions?.enabled &&
    baseResult.content.length > chunkingOptions.maxChunkSize
  ) {
    const textChunks = await chunkText(
      baseResult.content,
      chunkingOptions.maxChunkSize,
      chunkingOptions.overlapSize
    );

    const chunks: ProcessedChunk[] = textChunks.map((chunk, index) => ({
      content: chunk,
      chunkIndex: index,
      totalChunks: textChunks.length,
      images: index === 0 ? baseResult.images : undefined, // Only attach images to first chunk
    }));

    logger.info(`File ${filePath} chunked into ${chunks.length} parts`);

    return {
      content: baseResult.content,
      images: baseResult.images,
      chunks,
    };
  }

  return baseResult;
}

// Updated processDirectory function with chunking support
export async function processDirectory(
  options: ProcessingOptions
): Promise<void> {

  // Set up chunking options
  const chunkingOptions: ChunkingOptions = {
    maxChunkSize: options.chunkSize || 2000, // Default 4000 characters
    overlapSize: options.overlapSize || 200, // Default 200 characters overlap
    enabled: options.enableChunking ?? true, // Default enabled
  };

  logger.info(`Starting knowledge graph generation`);
  logger.info(`Input: ${options.input}`);
  logger.info(`Filter: ${options.filter}`);
  logger.info(`Output: ${options.output}`);
  logger.info(`Model: ${options.model}`);
  logger.info(
    `Chunking: ${chunkingOptions.enabled ? "enabled" : "disabled"} (size: ${
      chunkingOptions.maxChunkSize
    }, overlap: ${chunkingOptions.overlapSize})`
  );

  try {
    // Find files matching the filter
    const pattern = path.join(options.input, options.filter);
    const files = await glob(pattern, { nodir: true });

    if (files.length === 0) {
      logger.warn(`No files found matching pattern: ${pattern}`);
      return;
    }

    logger.info(`Found ${files.length} files to process`);

    const knowledgeGraphs: KnowledgeGraph[] = [];

    options.system ??= default_system_prompt(options.input, options.filter)

    // Process each file
    for (const file of files) {
      try {
        logger.info(`Processing: ${file}`);

        const processedFile = await processFile(file, chunkingOptions);

        if (
          !processedFile.content.trim() &&
          (!processedFile.images || processedFile.images.length === 0)
        ) {
          logger.warn(`No content extracted from: ${file}`);
          continue;
        }

        const searcher = new KnowledgeGraphSearch(
          options.embeddingsModel,
          options.host
        );

        const retrieve_and_generate = async (processedFile: any, file: string): Promise<KnowledgeGraph> => {
          const context = options.enableRetrieval ?
            await searcher.searchByFileContent(
              processedFile.content,
              file,
              knowledgeGraphs,
              { limit: options.retrievalLimit, includeObservations: true }
            )
            :
            undefined;

          const kg = await generateKnowledgeGraph(
            user_prompt_template(file, processedFile, processedFile.chunkIndex + 1, context),
            options,
            processedFile.images
          );

          kg.entities.forEach((entity) => {
              entity.files = [file];
              entity.chunk = processedFile.chunkIndex + 1;
              entity.totalChunks = processedFile.totalChunks;
            });

          return kg;
        };

        // Process chunks if available, otherwise process the whole file
        if (processedFile.chunks && processedFile.chunks.length > 1) {
          logger.info(
            `Processing ${processedFile.chunks.length} chunks for file: ${file}`
          );

          for (const chunk of processedFile.chunks) {

            const kg = await retrieve_and_generate(chunk, file);
            knowledgeGraphs.push(kg);

            // Write intermediate results for debugging
            fs.writeFileSync(
              options.output + ".tmp",
              JSON.stringify(knowledgeGraphs, null, 2)
            );

            logger.debug(
              `Generated knowledge graph for chunk ${chunk.chunkIndex + 1}/${
                chunk.totalChunks
              } of ${file} (${kg.entities.length} entities, ${
                kg.relations.length
              } relations)`
            );
          }
        } else {

          const kg = await retrieve_and_generate(processedFile, file);
          knowledgeGraphs.push(kg);

          // Write intermediate results for debugging
          fs.writeFileSync(
            options.output + ".tmp",
            JSON.stringify(knowledgeGraphs, null, 2)
          );
        }
      } catch (error) {
        logger.error(`Failed to process file ${file}: ${error}`);
        if (options.debug) {
          console.error(error);
        }
      }
    }

    // Merge all knowledge graphs
    logger.info(`Merging ${knowledgeGraphs.length} knowledge graphs`);
    const finalKG = await mergeKnowledgeGraphs(knowledgeGraphs, {
      entitySimilarityThreshold: options.entitySimilarityThreshold ?? 0.8,
      observationSimilarityThreshold:
        options.observationSimilarityThreshold ?? 0.8,
      model: options.embeddingsModel,
      host: options.host
    });

    // Save to output file
    const outputDir = path.dirname(options.output);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Export in requested format
    const exportFormat = options.exportFormat || "json";
    let outputContent: string;
    let outputPath = options.output;

    switch (exportFormat) {
      case "jsonl":
        outputContent = KnowledgeGraphConverter.toJSONL(finalKG);
        if (!outputPath.endsWith(".jsonl")) {
          outputPath = outputPath.replace(/\.[^.]+$/, ".jsonl");
        }
        break;

      case "mcp-jsonl":
        outputContent = KnowledgeGraphConverter.toMCPJSONL(finalKG);
        if (!outputPath.endsWith(".jsonl")) {
          outputPath = outputPath.replace(/\.[^.]+$/, ".mcp.jsonl");
        }
        break;

      case "json":
      default:
        outputContent = JSON.stringify(finalKG, null, 2);
        if (!outputPath.endsWith(".json")) {
          outputPath = outputPath.replace(/\.[^.]+$/, ".json");
        }
        break;
    }

    fs.writeFileSync(outputPath, outputContent);

    logger.info(`Knowledge graph saved to: ${options.output}`);
    logger.info(
      `Final graph: ${finalKG.entities.length} entities, ${finalKG.relations.length} relations`
    );
  } catch (error) {
    logger.error(`Failed to process directory: ${error}`);
    if (options.debug) {
      console.error(error);
    }
    process.exit(1);
  }
}
