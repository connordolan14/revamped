// Roster history engine. Every player a franchise has ever rostered, with
// regular-season usage and the stints (acquired → released) that make it up.
//
// Two independent sources, each authoritative for one thing:
//   - Weekly roster snapshots (Sleeper matchups: players / starters / points)
//     are the truth for USAGE — weeks rostered, starts, points. Totals come
//     from these alone, so they're right even if the event feed has gaps.
//   - Events (draft picks + completed transactions) are the truth for TENURE —
//     how and when a player arrived and left. They split usage into stints.

import type { SleeperDraftPick, SleeperTransaction } from "./sleeper.js";

export interface RosterWeek {
  season: string;
  week: number;
  rosterId: number;
  players: string[];
  starters: string[];
  points: Record<string, number>;
}

export type MoveHow = "draft" | "waiver" | "free_agent" | "trade" | "commissioner" | "unknown";

export interface RosterEvent {
  season: string;
  /** Sleeper's transaction leg (≈ week); 0 for drafts. */
  leg: number;
  ts: number;
  rosterId: number;
  playerId: string;
  kind: "add" | "drop";
  how: MoveHow;
  /** Winning FAAB bid, for waiver adds. */
  faab?: number | null;
  /** Trade partner: who the player came from (add) or went to (drop). */
  otherRosterId?: number | null;
  /** e.g. "Startup draft · 1.01" */
  draftLabel?: string;
}

export interface StintEnd {
  ts: number | null;
  season: string | null;
  how: MoveHow;
  faab?: number | null;
  otherRosterId?: number | null;
  draftLabel?: string;
}

export interface Usage {
  weeks: number;
  starts: number;
  points: number;
  starterPoints: number;
}

export interface Stint extends Usage {
  from: StintEnd;
  /** null = still on the roster. */
  to: StintEnd | null;
}

export interface PlayerHistory extends Usage {
  playerId: string;
  current: boolean;
  stints: Stint[];
}

const emptyUsage = (): Usage => ({ weeks: 0, starts: 0, points: 0, starterPoints: 0 });
const end = (e: RosterEvent): StintEnd => ({
  ts: e.ts,
  season: e.season,
  how: e.how,
  ...(e.faab != null ? { faab: e.faab } : {}),
  ...(e.otherRosterId != null ? { otherRosterId: e.otherRosterId } : {}),
  ...(e.draftLabel ? { draftLabel: e.draftLabel } : {}),
});
const unknownEnd = (): StintEnd => ({ ts: null, season: null, how: "unknown" });

/** Chronological sort key: season, then leg/week, then timestamp. */
const cmpKey = (a: [number, number, number], b: [number, number, number]) =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const eventKey = (e: RosterEvent): [number, number, number] => [Number(e.season), e.leg, e.ts];

/** A stint plus the leg it began in, used only for week attribution. */
type WorkingStint = Stint & { fromLeg?: number };
const stintKey = (s: WorkingStint): [number, number, number] | null =>
  s.from.season == null ? null : [Number(s.from.season), s.fromLeg ?? 0, s.from.ts ?? 0];

/**
 * @param currentRosters roster id → players on it right now. Players still
 *   rostered keep an open stint even if their acquisition predates the feed.
 */
export function computeRosterHistory(
  weeks: RosterWeek[],
  events: RosterEvent[],
  currentRosters: Map<number, string[]> = new Map(),
): Map<number, PlayerHistory[]> {
  const stints = new Map<string, WorkingStint[]>(); // `${rosterId}:${playerId}`
  const keyOf = (rosterId: number, playerId: string) => `${rosterId}:${playerId}`;
  const listFor = (k: string) => {
    let list = stints.get(k);
    if (!list) stints.set(k, (list = []));
    return list;
  };
  const open = (list: WorkingStint[]) => {
    const last = list[list.length - 1];
    return last && last.to === null ? last : null;
  };

  // 1. Tenure from events.
  for (const e of [...events].sort((a, b) => cmpKey(eventKey(a), eventKey(b)))) {
    const list = listFor(keyOf(e.rosterId, e.playerId));
    if (e.kind === "add") {
      if (open(list)) continue; // already on the roster — duplicate add
      list.push({ ...emptyUsage(), from: end(e), fromLeg: e.leg, to: null });
    } else {
      const cur = open(list);
      if (cur) cur.to = end(e);
      // Dropped without a recorded add: acquired before the feed begins.
      else list.push({ ...emptyUsage(), from: unknownEnd(), to: end(e) });
    }
  }

  // 2. Usage from weekly snapshots, attributed to the stint that was open then:
  // the latest stint that began at or before that week.
  for (const w of weeks) {
    const starters = new Set(w.starters);
    const at: [number, number, number] = [Number(w.season), w.week, Number.POSITIVE_INFINITY];
    for (const playerId of w.players) {
      const list = listFor(keyOf(w.rosterId, playerId));
      if (!list.length) list.push({ ...emptyUsage(), from: unknownEnd(), to: null });
      let stint = list[0];
      for (const s of list) {
        const k = stintKey(s);
        if (k == null || cmpKey(k, at) <= 0) stint = s;
      }
      const pts = w.points[playerId] ?? 0;
      stint.weeks += 1;
      stint.points += pts;
      if (starters.has(playerId)) {
        stint.starts += 1;
        stint.starterPoints += pts;
      }
    }
  }

  // 3. Reconcile with today's rosters.
  for (const [rosterId, players] of currentRosters) {
    for (const playerId of players) {
      const list = listFor(keyOf(rosterId, playerId));
      if (!open(list)) list.push({ ...emptyUsage(), from: unknownEnd(), to: null });
    }
  }
  if (currentRosters.size) {
    for (const [k, list] of stints) {
      const [rosterId, playerId] = k.split(":");
      const cur = open(list);
      if (cur && !currentRosters.get(Number(rosterId))?.includes(playerId)) cur.to = unknownEnd();
    }
  }

  // 4. Roll stints up into one career row per franchise + player.
  const out = new Map<number, PlayerHistory[]>();
  for (const [k, list] of stints) {
    if (!list.length) continue;
    const [rid, playerId] = k.split(":");
    const rosterId = Number(rid);
    const total = emptyUsage();
    for (const s of list) {
      total.weeks += s.weeks;
      total.starts += s.starts;
      total.points += s.points;
      total.starterPoints += s.starterPoints;
    }
    const row: PlayerHistory = {
      playerId,
      ...total,
      current: list[list.length - 1].to === null,
      stints: list.map(({ fromLeg: _fromLeg, ...s }) => s),
    };
    if (!out.has(rosterId)) out.set(rosterId, []);
    out.get(rosterId)!.push(row);
  }
  for (const rows of out.values()) rows.sort((a, b) => b.points - a.points || a.playerId.localeCompare(b.playerId));
  return out;
}

const HOW: Record<string, MoveHow> = {
  waiver: "waiver",
  free_agent: "free_agent",
  trade: "trade",
  commissioner: "commissioner",
};

/** Completed Sleeper transactions → add/drop events (one per player per side). */
export function eventsFromTransactions(season: string, txs: SleeperTransaction[]): RosterEvent[] {
  const out: RosterEvent[] = [];
  for (const tx of txs) {
    if (tx.status !== "complete") continue;
    const how = HOW[tx.type] ?? "unknown";
    const leg = tx.leg ?? 0;
    const adds = tx.adds ?? {};
    const drops = tx.drops ?? {};
    for (const [playerId, rosterId] of Object.entries(drops)) {
      out.push({
        season, leg, ts: tx.created, rosterId, playerId, kind: "drop", how,
        otherRosterId: how === "trade" ? (adds[playerId] ?? null) : null,
      });
    }
    for (const [playerId, rosterId] of Object.entries(adds)) {
      out.push({
        season, leg, ts: tx.created, rosterId, playerId, kind: "add", how,
        faab: how === "waiver" ? (tx.settings?.waiver_bid ?? null) : null,
        otherRosterId: how === "trade" ? (drops[playerId] ?? null) : null,
      });
    }
  }
  return out;
}

/** Draft picks → add events. `name` is e.g. "Startup draft" / "2026 rookie draft". */
export function eventsFromDraft(season: string, ts: number, name: string, picks: SleeperDraftPick[], teams: number): RosterEvent[] {
  return picks
    .filter((p) => p.player_id && p.roster_id != null)
    .map((p) => {
      const inRound = p.pick_no - (p.round - 1) * teams;
      return {
        season, leg: 0, ts, rosterId: p.roster_id, playerId: p.player_id, kind: "add" as const, how: "draft" as const,
        draftLabel: `${name} · ${p.round}.${String(inRound).padStart(2, "0")}`,
      };
    });
}
