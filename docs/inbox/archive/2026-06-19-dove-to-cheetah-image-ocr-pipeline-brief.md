# Brief — image & OCR pipeline upgrade (overdue items + the CV pre-pass)

**From:** Dove 🕊️ · **To:** Cheetah 🐆 · **Date:** 2026-06-19
**Type:** implementation brief (pre-release; the long-overdue image/OCR items + the opt-in CV pre-pass).
**Frame:** today images go **raw to the VLM**, discarding metadata, provenance, and content structure;
the PDF OCR ladder has mid + cloud rungs but **no light-local floor**. This brief (a) completes the OCR
ladder and (b) stops images going raw — enrich with metadata, provenance, and optional CV context.
**Mission tie:** every item produces either a *fact* (EXIF GPS→location, timestamp→time, objects→entities)
or a *validity signal on a source* (C2PA/forensics→trust) — the connect-and-validate task applied to images.

## Organizing principle — deterministic before interpretive
The two phases split on a hard line, the same one as graph-native-vs-LLM in the file-types plan:
- **Phase 1 — deterministic reads** (EXIF values, C2PA validation, OCR engine selection): a credential
  either validates or doesn't; EXIF either has GPS or doesn't. Cheap, lossless, no judgment. Ship first.
- **Phase 2 — interpretive analysis** (object detection, ELA/manipulation signals): probabilistic, must
  be **signal-not-verdict**, confidence-floored, tool-attributed, opt-in. The careful tier.

## Cross-cutting (all items)
Every image-derived observation carries the **`sourceAdapter` + confidence** provenance field from the
file-types plan (`exif` / `c2pa` / `cv-detection` / `cv-forensics`). EXIF, C2PA, the CV signals, and the
VLM's own read are **views of one image source, reconciled** — same multi-view pattern as whisper+parakeet
and marker+tesseract, conservative on disagreement.

---

## Phase 1 — long overdue, ship first

**1a — Tesseract config (the missing OCR floor).** Tesseract never got its own engine slot — it's the
**light-local rung** the ladder lacks, the one that serves weak hardware (no GPU, no 4B VLM). Add it to
the existing `readers.pdfEngine` selector (`node-tesseract-ocr` shelling the binary, or `tesseract.js`
WASM for zero-binary installs). Config: `lang`, `psm`/`oem`. Clean license (Apache). Completes the
hardware-aware ladder: **tesseract (light/CPU) → pdf2json → docling → marker → chandra → mistral (cloud)**.

**1b — Chandra engine.** Add `chandra` to the `pdfEngine` selector — **same Datalab lineage as marker**
(already integrated: Surya→Marker→Chandra), so it's a sibling addition, not a new paradigm. It's the
**handwriting / SOTA-quality rung** (4B VLM, 85.9% olmOCR, 90+ langs, structured MD/HTML/JSON). Invoke via
`chandra-ocr` (vLLM or HF+torch); sidecar-cache like marker (it's slow). **Hardware:** 4B VLM → M4-runnable
but slow (CPU/MPS); position it as the slow-local quality tier, not a default. **License note in the config
description:** weights are modified OpenRAIL-M (free personal/research/<$2M; commercial self-hosting needs a
license) — unlike Tesseract's clean Apache, so a downstream commercial user shouldn't be surprised.

**1c — EXIF adapter (graph-native metadata).** Pure-Node `exifr` over images; map deterministically:
GPS → **location entity**, capture timestamp → **`occurredAt`/`validAt`** (bitemporal-native),
camera/author/software → typed attributes. This is structured data you currently discard — same class as
the SQLite/iCal adapters. Stamp `sourceAdapter: exif`. Cheapest, highest-value image item.

**1d — C2PA provenance stamp (the deterministic validity read).** Read Content Credentials via the C2PA
SDK (Rust core / JS bindings) → a **trust observation** on the image source: credential present-and-valid /
absent / claims-AI-generation / signer. This is the "validate" half, and C2PA is the open standard the field
converged on (OpenAI+Google dual-layer, May 2026). Deterministic (a signature validates or doesn't), so it's
Phase 1, not forensics. Stamp `sourceAdapter: c2pa`, confidence high (it's cryptographic), but **note the
standard's own caveat**: a valid credential proves signed provenance, not truth; a *missing* one proves
nothing. Store the fact, not a verdict.

---

## Phase 2 — the CV pre-pass (opt-in; signal-not-verdict)

**The reframe, stated precisely:** NOT a forensics verdict engine. A pre-pass that produces *signals* fed
to the VLM as context **and** stored as confidence-tagged, tool-attributed observations. The model and the
human downstream judge; the tool never concludes.

**2a — Object/scene detection (the clean signal; do this first).** YOLO-class detector via ONNX (runs on
M4). people / vehicles / objects / animals / scene → **entities** + VLM context ("detected: 3 people, 2
motorbikes"). Concrete output, so it may be stated plainly — just confidence-tagged from the detector.
`sourceAdapter: cv-detection`. Genuinely useful beyond OSINT (a photo archive, a document corpus with
figures) and the lower-risk half of the pre-pass.

**2b — Manipulation/forensic signals (the careful tier; lowest priority, strictest discipline).** Classic
primitives — ELA, JPEG-ghost, copy-move, noise map (OpenCV/Python; the Krawetz/FotoForensics canon) — plus
EXIF-tampering and the C2PA read from 1d. **The discipline is the whole point and is mandatory, not
optional:**
- Present the signal **uninterpreted, low-confidence, tool-attributed** — *never* a verdict. Not "the image
  was redacted" but "ELA shows elevated error levels in region X (note: also normal in textured areas);
  EXIF absent; no C2PA credential." The VLM is instructed to **hedge** ("forensic analysis *suggests*…").
- The observation is **confidence-floored** and `sourceAdapter: cv-forensics`, so it's queryably a
  low-trust tool signal, not a fact. A *wrong* forensic signal asserted as truth manufactures a false
  validity claim — **worse than silence** — so if the output can't be honestly hedged, cut it.
- **On-mission, not OSINT-only:** scientific image-fraud (manipulated figures/blots — the research-scientist
  persona's live problem) and archival-photo authenticity (the historian) are the same validity question.

**Validation corpus (Phase 2):** the war-documentation corpus (Bellingcat-adjacent; heavily staged /
EXIF-stripped / manipulated propaganda material) is a strong **real-world validation/demo** for the
pre-pass — the adversarial case that proves "flag uncertainty, don't assert a verdict." But it's **Tier-3
(validate-it-runs + intrinsic), not labeled-accuracy** — manipulation has no clean oracle ("staged" is a
judgment, not a label); a curated set of Bellingcat-documented-and-debunked images could be a small labeled
probe later. Carries graphic/victim content → handle with care as a corpus.

---

## Phasing / effort
- **Phase 1** — overdue, do first. Tesseract + Chandra are small additions to the existing `pdfEngine`
  selector; EXIF + C2PA are cheap graph-native/deterministic reads. All low-risk.
- **Phase 2** — opt-in, medium. 2a (object detection) is the clean win; 2b (forensic signals) is last and
  governed by the hedge discipline above. Default off.

## Out of scope
- **Video VLM input** (frame extraction / content-aware frame selection / VLM video) — its own subsystem,
  its own brief (the ffmpeg dep exists; the new part is frame-selection strategy + transcript-timeline
  alignment).
- A forensics **verdict** system — we produce signals, not conclusions.
- Active geolocation / reverse-image search — OSINT-platform direction, parked.

## Hand-back
Phase 1 is four overdue items that complete the OCR ladder and stop discarding image metadata — ship it.
Phase 2 is the opt-in CV pre-pass; 2a first, 2b only if the hedge discipline holds. The connective thread is
the mission test: produce a fact or a (honestly-qualified) validity signal — never an unearned verdict.
