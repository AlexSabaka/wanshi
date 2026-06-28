import { FileReader, FileReadResult } from "./FileReader";
import path from "path";
import fs from "fs/promises";
import ffmpeg from "fluent-ffmpeg";
import { nodewhisper } from "nodejs-whisper";
import { promisify } from "util";
import { stat } from "fs/promises";
import { spawn } from "child_process";
import { Logger } from "../../../shared";
import { TextChunker } from "../chunking";
import { Turn, packTurns } from "./transcript/turnPacking";

/**
 * Reader for audio/video files with speech transcription
 *
 * This implementation uses:
 * - fluent-ffmpeg for audio/video preprocessing and metadata extraction
 * - nodejs-whisper for speech-to-text transcription with timestamps
 *
 * Required dependencies:
 * npm install fluent-ffmpeg nodejs-whisper ffmpeg-static ffprobe-static
 *
 * System requirements:
 * - FFmpeg binary (automatically handled by ffmpeg-static)
 * - Whisper models (automatically downloaded by nodejs-whisper)
 *
 * Supported formats: .mp3, .mp4, .wav, .ogg, .m4a, .flac, .aac, .webm, .mkv, .avi
 */
export class AudioReader extends FileReader {
  private tempDir: string;
  private options: AudioProcessingOptions;

  constructor(
    options: AudioProcessingOptions = {
      modelName: "medium",
      language: "auto",
      translate: false,
    },
    tempDir = "./temp",
    chunker: TextChunker,
    logger: Logger
  ) {
    super(
      [
        ".mp3",
        ".mp4",
        ".wav",
        ".ogg",
        ".m4a",
        ".flac",
        ".aac",
        ".webm",
        ".mkv",
        ".mov",
        ".avi",
      ],
      chunker,
      logger
    );
    this.tempDir = tempDir;
    this.options = options;
    this.ensureTempDir();
  }

  getName(): string {
    return "AudioReader";
  }

  async read(filePath: string): Promise<FileReadResult> {
    await this.validateFile(filePath);

    try {
      this.logger.debug(`Reading audio/video file: ${filePath}`);

      const stats = await stat(filePath);
      const ext = path.extname(filePath).toLowerCase();

      // Step 1: Extract audio metadata using ffprobe
      const audioMetadata = await this.extractAudioMetadata(filePath);

      // Step 1b: dual engine — VAD + dual-STT + diarization via the vendored
      // Python pipeline. Any failure degrades gracefully to the whisper path.
      if (this.options.engine === "dual") {
        try {
          return await this.transcribeDual(filePath, ext, stats, audioMetadata);
        } catch (error: any) {
          this.logger.warn(
            `Dual ASR engine failed for ${filePath} (${error.message}); falling back to the whisper engine`
          );
        }
      }

      // Step 2: Convert to WAV for Whisper if needed
      const processedAudioPath = await this.preprocessAudio(filePath);

      // Step 3: Transcribe using Whisper
      const transcriptionResult = await this.transcribeAudio(
        processedAudioPath,
        audioMetadata
      );

      // Step 4: Clean up temporary files
      await this.cleanup(processedAudioPath, filePath);

      // Build comprehensive metadata
      const metadata = {
        type: this.getMediaType(ext),
        description: this.getMediaDescription(ext),
        fileName: path.basename(filePath),
        filePath: filePath,
        fileSize: stats.size,
        createdAt: stats.birthtime.toISOString(),
        modifiedAt: stats.mtime.toISOString(),
        extension: ext,

        // Audio-specific metadata
        ...audioMetadata,

        // Transcription metadata
        ...transcriptionResult.metadata,

        status: "success",
        processingTime: transcriptionResult.processingTime,
        transcriptionLength: transcriptionResult.content.length,
        hasTranscription: transcriptionResult.content.trim().length > 0,
      };

      this.logger.debug(
        `Successfully transcribed ${filePath}: ${transcriptionResult.content.length} characters`
      );

      return {
        chunks: await this.chunker.chunk(transcriptionResult.content),
        metadata: metadata,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to read audio file ${filePath}: ${error.message}`
      );

      return {
        chunks: [],
        metadata: {
          type: this.getMediaType(path.extname(filePath).toLowerCase()),
          description: this.getMediaDescription(path.extname(filePath)),
          fileName: path.basename(filePath),
          filePath: filePath,
          status: "error",
          error: error.message,
          errorType: error.name,
          processingStep: error.step || "unknown",
        },
      };
    }
  }

  /**
   * Extract audio metadata using ffprobe
   */
  private async extractAudioMetadata(filePath: string): Promise<any> {
    try {
      const ffprobe = promisify(ffmpeg.ffprobe);
      const metadata = (await ffprobe(filePath)) as any;

      const audioStream = metadata.streams.find(
        // @ts-expect-error
        (stream) => stream.codec_type === "audio"
      );
      const videoStream = metadata.streams.find(
        // @ts-expect-error
        (stream) => stream.codec_type === "video"
      );

      return {
        // General file metadata
        duration: parseFloat(metadata.format.duration || "0"),
        bitrate: parseInt(metadata.format.bit_rate || "0"),
        formatName: metadata.format.format_name,
        formatLongName: metadata.format.format_long_name,

        // Audio stream metadata
        audioCodec: audioStream?.codec_name || "unknown",
        audioSampleRate: parseInt(audioStream?.sample_rate || "0"),
        audioChannels: audioStream?.channels || 0,
        audioChannelLayout: audioStream?.channel_layout || "unknown",
        audioBitrate: parseInt(audioStream?.bit_rate || "0"),

        // Video metadata (if present)
        hasVideo: !!videoStream,
        videoCodec: videoStream?.codec_name || null,
        videoResolution: videoStream
          ? `${videoStream.width}x${videoStream.height}`
          : null,
        videoFrameRate: videoStream?.r_frame_rate || null,

        // Metadata tags
        title: metadata.format.tags?.title || "",
        artist: metadata.format.tags?.artist || "",
        album: metadata.format.tags?.album || "",
        genre: metadata.format.tags?.genre || "",
        date: metadata.format.tags?.date || "",
        comment: metadata.format.tags?.comment || "",
      };
    } catch (error: any) {
      this.logger.warn(`Could not extract audio metadata: ${error.message}`);
      return {
        duration: 0,
        bitrate: 0,
        formatName: "unknown",
        audioCodec: "unknown",
        audioSampleRate: 0,
        audioChannels: 0,
      };
    }
  }

  /**
   * Convert audio to optimal format for Whisper
   */
  private async preprocessAudio(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();

    // If it's already a WAV file, check if it needs resampling
    if (ext === ".wav") {
      const metadata = await this.extractAudioMetadata(filePath);
      if (metadata.audioSampleRate === 16000 && metadata.audioChannels <= 2) {
        this.logger.debug(
          "WAV file already in optimal format, skipping preprocessing"
        );
        return filePath;
      }
    }

    const outputPath = path.resolve(
      path.join(
        this.tempDir,
        `${path.basename(filePath, ext)}_processed_${Date.now()}.wav`
      )
    );

    return new Promise((resolve, reject) => {
      this.logger.debug(`Converting ${filePath} to WAV format for Whisper`);

      ffmpeg(filePath)
        .audioFrequency(16000) // Whisper loves 16kHz
        .audioChannels(1) // Convert to mono for better performance
        .audioCodec("pcm_s16le") // Uncompressed PCM
        .format("wav")
        .on("start", (commandLine) => {
          this.logger.debug(`FFmpeg process started: ${commandLine}`);
        })
        .on("progress", (progress) => {
          if (progress.percent) {
            this.logger.debug(
              `Audio conversion progress: ${Math.round(progress.percent)}%`
            );
          }
        })
        .on("error", (error) => {
          // @ts-expect-error
          error.step = "audio_preprocessing";
          reject(error);
        })
        .on("end", () => {
          this.logger.debug(`Audio conversion completed: ${outputPath}`);
          resolve(outputPath);
        })
        .save(outputPath);
    });
  }

  /**
   * Transcribe audio using Whisper
   */
  private async transcribeAudio(
    audioPath: string,
    audioMetadata: any
  ): Promise<{ content: string; metadata: any; processingTime: number }> {
    const startTime = Date.now();

    try {
      this.logger.debug(
        `Transcribing with Whisper model: ${this.options.modelName}`
      );

      const options = {
        modelName: this.options.modelName,
        removeWavFileAfterTranscription: false, // We'll handle cleanup ourselves
        autoDownloadModelName: this.options.modelName,
        // logger: {
        //   debug: (...args: any[]) => this.logger.debug(args),
        //   error: (...args: any[]) => this.logger.error(args),
        //   log: (...args: any[]) => this.logger.info(args),
        // },
        whisperOptions: {
          language: this.options.language, // Auto-detect language
          outputInText: true,
          outputInJson: false, // Get detailed results
          outputInSrt: false, // Get timestamps
          wordTimestamps: false, // Word-level timestamps
          translateToEnglish: this.options.translate,
          splitOnWord: false,
        },
      };

      // Run Whisper transcription
      const content = await nodewhisper(audioPath, options);

      const processingTime = Date.now() - startTime;

      // Build transcription metadata
      const transcriptionMetadata = {
        asrEngine: "whisper",
        whisperModel: this.options.modelName,
        detectedLanguage: (content as any).language || "unknown",
        transcriptionConfidence: (content as any).confidence || null,
        wordCount: content.split(/\s+/).filter((word) => word.length > 0).length,
        hasTimestamps: options.whisperOptions.wordTimestamps,
        processingTimeMs: processingTime,
      };

      return {
        content: content.trim(),
        metadata: transcriptionMetadata,
        processingTime: processingTime,
      };
    } catch (error: any) {
      error.step = "transcription";
      throw error;
    }
  }

  /**
   * Dual engine: transcribe via the vendored Python `audio-pipeline` subproject
   * (Silero VAD → diarization → Parakeet/Whisper dual-STT → max-overlap merge).
   *
   * The subprocess writes a recua turns JSON sidecar (`<audio>.transcript.json`);
   * we reuse it if already present (re-runs are cheap), parse it into speaker
   * turns, and pack them with the shared `packTurns` so the chunks carry the same
   * speaker provenance as `TranscriptReader`. Throws on any failure so `read()`
   * can fall back to the whisper engine.
   */
  private async transcribeDual(
    filePath: string,
    ext: string,
    stats: { size: number; birthtime: Date; mtime: Date },
    audioMetadata: any
  ): Promise<FileReadResult> {
    const startTime = Date.now();
    const sidecar = `${filePath}.transcript.json`;

    let cached = false;
    if (await this.sidecarIsFresh(sidecar, filePath)) {
      this.logger.debug(`Reusing dual-ASR sidecar: ${sidecar}`);
      cached = true;
    } else {
      await this.runAudioPipeline(filePath, sidecar);
    }

    const raw = await fs.readFile(sidecar, "utf-8");
    const parsed = JSON.parse(raw) as RecuaTurn[];
    if (!Array.isArray(parsed)) {
      throw new Error(`audio-pipeline sidecar is not a turns array: ${sidecar}`);
    }
    const turns: Turn[] = parsed
      .map((t) => ({ speaker: String(t.speaker ?? "UNKNOWN"), text: this.pickTurnText(t) }))
      .filter((t) => t.text);
    if (turns.length === 0) {
      throw new Error(`audio-pipeline produced no usable turns: ${sidecar}`);
    }

    const maxChunkSize = this.options.maxChunkSize ?? 4000;
    const chunks = await packTurns(turns, filePath, maxChunkSize, this.chunker);
    const speakers = new Set(turns.map((t) => t.speaker)).size;

    const metadata = {
      type: this.getMediaType(ext),
      description: this.getMediaDescription(ext),
      fileName: path.basename(filePath),
      filePath,
      fileSize: stats.size,
      createdAt: stats.birthtime.toISOString(),
      modifiedAt: stats.mtime.toISOString(),
      extension: ext,
      ...audioMetadata,
      asrEngine: "dual",
      asrModels: this.options.dual?.asr ?? "both",
      diarized: this.options.dual?.diarize ?? true,
      speakerCount: speakers,
      turns: turns.length,
      sidecar,
      sidecarCached: cached,
      status: "success",
      processingTime: Date.now() - startTime,
    };

    this.logger.debug(
      `Dual ASR transcribed ${filePath}: ${turns.length} turns, ${speakers} speaker(s), ${chunks.length} chunk(s)`
    );
    return { chunks, metadata };
  }

  /** Prefer corrected > parakeet > whisper > any other string field. */
  private pickTurnText(t: RecuaTurn): string {
    for (const k of ["corrected", "parakeet", "whisper"] as const) {
      const v = t[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    for (const [k, v] of Object.entries(t)) {
      if (k === "start" || k === "end" || k === "speaker") continue;
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  }

  /** A sidecar is reusable if it exists and is newer than the source audio. */
  private async sidecarIsFresh(sidecar: string, filePath: string): Promise<boolean> {
    try {
      const [s, a] = await Promise.all([stat(sidecar), stat(filePath)]);
      return s.mtimeMs >= a.mtimeMs;
    } catch {
      return false;
    }
  }

  /**
   * Spawn the Python audio-pipeline (DoclingReader subprocess pattern: captured
   * stdout/stderr, `PYTHONUNBUFFERED`, hard timeout). Default launcher is
   * `uv run --project <dir> python -m audio_pipeline …`; override the executable
   * with `dual.pythonPath`. Rejects on non-zero exit / spawn error / timeout.
   */
  private async runAudioPipeline(filePath: string, outPath: string): Promise<void> {
    const dual = this.options.dual;
    if (!dual) throw new Error("dual engine options missing");

    const audioAbs = path.resolve(filePath);
    const outAbs = path.resolve(outPath);
    const cliArgs = ["transcribe", audioAbs, "--out", outAbs, "--asr", dual.asr];
    if (!dual.diarize) cliArgs.push("--no-diarize");
    if (dual.numSpeakers) cliArgs.push("--num-speakers", String(dual.numSpeakers));
    if (dual.device) cliArgs.push("--device", dual.device);

    let command: string;
    let args: string[];
    if (dual.pythonPath) {
      command = dual.pythonPath;
      args = ["-m", "audio_pipeline", ...cliArgs];
    } else {
      command = "uv";
      args = ["run", "--project", dual.projectDir, "python", "-m", "audio_pipeline", ...cliArgs];
    }

    this.logger.info(`Dual ASR: ${command} ${args.join(" ")}`);

    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: path.resolve(dual.projectDir),
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      });
      let stderr = "";
      child.stdout?.on("data", (d) => this.logger.debug(`[audio-pipeline] ${d.toString().trim()}`));
      child.stderr?.on("data", (d) => {
        stderr += d.toString();
        this.logger.debug(`[audio-pipeline] ${d.toString().trim()}`);
      });
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`audio-pipeline timed out after ${dual.timeoutMs}ms`));
      }, dual.timeoutMs);
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`failed to launch audio-pipeline (${command}): ${err.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`audio-pipeline exited ${code}${stderr ? `: ${stderr.trim().slice(-400)}` : ""}`));
      });
    });
  }

  /**
   * Clean up temporary files
   */
  private async cleanup(
    processedPath: string,
    originalPath: string
  ): Promise<void> {
    try {
      // Only delete if it's a temporary file we created
      if (
        processedPath !== originalPath &&
        processedPath.includes(this.tempDir)
      ) {
        await fs.unlink(processedPath);
        this.logger.debug(`Cleaned up temporary file: ${processedPath}`);
      }
    } catch (error) {
      this.logger.warn(
        `Could not clean up temporary file ${processedPath}: ${error}`
      );
    }
  }

  /**
   * Ensure temp directory exists
   */
  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      this.logger.warn(
        `Could not create temp directory ${this.tempDir}: ${error}`
      );
    }
  }

  /**
   * Get media type based on extension
   */
  private getMediaType(ext: string): string {
    const audioExts = [".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"];
    const videoExts = [".mp4", ".webm", ".mkv", ".avi"];

    if (audioExts.includes(ext)) return "audio";
    if (videoExts.includes(ext)) return "video";
    return "media";
  }

  /**
   * Get human-readable description
   */
  private getMediaDescription(ext: string): string {
    const descriptions: { [key: string]: string } = {
      ".mp3": "MP3 Audio File",
      ".mp4": "MP4 Video File",
      ".wav": "WAV Audio File",
      ".ogg": "OGG Audio File",
      ".m4a": "M4A Audio File",
      ".flac": "FLAC Audio File",
      ".aac": "AAC Audio File",
      ".webm": "WebM Video File",
      ".mkv": "Matroska Video File",
      ".avi": "AVI Video File",
    };
    return descriptions[ext] || "Media File";
  }
}

/**
 * Configuration interface for Whisper transcription
 */
export interface WhisperConfig {
  modelName?: string;
  language?: string;
  translateToEnglish?: boolean;
  wordTimestamps?: boolean;
  outputFormats?: {
    text?: boolean;
    json?: boolean;
    srt?: boolean;
    vtt?: boolean;
  };
}

/**
 * Audio processing options interface
 */
export interface AudioProcessingOptions {
  modelName: string;
  language: string;
  translate: boolean;
  /** Transcription engine: built-in `whisper` (default) or vendored Python `dual`. */
  engine?: "whisper" | "dual";
  /** Turn-packing budget for the dual engine (tied to the global chunk size). */
  maxChunkSize?: number;
  /** Dual-STT engine knobs (consulted only when `engine === "dual"`). */
  dual?: DualEngineOptions;
}

/** Knobs for the vendored Python `audio-pipeline` subproject (dual engine). */
export interface DualEngineOptions {
  projectDir: string;
  pythonPath?: string;
  asr: "both" | "parakeet" | "whisper";
  diarize: boolean;
  numSpeakers?: number;
  device?: string;
  timeoutMs: number;
}

/** One turn as emitted by the Python audio-pipeline (recua turns JSON). */
interface RecuaTurn {
  start?: number;
  end?: number;
  speaker?: string;
  corrected?: string;
  parakeet?: string;
  whisper?: string;
  [k: string]: unknown;
}

/**
 * Audio metadata interface
 */
export interface AudioMetadata {
  duration: number;
  bitrate: number;
  formatName: string;
  audioCodec: string;
  audioSampleRate: number;
  audioChannels: number;
  hasVideo: boolean;
  title?: string;
  artist?: string;
  album?: string;
}
