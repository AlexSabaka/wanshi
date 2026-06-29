#!/usr/bin/env bash
# Phase-1 specialist arc: each fine-tuned model AND ITS EXACT BASE on its home corpus,
# WANSHI-ONLY (the axis is specialist-wanshi vs base-wanshi → `specialist − base` isolates
# the tuning effect, size/family/arch held fixed; KGGen not needed). N=40, ctx 8192,
# closed+vocab (auto-skip where no relations.vocab) — same config as the gemma3/qwen3
# gradients → directly comparable, and reproduces the M4 specialist numbers as a check.
#
# Heterogeneous PAIRS="<ollama-model-tag>|<dataset>" (space/newline separated), env-overridable.
# Default = the lineage-controlled Phase-1 lineup (base + specialist per corpus). Each model is
# `ollama pull`ed; an unresolvable tag logs-and-continues (a no-go is itself a finding).
set -uo pipefail
REPO="${BENCH_ROOT:-/app}"
RES="${RESULTS:-${BENCH_ROOT:-/app}/results}"
EMB_MODEL="${EMB_MODEL:-nomic-embed-text}"
N="${N:-40}"
mkdir -p "$RES"
PAIRS="${PAIRS:-
qwen3:8b|finred
hf.co/mradermacher/ODA-Fin-SFT-8B-GGUF:Q4_K_M|finred
hf.co/alexsabaka/ODA-Fin-RL-8B-GGUF:Q4_K_M|finred
hf.co/unsloth/Qwen3.5-9B-GGUF:Q4_K_M|code
hf.co/Tesslate/OmniCoder-9B-GGUF:Q4_K_M|code
qwen2.5-coder:7b|code
qwen2.5:7b-instruct|code
hf.co/mradermacher/WhiteRabbitNeo-V3-7B-GGUF:Q4_K_M|code
}"

# mem sampler: total ollama RSS + swap (the swap field is macOS-only; empty on the Linux pod).
( while true; do
    rss=$(ps -axo rss,command 2>/dev/null | grep -i "[o]llama" | awk '{s+=$1} END{print s+0}')
    sw=$(sysctl -n vm.swapusage 2>/dev/null)
    printf '%s ollama_rss_mb=%d %s\n' "$(date +%H:%M:%S)" "$((rss/1024))" "$sw"
    sleep 30
  done ) >> "$RES/mem.log" 2>&1 &
MEMPID=$!
trap 'kill $MEMPID 2>/dev/null' EXIT

echo "[targeted] START $(date) N=$N RES=$RES" | tee -a "$RES/run.log"
cd "$REPO"
echo "[targeted] pulling embeddings ${EMB_MODEL}..." | tee -a "$RES/run.log"
ollama pull "$EMB_MODEL" 2>&1 | tail -1 | tee -a "$RES/run.log"

run_cell() {
  local model="$1" ds="$2" mode="$3"
  local slug; slug=$(echo "$model" | tr '/:.' '_')
  local vocab=()
  if [ "$mode" = vocab ]; then
    [ -f "data/$ds/relations.vocab" ] || { echo "[targeted] skip $ds/vocab (no relations.vocab)" | tee -a "$RES/run.log"; return 0; }
    vocab=(--relation-vocab "@data/$ds/relations.vocab")
  fi
  echo "[targeted] === CELL $model @ $ds ($mode) N=$N ===" | tee -a "$RES/run.log"
  local t0; t0=$(date +%s)
  TS_NODE_TRANSPILE_ONLY=1 npx ts-node scripts/gold-compare.ts \
    --dataset "$ds" --model "$model" \
    --provider ollama --host http://127.0.0.1:11434 \
    --embeddings-provider ollama --embeddings-model "$EMB_MODEL" --embeddings-host http://127.0.0.1:11434 \
    --limit "$N" --per-domain 50 --ctx "${CTX:-8192}" --max-tokens "${MAXTOK:-8192}" \
    --cache-dir "data/$ds/compare/${slug}" ${vocab[@]+"${vocab[@]}"} 2>&1 \
    | tee "$RES/${slug}__${ds}__${mode}.log" \
    | grep -iE 'conformance|nodeF1|wanshi +[0-9]|Scoring [0-9]|related_to|failed chunks|truncat' \
    | tee -a "$RES/run.log"
  local t1; t1=$(date +%s)
  echo "[targeted] $model@$ds/$mode took $((t1-t0))s" | tee -a "$RES/run.log"
}

for pair in $PAIRS; do
  model="${pair%%|*}"; ds="${pair##*|}"
  echo "[targeted] pulling ${model}..." | tee -a "$RES/run.log"
  ollama pull "$model" 2>&1 | tail -1 | tee -a "$RES/run.log"
  ollama show "$model" >/dev/null 2>&1 || { echo "[targeted] MODEL UNRESOLVED: $model — skipping (finding)" | tee -a "$RES/run.log"; continue; }
  for mode in closed vocab; do run_cell "$model" "$ds" "$mode"; done
done

echo "[targeted] DONE $(date)" | tee -a "$RES/run.log"
