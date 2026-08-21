// Portable domain types shared by the Supabase edge functions (Deno) and the
// local validation scripts (Node). Keep this file dependency-free.

export interface TeamWeek {
  rosterId: number;
  week: number;
  points: number;
  /** Sleeper matchup_id — teams that share it played head-to-head that week. */
  matchupId: number | null;
}

export interface WeeklyResult {
  rosterId: number;
  week: number;
  points: number;
  /** Head-to-head outcome: 1 win, 0.5 tie, 0 loss. null if no opponent (bye). */
  h2h: number | null;
  /** 0.5 if the team finished in the top-6 scorers that week, else 0. */
  topBonus: number;
  /** Total wins credited this week (h2h + topBonus), 0 / 0.5 / 1 / 1.5. */
  weekWins: number;
  /** Losses credited this week (1.5 - weekWins) when a matchup exists. */
  weekLosses: number;
  /** Opponent's points this week (null if no H2H opponent). */
  opponentPoints: number | null;
  /** Count of the other teams this team outscored this week (0..N-1). */
  beatenCount: number;
  /** True if this team was a top-6 scorer that week. */
  isTop: boolean;
}

export interface TeamStanding {
  rosterId: number;
  wins: number; // half-win total
  losses: number;
  ties: number;
  h2hWins: number;
  h2hLosses: number;
  h2hTies: number;
  pointsFor: number;
  pointsAgainst: number;
  topFinishes: number; // number of top-6 weeks
  weeksPlayed: number;
  winPct: number;
  streak: number; // signed: + for win streak, - for loss streak (by weekWins>=1)
  streakLabel: string; // e.g. "W3", "L2"
  avgPF: number;
  high: number;
  low: number;
  stdev: number; // population stdev of weekly points
  ovw: number; // overall wins = sum of beatenCount across weeks
}

export interface PowerFactorSet {
  wins: number;
  streak: number;
  rosterScore: number; // higher = stronger roster (e.g. FantasyCalc value sum)
  ovw: number;
  consistency: number; // higher = more consistent (we feed -stdev)
  avgPF: number;
}

export interface PowerRanking {
  rosterId: number;
  score: number; // average of factor ranks (lower = better)
  rank: number;
  prevRank: number | null;
  trend: number | null; // prevRank - rank (positive = moved up)
  factorRanks: Record<keyof PowerFactorSet, number>;
  factors: PowerFactorSet;
}
