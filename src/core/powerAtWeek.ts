// Power ranking as of a given week. Shared by the bundle builder (which needs
// "this week" and "last week" to compute trend) and the weekly recap context
// (which needs before/after snapshots). Single source so the two can't drift.

import { MatchRow } from "./history.js";
import { TeamWeek, TeamStanding, PowerRanking } from "./types.js";
import { computeWeeklyResults, computeStandings } from "./standings.js";
import { computePowerRankings, TeamFactors } from "./power.js";

/** Flatten { "1": [{r,m,p}, ...], ... } into the engine's TeamWeek rows. */
export function toTeamWeeks(rowsByWeek: Record<string, MatchRow[]>): TeamWeek[] {
  const out: TeamWeek[] = [];
  for (const [wk, rows] of Object.entries(rowsByWeek)) {
    for (const r of rows) out.push({ rosterId: r.r, week: Number(wk), points: r.p, matchupId: r.m });
  }
  return out;
}

/**
 * Season Scoring Consistency: a conservative 3-sigma scoring floor measured
 * against a league benchmark of 75% of league PPG.
 *   (teamAvg - 3 * teamDev) / (0.75 * leaguePPG)
 * Needs two games for a standard deviation, so it returns -99 before then
 * (sinking un-played teams to the bottom of the factor), and 1 when a team's
 * weekly deviation is exactly 0.
 */
export function consistencyOf(s: TeamStanding | undefined, leaguePPG: number): number {
  if (!s || s.weeksPlayed < 2 || !leaguePPG) return -99;
  if (s.stdev === 0) return 1;
  return (s.avgPF - 3 * s.stdev) / (0.75 * leaguePPG);
}

export function leaguePPGOf(standings: TeamStanding[]): number {
  const pts = standings.reduce((a, s) => a + s.pointsFor, 0);
  const gp = standings.reduce((a, s) => a + s.weeksPlayed, 0);
  return gp ? pts / gp : 0;
}

export interface PowerAtWeek {
  power: PowerRanking[];
  standings: TeamStanding[];
}

/**
 * Standings + power ranking using only weeks <= `upto`.
 * `rosterIds` fixes the team set so teams with no rows yet still get ranked.
 */
export function powerAt(
  rowsByWeek: Record<string, MatchRow[]>,
  rosterIds: number[],
  rosterScores: Map<number, number>,
  upto: number,
): PowerAtWeek {
  const weeks = toTeamWeeks(rowsByWeek).filter((w) => w.week <= upto);
  const standings = computeStandings(computeWeeklyResults(weeks));
  const sByR = new Map(standings.map((s) => [s.rosterId, s]));
  const ppg = leaguePPGOf(standings);
  const tf: TeamFactors[] = rosterIds.map((rid) => {
    const s = sByR.get(rid);
    return {
      rosterId: rid,
      factors: {
        wins: s?.h2hWins ?? 0,
        streak: s?.streak ?? 0,
        rosterScore: rosterScores.get(rid) ?? 0,
        ovw: s?.ovw ?? 0,
        consistency: consistencyOf(s, ppg),
        avgPF: s?.avgPF ?? 0,
      },
    };
  });
  return { power: computePowerRankings(tf), standings };
}
