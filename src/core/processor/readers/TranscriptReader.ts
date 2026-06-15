import * as fs from "fs";
import { FileReader, FileReadResult } from "./FileReader";
import { Logger } from "../../../shared";
import { TextChunker } from "../chunking";
import { Turn, packTurns } from "./transcript/turnPacking";

/** Speaker-labeled plain-text transcripts (recua `.parakeet.txt`, etc.). */
const TEXT_SUFFIXES = [
  ".parakeet.txt",
  ".whisper.txt",
  ".corrected.txt",
  ".transcript.txt",
];

/**
 * Reads conversational transcripts into **size-packed** chunks (capped at
 * `maxChunkSize`, tied to the global `chunkSize`) so a long dialogue becomes a
 * handful of chunks instead of one-per-turn. Each turn is rendered inline as
 * `speaker: text` so attribution stays visible to the model, and chunk
 * provenance carries the speaker whenever a chunk happens to be single-speaker.
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
    const chunks = await packTurns(turns, filePath, this.maxChunkSize, this.chunker);
    return {
      chunks,
      metadata: { type: "transcript", source: filePath, turns: turns.length },
    };
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
    convs.forEach((conv, convIndex) => {
      for (const msg of conv.chat_messages ?? []) {
        const text = this.chatMessageText(msg);
        if (!text) continue;
        turns.push({
          speaker: String(msg.sender ?? "unknown"),
          text,
          occurredAt: typeof msg.created_at === "string" ? msg.created_at : undefined,
          // Tag each turn with its conversation so chunkTurns never packs two
          // conversations together (cross-conversation fact bleed, KG-10).
          conversation: convIndex,
        });
      }
    });
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

  private async plainFallback(raw: string): Promise<FileReadResult> {
    const parts = await this.chunker.chunk(raw);
    return {
      chunks: parts.map((p) => ({ ...p })),
      metadata: { type: "transcript-fallback" },
    };
  }
}
