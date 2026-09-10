// Adapter: raw Sleeper payloads -> the recap context builder's input shape.
// Shared by the live generator and the golden-fixture tests so both exercise the
// same normalization path.

import { MatchRow, MatchupEntry } from "../core/history.js";
import { RecapContextInput, RecapPlayerWeekInput, RecapTransactionInput } from "../core/recapContext.js";
import { LineupPlayer } from "../core/lineup.js";

export interface SleeperLike {
  league: { settings: Record<string, number>; total_rosters: number; season: string };
  users: { user_id: string; display_name: string; metadata?: { team_name?: string } }[];
  rosters: { roster_id: number; owner_id: string | null }[];
  matchups: {
    roster_id: number; matchup_id: number | null; points: number;
    starters: string[] | null; players: string[] | null;
    starters_points?: number[]; players_points?: Record<string, number>;
  }[];
  transactions?: {
    transaction_id: string; type: string; status: string; created: number;
    roster_ids: number[];
    adds: Record<string, number> | null;
    drops: Record<string, number> | null;
    settings?: { waiver_bid?: number } | null;
  }[];
  /** playerId -> { n: name, p: position, t: team } */
  players: Record<string, { n: string; p: string; t?: string | null }>;
}

export interface RecapInputExtras {
  season: string;
  week: number;
  /** Scored weeks of this season, week -> rows. Must include `week`. */
  rowsByWeek: Record<string, MatchRow[]>;
  /** Empty for historical backfill: no dynasty values exist for a past week. */
  rosterScores?: Map<number, number>;
  priorMeetings?: MatchupEntry[];
  allTimeHighWeek?: { rosterId: number; points: number; season: string; week: number } | null;
  /** ISO kickoff date for the season, used to derive the publication window. */
  seasonStartDate?: string;
  window?: { publicationDate: string; contextWindow: { start: string; end: string } };
}

export function recapInputFromSleeper(s: SleeperLike, x: RecapInputExtras): RecapContextInput {
  const uById = new Map(s.users.map((u) => [u.user_id, u]));
  const teams = s.rosters
    .map((r) => {
      const u = r.owner_id ? uById.get(r.owner_id) : undefined;
      return {
        rosterId: r.roster_id,
        handle: u?.display_name ?? `roster${r.roster_id}`,
        teamName: u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`,
      };
    })
    .sort((a, b) => a.rosterId - b.rosterId);

  const lp = (pid: string, pts: number): LineupPlayer => {
    const meta = s.players[pid];
    return { playerId: pid, name: meta?.n ?? pid, position: (meta?.p ?? "").toUpperCase(), points: pts };
  };

  const playerWeeks: RecapPlayerWeekInput[] = s.matchups.map((m) => {
    const pp = m.players_points ?? {};
    const startedIds = m.starters ?? [];
    const sp = m.starters_points ?? [];
    return {
      rosterId: m.roster_id,
      started: startedIds
        // Sleeper uses "0" as an empty-slot placeholder.
        .map((pid, i) => (pid && pid !== "0" ? lp(pid, sp[i] ?? pp[pid] ?? 0) : null))
        .filter((p): p is LineupPlayer => p != null),
      rostered: (m.players ?? []).map((pid) => lp(pid, pp[pid] ?? 0)),
    };
  });

  const transactions: RecapTransactionInput[] = (s.transactions ?? [])
    .filter((t) => t.status === "complete")
    .map((t) => ({
      id: t.transaction_id,
      type: t.type,
      week: x.week,
      created: t.created,
      rosterIds: t.roster_ids ?? [],
      adds: Object.entries(t.adds ?? {}).map(([pid, rid]) => ({ playerId: pid, player: s.players[pid]?.n ?? pid, rosterId: rid })),
      drops: Object.entries(t.drops ?? {}).map(([pid, rid]) => ({ playerId: pid, player: s.players[pid]?.n ?? pid, rosterId: rid })),
      faab: t.settings?.waiver_bid ?? null,
    }));

  const playoffWeekStart = s.league.settings.playoff_week_start ?? 15;
  return {
    season: x.season,
    week: x.week,
    teams,
    rowsByWeek: x.rowsByWeek,
    rosterScores: x.rosterScores ?? new Map(),
    playoffTeams: s.league.settings.playoff_teams ?? Math.floor(s.league.total_rosters / 2),
    byeTeams: 2,
    regularSeasonWeeks: playoffWeekStart - 1,
    playerWeeks,
    transactions,
    priorMeetings: x.priorMeetings,
    allTimeHighWeek: x.allTimeHighWeek ?? null,
    seasonStartDate: x.seasonStartDate,
    window: x.window,
  };
}
