import { spawn } from "child_process";
import { Logger } from "../../../../shared";

/**
 * Deterministic image-metadata extraction (the "deterministic-before-interpretive"
 * tier of the image/OCR brief). These helpers read structured facts an image
 * already carries — EXIF tags, C2PA content credentials — and return plain
 * objects that `ImageReader` stashes on `FileReadResult.metadata`; a pure builder
 * (`buildImageMetaGraph`) later turns them into graph facts that AUGMENT the VLM's
 * read (not replace it). Each helper is best-effort and never throws.
 */

/** EXIF facts we map to the graph (a deterministic subset of the tags). */
export interface ExifMetadata {
  /** Decimal GPS, computed by exifr from the GPS IFD. */
  gps?: { lat: number; lng: number };
  /** Capture time (ISO-8601) — becomes the observation/edge `validAt`. */
  dateTaken?: string;
  camera?: { make?: string; model?: string };
  author?: string;
  software?: string;
}

/**
 * Read EXIF metadata from an image via `exifr` (pure-JS). Returns `undefined`
 * when the image has no usable EXIF (e.g. a PNG screenshot) or on any parse
 * error — extraction is an enhancement, never a failure mode. Lazy-imports
 * `exifr` so a run that never touches an image pays nothing.
 */
export async function readExif(filePath: string, logger?: Logger): Promise<ExifMetadata | undefined> {
  try {
    const exifr: any = await import("exifr");
    const parse = exifr.parse ?? exifr.default?.parse;
    // Block selectors: tiff (IFD0: Make/Model/Artist/Software) + exif (DateTimeOriginal)
    // + gps (so exifr computes decimal latitude/longitude).
    const o: any = await parse(filePath, { tiff: true, exif: true, gps: true });
    if (!o) return undefined;

    const meta: ExifMetadata = {};
    if (typeof o.latitude === "number" && typeof o.longitude === "number") {
      meta.gps = { lat: o.latitude, lng: o.longitude };
    }
    const dt = o.DateTimeOriginal ?? o.CreateDate ?? o.ModifyDate;
    if (dt) meta.dateTaken = dt instanceof Date ? dt.toISOString() : String(dt);
    const make = typeof o.Make === "string" ? o.Make.trim() : undefined;
    const model = typeof o.Model === "string" ? o.Model.trim() : undefined;
    if (make || model) meta.camera = { ...(make ? { make } : {}), ...(model ? { model } : {}) };
    if (typeof o.Artist === "string" && o.Artist.trim()) meta.author = o.Artist.trim();
    if (typeof o.Software === "string" && o.Software.trim()) meta.software = o.Software.trim();

    return Object.keys(meta).length ? meta : undefined;
  } catch (e) {
    logger?.debug(`EXIF read failed for ${filePath}: ${e}`);
    return undefined;
  }
}

/**
 * C2PA Content Credential facts. `present:false, unavailable:true` means we could
 * NOT read provenance (c2patool missing / errored) — distinct from a clean
 * `present:false` (no credential on the asset, itself a fact). Stores facts, never
 * a verdict: a valid credential proves signed provenance, not truth; a missing one
 * proves nothing.
 */
export interface C2paMetadata {
  present: boolean;
  valid?: boolean;
  signer?: string;
  aiGenerated?: boolean;
  unavailable?: boolean;
}

/**
 * Read C2PA Content Credentials by shelling the official Adobe/CAI `c2patool`
 * (reference-grade cryptographic validation; degrade-if-absent like marker). Never
 * throws — a missing binary / parse error yields `{present:false, unavailable:true}`.
 */
export async function readC2pa(
  filePath: string,
  command = "c2patool",
  logger?: Logger
): Promise<C2paMetadata> {
  try {
    const { code, stdout, stderr } = await runCommand(command, [filePath], 30_000);
    if (code !== 0) {
      // c2patool exits non-zero with "No claim found" when the asset has no
      // credential — a real fact (absent), distinct from the tool being missing.
      if (/no (claim|manifest|provenance|c2pa)/i.test(`${stderr}\n${stdout}`)) return { present: false };
      logger?.debug(`c2patool exited ${code} for ${filePath}: ${stderr.trim().slice(-200)}`);
      return { present: false, unavailable: true };
    }
    return parseC2pa(JSON.parse(stdout));
  } catch (e) {
    // ENOENT (binary not installed), timeout, or unparseable output → we could not
    // read provenance. Distinct from "no credential present".
    logger?.debug(`C2PA read unavailable for ${filePath}: ${e}`);
    return { present: false, unavailable: true };
  }
}

/** Map a c2patool manifest-store JSON report to the trust facts we record. */
function parseC2pa(json: any): C2paMetadata {
  const manifests = json?.manifests ?? {};
  const active = json?.active_manifest;
  const present = !!active || Object.keys(manifests).length > 0;
  if (!present) return { present: false };

  const m = (active && manifests[active]) || Object.values(manifests)[0] || {};
  const sigInfo = (m as any)?.signature_info ?? {};
  const signer = typeof sigInfo.issuer === "string" ? sigInfo.issuer : typeof sigInfo.common_name === "string" ? sigInfo.common_name : undefined;
  const vstatus: any[] = Array.isArray(json?.validation_status) ? json.validation_status : [];
  const valid = vstatus.every((v) => !/error|invalid|fail/i.test(String(v?.code ?? "")));
  // C2PA's AI-generation indicator (digitalSourceType …trainedAlgorithmicMedia).
  const aiGenerated = /trainedAlgorithmicMedia/i.test(JSON.stringify(json));
  return { present: true, valid, signer, aiGenerated };
}

/** Spawn a CLI with captured output + timeout; rejects on launch error (ENOENT). */
function runCommand(
  command: string,
  args: string[],
  timeoutMs: number
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}
