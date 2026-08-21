// Half-win standings engine. Reproduces the league's custom scoring:
//   - Head-to-head result each week (1 / 0.5 / 0)
//   - PLUS a 0.5 "bonus win" for every team that finishes in the top half of
//     scorers that week (top 6 of 12).
// So a team's weekly result is 0, 0.5, 1, or 1.5 wins; losses = 1.5 - wins.

import { TeamWeek, WeeklyResult, TeamStanding } from "./types.js";
import { mean, stdevSample } from "./stats.js";

export interface StandingsOptions {
  /** How many teams get the weekly bonus. Defaults to floor(teams/2) = top 6. */
  topN?: number;
}

/** Compute per-team, per-week results from raw weekly points + pairings. */
export function computeWeeklyResults(
  weeks: TeamWeek[],
  opts: StandingsOptions = {},
): WeeklyResult[] {
  const byWeek = new Map<number, TeamWeek[]>();
  for (const w of weeks) {
    if (!byWeek.has(w.week)) byWeek.set(w.week, []);
    byWeek.get(w.week)!.push(w);
  }

  const out: WeeklyResult[] = [];
  for (const [week, teams] of byWeek) {
    const n = teams.length;
    const topN = opts.topN ?? Math.floor(n / 2);
    // Rank by points desc to find the top-half scorers.
    const sorted = [...teams].sort((a, b) => b.points - a.points);
    const topIds = new Set(sorted.slice(0, topN).map((t) => t.rosterId));

    // Pair up head-to-head by matchupId.
    const byMatch = new Map<number, TeamWeek[]>();
    for (const t of teams) {
      if (t.matchupId == null) continue;
      if (!byMatch.has(t.matchupId)) byMatch.set(t.matchupId, []);
      byMatch.get(t.matchupId)!.push(t);
    }
    const h2hByRoster = new Map<number, number | null>();
    const paByRoster = new Map<number, number>();
    for (const t of teams) h2hByRoster.set(t.rosterId, null);
    for (const pair of byMatch.values()) {
      if (pair.length === 2) {
        const [a, b] = pair;
        paByRoster.set(a.rosterId, b.points);
        paByRoster.set(b.rosterId, a.points);
        if (a.points > b.points) {
          h2hByRoster.set(a.rosterId, 1);
          h2hByRoster.set(b.rosterId, 0);
        } else if (a.points < b.points) {
          h2hByRoster.set(a.rosterId, 0);
          h2hByRoster.set(b.rosterId, 1);
        } else {
          h2hByRoster.set(a.rosterId, 0.5);
          h2hByRoster.set(b.rosterId, 0.5);
        }
      }
    }

    for (const t of teams) {
      const beatenCount = teams.filter(
        (o) => o.rosterId !== t.rosterId && o.points < t.points,
      ).length;
      const isTop = topIds.has(t.rosterId);
      const topBonus = isTop ? 0.5 : 0;
      const h2h = h2hByRoster.get(t.rosterId) ?? null;
      const weekWins = (h2h ?? 0) + topBonus;
      const hasGame = h2h != null;
      const weekLosses = hasGame ? 1.5 - weekWins : 0;
      out.push({
        rosterId: t.rosterId,
        week,
        points: t.points,
        h2h,
        opponentPoints: paByRoster.get(t.rosterId) ?? null,
        topBonus,
        weekWins,
        weekLosses,
        beatenCount,
        isTop,
      });
    }
  }
  return out.sort((a, b) => a.week - b.week || a.rosterId - b.rosterId);
}

/** Aggregate weekly results into full season standings. */
export function computeStandings(results: WeeklyResult[]): TeamStanding[] {
  const byRoster = new Map<number, WeeklyResult[]>();
  for (const r of results) {
    if (!byRoster.has(r.rosterId)) byRoster.set(r.rosterId, []);
    byRoster.get(r.rosterId)!.push(r);
  }

  const standings: TeamStanding[] = [];
  for (const [rosterId, rs] of byRoster) {
    const ordered = [...rs].sort((a, b) => a.week - b.week);
    const points = ordered.map((r) => r.points);
    let wins = 0, losses = 0, h2hW = 0, h2hL = 0, h2hT = 0, top = 0, ovw = 0;
    let pf = 0, pa = 0;
    for (const r of ordered) {
      wins += r.weekWins;
      losses += r.weekLosses;
      ovw += r.beatenCount;
      pf += r.points;
      if (r.opponentPoints != null) pa += r.opponentPoints;
      if (r.isTop) top += 1;
      if (r.h2h === 1) h2hW += 1;
      else if (r.h2h === 0) h2hL += 1;
      else if (r.h2h === 0.5) h2hT += 1;
    }
    // Points against: reconstruct from pairings handled at week level is not
    // stored here; callers that need PA should use computeWeeklyResults' pair
    // data. We approximate PA as 0 when unavailable (filled by the sync layer).

    // Streak: a "winning" week is weekWins >= 1 (beat opponent or split+top6).
    let streak = 0;
    for (let i = ordered.length - 1; i >= 0; i--) {
      const win = ordered[i].weekWins >= 1;
      if (i === ordered.length - 1) streak = win ? 1 : -1;
      else if (win && streak > 0) streak += 1;
      else if (!win && streak < 0) streak -= 1;
      else break;
    }
    const weeksPlayed = ordered.length;
    const avgPF = mean(points);
    standings.push({
      rosterId,
      wins,
      losses,
      ties: 0,
      h2hWins: h2hW,
      h2hLosses: h2hL,
      h2hTies: h2hT,
      pointsFor: pf,
      pointsAgainst: pa,
      topFinishes: top,
      weeksPlayed,
      winPct: weeksPlayed ? wins / (weeksPlayed * 1.5) : 0,
      streak,
      streakLabel: (streak >= 0 ? "W" : "L") + Math.abs(streak),
      avgPF,
      high: points.length ? Math.max(...points) : 0,
      low: points.length ? Math.min(...points) : 0,
      stdev: stdevSample(points), // sample stdev (N-1) matches the league sheet's DEV
      ovw,
    });
  }
  // Sort by half-win total, then win%, then PF.
  standings.sort(
    (a, b) => b.wins - a.wins || b.winPct - a.winPct || b.pointsFor - a.pointsFor,
  );
  return standings;
}
