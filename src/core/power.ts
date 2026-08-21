// Six-factor power ranking model, reproducing the league sheet's method:
// each team is ranked 1..N on six factors, each factor rank is multiplied by a
// per-factor weight, the weighted ranks are averaged into a score, and teams
// are ordered by that score (lowest = strongest). Trend = movement vs last week.

import { PowerFactorSet, PowerRanking } from "./types.js";
import { rankDesc } from "./stats.js";

export type FactorKey = keyof PowerFactorSet;

export const FACTOR_KEYS: FactorKey[] = [
  "wins",
  "streak",
  "rosterScore",
  "ovw",
  "consistency",
  "avgPF",
];

// Default multipliers all 1.0 (matches the current sheet). Tunable later.
export const DEFAULT_MULTIPLIERS: Record<FactorKey, number> = {
  wins: 1,
  streak: 1,
  rosterScore: 1,
  ovw: 1,
  consistency: 1,
  avgPF: 1,
};

export interface TeamFactors {
  rosterId: number;
  factors: PowerFactorSet;
}

export function computePowerRankings(
  teams: TeamFactors[],
  prevRankByRoster: Map<number, number> = new Map(),
  multipliers: Record<FactorKey, number> = DEFAULT_MULTIPLIERS,
): PowerRanking[] {
  const ids = teams.map((t) => t.rosterId);
  // Rank each factor (higher value = better = rank 1).
  const factorRankArrays: Record<FactorKey, number[]> = {} as any;
  for (const k of FACTOR_KEYS) {
    factorRankArrays[k] = rankDesc(teams.map((t) => t.factors[k]));
  }

  const scored = teams.map((t, i) => {
    const factorRanks = {} as Record<FactorKey, number>;
    let weightedSum = 0;
    let weightTotal = 0;
    for (const k of FACTOR_KEYS) {
      const r = factorRankArrays[k][i];
      factorRanks[k] = r;
      weightedSum += r * multipliers[k];
      weightTotal += multipliers[k];
    }
    const score = weightedSum / (weightTotal || 1);
    return { rosterId: t.rosterId, score, factorRanks, factors: t.factors };
  });

  // Order by score ascending (lower = stronger).
  const order = [...scored].sort((a, b) => a.score - b.score || a.rosterId - b.rosterId);
  const rankByRoster = new Map<number, number>();
  order.forEach((s, idx) => rankByRoster.set(s.rosterId, idx + 1));

  return scored
    .map((s) => {
      const rank = rankByRoster.get(s.rosterId)!;
      const prev = prevRankByRoster.get(s.rosterId);
      return {
        rosterId: s.rosterId,
        score: s.score,
        rank,
        prevRank: prev ?? null,
        trend: prev == null ? null : prev - rank,
        factorRanks: s.factorRanks,
        factors: s.factors,
      };
    })
    .sort((a, b) => a.rank - b.rank);
}
