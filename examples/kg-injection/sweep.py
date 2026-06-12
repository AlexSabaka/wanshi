#!/usr/bin/env python
"""Sweep saved LoRA checkpoints: recall vs perplexity (the injection↔forgetting
tradeoff), loading base once. Finds the epoch sweet spot without retraining."""
import json, os, re, shutil, sys, tempfile
import mlx.core as mx, mlx.nn as nn
from mlx_lm import load
from eval import gen, norm, read_jsonl, NEUTRAL_TEXT

ADAPTER_DIR = sys.argv[1] if len(sys.argv) > 1 else "./adapters/lora-r16"
LIMIT = int(sys.argv[2]) if len(sys.argv) > 2 else 80
recall = read_jsonl("./data/recall.jsonl")[:LIMIT]


def ppl(model, tok, text):
    ids = mx.array(tok.encode(text)); logits = model(ids[None])[0][:-1]; t = ids[1:]
    lp = mx.take_along_axis(nn.log_softmax(logits, -1), t[:, None], -1)
    return float(mx.exp(-lp.mean()))


def recall_rate(model, tok):
    hits = sum(1 for p in recall if norm(p["expected"])[:40] and norm(p["expected"])[:40] in norm(gen(model, tok, p["prompt"])))
    return hits / len(recall)


ckpts = sorted(f for f in os.listdir(ADAPTER_DIR) if re.match(r"\d+_adapters\.safetensors", f))
print(f"checkpoints: {ckpts}", file=sys.stderr)
rows = []
for ck in ckpts:
    iters = int(ck.split("_")[0])
    with tempfile.TemporaryDirectory() as d:
        shutil.copy(os.path.join(ADAPTER_DIR, ck), os.path.join(d, "adapters.safetensors"))
        shutil.copy(os.path.join(ADAPTER_DIR, "adapter_config.json"), d)
        m, tok = load("Qwen/Qwen3-0.6B", adapter_path=d)
        r, p = recall_rate(m, tok), ppl(m, tok, NEUTRAL_TEXT)
        del m; mx.clear_cache()
    epoch = round(iters * 2 / 969, 1)  # batch_size 2
    rows.append({"iters": iters, "epoch": epoch, "recall": round(r, 3), "ppl": round(p, 1)})
    print(f"iter {iters} (~{epoch} ep): recall {r:.3f}  ppl {p:.1f}", file=sys.stderr)

print(json.dumps(rows, indent=2))
