import { ChunkResult } from "../FileReader";
import { TextChunker } from "../../chunking";
import { ChunkProvenance } from "../../../../types";

/** A normalized conversational turn from any supported transcript source. */
export interface Turn {
  speaker: string;
  text: string;
  occurredAt?: string; // ISO-8601 wall-clock time, when known
  // 0-based conversation index (KG-10): a chat export holds many conversations;
  // turns from different conversations must never share a chunk. Undefined ⇒ a
  // single-conversation source (recua/speaker-text), so no boundary splitting.
  conversation?: number;
}

/** Render a turn with its inline speaker label (`speaker: text`). */
export function renderTurn(turn: Turn): string {
  return `${turn.speaker}: ${turn.text}`;
}

/**
 * Pack consecutive turns into chunks up to `maxChunkSize` (regardless of
 * speaker), rendering each turn inline as `speaker: text`. Provenance carries
 * the speaker only when a chunk turns out to be single-speaker; a turn longer
 * than the budget on its own is split with the label kept on every piece.
 *
 * Shared by `TranscriptReader` (parsed transcript files) and `AudioReader`'s
 * dual-STT engine (turns emitted by the vendored Python pipeline) so both
 * produce identical speaker-stamped chunk provenance.
 */
export async function packTurns(
  turns: Turn[],
  sourcePath: string,
  maxChunkSize: number,
  chunker: TextChunker
): Promise<ChunkResult[]> {
  const SEP = "\n\n";
  const chunks: ChunkResult[] = [];
  let buf: Turn[] = [];
  const renderLen = (t: Turn) => renderTurn(t).length;
  const bufLen = () => buf.reduce((n, t) => n + renderLen(t) + SEP.length, 0);

  const flush = () => {
    if (buf.length === 0) return;
    const speakers = new Set(buf.map((t) => t.speaker));
    const occurredAt = buf.find((t) => t.occurredAt)?.occurredAt;
    const text = buf.map((t) => renderTurn(t)).join(SEP).trim();
    const provenance: ChunkProvenance = {
      source: sourcePath,
      ...(speakers.size === 1 && { speaker: buf[0].speaker }),
      ...(occurredAt && { occurredAt }),
    };
    chunks.push({ content: text, index: 0, totalChunks: 0, startOffset: 0, endOffset: text.length, provenance });
    buf = [];
  };

  // Split a single oversized turn, keeping its speaker label on each piece.
  const flushOversized = async (turn: Turn) => {
    const provenance: ChunkProvenance = {
      source: sourcePath,
      speaker: turn.speaker,
      ...(turn.occurredAt && { occurredAt: turn.occurredAt }),
    };
    for (const p of await chunker.chunk(turn.text)) {
      const content = `${turn.speaker}: ${p.content}`;
      chunks.push({ content, index: 0, totalChunks: 0, startOffset: p.startOffset, endOffset: p.endOffset, provenance });
    }
  };

  for (const turn of turns) {
    if (!turn.text) continue;
    // Conversation boundary (KG-10): a chat export's conversations must never
    // share a chunk, so flush before a turn from a different conversation —
    // regardless of remaining budget — keeping validAt/speaker per-conversation.
    if (buf.length > 0 && buf[buf.length - 1].conversation !== turn.conversation) {
      flush();
    }
    if (renderLen(turn) > maxChunkSize) {
      flush();
      await flushOversized(turn);
      continue;
    }
    if (buf.length > 0 && bufLen() + renderLen(turn) + SEP.length > maxChunkSize) {
      flush();
    }
    buf.push(turn);
  }
  flush();

  chunks.forEach((c, i) => {
    c.index = i + 1;
    c.totalChunks = chunks.length;
  });
  return chunks;
}
