// Shared final-bundle assembly for both live Sleeper data and offline fixtures.
// Data acquisition belongs in the callers; every deterministic season shape
// and the final browser payload shape belongs here so preview and production
// builds cannot drift.

import { computeWeeklyResults, computeStandings } from "../core/standings.js";
import { powerAt, toTeamWeeks } from "../core/powerAtWeek.js";
import { computeRecaps, WeekRecap } from "../core/recap.js";
import { loadSeasonRecaps } from "../core/recapStore.js";
import { MatchRow } from "../core/history.js";
import { round } from "../core/stats.js";

export interface BundleTeam {
  rosterId: number;
  ownerId: string;
  handle: string;
  teamName: string;
  avatar: string | null;
}

/** Add publishable article fields while keeping generation metadata private. */
export function attachArticles(
  season: string,
  recaps: WeekRecap[],
  root = process.cwd(),
) {
  const byWeek = new Map(loadSeasonRecaps(season, root).map((r) => [r.week, r.recap]));
  return recaps.map((recap) => {
    const article = byWeek.get(recap.week);
    return article
      ? {
          ...recap,
          article: {
            title: article.title,
            body: article.body,
            forTheRecord: article.for_the_record.map((item) => item.text),
          },
        }
      : recap;
  });
}

export function standingsShape(
  rowsByWeek: Record<string, MatchRow[]>,
  teams: BundleTeam[],
  movesByRoster?: Map<number, number>,
) {
  const computed = computeStandings(computeWeeklyResults(toTeamWeeks(rowsByWeek)));
  const byRoster = new Map(teams.map((team) => [team.rosterId, team]));

  // Preseason: include every current team even though the standings engine has
  // no scored rows to aggregate yet.
  const source = computed.length
    ? computed
    : [...teams].sort((a, b) => a.rosterId - b.rosterId).map((team) => ({
        rosterId: team.rosterId,
        wins: 0,
        losses: 0,
        winPct: 0,
        h2hWins: 0,
        h2hLosses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        high: 0,
        low: 0,
        avgPF: 0,
        stdev: 0,
        topFinishes: 0,
        ovw: 0,
        streakLabel: "W0",
      }));

  return source.map((standing, index) => {
    const team = byRoster.get(standing.rosterId)!;
    return {
      rank: index + 1,
      rosterId: standing.rosterId,
      handle: team.handle,
      teamName: team.teamName,
      avatar: team.avatar,
      wins: standing.wins,
      losses: standing.losses,
      winPct: round(standing.winPct, 3),
      h2hWins: standing.h2hWins,
      h2hLosses: standing.h2hLosses,
      pf: round(standing.pointsFor, 2),
      pa: round(standing.pointsAgainst, 2),
      maxPF: round(standing.high, 2),
      minPF: round(standing.low, 2),
      avgPF: round(standing.avgPF, 2),
      stdev: round(standing.stdev, 2),
      topFinishes: standing.topFinishes,
      ovw: standing.ovw,
      streak: standing.streakLabel,
      moves: movesByRoster ? (movesByRoster.get(standing.rosterId) ?? 0) : null,
    };
  });
}

export function powerShape(
  rowsByWeek: Record<string, MatchRow[]>,
  teams: BundleTeam[],
  rosterScores: Map<number, number>,
) {
  const maxWeek = Math.max(0, ...toTeamWeeks(rowsByWeek).map((row) => row.week));
  const byRoster = new Map(teams.map((team) => [team.rosterId, team]));
  const rosterIds = teams.map((team) => team.rosterId);
  const rankAt = (week: number) => powerAt(rowsByWeek, rosterIds, rosterScores, week).power;
  const previous = maxWeek > 1
    ? new Map(rankAt(maxWeek - 1).map((ranking) => [ranking.rosterId, ranking.rank]))
    : new Map<number, number>();

  return rankAt(maxWeek).map((ranking) => {
    const previousRank = previous.get(ranking.rosterId) ?? null;
    const team = byRoster.get(ranking.rosterId)!;
    return {
      rosterId: ranking.rosterId,
      handle: team.handle,
      teamName: team.teamName,
      avatar: team.avatar,
      rank: ranking.rank,
      prevRank: previousRank,
      trend: previousRank == null ? null : previousRank - ranking.rank,
      score: round(ranking.score, 2),
    };
  });
}

export function weeklyMatrix(rowsByWeek: Record<string, MatchRow[]>, teams: BundleTeam[]) {
  const maxWeek = Math.max(0, ...Object.keys(rowsByWeek).map(Number));
  return teams.map((team) => {
    const scores = new Array(maxWeek).fill(0);
    for (const [week, rows] of Object.entries(rowsByWeek)) {
      const row = rows.find((candidate) => candidate.r === team.rosterId);
      if (row) scores[Number(week) - 1] = row.p;
    }
    return { rosterId: team.rosterId, handle: team.handle, teamName: team.teamName, scores };
  });
}

export interface SeasonBundleInput {
  season: string;
  complete: boolean;
  rowsByWeek: Record<string, MatchRow[]>;
  teams: BundleTeam[];
  rosterScores: Map<number, number>;
  movesByRoster?: Map<number, number>;
  root?: string;
}

export function buildSeasonBundle(input: SeasonBundleInput) {
  return {
    complete: input.complete,
    standings: standingsShape(input.rowsByWeek, input.teams, input.movesByRoster),
    power: powerShape(input.rowsByWeek, input.teams, input.rosterScores),
    weeklyScores: weeklyMatrix(input.rowsByWeek, input.teams),
    recaps: attachArticles(
      input.season,
      computeRecaps(input.season, input.rowsByWeek),
      input.root,
    ),
  };
}

export function scheduleWeeksFromRows(rowsByWeek: Record<string, { r: number; m: number }[]>) {
  return Object.entries(rowsByWeek)
    .map(([week, rows]) => {
      const byMatchup = new Map<number, number[]>();
      for (const row of rows) {
        if (!byMatchup.has(row.m)) byMatchup.set(row.m, []);
        byMatchup.get(row.m)!.push(row.r);
      }
      return {
        week: Number(week),
        games: [...byMatchup.values()]
          .filter((pair) => pair.length === 2)
          .map((pair) => ({ a: pair[0], b: pair[1] })),
      };
    })
    .sort((a, b) => a.week - b.week);
}

export interface BundleDocumentInput {
  generatedAt: string | null;
  league: unknown;
  state: unknown;
  teams: BundleTeam[];
  players?: Record<string, unknown>;
  seasons: Record<string, unknown>;
  transactions: unknown[];
  history: unknown;
  schedule: unknown;
  rulebook: unknown;
  meta: unknown;
}

/** The sole definition of the JSON object consumed by web/app.js. */
export function buildBundleDocument(input: BundleDocumentInput) {
  return {
    generatedAt: input.generatedAt,
    league: input.league,
    state: input.state,
    teams: input.teams,
    players: input.players ?? {},
    seasons: input.seasons,
    transactions: input.transactions,
    history: input.history,
    schedule: input.schedule,
    rulebook: input.rulebook,
    meta: input.meta,
  };
}
