#!/usr/bin/env bash
# Pack the gold corpora (EXCLUDING the 11GB REBEL, which is not a gold set) into a
# single corpora.tar.zst for the private data repo or a direct pod upload.
# Run from the bench repo root (where data/ lives). ~80MB output.
set -euo pipefail
OUT="${1:-corpora.tar.zst}"
SETS="crossre semeval redocred biored scier drugprot finred code mine"
args=()
for d in ${SETS}; do
  if [ -e "data/${d}" ]; then args+=("data/${d}"); else echo "warn: data/${d} missing, skipping" >&2; fi
done
[ ${#args[@]} -gt 0 ] || { echo "no corpora found under data/"; exit 1; }
echo "packing: ${args[*]}"
# Pipe tar → zstd (portable): `tar -I 'zstd -19 -T0'` is a GNU-tar-ism that macOS bsdtar
# parses as a literal program name "zstd -19 -T0" and fails. pipefail catches a tar error.
# --exclude '._*'/.DS_Store: data/ lives on an exFAT external drive where macOS materializes
# resource forks as real AppleDouble `._*` sidecar files. `--no-xattrs` does NOT drop them
# (they're files, not xattrs); unexcluded they leak into the image and break readdir-based
# loaders on Linux (`._foo.tsv` endsWith `_foo.tsv`, sorts first → 0 samples). See
# DrugProtDataset.resolveSplitFiles.
tar --no-xattrs --exclude '._*' --exclude '.DS_Store' -cf - "${args[@]}" | zstd -19 -T0 -o "${OUT}" -f
ls -lh "${OUT}"
echo "done → ${OUT}"
echo "extract: zstd -dc ${OUT} | tar -xf - -C <dest>   (yields data/<set>/…)"
