# Research brief (Dove → Dove) — video processing pipeline for wanshi

**Purpose:** a self-contained handoff to a *fresh chat* to begin **deep research** on a video-ingestion
pipeline, before any design or implementation brief. This carries (a) the project context a new chat
won't have, (b) the design thinking already done (so it isn't re-derived), and (c) the prioritized
research agenda to act on. **Not** a Cheetah implementation brief — this is the pre-research scoping.

---

## Project context (for the fresh chat — read first)
**wanshi** is a TypeScript/Node CLI that extracts **provenance-tracked knowledge graphs** from
heterogeneous files (docs, PDFs, code, audio, transcripts, images) for eventual KBLaM/LoRA knowledge
injection into small local LLMs. Core values: **offline-first, local-first**, runs on a **16GB M4 Mac
mini** (Apple Silicon — no CUDA; CPU/MPS only for local models). Cloud models are opt-in, never default.

Relevant existing machinery this pipeline must *reuse, not reinvent*:
- **ffmpeg** is already a dependency (current `AudioReader` uses it to decode→whisper/parakeet).
- A **transcript/speaker model** with **bi-temporal provenance** (`occurredAt`/`validAt`, per-chunk
  `ChunkProvenance{source, speaker, occurredAt}`) — already populated by the transcript path.
- A **`SubtitleReader`** (`.srt`/`.vtt`) already exists.
- An **image pipeline** (briefed separately): per-image EXIF, C2PA, optional CV pre-pass (YOLO object
  detection + hedged forensic signals), then VLM — with a **`sourceAdapter` + `locator` provenance
  field** stamped on every observation.
- A **content classifier** (heuristic/cascade) that routes document *type* → extraction handling.
- A recurring architectural theme across the project: **multi-view reconciliation** — imperfect views
  of one source (whisper+parakeet transcripts; marker+tesseract OCR) presented to the model to
  reconcile, **conservative on disagreement** (mark uncertain, don't pick a winner).

---

## The thesis (the framing that keeps this bounded)
**A video is not a new extraction problem — it's a multi-modal time-series, and the pipeline is a
selection-and-fusion layer wrapped around tools wanshi already has.** Concretely:
1. a **content-aware layer** decides *what to look at* (which frames),
2. each selected frame runs through the **image pipeline** (exists),
3. the audio runs through the **transcript pipeline** (exists),
4. everything **fuses on a shared timeline**.

The genuinely *new* engineering is only **(1) selection** and **(4) fusion**. Extraction itself is reuse.
Today, video → audio-only (whisper/parakeet); the visual track is discarded. That's the gap.

---

## Established design thinking (already reasoned — don't re-derive, build on)

**Content typology decides everything**, because it decides *where the information lives*:
- *Presentation / lecture / screencast* → info in sparse discrete **slides**; one frame per slide-change.
- *Talking-head / interview / podcast-video* → info ~entirely **audio**; face carries no facts → near-zero frames.
- *Documentary / news / edited* → info in **scene changes + on-screen text** (lower-thirds/chyrons name
  people/places/dates) → scene detection + chyron-OCR + VLM keyframes.
- *Surveillance / dashcam / war-footage* → continuous scene, sparse **events** → motion/object-change, not scene cuts.
- *Tutorial / demo* → info in **actions** → hardest; denser sampling or action recognition; defer.
- **Routing insight:** the existing content classifier could detect video type and pick the frame
  strategy — same pattern as document-type routing.

**Frame selection should be driven by structure or change, never a fixed clock** (a 1h lecture sampled
every 5s = 720 mostly-redundant VLM calls). **Pluggable strategies** (same pattern as the `pdfEngine`
ladder), chosen by content type:
- **transcript-aligned** — one frame per transcript segment/topic shift (audio structure drives visual sampling),
- **slide-change** — visual diff (SSIM/histogram/perceptual-hash) emits a keyframe when content jumps,
- **scene-detection** — PySceneDetect, or ffmpeg's own `select='gt(scene,0.4)'` (no new dep), one keyframe/shot,
- **fixed-interval** — the dumb baseline/fallback.

**Two architectures for fusion (the key fork):**
- *independent-then-merge* — extract from transcript / frames / OCR separately → dedup on the graph.
  Simpler, reuses the merger, but **loses cross-modal context** ("as you can see *here*" — "here" is the slide).
- *aligned-then-co-extract* — transcript segment boundaries define temporal **windows**; pull the
  frame(s) in each window and feed the **bundle** to a VLM ("during 2:13–2:45 the speaker said [X]
  while the slide showed [Y]; extract"). Resolves cross-modal reference. **This is the multi-view
  reconciliation pattern applied to time** — a "moment" is aligned views of one slice, co-extracted.
  *Lean: this is the architecture worth building; the transcript-frame idea is its alignment key.*

**Per-frame = the whole image pipeline, and OCR is the sleeper:** a selected frame isn't "VLM-describe."
It's VLM (semantics) + **OCR (chyron/slide/caption — frequently the highest-value KG signal, since a
lower-third literally names the person/place/date)** + object detection (entities) + the forensic/
provenance signals. The image pipeline *is* the per-frame processor.

**Cost is the constraint; the control is a cascade:** content-aware selection (fewest frames — biggest
lever) → **perceptual-hash dedup** (near-identical frames extract once) → **cheap local CV pre-pass as a
gate** (object detection / OCR run cheap; a frame with no text or objects may not earn a VLM call) →
VLM only on passing frames → cached sidecar → `--max-frames`/cost cap. The image brief's CV pre-pass
becomes the **gating filter** here.

**Temporal semantics — locator vs occurredAt (mirrors the subtitle cue-offset decision):** a video
timestamp is a **media offset** ("minute 15 of the file"), NOT wall-clock. So: frame/segment timestamp
→ **`locator`** ("talk.mp4 @ 2:13–2:45"); the video's **creation metadata** (recorded-when, from
container/EXIF-equivalent) → **`occurredAt`/`validAt`** (wall-clock). Don't conflate "minute 15" with
"3pm June 5th." Done right, this yields the per-fact video timestamps that power a timeline view.

**The audio-text side is itself multi-view, partly free:** many videos carry **embedded soft-subtitle
tracks** (ffmpeg-extractable) — a free, often professionally-authored transcript, sometimes better than
ASR; **burned-in captions** need frame-OCR. Check embedded subs first → fall back to ASR; if *both*
exist, reconcile (the whisper+parakeet pattern, with subs as a third view).

---

## Research agenda (the heart — prioritized; the fresh chat acts on this)

**R1 — THE GATING QUESTION: is local video/multi-frame VLM viable on a 16GB M4, or is video
inherently a cloud feature?** This determines whether video fits the offline-first thesis at all or is
an explicit opt-in cloud capability. Research: which open VLMs accept **native video vs frame-sequence**
input; which run **locally on Apple Silicon** (MPS/CoreML/llama.cpp/MLX) at 16GB; how frames are fed
(grid montage? sequence? interleaved with transcript text?); **per-frame token cost**; and the
practical ceiling on frame count per call. Note from the project's model survey: `minimax-m3` and
several Gemini/Qwen-VL tiers are video-capable on the cloud side. **Answer this first — everything
downstream forks on it.**

**R2 — Frame/scene/keyframe selection, state of the art and what runs on M4.** PySceneDetect (content
vs threshold detectors) and ffmpeg's `scene` filter for shot boundaries; **slide-change/keyframe**
methods for presentations (SSIM, histogram-diff, perceptual-hash thresholds); learned keyframe-selection
models vs classic CV; which are cheap/local. The claim to verify: *this is a solved library problem*,
not the hard part.

**R3 — Audio-visual / transcript-frame alignment prior art, and KG-from-video specifically.** Does
anyone do **co-extraction** (feed aligned transcript+frame to an MLLM as one "moment")? Survey
video-understanding/video-RAG/video-KG-extraction literature; timestamp-alignment techniques; whether
the "co-extraction moment" is novel or has precedent. This validates (or reshapes) the architecture fork.

**R4 — Object/people/animal detection on Apple Silicon.** Current best open-source detectors
(YOLO-class), ONNX/CoreML for M4, the COCO-80 taxonomy (people/vehicles/animals/objects), confidence
handling; and whether **cross-frame tracking** (same object across frames → one entity) adds value over
per-frame detection. (Overlaps the image brief, but here it's the per-frame gate + the temporal-tracking question.)

**R5 — Embedded subtitle & caption extraction.** ffmpeg soft-sub extraction across formats (SRT/ASS/VTT
text-subs vs **PGS/VobSub bitmap-subs that need OCR**); detecting embedded sub tracks; burned-in caption
detection + OCR. The "free transcript" path and its failure modes.

**R6 — Long-video chunking / memory.** Handling multi-hour video without blowing memory/context;
segment-based processing; the relationship between scene boundaries and processing chunks.

**R7 (lower priority — the validity half) — video manipulation / deepfake signals.** For the
investigative/war-footage corpus interest: deepfake and staged-video detection, the open-source landscape,
and the same **signal-not-verdict, hedged, low-confidence** discipline the image forensics brief
established. Brief survey only; this is the speculative tier.

---

## Open design forks (resolve *after* research, not now)
- **Architecture:** co-extract vs independent-then-merge (lean co-extract — R3 informs feasibility).
- **Selection-strategy set + routing:** which strategies ship, classifier-driven selection (R2).
- **Local vs cloud video-VLM:** the offline-first question (R1 decides — possibly "local for selection/OCR/
  detection, cloud-opt-in for the heavy video-VLM").
- **Cost cascade design:** the gate thresholds, dedup, frame budget (R1/R4).
- **Temporal semantics:** locator-vs-occurredAt — *mostly decided* (mirrors subtitle decision); confirm only.

## MVP recommendation
Start with the **presentation/lecture case** — highest value-for-effort (covers conference talks,
screencasts, webinars, lectures — a huge swath) and it exercises the *entire* architecture: subs-or-ASR
transcript + slide-change/transcript-aligned selection + per-frame OCR+VLM + timeline fusion. Prove it
there, then generalize by **adding strategies** (scene-detection, motion-event), not rebuilding. The
genuinely hard part is **not** frame selection (R2 — solved) but **(4) temporal fusion** (frame
timestamps + transcript segment times + sub-cue offsets onto one clock, bundled into co-extraction
moments) and **(1) strategy routing** — budget the engineering care there.

## Sequencing (where this sits)
Exploratory. It sits **behind** the current pre-release batch — the benchmark work and the image/OCR
pipeline land first (and the image pipeline is video's per-frame processor, so it's a soft prerequisite).
This brief seeds the research thread; an implementation brief for Cheetah comes only after R1–R3 settle
the feasibility and the architecture.

## Hand-back (to the fresh chat)
Start with **R1** (the local-VLM feasibility gate) and **R2/R3** (selection SOTA + alignment prior art) —
these three decide whether the pipeline is offline-viable and which architecture is real. Then crystallize
the design forks, *then* a Cheetah implementation brief. Everything above the research agenda is
already-reasoned context to build on, not to relitigate.
