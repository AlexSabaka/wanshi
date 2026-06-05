import z from "zod";
import { Ollama } from "ollama";
import zodToJsonSchema from "zod-to-json-schema";
import { Logger } from "../../../shared";
import { ClassificationResult } from "../../../types";
import { IContentClassifier } from "./IContentTypeClassifier";

const ResponseSchema = z.object({
  class: z.enum([
    "code",
    "financial",
    "medical",
    "legal",
    "research",
    "transcript",
    "tabular",
    "communication",
    "documentation",
    "technical",
    "narrative",
    "reference",
  ]),
  confidence: z.number(),
});

const ClassifierSystemPrompt = `# MISSION STATEMENT

You are a text classification assistant. Your task is to classify the provided text content into one of the predefined classes. Your goal is to accurately determine the category of the text based on its content and context.

## Class Definitions

1. **code**: Text containing programming code, scripts, or any form of computer language syntax.
2. **financial**: Text related to financial data, reports, transactions, or economic analysis.
3. **medical**: Text pertaining to medical information, health records, clinical notes, or healthcare-related content.
4. **legal**: Text involving legal documents, contracts, laws, regulations, or any legal proceedings.
5. **research**: Text related to academic research, scientific studies, or scholarly articles.
6. **transcript**: Text that is a transcription of spoken language, such as interviews, meetings, or lectures.
7. **tabular**: Text presented in a tabular format, such as tables, spreadsheets, or structured data.
8. **communication**: Text involving personal or professional communication, such as emails, messages, or letters.
9. **documentation**: Text that serves as documentation, such as manuals, guides, or instructional content.
10. **technical**: Text related to technical specifications, engineering details, or technical manuals.
11. **narrative**: Text that tells a story or describes events, such as novels, stories, or anecdotes.
12. **reference**: Text that serves as a reference, such as encyclopedias, dictionaries, or reference guides.

## Response Format

Please provide your response in the following JSON schema:

\`\`\`json
{
  "class": "code" | "financial" | "medical" | "legal" | "research" | "transcript" | "tabular" | "communication" | "documentation" | "technical" | "narrative" | "reference",
  "confidence": number
}
\`\`\`

## Critical Instructions

1. Read the provided text carefully.
2. Determine the most appropriate class for the text based on the definitions provided.
3. Assign a confidence score between 0 and 1, where 1 indicates absolute certainty and 0 indicates complete uncertainty.
4. Return the response in the specified JSON format.

Ensure that your classification is accurate and that the confidence score reflects your certainty in the classification.
`;

export interface LlmClassifierOptions {
  model: string;
  host: string;
}

export class LlmContentClassifier implements IContentClassifier {
  private model: string;
  private ollama: Ollama;

  constructor(private logger: Logger, options?: LlmClassifierOptions) {
    this.model = options?.model ?? "gemma3:1b";
    this.ollama = new Ollama({ host: options?.host ?? "http://localhost:11434" });
  }

  async classify(
    content: string,
    path: string
  ): Promise<ClassificationResult[]> {
    const chatRequest = {
      model: this.model,
      messages: [
        { role: "system", content: ClassifierSystemPrompt },
        { role: "user", content: this.formatMessage(content, path) },
      ],
      format: zodToJsonSchema(ResponseSchema),
      think: false,
      options: {
        num_ctx: 4096,
      },
    };

    const response = await this.ollama.chat(chatRequest);

    // Parse the response
    const responseContent = response.message.content.trim();

    // Handle code block wrapped responses
    let cleanContent = responseContent;
    if (cleanContent.startsWith("```")) {
      cleanContent = cleanContent.slice(
        cleanContent.indexOf("\n") + 1,
        cleanContent.lastIndexOf("\n")
      );
    }

    const parsed = JSON.parse(cleanContent);

    // Validate against schema
    const validated = ResponseSchema.parse(parsed);

    return [ validated ];
  }

  private formatMessage(content: string, path: string): string {
    return `File Path: \`${path}\`\nFile Content:\n\`\`\`\n${content}\n\`\`\`\n`;
  }
}
