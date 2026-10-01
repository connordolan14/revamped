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
import { PlayerHistory, StintEnd, Usage } from "../core/rosterHistory.js";
import { loadPowerSnapshots } from "./powerHistory.js";

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
  faabLeftByRoster?: Map<number, number>,
  maxPFByRoster?: Map<number, number>,
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
      // Max PF = Sleeper's potential points (optimal lineup every week), not
      // the single-week high — that's `highPF`.
      maxPF: maxPFByRoster?.has(standing.rosterId) ? round(maxPFByRoster.get(standing.rosterId)!, 2) : null,
      highPF: round(standing.high, 2),
      minPF: round(standing.low, 2),
      avgPF: round(standing.avgPF, 2),
      stdev: round(standing.stdev, 2),
      topFinishes: standing.topFinishes,
      ovw: standing.ovw,
      streak: standing.streakLabel,
      moves: movesByRoster ? (movesByRoster.get(standing.rosterId) ?? 0) : null,
      faabLeft: faabLeftByRoster ? (faabLeftByRoster.get(standing.rosterId) ?? null) : null,
    };
  });
}

export function powerShape(
  rowsByWeek: Record<string, MatchRow[]>,
  teams: BundleTeam[],
  rosterScores: Map<number, number>,
  throughWeek?: number,
) {
  const maxWeek = throughWeek ?? Math.max(0, ...toTeamWeeks(rowsByWeek).map((row) => row.week));
  const byRoster = new Map(teams.map((team) => [team.rosterId, team]));
  const rosterIds = teams.map((team) => team.rosterId);
  const rankAt = (week: number) => powerAt(rowsByWeek, rosterIds, rosterScores, week).power;
  // Week 1's "previous" is rankAt(0): every real-game factor ties (no games
  // played yet), so it's exactly the preseason roster-strength-only ranking
  // — a legitimate baseline for Week 1's trend, not a placeholder.
  const previous = maxWeek > 0
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
  faabLeftByRoster?: Map<number, number>;
  maxPFByRoster?: Map<number, number>;
  root?: string;
}

export function buildSeasonBundle(input: SeasonBundleInput) {
  return {
    complete: input.complete,
    standings: standingsShape(input.rowsByWeek, input.teams, input.movesByRoster, input.faabLeftByRoster, input.maxPFByRoster),
    power: powerShape(input.rowsByWeek, input.teams, input.rosterScores),
    weeklyScores: weeklyMatrix(input.rowsByWeek, input.teams),
    powerHistory: loadPowerSnapshots(input.season, input.root),
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
  rosterHistory?: unknown;
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
    rosterHistory: input.rosterHistory ?? null,
  };
}

/** Browser shape for the all-time rosters page: franchise → player careers. */
export function rosterHistoryShape(history: Map<number, PlayerHistory[]>, regularSeasonWeeks: Record<string, number>) {
  const endShape = (e: StintEnd | null) => e && {
    ts: e.ts,
    season: e.season,
    how: e.how,
    ...(e.faab != null ? { faab: e.faab } : {}),
    ...(e.otherRosterId != null ? { team: e.otherRosterId } : {}),
    ...(e.draftLabel ? { draft: e.draftLabel } : {}),
    ...(e.viaCommissioner ? { commish: true } : {}),
  };
  const usageShape = (u: Usage) => ({
    weeks: u.weeks,
    games: u.games,
    starts: u.starts,
    pts: round(u.points, 2),
    startPts: round(u.starterPoints, 2),
  });
  const byRoster: Record<number, unknown[]> = {};
  for (const [rosterId, rows] of history) {
    byRoster[rosterId] = rows.map((row) => ({
      id: row.playerId,
      ...usageShape(row),
      // Postseason only when there is one — most players never get there.
      ...(row.post.weeks ? { post: { ...usageShape(row.post), seasons: row.postSeasons } } : {}),
      current: row.current,
      stints: row.stints.map((stint) => ({
        from: endShape(stint.from),
        to: endShape(stint.to),
        ...usageShape(stint),
        ...(stint.post.weeks ? { post: usageShape(stint.post) } : {}),
      })),
    }));
  }
  return { regularSeasonWeeks, byRoster };
}
