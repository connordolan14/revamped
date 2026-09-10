// Optimal-lineup solver for the league's Superflex slate. Used by the weekly
// recap context to compute "lineup regret" — how many points a manager left on
// the bench in a lineup they were actually allowed to set.
//
// Slots: QB, RB, RB, WR, WR, TE, FLEX x3 (RB/WR/TE), SUPER_FLEX (QB/RB/WR/TE)
//
// Eligibility here is laminar ({QB} and {RB},{WR},{TE} nest inside FLEX, which
// nests inside SUPER_FLEX), so filling the most restrictive slots first and
// taking the highest scorer available at each step is provably optimal — no
// search needed.

export interface LineupPlayer {
  playerId: string;
  name: string;
  position: string;
  points: number;
}

export const FLEX_ELIGIBLE = ["RB", "WR", "TE"];
export const SUPER_FLEX_ELIGIBLE = ["QB", "RB", "WR", "TE"];

/** Slot fill order: singletons, then FLEX, then SUPER_FLEX (most → least restrictive). */
const SLOT_ORDER: { slot: string; eligible: string[] }[] = [
  { slot: "QB", eligible: ["QB"] },
  { slot: "RB", eligible: ["RB"] },
  { slot: "RB", eligible: ["RB"] },
  { slot: "WR", eligible: ["WR"] },
  { slot: "WR", eligible: ["WR"] },
  { slot: "TE", eligible: ["TE"] },
  { slot: "FLEX", eligible: FLEX_ELIGIBLE },
  { slot: "FLEX", eligible: FLEX_ELIGIBLE },
  { slot: "FLEX", eligible: FLEX_ELIGIBLE },
  { slot: "SUPER_FLEX", eligible: SUPER_FLEX_ELIGIBLE },
];

export interface OptimalLineup {
  total: number;
  starters: (LineupPlayer & { slot: string })[];
  /** Roster players the optimal lineup left out. */
  benched: LineupPlayer[];
}

/** Highest-scoring legal lineup from a pool of rostered players. */
export function optimalLineup(pool: LineupPlayer[]): OptimalLineup {
  const remaining = [...pool].sort((a, b) => b.points - a.points || a.playerId.localeCompare(b.playerId));
  const starters: (LineupPlayer & { slot: string })[] = [];
  for (const { slot, eligible } of SLOT_ORDER) {
    const i = remaining.findIndex((p) => eligible.includes(p.position.toUpperCase()));
    if (i === -1) continue; // roster can't fill this slot — leave it empty
    const [p] = remaining.splice(i, 1);
    starters.push({ ...p, slot });
  }
  return {
    total: round2(starters.reduce((a, p) => a + p.points, 0)),
    starters,
    benched: remaining,
  };
}

export interface MissedStart {
  benched: LineupPlayer;
  /** The started player this would have displaced, or null for an empty slot
   *  (an unset lineup, or a slot the manager simply left blank). */
  wouldHaveReplaced: LineupPlayer | null;
  gain: number;
}

export interface LineupRegret {
  actual: number;
  optimal: number;
  /** optimal - actual; 0 when the manager set the best legal lineup. */
  regret: number;
  /** Bench players who should have started, worst omission first. */
  missed: MissedStart[];
}

/**
 * Compare the lineup a manager actually started against the best legal one.
 * `started` must be the real starters; `pool` is every rostered player that week.
 */
export function lineupRegret(started: LineupPlayer[], pool: LineupPlayer[]): LineupRegret {
  const actual = round2(started.reduce((a, p) => a + p.points, 0));
  const best = optimalLineup(pool);
  const startedIds = new Set(started.map((p) => p.playerId));

  // Pair each player the optimal lineup added against the one it dropped, by slot
  // value order, so "you should have started X over Y" reads sensibly.
  const added = best.starters.filter((p) => !startedIds.has(p.playerId)).sort((a, b) => b.points - a.points);
  const bestIds = new Set(best.starters.map((p) => p.playerId));
  const dropped = started.filter((p) => !bestIds.has(p.playerId)).sort((a, b) => b.points - a.points);

  const missed: MissedStart[] = [];
  for (let i = 0; i < added.length; i++) {
    // Past the end of `dropped`, the optimal lineup is filling a slot the
    // manager left empty rather than displacing anyone.
    const replaced = dropped[i] ?? null;
    const gain = round2(added[i].points - (replaced?.points ?? 0));
    if (gain > 0) missed.push({ benched: added[i], wouldHaveReplaced: replaced, gain });
  }
  missed.sort((a, b) => b.gain - a.gain);
  return { actual, optimal: best.total, regret: round2(best.total - actual), missed };
}

function round2(n: number) { return Math.round(n * 100) / 100; }
