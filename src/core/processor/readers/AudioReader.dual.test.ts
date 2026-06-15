import { EventEmitter } from "events";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ── mocks (names must be `mock*` to satisfy jest's hoisting rules) ──────────────
const mockSpawn = jest.fn();
jest.mock("child_process", () => ({ spawn: (...a: any[]) => mockSpawn(...a) }));

const mockNodewhisper = jest.fn();
jest.mock("nodejs-whisper", () => ({ nodewhisper: (...a: any[]) => mockNodewhisper(...a) }));

// ffprobe always reports a 16 kHz mono stream so the whisper fallback's
// preprocess step short-circuits (no real ffmpeg invocation in tests).
jest.mock("fluent-ffmpeg", () => {
  const m: any = jest.fn();
  m.ffprobe = (_file: string, cb: (e: any, d: any) => void) =>
    cb(null, {
      format: { duration: "4.0", bit_rate: "128000", format_name: "wav" },
      streams: [{ codec_type: "audio", sample_rate: "16000", channels: 1 }],
    });
  return { __esModule: true, default: m };
});

import { AudioReader, DualEngineOptions } from "./AudioReader";
import { TextChunker } from "../chunking/TextChunker";

const TURNS = [
  { start: 0, end: 2, speaker: "SPEAKER_00", parakeet: "alpha beta", whisper: "alpha beta!" },
  { start: 2, end: 4, speaker: "SPEAKER_01", parakeet: "gamma delta", whisper: "gamma delta?" },
];

const makeLogger = () =>
  ({ trace: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn() } as any);

/** A fake child process that emits `close` with the given code on next tick. */
const fakeChild = (onSpawn: (args: string[]) => void, code: number) => (_cmd: string, args: string[]) => {
  const child: any = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  setImmediate(() => {
    onSpawn(args);
    child.emit("close", code);
  });
  return child;
};

describe("AudioReader — dual engine", () => {
  let tmp: string;
  let logger: any;
  const dual: DualEngineOptions = {
    projectDir: "/tmp/audio-pipeline",
    asr: "both",
    diarize: true,
    timeoutMs: 5000,
  };

  const reader = () => {
    const chunker = new TextChunker({ maxChunkSize: 4000, overlapSize: 50, enabled: true }, logger);
    return new AudioReader(
      { modelName: "medium", language: "auto", translate: false, engine: "dual", maxChunkSize: 4000, dual },
      tmp,
      chunker,
      logger
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    logger = makeLogger();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kgad-"));
    // default: a successful run that writes the turns-JSON sidecar
    mockSpawn.mockImplementation(
      fakeChild((args) => {
        const out = args[args.indexOf("--out") + 1];
        fs.writeFileSync(out, JSON.stringify(TURNS));
      }, 0)
    );
  });

  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("spawns the python pipeline and packs its turns into speaker-stamped chunks", async () => {
    const audio = path.join(tmp, "lesson.m4a");
    fs.writeFileSync(audio, Buffer.from("fake-audio"));

    const res = await reader().read(audio);

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    // launcher + args carry the contract
    const [, args] = mockSpawn.mock.calls[0];
    expect(args).toEqual(expect.arrayContaining(["transcribe", "--out", "--asr", "both"]));

    expect(res.metadata?.asrEngine).toBe("dual");
    expect(res.metadata?.speakerCount).toBe(2);
    expect(res.metadata?.turns).toBe(2);

    const joined = res.chunks.map((c) => c.content).join("\n");
    // text uses the parakeet hypothesis (priority), labels inline
    expect(joined).toContain("SPEAKER_00: alpha beta");
    expect(joined).toContain("SPEAKER_01: gamma delta");
    // single mixed-speaker chunk → source kept, no single speaker
    expect(res.chunks[0].provenance?.source).toBe(audio);
    expect(res.chunks[0].provenance?.speaker).toBeUndefined();
  });

  it("passes --no-diarize and --num-speakers through to the subprocess", async () => {
    const audio = path.join(tmp, "lesson.m4a");
    fs.writeFileSync(audio, Buffer.from("fake-audio"));
    const chunker = new TextChunker({ maxChunkSize: 4000, overlapSize: 50, enabled: true }, logger);
    const r = new AudioReader(
      {
        modelName: "medium",
        language: "auto",
        translate: false,
        engine: "dual",
        maxChunkSize: 4000,
        dual: { ...dual, diarize: false, numSpeakers: 3 },
      },
      tmp,
      chunker,
      logger
    );
    await r.read(audio);
    const [, args] = mockSpawn.mock.calls[0];
    expect(args).toContain("--no-diarize");
    expect(args).toEqual(expect.arrayContaining(["--num-speakers", "3"]));
  });

  it("reuses a fresh sidecar instead of re-spawning", async () => {
    const audio = path.join(tmp, "lesson.m4a");
    fs.writeFileSync(audio, Buffer.from("fake-audio"));
    fs.writeFileSync(`${audio}.transcript.json`, JSON.stringify(TURNS)); // pre-existing, newer

    const res = await reader().read(audio);

    expect(mockSpawn).not.toHaveBeenCalled();
    expect(res.metadata?.sidecarCached).toBe(true);
    expect(res.metadata?.asrEngine).toBe("dual");
  });

  it("degrades to the whisper engine when the subprocess fails", async () => {
    mockSpawn.mockImplementation(fakeChild(() => {}, 1)); // non-zero exit, no sidecar
    mockNodewhisper.mockResolvedValue("fallback transcript text");

    const audio = path.join(tmp, "lesson.wav");
    fs.writeFileSync(audio, Buffer.from("fake-audio"));

    const res = await reader().read(audio);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("falling back to the whisper engine"));
    expect(mockNodewhisper).toHaveBeenCalled();
    expect(res.metadata?.asrEngine).toBeUndefined(); // whisper path, not dual
    expect(res.metadata?.whisperModel).toBe("medium");
    expect(res.chunks.map((c) => c.content).join(" ")).toContain("fallback transcript text");
  });
});
