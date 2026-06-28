#!/usr/bin/env bash
# Container entrypoint: resolve corpora → start Ollama → run the sweep.
# Corpora delivery is flexible (the bake-vs-upload choice stays reversible):
#   1. baked   — data/ already populated in the image (private image)
#   2. tar     — CORPORA_TAR=/path/to/corpora.tar.zst  (uploaded to the pod)
#   3. mount   — CORPORA_DIR=/data  (a RunPod volume holding the data/ tree)
set -uo pipefail
APP=/app
cd "$APP"

have_corpora() { [ -f data/semeval/test.jsonl ] || [ -d data/crossre/crossre_data ] || [ -f data/finred/test.jsonl ]; }

echo "[entrypoint] resolving corpora…"
if have_corpora; then
  echo "[entrypoint] corpora present (baked)"
elif [ -n "${CORPORA_TAR:-}" ] && [ -f "${CORPORA_TAR}" ]; then
  echo "[entrypoint] extracting ${CORPORA_TAR} → ${APP}"
  tar -I zstd -xf "${CORPORA_TAR}" -C "${APP}" || tar -xf "${CORPORA_TAR}" -C "${APP}"
elif [ -d "${CORPORA_DIR:-/data}" ] && [ -n "$(ls -A "${CORPORA_DIR:-/data}" 2>/dev/null)" ]; then
  src="${CORPORA_DIR:-/data}"
  echo "[entrypoint] linking corpora from ${src}"
  rm -rf "${APP}/data" && ln -s "${src}" "${APP}/data"
fi
have_corpora || echo "[entrypoint] WARNING: no corpora resolved — dataset loads will fail." >&2

echo "[entrypoint] starting ollama (OLLAMA_HOST=${OLLAMA_HOST}, MAX_LOADED=${OLLAMA_MAX_LOADED_MODELS}, KEEP_ALIVE=${OLLAMA_KEEP_ALIVE})…"
ollama serve >/var/log/ollama.log 2>&1 &
base="http://${OLLAMA_HOST}"
for i in $(seq 1 60); do
  curl -fsS "${base}/api/version" >/dev/null 2>&1 && break
  [ "$i" = 60 ] && { echo "[entrypoint] ollama did not come up; tail of log:" >&2; tail -20 /var/log/ollama.log >&2; exit 1; }
  sleep 1
done
echo "[entrypoint] ollama up: $(curl -fsS "${base}/api/version")"

exec "${APP}/scripts/bench-run.sh"
