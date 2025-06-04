import ollama from "ollama";

const embeddingCache = new Map<string, number[]>();

// Get embedding for text using Ollama
export async function getEmbedding(
  text: string,
  model: string,
  host: string
): Promise<number[]> {
  // Check cache first
  if (embeddingCache.has(text)) {
    return embeddingCache.get(text)!;
  }

  try {
    const response = await ollama.embeddings({
      model: model,
      prompt: text,
      options: {},
    });

    embeddingCache.set(text, response.embedding);
    return response.embedding;
  } catch (error) {
    throw new Error(`Failed to get embedding: ${error}`);
  }
}
