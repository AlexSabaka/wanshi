#!/usr/bin/env bash
# Local-model gold benchmark sweep: wanshi vs KGGen, SAME local Ollama model.
# Loops MODELS × DATASETS × MODES; each cell = the 3-step gold-compare flow
# (wanshi extract + dump samples → KGGen on the same local model → score two-way).
# Resumable (JSONL caches); a cell failure is logged and skipped, never fatal.
#
# Tunables (env, with defaults):
#   MODELS     "gemma3:4b qwen3:8b"        Ollama gen tags (space-separated)
#   DATASETS   "semeval crossre redocred biored finred"
#   MODES      "closed vocab"             vocab only applies where data/<ds>/relations.vocab exists
#   LIMIT      100                        per-dataset sample cap (redocred is doc-level → consider 50)
#   PERDOMAIN  50                         CrossRE per-domain cap
#   EMB_MODEL  nomic-embed-text           local embeddings (free)
set -uo pipefail
cd /app

MODELS="${MODELS:-gemma3:4b qwen3:8b}"
DATASETS="${DATASETS:-semeval crossre redocred biored finred}"
MODES="${MODES:-closed vocab}"
LIMIT="${LIMIT:-100}"
PERDOMAIN="${PERDOMAIN:-50}"
EMB_MODEL="${EMB_MODEL:-nomic-embed-text}"
OLLAMA_BASE="http://${OLLAMA_HOST:-127.0.0.1:11434}"
export OLLAMA_API_BASE="${OLLAMA_BASE}"
PY="${VENV_KGGEN:-/opt/venv-kggen}/bin/python"
RESULTS=/app/results
mkdir -p "${RESULTS}"
LOG="${RESULTS}/sweep.log"

log() { echo "[bench-run] $*" | tee -a "${LOG}"; }

slug() { echo "$1" | tr '/:.' '_'; }

log "MODELS=[${MODELS}] DATASETS=[${DATASETS}] MODES=[${MODES}] LIMIT=${LIMIT} EMB=${EMB_MODEL}"
log "pulling embeddings model ${EMB_MODEL}…"; ollama pull "${EMB_MODEL}" 2>&1 | tail -1 | tee -a "${LOG}"

run_cell() {
  local model="$1" ds="$2" mode="$3"
  local s; s="$(slug "${model}")"
  local cache="data/${ds}/compare/${s}"   # per-MODEL cache dir (kggen.jsonl isn't model-keyed upstream)
  local vocab=()
  if [ "${mode}" = "vocab" ]; then
    [ -f "data/${ds}/relations.vocab" ] || { log "skip ${ds}/vocab (no relations.vocab)"; return 0; }
    vocab=(--relation-vocab "@data/${ds}/relations.vocab")
  fi
  local common=(--dataset "${ds}" --model "${model}" --provider ollama --host "${OLLAMA_BASE}"
                --embeddings-provider ollama --embeddings-model "${EMB_MODEL}" --embeddings-host "${OLLAMA_BASE}"
                --limit "${LIMIT}" --per-domain "${PERDOMAIN}" --cache-dir "${cache}")
  log "=== CELL model=${model} ds=${ds} mode=${mode} → ${cache} ==="

  # 1) wanshi extract + dump samples.jsonl (mode-suffixed wanshi cache)
  npx ts-node scripts/gold-compare.ts "${common[@]}" "${vocab[@]}" 2>&1 | tee -a "${LOG}" \
    || { log "gold-compare(extract) FAILED ${model}/${ds}/${mode} — skipping cell"; return 0; }

  # 2) KGGen on the SAME local model (once per model+ds; reused across modes).
  #    LiteLLM ollama_chat/ provider → local Ollama; the script's key check is satisfied
  #    by a dummy OPENROUTER_API_KEY (ollama ignores it).
  if [ ! -s "${cache}/kggen.jsonl" ]; then
    log "KGGen (ollama_chat/${model}) → ${cache}/kggen.jsonl"
    OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-ollama}" OLLAMA_API_BASE="${OLLAMA_BASE}" \
      "${PY}" scripts/kggen-crossre.py --model "${model}" --model-prefix "ollama_chat/" \
        --samples "${cache}/samples.jsonl" --out "${cache}/kggen.jsonl" 2>&1 | tee -a "${LOG}" \
      || log "KGGen FAILED ${model}/${ds} — continuing (wanshi-only table)"
  else
    log "KGGen cache present for ${model}/${ds} — reuse"
  fi

  # 3) re-run → two-way table + JSON report (results/<ds>/<slug>__<mode>__wanshi-vs-kggen.json)
  npx ts-node scripts/gold-compare.ts "${common[@]}" "${vocab[@]}" 2>&1 | tee -a "${LOG}" \
    || log "gold-compare(score) FAILED ${model}/${ds}/${mode}"
}

for model in ${MODELS}; do
  log "pulling model ${model}…"; ollama pull "${model}" 2>&1 | tail -1 | tee -a "${LOG}"
  for ds in ${DATASETS}; do
    for mode in ${MODES}; do
      run_cell "${model}" "${ds}" "${mode}"
    done
  done
done

# Roll the JSON reports into one scannable table (node entity-capture F1 = the headline).
log "=== SUMMARY (node entity-capture semantic F1; tri = endpoint triple F1) ==="
{
  printf '%-10s %-9s %-7s %8s %8s %8s %8s\n' dataset model mode wanshiF1 kggenF1 wTriF1 kTriF1
  find "${RESULTS}" -name '*__*__wanshi-vs-kggen.json' 2>/dev/null | sort | while read -r r; do
    jq -r '"\(.dataset) \(.model) \(.mode) "
      + "\(.tools.wanshi.nodeEntityCapture.semantic.f1 // 0) "
      + "\((.tools.kggen.nodeEntityCapture.semantic.f1) // "-") "
      + "\(.tools.wanshi.tripletEndpoint.semantic.triple.f1 // 0) "
      + "\((.tools.kggen.tripletEndpoint.semantic.triple.f1) // "-")"' "$r" 2>/dev/null \
    | awk '{printf "%-10s %-9s %-7s %8s %8s %8s %8s\n",$1,$2,$3,$4,$5,$6,$7}'
  done
} | tee "${RESULTS}/SUMMARY.txt" | tee -a "${LOG}"

log "DONE. JSON reports under ${RESULTS}/<dataset>/ ; summary ${RESULTS}/SUMMARY.txt"
