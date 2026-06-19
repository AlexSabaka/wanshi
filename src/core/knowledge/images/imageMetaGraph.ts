import { Entity, KnowledgeGraph, Observation, ProcessedFile, Relation } from "../../../types";
import { toRelPathId } from "../../corpus/relPath";
import { ExifMetadata, C2paMetadata } from "../../processor/readers/image/imageMetadata";

/**
 * Turn an image's deterministic metadata (`metadata.exif`, `metadata.c2pa`) into a
 * `KnowledgeGraph` fragment that AUGMENTS the VLM's read of the image rather than
 * replacing it. Mirrors `buildReferenceGraph`: a pure per-file module whose
 * fragment `DirectoryProcessor` unions into the per-file `graphs[]` (alongside the
 * LLM extraction + AST seed + reference graph), so it flows through merge/canon
 * like any other fragment.
 *
 * The image file itself is an entity keyed by corpus-relative path (`toRelPathId`,
 * the buildReferenceGraph convention) and is always emitted, so EXIF/C2PA edges
 * never dangle. Facts are stamped `sourceAdapter:"exif"`/`"c2pa"` + a `confidence`
 * (read-reliability, not a truth verdict). Capture time → bitemporal `validAt`.
 * C2PA stores a fact, never a verdict — a valid credential proves signed
 * provenance, not truth; a missing one proves nothing.
 */

const IMAGE = "image";
// EXIF is a deterministic read but the tags are editable/strippable, so it is
// high- but not perfect-confidence; the cryptographic C2PA read scores higher.
const EXIF_CONFIDENCE = 0.9;
const C2PA_CONFIDENCE = 0.95;

export function buildImageMetaGraph(processedFile: ProcessedFile, inputRoot: string): KnowledgeGraph | null {
  const exif = processedFile.metadata?.exif as ExifMetadata | undefined;
  const c2pa = processedFile.metadata?.c2pa as C2paMetadata | undefined;
  if (!exif && !c2pa) return null;

  const imageName = toRelPathId(inputRoot, processedFile.path);
  const createdAt = new Date().toISOString();
  const entities = new Map<string, Entity>();
  const relations: Relation[] = [];

  const ensure = (name: string, entityType: string, observations: Observation[] = []): Entity => {
    const existing = entities.get(name);
    if (existing) {
      if (observations.length) existing.observations.push(...observations);
      return existing;
    }
    const e: Entity = { name, entityType, files: [], observations };
    entities.set(name, e);
    return e;
  };
  const obs = (text: string, adapter: string, confidence: number, extra: Partial<Observation> = {}): Observation => ({
    text,
    source: processedFile.path,
    createdAt,
    sourceAdapter: adapter,
    confidence,
    ...extra,
  });
  const edge = (to: string, type: string, validAt?: string) => {
    if (!to || to === imageName) return; // no self-loops
    relations.push({ from: imageName, to, relationType: [type], source: imageName, ...(validAt ? { validAt } : {}) });
  };

  // The image file as an entity (edge endpoint + holder of attribute observations).
  const image = ensure(imageName, IMAGE);
  image.files.push(processedFile.path);

  // EXIF — graph-native structured tags.
  if (exif) {
    const exifObs = (text: string, extra: Partial<Observation> = {}) => obs(text, "exif", EXIF_CONFIDENCE, extra);
    const validAt = exif.dateTaken;
    if (exif.dateTaken) image.observations.push(exifObs(`Captured: ${exif.dateTaken}`, { validAt }));
    if (exif.author) image.observations.push(exifObs(`Author: ${exif.author}`));
    if (exif.software) image.observations.push(exifObs(`Software: ${exif.software}`));

    // GPS → a location entity (deterministic, deduped to ~1 m by the rounded name).
    if (exif.gps) {
      const loc = `Location(${exif.gps.lat.toFixed(5)}, ${exif.gps.lng.toFixed(5)})`;
      ensure(loc, "location", [
        exifObs(`Latitude: ${exif.gps.lat}`, { locator: "gps" }),
        exifObs(`Longitude: ${exif.gps.lng}`, { locator: "gps" }),
      ]);
      edge(loc, "taken_at", validAt);
    }

    // Camera make/model → a device entity (reused across photos from one camera).
    if (exif.camera && (exif.camera.make || exif.camera.model)) {
      const cam = [exif.camera.make, exif.camera.model].filter(Boolean).join(" ").trim();
      if (cam) {
        ensure(cam, "camera", [
          ...(exif.camera.make ? [exifObs(`Make: ${exif.camera.make}`)] : []),
          ...(exif.camera.model ? [exifObs(`Model: ${exif.camera.model}`)] : []),
        ]);
        edge(cam, "captured_with", validAt);
      }
    }
  }

  // C2PA — a trust observation on the image source (a fact, never a verdict).
  // `unavailable` (couldn't read provenance) emits nothing — no signal to hedge.
  if (c2pa && !c2pa.unavailable) {
    if (c2pa.present) {
      const parts = [
        c2pa.valid === false
          ? "C2PA Content Credential present but failed validation"
          : "C2PA Content Credential present and valid",
      ];
      if (c2pa.signer) parts.push(`signed by ${c2pa.signer}`);
      if (c2pa.aiGenerated) parts.push("the credential asserts AI-generated content");
      image.observations.push(
        obs(`${parts.join("; ")}. A credential proves signed provenance, not truth.`, "c2pa", C2PA_CONFIDENCE)
      );
    } else {
      image.observations.push(
        obs("No C2PA Content Credential found. Absence is not evidence of manipulation.", "c2pa", C2PA_CONFIDENCE)
      );
    }
  }

  const hasObservations = Array.from(entities.values()).some((e) => e.observations.length > 0);
  if (!relations.length && !hasObservations) return null;
  return { entities: Array.from(entities.values()), relations };
}
