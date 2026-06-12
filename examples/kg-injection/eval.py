#!/usr/bin/env python
"""
Phase 9 eval — does the LoRA-injected adapter recover injected facts, refuse on
absent ones, and not wreck the base model? Compares base vs adapter on:

  recall    fraction of recall.jsonl (trained facts, PARAPHRASED question) whose
            answer contains the expected value (loose substring) — injection signal
  refusal   fraction of refusal.jsonl (held-out entities) where the model DECLINES
            rather than fabricating a value — KBLaM's core success metric
  ppl       perplexity on a neutral general-text sample (continual-learning guard)

Usage:
  ./.venv/bin/python eval.py --adapter ./adapters/lora-r16 [--limit N]

16GB note: mx.metal.clear_cache() between phases so base + adapter don't co-pin GPU.
"""
import argparse, json, math, re, sys
import mlx.core as mx
import mlx.nn as nn
from mlx_lm import load, generate
from mlx_lm.sample_utils import make_sampler

NEUTRAL_TEXT = (
    "The river flowed quietly past the old stone bridge as the morning fog lifted. "
    "Travellers crossed on their way to the market, carrying baskets of bread and fruit. "
    "By noon the square was busy with the sound of bargaining and laughter."
)
REFUSAL_MARKERS = re.compile(
    r"\b(i (don'?t|do not) know|not sure|no information|cannot|can'?t|unknown|"
    r"i'?m not aware|don'?t have|no data|unable to)\b",
    re.I,
)


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def read_jsonl(path):
    with open(path) as f:
        return [json.loads(l) for l in f if l.strip()]


def gen(model, tok, prompt, max_tokens=80):
    msgs = [{"role": "user", "content": prompt}]
    text = tok.apply_chat_template(msgs, add_generation_prompt=True, enable_thinking=False)
    sampler = make_sampler(temp=0.0)  # greedy, deterministic
    out = generate(model, tok, prompt=text, max_tokens=max_tokens, sampler=sampler, verbose=False)
    # strip any think block the model emits
    return re.sub(r"<think>.*?</think>", "", out, flags=re.S).strip()


def eval_recall(model, tok, probes):
    hits = 0
    for p in probes:
        ans = gen(model, tok, p["prompt"])
        if norm(p["expected"])[:40] and norm(p["expected"])[:40] in norm(ans):
            hits += 1
    return hits / max(1, len(probes))


def eval_refusal(model, tok, probes):
    refused = 0
    for p in probes:
        ans = gen(model, tok, p["prompt"])
        if REFUSAL_MARKERS.search(ans):
            refused += 1
    return refused / max(1, len(probes))


def perplexity(model, tok, text):
    ids = mx.array(tok.encode(text))
    logits = model(ids[None])[0][:-1]
    targets = ids[1:]
    logp = mx.take_along_axis(nn.log_softmax(logits, axis=-1), targets[:, None], axis=-1)
    return math.exp(-float(logp.mean()))


def run(model, tok, recall, refusal, limit):
    r = eval_recall(model, tok, recall[:limit])
    mx.clear_cache()
    f = eval_refusal(model, tok, refusal[:limit])
    mx.clear_cache()
    ppl = perplexity(model, tok, NEUTRAL_TEXT)
    return {"recall": round(r, 3), "refusal": round(f, 3), "perplexity": round(ppl, 2)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="Qwen/Qwen3-0.6B")
    ap.add_argument("--adapter", default="./adapters/lora-r16")
    ap.add_argument("--data", default="./data")
    ap.add_argument("--limit", type=int, default=120)
    ap.add_argument("--out", default="./report.json")
    args = ap.parse_args()

    recall = read_jsonl(f"{args.data}/recall.jsonl")
    refusal = read_jsonl(f"{args.data}/refusal.jsonl")
    print(f"probes: recall={len(recall)} refusal={len(refusal)} (limit {args.limit})", file=sys.stderr)

    print("== base ==", file=sys.stderr)
    base, tok = load(args.model)
    base_m = run(base, tok, recall, refusal, args.limit)
    del base
    mx.clear_cache()

    print("== adapter ==", file=sys.stderr)
    adpt, tok = load(args.model, adapter_path=args.adapter)
    adpt_m = run(adpt, tok, recall, refusal, args.limit)

    report = {"model": args.model, "adapter": args.adapter, "limit": args.limit, "base": base_m, "adapter_metrics": adpt_m}
    with open(args.out, "w") as f:
        json.dump(report, f, indent=2)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
