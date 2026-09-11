// Stage 1 of the weekly recap pipeline: turn league data into a normalized,
// self-describing context for a writer.
//
// This module is pure and deterministic — no network, no clock, no randomness —
// so it can be golden-tested. It reuses the site's stats engine rather than
// recalculating standings, and it never emits Sleeper roster IDs as the primary
// way to refer to a team.
//
// It also emits `facts`: candidate story beats with stable `fact_id` values, so
// downstream stages can say which facts a sentence rests on. Fact IDs are
// metadata and must never appear in published prose.

import { MatchRow, MatchupEntry } from "./history.js";
import { TeamStanding } from "./types.js";
import { computeWeeklyResults, computeStandings } from "./standings.js";
import { powerAt, toTeamWeeks } from "./powerAtWeek.js";
import { LineupPlayer, lineupRegret } from "./lineup.js";
import { windowForWeek, windowForSeasonWeek } from "./recapWindow.js";

/* ---------------------------------- input --------------------------------- */

export interface RecapTeamInput { rosterId: number; teamName: string; handle: string; }

export interface RecapPlayerWeekInput {
  rosterId: number;
  started: LineupPlayer[];
  /** Every rostered player that week, starters included. */
  rostered: LineupPlayer[];
}

export interface RecapTransactionInput {
  id: string;
  type: string;
  week: number;
  created: number;
  rosterIds: number[];
  adds: { playerId: string | null; player: string; rosterId: number }[];
  drops: { playerId: string | null; player: string; rosterId: number }[];
  faab: number | null;
}

export interface RecapContextInput {
  season: string;
  week: number;
  teams: RecapTeamInput[];
  /** Every scored week of this season up to and including `week`. */
  rowsByWeek: Record<string, MatchRow[]>;
  rosterScores: Map<number, number>;
  playoffTeams: number;
  byeTeams: number;
  regularSeasonWeeks: number;
  playerWeeks?: RecapPlayerWeekInput[];
  transactions?: RecapTransactionInput[];
  /** Every completed meeting between league teams BEFORE this week. */
  priorMeetings?: MatchupEntry[];
  /** Highest single-week score in league history before this week, if known. */
  allTimeHighWeek?: { rosterId: number; points: number; season: string; week: number } | null;
  /** Publication date + research window. Derived from the season calendar when omitted. */
  window?: { publicationDate: string; contextWindow: { start: string; end: string } };
  /** ISO date the NFL season kicked off, used to derive the window. */
  seasonStartDate?: string;
}

/* --------------------------------- output --------------------------------- */

/**
 * A deterministic story candidate. Shape follows data-contract.md.
 *
 * `fact_id` is `{season}-w{NN}-{type}-{detail}`, e.g.
 * `2025-w08-bench-chrisrenna17-tua`. The detail slug is built from a team's
 * username rather than its team name, because usernames are stable across a
 * season and team names are not. IDs are metadata and never appear in prose.
 */
export interface RecapFact {
  fact_id: string;
  type: string;
  /** 0-10 editorial interest. Higher = more likely to carry a paragraph. */
  importance_score: number;
  /** Plain factual sentence. Raw material, not publishable prose. */
  summary: string;
  /** Teams the candidate concerns. */
  teams: number[];
  support: Record<string, unknown>;
}

export interface RecapMatchupSide {
  rosterId: number; teamName: string; handle: string;
  points: number; scoreRank: number; madeTopSix: boolean;
  allPlayWins: number; allPlayLosses: number;
  h2hRecordBefore: string | null; h2hRecordAfter: string;
  standingsPositionBefore: number | null; standingsPositionAfter: number;
  powerRankBefore: number | null; powerRankAfter: number; powerRankDelta: number | null;
  streakBefore: string | null; streakAfter: string;
}

export interface RecapMatchup {
  matchupId: number;
  a: RecapMatchupSide;
  b: RecapMatchupSide;
  winnerRosterId: number | null;
  margin: number;
  kind: "blowout" | "close" | "normal" | "tie";
}

export interface RecapStandingRow {
  rosterId: number; teamName: string; handle: string;
  rank: number; wins: number; losses: number; record: string;
  /** Head-to-head only, excluding the top-six bonus. */
  h2hWins: number; h2hLosses: number; h2hRecord: string;
  pointsFor: number; streakLabel: string;
}

export interface RecapPowerRow {
  rosterId: number; teamName: string; handle: string; rank: number; score: number;
}

export interface RecapContext {
  season: string;
  week: number;
  /** Tuesday the recap publishes, and the Tuesday..Monday research window. */
  publicationDate: string;
  contextWindow: { start: string; end: string };
  league: {
    teamCount: number; playoffTeams: number; byeTeams: number;
    regularSeasonWeeks: number; weeksRemaining: number; isFinalWeek: boolean;
  };
  teams: (RecapTeamInput & { slug: string })[];
  matchups: RecapMatchup[];
  scoring: {
    ranked: { rosterId: number; teamName: string; points: number; rank: number }[];
    high: { rosterId: number; teamName: string; points: number };
    low: { rosterId: number; teamName: string; points: number };
    topSix: number[];
  };
  allPlay: { rosterId: number; teamName: string; beaten: number; record: string }[];
  standings: { before: RecapStandingRow[]; after: RecapStandingRow[]; moves: { rosterId: number; teamName: string; from: number; to: number; delta: number }[] };
  power: { before: RecapPowerRow[]; after: RecapPowerRow[]; moves: { rosterId: number; teamName: string; from: number; to: number; delta: number }[] };
  playoffPicture: {
    inside: number[]; outside: number[]; byes: number[];
    enteredField: number[]; leftField: number[];
    lastPlayoffRecord: string | null;
  };
  streaks: { rosterId: number; teamName: string; streak: number; label: string }[];
  players: {
    topStarters: { rosterId: number; teamName: string; name: string; position: string; points: number }[];
    /** Every team's single highest-scoring benched player, best first. */
    highestBench: {
      rosterId: number; teamName: string; playerId: string; name: string; position: string; points: number;
      highestBenchScoreTeam: boolean; highestBenchScoreLeague: boolean;
      legalSwapAvailable: boolean; bestLegalReplacementFor: string | null;
      netPointsIfSwapped: number; changesH2hResult: boolean; changesTopSixResult: boolean;
    }[];
    benchBlunders: { rosterId: number; teamName: string; name: string; position: string; points: number; startedInstead: string | null; startedPoints: number | null; gain: number }[];
    lineupRegret: { rosterId: number; teamName: string; actual: number; optimal: number; regret: number; wouldHaveFlipped: boolean }[];
  };
  transactions: (RecapTransactionInput & { teamNames: string[] })[];
  h2h: { matchupId: number; priorMeetings: number; series: string; lastMeeting: { season: string; week: number; winnerRosterId: number | null; score: string } | null }[];
  facts: RecapFact[];
}

/* --------------------------------- helpers -------------------------------- */

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Stable, collision-resistant slug from a Sleeper handle. */
export const teamSlug = (handle: string) => handle.toLowerCase().replace(/[^a-z0-9]/g, "") || "team";
/** Stable slug from a player's name — last token, letters only. */
export const playerSlug = (name: string) => {
  const parts = name.trim().split(/\s+/).filter((p) => !/^(jr|sr|ii|iii|iv|v)\.?$/i.test(p));
  return (parts[parts.length - 1] || name).toLowerCase().replace(/[^a-z]/g, "") || "player";
};
const recordOf = (s: TeamStanding | undefined) => s ? `${s.wins}-${s.losses}` : "0-0";

function standingRows(standings: TeamStanding[], byR: Map<number, RecapTeamInput>): RecapStandingRow[] {
  return standings.map((s, i) => {
    const t = byR.get(s.rosterId);
    return {
      rosterId: s.rosterId, teamName: t?.teamName ?? `Roster ${s.rosterId}`, handle: t?.handle ?? "",
      rank: i + 1, wins: s.wins, losses: s.losses, record: recordOf(s),
      h2hWins: s.h2hWins, h2hLosses: s.h2hLosses, h2hRecord: `${s.h2hWins}-${s.h2hLosses}`,
      pointsFor: r2(s.pointsFor), streakLabel: s.streakLabel,
    };
  });
}

function rankDeltas<T extends { rosterId: number; rank: number }>(
  before: T[], after: T[], byR: Map<number, RecapTeamInput>,
) {
  const b = new Map(before.map((x) => [x.rosterId, x.rank]));
  return after
    .map((x) => {
      const from = b.get(x.rosterId);
      if (from == null) return null;
      return {
        rosterId: x.rosterId,
        teamName: byR.get(x.rosterId)?.teamName ?? `Roster ${x.rosterId}`,
        from, to: x.rank, delta: from - x.rank,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null && x.delta !== 0)
    .sort((p, q) => Math.abs(q.delta) - Math.abs(p.delta));
}

/* --------------------------------- builder -------------------------------- */

export function buildRecapContext(input: RecapContextInput): RecapContext {
  const { season, week, teams, rowsByWeek, rosterScores } = input;
  const byR = new Map(teams.map((t) => [t.rosterId, t]));
  const rosterIds = teams.map((t) => t.rosterId);
  const name = (rid: number) => byR.get(rid)?.teamName ?? `Roster ${rid}`;
  const slugOf = (rid: number) => teamSlug(byR.get(rid)?.handle ?? String(rid));

  const rows = rowsByWeek[String(week)] ?? [];
  if (!rows.length) throw new Error(`No scored rows for ${season} week ${week}`);

  /* ----- weekly scoring, top-six placement, all-play ----- */
  const weekResults = computeWeeklyResults(
    toTeamWeeks({ [String(week)]: rows }),
  );
  const resByR = new Map(weekResults.map((r) => [r.rosterId, r]));
  const ranked = [...rows]
    .sort((a, b) => b.p - a.p)
    .map((r, i) => ({ rosterId: r.r, teamName: name(r.r), points: r2(r.p), rank: i + 1 }));
  const topSixCount = Math.floor(rows.length / 2);
  const topSix = ranked.slice(0, topSixCount).map((r) => r.rosterId);

  const allPlay = ranked.map((r) => {
    const beaten = resByR.get(r.rosterId)?.beatenCount ?? 0;
    return { rosterId: r.rosterId, teamName: r.teamName, beaten, record: `${beaten}-${rows.length - 1 - beaten}` };
  });

  /* ----- standings & power, before vs after -----
     Computed before the matchups so each side can carry its own before/after
     values. "Before" uses only weeks < N, so no future week can leak in. */
  const prevWeeks = Object.fromEntries(Object.entries(rowsByWeek).filter(([w]) => Number(w) < week));
  const stBeforeRaw = computeStandings(computeWeeklyResults(toTeamWeeks(prevWeeks)));
  const stAfterRaw = computeStandings(computeWeeklyResults(toTeamWeeks(
    Object.fromEntries(Object.entries(rowsByWeek).filter(([w]) => Number(w) <= week)),
  )));
  const standingsBefore = standingRows(stBeforeRaw, byR);
  const standingsAfter = standingRows(stAfterRaw, byR);
  const sBefore = new Map(standingsBefore.map((s) => [s.rosterId, s]));
  const sAfter = new Map(standingsAfter.map((s) => [s.rosterId, s]));

  const powBefore = week > 1 ? powerAt(rowsByWeek, rosterIds, rosterScores, week - 1).power : [];
  const powAfter = powerAt(rowsByWeek, rosterIds, rosterScores, week).power;
  const powRow = (p: { rosterId: number; rank: number; score: number }): RecapPowerRow => ({
    rosterId: p.rosterId, teamName: name(p.rosterId), handle: byR.get(p.rosterId)?.handle ?? "",
    rank: p.rank, score: r2(p.score),
  });
  const pBefore = new Map(powBefore.map((p) => [p.rosterId, p.rank]));
  const pAfter = new Map(powAfter.map((p) => [p.rosterId, p.rank]));

  /* ----- matchups ----- */
  const byMatch = new Map<number, MatchRow[]>();
  for (const r of rows) { if (!byMatch.has(r.m)) byMatch.set(r.m, []); byMatch.get(r.m)!.push(r); }
  const rankByR = new Map(ranked.map((r) => [r.rosterId, r.rank]));
  const side = (r: MatchRow): RecapMatchupSide => {
    const before = sBefore.get(r.r), after = sAfter.get(r.r)!;
    const pb = pBefore.get(r.r) ?? null, pa = pAfter.get(r.r)!;
    const beaten = resByR.get(r.r)?.beatenCount ?? 0;
    return {
      rosterId: r.r, teamName: name(r.r), handle: byR.get(r.r)?.handle ?? "",
      points: r2(r.p), scoreRank: rankByR.get(r.r) ?? 0, madeTopSix: topSix.includes(r.r),
      allPlayWins: beaten, allPlayLosses: rows.length - 1 - beaten,
      h2hRecordBefore: before?.h2hRecord ?? null, h2hRecordAfter: after.h2hRecord,
      standingsPositionBefore: before?.rank ?? null, standingsPositionAfter: after.rank,
      powerRankBefore: pb, powerRankAfter: pa, powerRankDelta: pb == null ? null : pb - pa,
      streakBefore: before?.streakLabel ?? null, streakAfter: after.streakLabel,
    };
  };
  const matchups: RecapMatchup[] = [];
  for (const [mid, pair] of [...byMatch.entries()].sort((a, b) => a[0] - b[0])) {
    if (pair.length !== 2) continue;
    const [x, y] = pair[0].p >= pair[1].p ? [pair[0], pair[1]] : [pair[1], pair[0]];
    const margin = r2(x.p - y.p);
    matchups.push({
      matchupId: mid, a: side(x), b: side(y),
      winnerRosterId: x.p === y.p ? null : x.r,
      margin,
      kind: x.p === y.p ? "tie" : margin >= 40 ? "blowout" : margin <= 6 ? "close" : "normal",
    });
  }
  matchups.sort((a, b) => b.a.points - a.a.points);

  /* ----- playoff picture ----- */
  const fieldBefore = standingsBefore.slice(0, input.playoffTeams).map((s) => s.rosterId);
  const fieldAfter = standingsAfter.slice(0, input.playoffTeams).map((s) => s.rosterId);
  const playoffPicture = {
    inside: fieldAfter,
    outside: standingsAfter.slice(input.playoffTeams).map((s) => s.rosterId),
    byes: standingsAfter.slice(0, input.byeTeams).map((s) => s.rosterId),
    enteredField: fieldAfter.filter((r) => standingsBefore.length > 0 && !fieldBefore.includes(r)),
    leftField: fieldBefore.filter((r) => !fieldAfter.includes(r)),
    lastPlayoffRecord: standingsAfter[input.playoffTeams - 1]?.record ?? null,
  };

  /* ----- streaks ----- */
  const streaks = stAfterRaw
    .map((s) => ({ rosterId: s.rosterId, teamName: name(s.rosterId), streak: s.streak, label: s.streakLabel }))
    .sort((a, b) => Math.abs(b.streak) - Math.abs(a.streak));

  /* ----- players: top starters, bench blunders, lineup regret ----- */
  const topStarters: RecapContext["players"]["topStarters"] = [];
  const benchBlunders: RecapContext["players"]["benchBlunders"] = [];
  const regretRows: RecapContext["players"]["lineupRegret"] = [];
  const marginByR = new Map<number, number>();
  for (const m of matchups) {
    marginByR.set(m.a.rosterId, m.margin);
    marginByR.set(m.b.rosterId, -m.margin);
  }
  const highestBench: RecapContext["players"]["highestBench"] = [];
  for (const pw of input.playerWeeks ?? []) {
    const tn = name(pw.rosterId);
    for (const p of [...pw.started].sort((a, b) => b.points - a.points).slice(0, 2)) {
      topStarters.push({ rosterId: pw.rosterId, teamName: tn, name: p.name, position: p.position, points: r2(p.points) });
    }
    const lr = lineupRegret(pw.started, pw.rostered);
    const deficit = marginByR.get(pw.rosterId) ?? 0;
    regretRows.push({
      rosterId: pw.rosterId, teamName: tn, actual: lr.actual, optimal: lr.optimal, regret: lr.regret,
      // Did the points left on the bench exceed the margin they lost by?
      wouldHaveFlipped: deficit < 0 && lr.regret > Math.abs(deficit),
    });
    for (const m of lr.missed) {
      benchBlunders.push({
        rosterId: pw.rosterId, teamName: tn, name: m.benched.name, position: m.benched.position,
        points: r2(m.benched.points),
        startedInstead: m.wouldHaveReplaced?.name ?? null,
        startedPoints: m.wouldHaveReplaced ? r2(m.wouldHaveReplaced.points) : null,
        gain: m.gain,
      });
    }

    // Highest-scoring benched player, by raw points rather than swap value. A
    // big bench score is a story even when no legal swap existed.
    const startedIds = new Set(pw.started.map((p) => p.playerId));
    const bench = pw.rostered.filter((p) => !startedIds.has(p.playerId)).sort((a, b) => b.points - a.points);
    const top = bench[0];
    if (top && top.points > 0) {
      const swap = lr.missed.find((m) => m.benched.playerId === top.playerId);
      const net = swap ? swap.gain : 0;
      // Would starting him have flipped the head-to-head, or the top-six bonus?
      const flipsH2h = deficit < 0 && net > Math.abs(deficit);
      const projectedTopSix = [...rows]
        .map((row) => ({ rosterId: row.r, points: row.p + (row.r === pw.rosterId ? net : 0) }))
        .sort((a, b) => b.points - a.points)
        .slice(0, topSixCount)
        .some((row) => row.rosterId === pw.rosterId);
      const flipsTopSix = !topSix.includes(pw.rosterId) && net > 0 && projectedTopSix;
      highestBench.push({
        rosterId: pw.rosterId, teamName: tn, playerId: top.playerId, name: top.name,
        position: top.position, points: r2(top.points),
        highestBenchScoreTeam: true, highestBenchScoreLeague: false,
        legalSwapAvailable: swap != null,
        bestLegalReplacementFor: swap?.wouldHaveReplaced?.name ?? null,
        netPointsIfSwapped: net,
        changesH2hResult: flipsH2h, changesTopSixResult: flipsTopSix,
      });
    }
  }
  topStarters.sort((a, b) => b.points - a.points);
  benchBlunders.sort((a, b) => b.gain - a.gain);
  regretRows.sort((a, b) => b.regret - a.regret);
  highestBench.sort((a, b) => b.points - a.points);
  if (highestBench[0]) highestBench[0].highestBenchScoreLeague = true;

  /* ----- head-to-head history ----- */
  const h2h = matchups.map((m) => {
    const prior = (input.priorMeetings ?? []).filter(
      (g) => g.rosterId === m.a.rosterId && g.oppRosterId === m.b.rosterId,
    );
    let w = 0, l = 0, t = 0;
    for (const g of prior) { if (g.result === "W") w++; else if (g.result === "L") l++; else if (g.result === "T") t++; }
    const last = [...prior].sort((p, q) => q.season.localeCompare(p.season) || q.week - p.week)[0];
    const tail = t ? `-${t}` : "";
    const series = prior.length === 0
      ? "first meeting"
      : w === l
        ? `series even ${w}-${l}${tail}`
        : w > l
          ? `${m.a.teamName} leads ${w}-${l}${tail}`
          : `${m.b.teamName} leads ${l}-${w}${tail}`;
    return {
      matchupId: m.matchupId,
      priorMeetings: prior.length,
      series,
      lastMeeting: last
        ? { season: last.season, week: last.week, winnerRosterId: last.result === "W" ? last.rosterId : last.result === "L" ? last.oppRosterId : null, score: `${r2(last.points)} to ${r2(last.oppPoints ?? 0)}` }
        : null,
    };
  });

  /* ----- transactions ----- */
  const transactions = (input.transactions ?? [])
    .filter((t) => t.week === week)
    .map((t) => ({ ...t, teamNames: t.rosterIds.map(name) }));

  /* ------------------------- story candidates (facts) -----------------------
     fact_id is `{season}-w{NN}-{type}-{detail}`. The detail slug is built from
     a team's username, which is stable across a season; team names are not.
     importance_score is 0-10 and deliberately simple: it is an editorial menu,
     not a second ranking model. */
  const facts: RecapFact[] = [];
  const wk = `${season}-w${String(week).padStart(2, "0")}`;
  const clamp = (n: number) => Math.max(0, Math.min(10, r2(n)));
  const add = (type: string, detail: string, importance: number, summary: string, teams: number[], support: Record<string, unknown> = {}) => {
    facts.push({ fact_id: `${wk}-${type}-${detail}`, type, importance_score: clamp(importance), summary, teams, support });
  };

  const hi = ranked[0], lo = ranked[ranked.length - 1];
  add("high", `${slugOf(hi.rosterId)}-score`, 7,
    `${hi.teamName} led the league with ${hi.points} points.`, [hi.rosterId], { points: hi.points });
  add("low", `${slugOf(lo.rosterId)}-score`, 6.5,
    `${lo.teamName} scored the fewest points, ${lo.points}.`, [lo.rosterId], { points: lo.points });

  for (const m of matchups) {
    const type = m.kind === "blowout" ? "blowout" : m.kind === "close" ? "close" : m.kind === "tie" ? "tie" : "matchup";
    add(type, `${slugOf(m.a.rosterId)}-${slugOf(m.b.rosterId)}-margin`,
      m.kind === "blowout" ? 7.5 : m.kind === "close" ? 8 : 4.5,
      m.kind === "tie"
        ? `${m.a.teamName} and ${m.b.teamName} tied at ${m.a.points}.`
        : `${m.a.teamName} beat ${m.b.teamName} by ${m.margin}, ${m.a.points} to ${m.b.points}.`,
      [m.a.rosterId, m.b.rosterId],
      { winner_roster_id: m.winnerRosterId, loser_roster_id: m.winnerRosterId === m.a.rosterId ? m.b.rosterId : m.a.rosterId, margin: m.margin, winner_score: m.a.points, loser_score: m.b.points });

    if (m.b.madeTopSix && m.winnerRosterId === m.a.rosterId) {
      add("high-scoring-loss", `${slugOf(m.b.rosterId)}-top-six`, 7.2,
        `${m.b.teamName} made the top-six bonus and still lost its matchup.`, [m.b.rosterId], { points: m.b.points, score_rank: m.b.scoreRank });
    }
    if (!m.a.madeTopSix && m.winnerRosterId === m.a.rosterId) {
      add("low-scoring-win", `${slugOf(m.a.rosterId)}-missed-bonus`, 6.5,
        `${m.a.teamName} won its matchup but missed the top-six bonus.`, [m.a.rosterId], { points: m.a.points, score_rank: m.a.scoreRank });
    }
  }

  // The whole slate lining up is rarer and funnier than any single game.
  const winners = matchups.map((m) => m.winnerRosterId).filter((r): r is number => r != null);
  if (winners.length === matchups.length && winners.every((r) => topSix.includes(r)) && matchups.length > 1) {
    add("coincidence", "all-winners-top-six", 8.5,
      `All ${winners.length} head-to-head winners were also the ${topSixCount} highest-scoring teams.`,
      winners, { winner_roster_ids: winners, top_six: topSix });
  }

  const leagueBench = highestBench[0];
  if (leagueBench) {
    add("bench", `${slugOf(leagueBench.rosterId)}-${playerSlug(leagueBench.name)}`,
      clamp(6 + leagueBench.points / 10),
      `${leagueBench.teamName} left ${leagueBench.name} and his ${leagueBench.points} points on the bench, the highest bench score in the league.`,
      [leagueBench.rosterId],
      { player_id: leagueBench.playerId, player_name: leagueBench.name, points: leagueBench.points,
        legal_swap_available: leagueBench.legalSwapAvailable, net_points_if_swapped: leagueBench.netPointsIfSwapped,
        changes_h2h_result: leagueBench.changesH2hResult, changes_top_six_result: leagueBench.changesTopSixResult });
  }
  for (const b of benchBlunders.slice(0, 3)) {
    if (leagueBench && b.rosterId === leagueBench.rosterId && b.name === leagueBench.name) continue;
    add("lineup", `${slugOf(b.rosterId)}-${playerSlug(b.name)}`, clamp(5 + b.gain / 5),
      b.startedInstead
        ? `${b.teamName} benched ${b.name} (${b.points}) and started ${b.startedInstead} (${b.startedPoints}) instead.`
        : `${b.teamName} left ${b.name} (${b.points}) on the bench with an empty lineup slot.`,
      [b.rosterId],
      { benched: b.name, points: b.points, started_instead: b.startedInstead, started_points: b.startedPoints, net_points_if_swapped: b.gain });
  }
  for (const g of regretRows.filter((x) => x.wouldHaveFlipped).slice(0, 3)) {
    add("lineup-regret", `${slugOf(g.rosterId)}-cost-the-game`, 8.8,
      `${g.teamName} left ${g.regret} on the bench, more than the margin it lost by.`, [g.rosterId],
      { actual: g.actual, optimal: g.optimal, regret: g.regret });
  }

  for (const p of rankDeltas(powBefore.map(powRow), powAfter.map(powRow), byR).filter((m) => Math.abs(m.delta) >= 2).slice(0, 4)) {
    add(p.delta > 0 ? "power-jump" : "power-drop", `${slugOf(p.rosterId)}-${Math.abs(p.delta)}`,
      clamp(4.5 + Math.abs(p.delta) * 0.6),
      `${p.teamName} moved ${p.delta > 0 ? "up" : "down"} ${Math.abs(p.delta)} in the power rankings, to ${p.to}.`,
      [p.rosterId], { from: p.from, to: p.to, delta: p.delta });
  }
  for (const rid of playoffPicture.enteredField) {
    add("playoff-entry", slugOf(rid), 7.4, `${name(rid)} moved into the top six.`, [rid], { position: sAfter.get(rid)?.rank });
  }
  for (const rid of playoffPicture.leftField) {
    add("playoff-exit", slugOf(rid), 7.4, `${name(rid)} dropped out of the top six.`, [rid], { position: sAfter.get(rid)?.rank });
  }

  for (const s of streaks.filter((x) => Math.abs(x.streak) >= 3).slice(0, 4)) {
    add(s.streak > 0 ? "win-streak" : "losing-streak", `${slugOf(s.rosterId)}-${s.label.toLowerCase()}`,
      clamp(5 + Math.abs(s.streak) * 0.5),
      `${s.teamName} is on a ${Math.abs(s.streak)} game ${s.streak > 0 ? "winning" : "losing"} streak.`,
      [s.rosterId], { streak: s.streak, label: s.label });
  }

  const startedByR = new Map((input.playerWeeks ?? []).map((pw) => [pw.rosterId, new Map(pw.started.map((p) => [p.playerId, p]))]));
  for (const t of transactions) {
    for (const a of t.adds) {
      const started = a.playerId ? startedByR.get(a.rosterId)?.get(a.playerId) : undefined;
      if (started && started.points >= 15) {
        add("waiver-payoff", `${slugOf(a.rosterId)}-${playerSlug(a.player)}`, 7.8,
          `${name(a.rosterId)} added ${a.player} this week and started him for ${r2(started.points)}.`,
          [a.rosterId], { player_id: a.playerId, player_name: a.player, points: r2(started.points), faab_spent: t.faab, type: t.type });
      }
    }
    if (t.type === "trade") {
      add("trade", t.rosterIds.map(slugOf).join("-"), 7,
        `${t.teamNames.join(" and ")} completed a trade.`, t.rosterIds, { adds: t.adds, drops: t.drops });
    }
    if ((t.faab ?? 0) >= 25) {
      add("faab", `${slugOf(t.rosterIds[0])}-${t.faab}`, 5.8,
        `${t.teamNames[0]} spent $${t.faab} of FAAB on ${t.adds.map((a) => a.player).join(", ") || "a waiver claim"}.`,
        t.rosterIds, { faab_spent: t.faab, adds: t.adds });
    }
  }

  if (input.allTimeHighWeek && hi.points > input.allTimeHighWeek.points) {
    add("league-record", `${slugOf(hi.rosterId)}-highest-week`, 9.5,
      `${hi.teamName}'s ${hi.points} is the highest single-week score in league history, passing ${input.allTimeHighWeek.points}.`,
      [hi.rosterId], { scope: "league", record_type: "highest_weekly_score", is_record: true, points: hi.points, previous: input.allTimeHighWeek });
  }

  facts.sort((a, b) => b.importance_score - a.importance_score || a.fact_id.localeCompare(b.fact_id));

  // Always derivable: falls back to the season's own calendar rather than the
  // current NFL season, so a historical week gets the right year.
  const win = input.window
    ?? (input.seasonStartDate ? windowForWeek(input.seasonStartDate, week) : windowForSeasonWeek(season, week));

  return {
    season, week,
    publicationDate: win?.publicationDate ?? "",
    contextWindow: win?.contextWindow ?? { start: "", end: "" },
    league: {
      teamCount: teams.length, playoffTeams: input.playoffTeams, byeTeams: input.byeTeams,
      regularSeasonWeeks: input.regularSeasonWeeks,
      weeksRemaining: Math.max(0, input.regularSeasonWeeks - week),
      isFinalWeek: week === input.regularSeasonWeeks,
    },
    teams: teams.map((t) => ({ ...t, slug: teamSlug(t.handle) })),
    matchups,
    scoring: { ranked, high: pick(hi), low: pick(lo), topSix },
    allPlay,
    standings: { before: standingsBefore, after: standingsAfter, moves: rankDeltas(standingsBefore, standingsAfter, byR) },
    power: { before: powBefore.map(powRow), after: powAfter.map(powRow), moves: rankDeltas(powBefore.map(powRow), powAfter.map(powRow), byR) },
    playoffPicture,
    streaks,
    players: { topStarters: topStarters.slice(0, 8), highestBench, benchBlunders: benchBlunders.slice(0, 6), lineupRegret: regretRows },
    transactions,
    h2h,
    facts,
  };
}

function pick(r: { rosterId: number; teamName: string; points: number }) {
  return { rosterId: r.rosterId, teamName: r.teamName, points: r.points };
}
