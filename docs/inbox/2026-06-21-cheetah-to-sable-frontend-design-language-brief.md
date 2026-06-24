# Brief — `wanshi-app` design language (color-book · Tailwind tokens · typefaces)

**From:** Cheetah 🐆 · **To:** Sable 🎨 · **Date:** 2026-06-21
**Type:** Design-language spec — the convergence half of Dove's frontend UI/UX brief
([`2026-06-21-dove-to-sable-cheetah-frontend-uiux-brief.md`](./2026-06-21-dove-to-sable-cheetah-frontend-uiux-brief.md)).
**Status of the other half:** the frontend **scaffolding is built and merged** (branch `frontend-provenance`):
provenance-complete data, a pure trust-derivation layer, a provenance-aware node inspector, trust on the
graph canvas, and a debug/trace lineage inspector — **all rendering in neutral grayscale placeholders behind
a clean token seam.** Your job is the visual language that slots into that seam. Nothing you deliver requires
rewiring components — you fill **values**, I wire fonts and verify.

> Read first: the **frontend-design SKILL** (env design-token/styling constraints). The headline rule that
> applies here — *spend boldness in exactly one place* — maps perfectly: **the one place is the trust
> language.** Everything else stays quiet and disciplined.

---

## 1. Brand ground truth (the latest Figma exports)

Authoritative source = your re-exported SVGs (currently `~/Downloads/`, to be vendored into the repo):
`wanshi-banner-dark.svg`, `wanshi-banner-light.svg`, `wanshi-avatar-256.svg`. The legacy `logo.svg`
(green `#3ECC5F` / yellow `#FFFF50`) is **superseded** by these — do not anchor to it.

Extracted palette (literal hexes from the SVG sources):

**Dark (the hero):**
| Role | Hex | Notes |
|---|---|---|
| Hero cyan (primary) | `#4fe6d7` | the neon "wanshi" wordmark; the product's signature |
| Cyan glow / highlight | `#7aecdf` | lighter, used as bloom/edge-light |
| Cyan-teal mids | `#2fe0cc` · `#49e4d5` | graph nodes/edges |
| Teal (depth) | `#118f7f` · `#0c8f84` | recessed structure |
| Ground (petrol-black) | `#0c2834` | the dark canvas; near-black with teal |
| Near-white (cyan-tint) | `#d8faf6` · `#dcfbf5` | text / highlights |
| **Amber accent** | **`#f4c75a`** (soft `#ecbf72`) | the cat's eyes — **the one warm pop** |
| Muted secondary (blue-grays) | `#8cc0dd` · `#aecbdb` · `#bcd5d2` | de-emphasized graph/secondary |
| Muted greens | `#74a378` · `#3f6e59` | the waveform/data motif |

**Light:** same family inverted — primary teal `#0c8f84`, deep ink `#0a5f58` / navy `#0c2a34`, pale grounds
`#d8faf6`/`#dcedec`, amber deepened to `#c98b12` so it holds on a pale field.

**Avatar (the cat):** dark teal-black body gradient (`#234a53`→`#16282f`→`#0f1a20`→`#0a151a`) with **amber
eyes** (`#f4c75a`, glow `#ffe08a`/`#fff6da`). This is the app mark (favicon, nav brand, loading states).

**Register:** *tactical research instrument* — neon-graph-on-petrol, serious tool, dark is hero. Not a
cute consumer app.

---

## 2. The one insight that should drive the trust language

**The brand is overwhelmingly cool (cyan/teal) with a single warm accent (amber).** That is not just
flavor — it *constrains* the trust language, which is your headline deliverable:

- **Green/teal cannot mean "grounded/good."** It's the brand's ambient color — a teal "grounded" badge
  camouflages into every node, edge, and chrome surface. The most-common state must read as *calm and
  trustworthy without shouting brand-color.*
- **Amber `#f4c75a` is the brand's only attention color** → it's the natural semantic home for
  **uncertain / needs-a-look**. But it's *precious* — overusing it as a trust color dilutes the brand pop.
- **The alarm states (ungrounded / contradicted) need a hue from OUTSIDE the brand range** — the banner has
  no red/coral/magenta, which is exactly why a non-brand alarm hue will *pop* as "stop and look." Use it
  sparingly; if everything alarms, nothing does.
- **The confidence gradient is hue-agnostic and already wired** (opacity), so it composes with a near-
  monochrome trust palette — lean on it.

This tension *is* the design problem. A generic KG viewer would map grounded=green/bad=red and call it done;
that collides with the brand and fails colorblind users. You're solving "make trust immediate **within** a
cool brand."

---

## 3. What to deliver, and exactly where it plugs in

Everything below is a **value-fill into an existing seam** — file paths are concrete so you (and I, on
convergence) know the blast radius is *values + fonts*, not components.

### 3a. The trust language — THE headline (`frontend/app/globals.css`)
Seven CSS custom properties, defined in both the `@theme` (light) block and the `.dark` block. They're
**neutral grayscale today**; you overwrite the values. Consumers (DOM + canvas) already read them — no
rewiring.

```
--color-trust-grounded      --color-trust-ungrounded     --color-trust-uncertain
--color-trust-contradicted  --color-trust-superseded     --color-trust-tool-derived
--color-trust-unknown
```

State semantics (so your colors are grounded in real meaning):
| State | Means | Frequency |
|---|---|---|
| `grounded` | passed the grounding gate / citation "supported" | common — must be calm |
| `ungrounded` | grounding failed / citation "unsupported" | alarm |
| `uncertain` | citation "uncertain", or an unresolved reference | attention |
| `contradicted` | (reserved — cross-fact, not yet emitted) | rare/alarm |
| `superseded` | bi-temporal: invalidAt/expiredAt — no longer current | informational/past |
| `tool-derived` | low-trust machine read (OCR, cv-detection, cv-forensics) | caution, not alarm |
| `unknown` | **no trust signal at all** (default run / mcp graph) | very common — must be quiet/neutral |

> **Critical:** `unknown` is the *default* on most graphs (the grounding gate is off by default). It must be
> visually *quiet* — neutral, low-emphasis — NOT alarming. Trust visuals should *light up* when provenance
> exists, not paint a default graph red.

**Strawman mapping (my read — your call, you own this):** `grounded` → a confident desaturated cyan that's
distinct from ambient (a "solid" feel, not a shout); `uncertain` → amber `#f4c75a`; `ungrounded`/
`contradicted` → a non-brand coral/magenta alarm; `superseded` → desaturated/greyed (the "faded past");
`tool-derived` → an off-brand cool (violet/indigo — "machine, hedge it") that isn't an alarm;
`unknown` → neutral grey (quiet). Reshape freely — this is your headline, not a spec.

**Icons already carry each state** (so color *reinforces*, never *carries alone* — colorblind-safe by
construction; keep this property): `ShieldCheck / ShieldX / ShieldQuestion / GitCompare / History / ScanLine
/ CircleHelp` (in `frontend/components/trust-badge.tsx`). Swap icons if you have better; keep the 1:1.

**Confidence gradient:** wired on the canvas as `opacity = 0.45 + 0.55·confidence` and surfaced as a `%` on
badges. Tell me if you want a different ramp or a token-driven tint instead of pure opacity.

### 3b. Entity-type palette (`frontend/lib/graph-colors.ts` → `PALETTE`)
A 12-hex categorical scale (`colorForType()`), deterministic per type, shared by the graph + chips + charts.
Dove's ask: **domain-extensible** (types vary by corpus) + a graceful fallback for unknowns. Deliver a
**scalable categorical scheme** (it must stay legible on both the petrol-dark and pale-light grounds, and
not fight the cyan brand or the trust hues). Decide with me: keep it as the JS array you edit, or promote to
`--color-entity-*` CSS vars (the resolver already supports reading them — a one-step convergence).

### 3c. The base UI skin (`frontend/app/globals.css`)
The shadcn OKLCH token set already exists and is fully themed light/dark: `--color-{background, foreground,
card, popover, primary, secondary, muted, accent, destructive, border, input, ring, sidebar-*}` +
`--color-chart-1..5`. Reskin these to the brand, **dark-hero**. The petrol `#0c2834` ground, cyan primary,
and the amber as a *sparing* accent (`--color-ring`/focus? selection? — your call) are the obvious moves.

### 3d. Typography (open slot — no `next/font` is wired yet)
`frontend/app/layout.tsx` currently ships **no** typeface — the app is on the system sans. Pick three roles;
I'll wire them via `next/font`:
- **Display** — characterful, for the wordmark/hero/section headers (the banner sets the tone; match its
  confidence). Used sparingly.
- **Body** — readable prose for *observations* (these are long, factual, and the substance of the inspector).
- **Mono** — **load-bearing**, not decorative: IDs, `locator` (`p.67`, `table:parts/row:42`), `sourceAdapter`
  tags, code, and the entire trace **lineage panel**. Pick a real mono with good legibility at 10–11px.

Give weights + any web-font source; I handle the `next/font` wiring + the canvas font (the graph labels
read a JS font string).

---

## 4. The surface your tokens light up (so you can see the whole canvas)

| Component / view | File | What your tokens drive |
|---|---|---|
| Trust badge | `components/trust-badge.tsx` | trust color + icon, per state |
| Provenance chip | `components/provenance-chip.tsx` | `sourceAdapter` · `locator` · confidence (mono) |
| Observation row | `components/graph/observation-item.tsx` | fact + trust + provenance + bi-temporal line |
| Node inspector | `components/graph/graph-detail-panel.tsx` | observations + trust-bearing relations |
| **Graph canvas** | `components/graph/force-graph.tsx` | node fill (entity palette), **opacity=confidence**, **trust ring**, tinted unfaithful edges |
| Trace lineage | `components/trace/lineage-panel.tsx` + `app/(debug)/trace/[id]/page.tsx` | merge/grounding decisions, mono-heavy |
| Mode shell | `components/layout/app-shell.tsx` | nav, brand mark, the dark-hero chrome |

### The one canvas gotcha (please design around it)
`react-force-graph` paints to a **raw `<canvas>` that cannot read CSS classes or `var(--token)`**. The graph
resolves colors via a JS helper (`resolveToken()` / `trustColor()` in `lib/graph-colors.ts`) that reads the
**computed CSS custom property**. Practical consequence: **any color you want on the graph must be a CSS
custom property** (a `--color-*` token), not a Tailwind utility class. Keep the trust + entity colors as
tokens and the canvas inherits them for free.

---

## 5. Guardrails (the "tactical instrument" register)

- **Dark is hero**, light is real but secondary. Both must hold the trust language legibly.
- **Trust ≠ brand green.** Reserve a non-brand alarm hue; spend amber sparingly (it's the brand's pop).
- **Never rely on hue alone** — icons already encode state; your color reinforces. (This is also the
  colorblind-safety guarantee — don't break it.)
- **`unknown` stays quiet** — a default-run graph must not look alarmed.
- **Epistemic distinctness** (Dove's scientist caveat): "paper reports X" vs "we observed X" must read as
  *visibly different* — `speaker`/`sourceAdapter` styling should make source-kind legible, never blended.
- **Density-appropriate** — a pro analysis instrument; small type, tight rhythm, lots of true information.
  Not a consumer app's whitespace.
- **Avoid the generic-AI-design clusters** (per the SKILL): cream + high-contrast serif + terracotta;
  near-black + a single acid-green/vermilion; broadsheet hairline-rule layouts. The brand already gives you
  a distinctive starting point — use it.

---

## 6. Out of scope for you (so the lane is clear)

The trust **logic**, data plumbing, components, and the trace inspector are **done**. You are not changing
component structure or behavior — you deliver **token values, typeface choices, and (optionally) icon
swaps**. The rewiring cost is already absorbed by the seam. Wiring `next/font`, applying your token block,
the entity-palette decision, and verifying are **mine**.

---

## 7. Hand-back & convergence protocol

Deliver:
1. **Color-book** — named hex/oklch per `--color-trust-*` (×7), the reskinned shadcn base set, and the
   entity-type scale — **for both light and dark**.
2. **The filled `globals.css` token block** (or a values table I paste in).
3. **Typefaces** — display / body / mono + weights + source.
4. **Entity palette** — the scalable scheme + unknown fallback (and the JS-array-vs-CSS-var call).
5. **Icon confirmations / swaps** for the 7 trust states (optional).

Then I: apply the tokens, wire the fonts, and run the **seam check** — override one `--color-trust-*` value
and confirm the badge **and** the canvas ring recolor with zero component edits. That green check is the
proof we've converged.

**The through-line:** trust-visualization is the identity; the brand is cool-with-one-warm, so the trust
language must carve distinct, non-colliding, icon-reinforced encodings; everything plugs into a seam that's
already built and waiting for your values.
