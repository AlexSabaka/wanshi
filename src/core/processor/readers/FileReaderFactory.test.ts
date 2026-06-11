import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { FileReaderFactory } from "./FileReaderFactory";
import { RtfReader } from "./RtfReader";
import { MarkdownReader } from "./MarkdownReader";
import { HtmlReader } from "./HtmlReader";
import { ImageReader } from "./ImageReader";
import { OfficeReader } from "./OfficeReader";
import { PdfReader } from "./PdfReader";
import { TranscriptReader } from "./TranscriptReader";
import { JsonFileReader } from "./JsonFileReader";
import { TextReader } from "./TextReader";
import { BinaryReader } from "./BinaryReader";
import { TextChunker } from "../chunking/TextChunker";
import { stubLogger } from "../../../__tests__/helpers";

/**
 * Guards KG-01: TextReader must no longer claim every file (the `''` +
 * `startsWith` bug), audio/binary must never decode as text, and BinaryReader is
 * the registered catch-all. The registration below MIRRORS
 * ContainerFactory's non-docling / ASR-disabled order — keep them in sync.
 * AudioReader is intentionally omitted (its nodejs-whisper import is heavy); the
 * ASR-off contract `.mp3 → BinaryReader` is the load-bearing "never Text" check.
 */
describe("FileReaderFactory routing", () => {
  let tmp: string;
  const log = stubLogger();
  const chunker = () =>
    new TextChunker({ maxChunkSize: 4000, overlapSize: 50, enabled: true }, log);

  const makeFactory = (): FileReaderFactory => {
    const f = new FileReaderFactory(log);
    f.registerReader(new RtfReader(chunker(), log));
    f.registerReader(new MarkdownReader(chunker(), log, false));
    f.registerReader(new HtmlReader(chunker(), log));
    f.registerReader(new ImageReader(chunker(), log));
    f.registerReader(new OfficeReader(chunker(), log));
    f.registerReader(new PdfReader(chunker(), log, false));
    f.registerReader(new TranscriptReader(chunker(), log, 4000));
    f.registerReader(
      new JsonFileReader({ strategy: "structural", maxChunkSize: 4000 }, chunker(), log)
    );
    f.registerReader(new TextReader(chunker(), log));
    f.registerReader(new BinaryReader(chunker(), log)); // catch-all, last
    return f;
  };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kgroute-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  // Empty fixture file is enough — routing only consults canRead (extension /
  // basename, or TranscriptReader's content sniff which tolerates empty .json).
  const at = (name: string, content = ""): string => {
    const p = path.join(tmp, name);
    fs.writeFileSync(p, content);
    return p;
  };

  // Every row carries a content string (Jest's it.each injects `done` for a
  // missing trailing arg, so keep the arity fixed at 3).
  const cases: Array<[string, string, string]> = [
    ["plain.txt", "TextReader", ""],
    ["module.ts", "TextReader", ""],
    ["Makefile", "TextReader", ""],
    ["LICENSE", "TextReader", ""],
    ["notes.md", "MarkdownReader", ""],
    ["page.html", "HtmlReader", ""],
    ["doc.rtf", "RtfReader", ""],
    ["photo.png", "ImageReader", ""],
    ["sheet.docx", "OfficeReader", ""],
    ["paper.pdf", "PdfReader", ""],
    ["data.json", "JsonFileReader", "{}"],
    ["lesson.parakeet.txt", "TranscriptReader", "SPEAKER_00: hi there."],
    // The regression fixes: audio/binary/unknown must hit the catch-all, not Text.
    ["song.mp3", "BinaryReader", ""],
    ["clip.wav", "BinaryReader", ""],
    ["app.exe", "BinaryReader", ""],
    ["db.sqlite", "BinaryReader", ""],
    ["weird.unknownext", "BinaryReader", ""],
  ];

  it.each(cases)("routes %s → %s", (name, expected, content) => {
    const reader = makeFactory().getReader(at(name, content));
    expect(reader?.getName()).toBe(expected);
  });

  it("never routes audio to TextReader (the KG-01 regression)", () => {
    for (const name of ["song.mp3", "clip.wav", "movie.mp4"]) {
      expect(makeFactory().getReader(at(name))?.getName()).not.toBe("TextReader");
    }
  });

  it("BinaryReader is a true catch-all for any unrecognized file", () => {
    const reader = makeFactory().getReader(at("mystery.qwerty"));
    expect(reader?.getName()).toBe("BinaryReader");
  });
});
