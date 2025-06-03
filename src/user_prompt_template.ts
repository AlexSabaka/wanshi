// Process as single file (no chunking needed or disabled)

import { KnowledgeGraph } from "./types";

export const user_prompt_template = (
  current_file: string,
  processedFile: any,
  currentChunk?: number,
  context?: KnowledgeGraph
) => {

    return currentChunk && processedFile.chunks && processedFile.chunks.length > 0
        ? processedFile.chunks[currentChunk - 1].content
        : processedFile.content;

//   let prompt = currentChunk && processedFile.chunks && processedFile.chunks.length > 0
//     ? `Current File: \`${current_file}\` (Chunk ${currentChunk}/${processedFile.chunks.length})`
//     : `Current File: \`${current_file}\`\n\n`;

//   if (context) {
//     prompt += `Existing Knowledge Context:\n\`\`\`\n${JSON.stringify(context, null, 2)}\n\`\`\`\n\n`
//   }

//   if (currentChunk && processedFile.chunks && processedFile.chunks.length > 0) {
//     prompt += `File Chunk Content:\n\`\`\`\n${processedFile.chunks[currentChunk - 1].content}\`\`\`\n`;
//   } else if (processedFile.content) {
//     prompt += `File Content:\n\`\`\`\n${processedFile.content}\`\`\`\n`;
//   }

//   return prompt;
};
