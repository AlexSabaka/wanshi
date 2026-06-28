/**
 * Numerically-stable softmax over a vector of scores.
 *
 * Subtracts the max before exponentiating so large raw scores can't overflow.
 * `temperature` controls sharpness: small T approaches a one-hot argmax, larger T
 * flattens toward uniform. Unlike sum-normalization it handles **negative** scores
 * gracefully (via `exp`), which is why the heuristic classifier uses it — its
 * cross-validation penalties push some raw class scores below zero.
 *
 * Returns a distribution that sums to 1 (uniform when every score is equal).
 *
 * A non-finite input (NaN/±Infinity) can't produce a meaningful distribution, so
 * it falls back to uniform — but **explicitly**, distinct from the legitimate
 * all-equal case that also yields uniform. Without the guard a single NaN would
 * silently flatten the whole distribution and look like a real all-equal result.
 */
export function softmax(scores: number[], temperature = 1): number[] {
  if (scores.length === 0) return [];
  // Non-finite scores (NaN/±Infinity) poison max/exp/sum — bail to uniform up front
  // rather than letting `sum > 0` fail and masquerade as the all-equal branch.
  if (!scores.every(Number.isFinite)) return scores.map(() => 1 / scores.length);
  const t = temperature > 0 ? temperature : 1;
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - max) / t));
  const sum = exps.reduce((a, b) => a + b, 0);
  return sum > 0
    ? exps.map((e) => e / sum)
    : exps.map(() => 1 / scores.length);
}
