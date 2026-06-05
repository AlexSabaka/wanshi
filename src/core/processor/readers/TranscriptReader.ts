import * as fs from "fs";
import { ChunkResult, FileReader, FileReadResult } from "./FileReader";
import { Logger } from "../../../shared";
import { TextChunker } from "../chunking";
import { ChunkProvenance } from "../../../types";

/** A normalized conversational turn from any supported transcript format. */
interface Turn {
  speaker: string;
  text: string;
  occurredAt?: string; // ISO-8601 wall-clock time, when known
}

/** Speaker-labeled plain-text transcripts (recua `.parakeet.txt`, etc.). */
const TEXT_SUFFIXES = [
  ".parakeet.txt",
  ".whisper.txt",
  ".corrected.txt",
  ".transcript.txt",
];

/**
 * Reads conversational transcripts into **speaker-pure** chunks carrying
 * per-turn provenance (speaker + time), so extracted observations are attributed
 * to who actually said them instead of the speaker becoming an entity.
 *
 * Handles three real shapes:
 *  - recua speaker-labeled text  (`SPEAKER_XX: …` blocks)
 *  - recua turns JSON            (`[{ start, end, speaker, <backend>: text }]`)
 *  - Claude/ChatGPT chat export  (`[{ chat_messages: [{ sender, created_at, … }] }]`)
 *
 * Registered before JsonFileReader/TextReader; `canRead` claims only files that
 * sniff as transcripts, deferring everything else.
 */
export class TranscriptReader extends FileReader {
  private readonly maxChunkSize: number;

  constructor(chunker: TextChunker, logger: Logger, maxChunkSize = 4000) {
    super([], chunker, logger); // extension list unused; canRead is overridden
    this.maxChunkSize = maxChunkSize;
  }

  getName(): string {
    return "TranscriptReader";
  }

  canRead(filePath: string): boolean {
    const lower = filePath.toLowerCase();
    if (TEXT_SUFFIXES.some((s) => lower.endsWith(s))) return true;
    if (lower.endsWith(".json")) return this.sniffJsonTranscript(filePath);
    return false;
  }

  /** Cheap content sniff (first 8 KB) to claim only transcript-shaped JSON. */
  private sniffJsonTranscript(filePath: string): boolean {
    try {
      const fd = fs.openSync(filePath, "r");
      const buf = Buffer.alloc(8192);
      const n = fs.readSync(fd, buf, 0, 8192, 0);
      fs.closeSync(fd);
      const head = buf.toString("utf8", 0, n);
      // Claude/ChatGPT export
      if (head.includes('"chat_messages"') && head.includes('"sender"')) return true;
      // recua turns array
      if (
        /"speaker"\s*:/.test(head) &&
        /"start"\s*:/.test(head) &&
        /"end"\s*:/.test(head)
      )
        return true;
      return false;
    } catch {
      return false;
    }
  }

  async read(filePath: string): Promise<FileReadResult> {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    let turns: Turn[];
    try {
      turns = this.parse(filePath, raw);
    } catch (e) {
      this.logger.warn(
        `TranscriptReader could not parse ${filePath}; falling back to plain chunking: ${e}`
      );
      return this.plainFallback(raw);
    }
    if (turns.length === 0) return this.plainFallback(raw);
    return this.chunkTurns(turns, filePath);
  }

  private parse(filePath: string, raw: string): Turn[] {
    if (filePath.toLowerCase().endsWith(".json")) {
      const data = JSON.parse(raw);
      if (Array.isArray(data) && data[0]?.chat_messages !== undefined) {
        return this.parseChatExport(data);
      }
      if (Array.isArray(data) && data[0]?.speaker !== undefined) {
        return this.parseRecuaTurns(data);
      }
      throw new Error("unrecognized transcript JSON shape");
    }
    return this.parseSpeakerText(raw);
  }

  /** "SPEAKER_XX: text" blocks separated by blank lines. */
  private parseSpeakerText(raw: string): Turn[] {
    const labelRe = /^([A-Za-z0-9_][\w .\-]{0,40}?):\s+/;
    const blocks = raw
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean);
    const turns: Turn[] = [];
    for (const block of blocks) {
      const m = block.match(labelRe);
      if (m) {
        turns.push({ speaker: m[1].trim(), text: block.slice(m[0].length).trim() });
      } else if (turns.length > 0) {
        turns[turns.length - 1].text += " " + block; // continuation
      } else {
        turns.push({ speaker: "UNKNOWN", text: block });
      }
    }
    return turns;
  }

  private parseRecuaTurns(data: any[]): Turn[] {
    return data
      .map((t) => ({
        speaker: String(t.speaker ?? "UNKNOWN"),
        text: this.pickRecuaText(t),
      }))
      .filter((t) => t.text);
  }

  private pickRecuaText(t: any): string {
    for (const k of ["corrected", "parakeet", "whisper"]) {
      if (typeof t[k] === "string" && t[k].trim()) return t[k].trim();
    }
    for (const [k, v] of Object.entries(t)) {
      if (k === "start" || k === "end" || k === "speaker") continue;
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  }

  private parseChatExport(convs: any[]): Turn[] {
    const turns: Turn[] = [];
    for (const conv of convs) {
      for (const msg of conv.chat_messages ?? []) {
        const text = this.chatMessageText(msg);
        if (!text) continue;
        turns.push({
          speaker: String(msg.sender ?? "unknown"),
          text,
          occurredAt: typeof msg.created_at === "string" ? msg.created_at : undefined,
        });
      }
    }
    return turns;
  }

  private chatMessageText(msg: any): string {
    if (typeof msg.text === "string" && msg.text.trim()) return msg.text.trim();
    if (Array.isArray(msg.content)) {
      return msg.content
        .map((c: any) => (typeof c?.text === "string" ? c.text : ""))
        .join(" ")
        .trim();
    }
    return "";
  }

  /**
   * Group consecutive same-speaker turns into chunks (≤ maxChunkSize, splitting
   * oversized monologues), each stamped with that speaker's provenance.
   */
  private async chunkTurns(turns: Turn[], filePath: string): Promise<FileReadResult> {
    const chunks: ChunkResult[] = [];
    let buf: Turn[] = [];
    const bufLen = () => buf.reduce((n, t) => n + t.text.length + 1, 0);

    const flush = async () => {
      if (buf.length === 0) return;
      const speaker = buf[0].speaker;
      const occurredAt = buf.find((t) => t.occurredAt)?.occurredAt;
      const text = buf.map((t) => t.text).join("\n").trim();
      const provenance: ChunkProvenance = {
        speaker,
        source: filePath,
        ...(occurredAt && { occurredAt }),
      };
      if (text.length <= this.maxChunkSize) {
        chunks.push({ content: text, index: 0, totalChunks: 0, startOffset: 0, endOffset: text.length, provenance });
      } else {
        for (const p of await this.chunker.chunk(text)) {
          chunks.push({ content: p.content, index: 0, totalChunks: 0, startOffset: p.startOffset, endOffset: p.endOffset, provenance });
        }
      }
      buf = [];
    };

    for (const turn of turns) {
      if (!turn.text) continue;
      if (
        buf.length > 0 &&
        (turn.speaker !== buf[0].speaker || bufLen() + turn.text.length > this.maxChunkSize)
      ) {
        await flush();
      }
      buf.push(turn);
    }
    await flush();

    chunks.forEach((c, i) => {
      c.index = i + 1;
      c.totalChunks = chunks.length;
    });
    return {
      chunks,
      metadata: { type: "transcript", source: filePath, turns: turns.length },
    };
  }

  private async plainFallback(raw: string): Promise<FileReadResult> {
    const parts = await this.chunker.chunk(raw);
    return {
      chunks: parts.map((p) => ({ ...p })),
      metadata: { type: "transcript-fallback" },
    };
  }
}
