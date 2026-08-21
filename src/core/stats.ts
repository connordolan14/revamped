// Small dependency-free numeric helpers.

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Population standard deviation (divide by N). Matches the league sheet's DEV. */
export function stdevPop(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length;
  return Math.sqrt(v);
}

/** Sample standard deviation (divide by N-1). */
export function stdevSample(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export function round(x: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(x * f) / f;
}

/**
 * Competition ranking (1 = best) of `values` under a comparator that returns
 * true when `a` is better than `b`. Ties share the lower rank number, and the
 * next distinct value skips ranks (standard "1224" ranking). Deterministic:
 * ties are broken by original index so the output order is stable.
 */
export function rankBy<T>(
  items: T[],
  betterThan: (a: T, b: T) => number, // >0 if a ranks ahead of b
): Map<T, number> {
  const idx = items.map((it, i) => ({ it, i }));
  idx.sort((x, y) => {
    const c = betterThan(x.it, y.it);
    if (c !== 0) return -c; // higher "better" first
    return x.i - y.i;
  });
  const ranks = new Map<T, number>();
  let rank = 0;
  let seen = 0;
  let prev: T | null = null;
  for (const { it } of idx) {
    seen += 1;
    if (prev === null || betterThan(prev, it) !== 0) {
      rank = seen; // new distinct value → rank jumps to running count
    }
    ranks.set(it, rank);
    prev = it;
  }
  return ranks;
}

/** Rank numbers where a larger metric value is better (1 = highest). */
export function rankDesc(values: number[]): number[] {
  const order = values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => (b.v - a.v) || (a.i - b.i));
  const ranks = new Array(values.length).fill(0);
  let rank = 0;
  for (let s = 0; s < order.length; s++) {
    if (s === 0 || order[s].v !== order[s - 1].v) rank = s + 1;
    ranks[order[s].i] = rank;
  }
  return ranks;
}

/** Rank numbers where a smaller metric value is better (1 = lowest). */
export function rankAsc(values: number[]): number[] {
  return rankDesc(values.map((v) => -v));
}
