// Roster history engine. Every player a franchise has ever rostered, with
// regular-season and postseason usage and the stints (acquired → released)
// that make it up.
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
  /** A winners-bracket playoff game; counted separately from the regular season. */
  playoff?: boolean;
  /** Players who appeared in an NFL game that week (not on bye or inactive).
   *  When omitted, every rostered player is assumed to have played. */
  played?: string[];
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
  /** A team-to-team move the commissioner made; treated as a trade. */
  viaCommissioner?: boolean;
}

export interface StintEnd {
  ts: number | null;
  season: string | null;
  how: MoveHow;
  faab?: number | null;
  otherRosterId?: number | null;
  draftLabel?: string;
  viaCommissioner?: boolean;
}

export interface Usage {
  weeks: number;
  /** Weeks rostered in which the player actually played an NFL game. */
  games: number;
  starts: number;
  points: number;
  starterPoints: number;
}

/** Top-level usage fields are regular season; `post` is the postseason. */
export interface Stint extends Usage {
  post: Usage;
  from: StintEnd;
  /** null = still on the roster. */
  to: StintEnd | null;
}

export interface PlayerHistory extends Usage {
  playerId: string;
  current: boolean;
  post: Usage;
  /** Seasons with at least one postseason game for this franchise. */
  postSeasons: string[];
  stints: Stint[];
}

const emptyUsage = (): Usage => ({ weeks: 0, games: 0, starts: 0, points: 0, starterPoints: 0 });
const addUsage = (into: Usage, from: Usage) => {
  into.weeks += from.weeks;
  into.games += from.games;
  into.starts += from.starts;
  into.points += from.points;
  into.starterPoints += from.starterPoints;
};
const end = (e: RosterEvent): StintEnd => ({
  ts: e.ts,
  season: e.season,
  how: e.how,
  ...(e.faab != null ? { faab: e.faab } : {}),
  ...(e.otherRosterId != null ? { otherRosterId: e.otherRosterId } : {}),
  ...(e.draftLabel ? { draftLabel: e.draftLabel } : {}),
  ...(e.viaCommissioner ? { viaCommissioner: true } : {}),
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
      list.push({ ...emptyUsage(), post: emptyUsage(), from: end(e), fromLeg: e.leg, to: null });
    } else {
      const cur = open(list);
      if (cur) cur.to = end(e);
      // Dropped without a recorded add: acquired before the feed begins.
      else list.push({ ...emptyUsage(), post: emptyUsage(), from: unknownEnd(), to: end(e) });
    }
  }

  // 2. Usage from weekly snapshots, attributed to the stint that was open then:
  // the latest stint that began at or before that week.
  const postSeasons = new Map<string, Set<string>>();
  for (const w of weeks) {
    const starters = new Set(w.starters);
    const played = w.played ? new Set(w.played) : null;
    const at: [number, number, number] = [Number(w.season), w.week, Number.POSITIVE_INFINITY];
    for (const playerId of w.players) {
      const list = listFor(keyOf(w.rosterId, playerId));
      if (!list.length) list.push({ ...emptyUsage(), post: emptyUsage(), from: unknownEnd(), to: null });
      let stint = list[0];
      for (const s of list) {
        const k = stintKey(s);
        if (k == null || cmpKey(k, at) <= 0) stint = s;
      }
      const pts = w.points[playerId] ?? 0;
      const usage: Usage = w.playoff ? stint.post : stint;
      usage.weeks += 1;
      if (!played || played.has(playerId)) usage.games += 1;
      usage.points += pts;
      if (starters.has(playerId)) {
        usage.starts += 1;
        usage.starterPoints += pts;
      }
      if (w.playoff) {
        const k = keyOf(w.rosterId, playerId);
        if (!postSeasons.has(k)) postSeasons.set(k, new Set());
        postSeasons.get(k)!.add(w.season);
      }
    }
  }

  // 3. Reconcile with today's rosters.
  for (const [rosterId, players] of currentRosters) {
    for (const playerId of players) {
      const list = listFor(keyOf(rosterId, playerId));
      if (!open(list)) list.push({ ...emptyUsage(), post: emptyUsage(), from: unknownEnd(), to: null });
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
    const post = emptyUsage();
    for (const s of list) {
      addUsage(total, s);
      addUsage(post, s.post);
    }
    const row: PlayerHistory = {
      playerId,
      ...total,
      post,
      postSeasons: [...(postSeasons.get(k) ?? [])].sort(),
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

/** Completed Sleeper transactions → add/drop events (one per player per side).
 *  A commissioner move that sends a player from one team to another is a
 *  trade in practice (e.g. a trade the commissioner re-executed), so it's
 *  recorded as one, flagged `viaCommissioner`. */
export function eventsFromTransactions(season: string, txs: SleeperTransaction[]): RosterEvent[] {
  const out: RosterEvent[] = [];
  for (const tx of txs) {
    if (tx.status !== "complete") continue;
    const txHow = HOW[tx.type] ?? "unknown";
    const leg = tx.leg ?? 0;
    const adds = tx.adds ?? {};
    const drops = tx.drops ?? {};
    const moved = (playerId: string) => adds[playerId] != null && drops[playerId] != null && adds[playerId] !== drops[playerId];
    const howFor = (playerId: string): Pick<RosterEvent, "how" | "viaCommissioner"> =>
      txHow === "commissioner" && moved(playerId) ? { how: "trade", viaCommissioner: true } : { how: txHow };
    for (const [playerId, rosterId] of Object.entries(drops)) {
      const h = howFor(playerId);
      out.push({
        season, leg, ts: tx.created, rosterId, playerId, kind: "drop", ...h,
        otherRosterId: h.how === "trade" ? (adds[playerId] ?? null) : null,
      });
    }
    for (const [playerId, rosterId] of Object.entries(adds)) {
      const h = howFor(playerId);
      out.push({
        season, leg, ts: tx.created, rosterId, playerId, kind: "add", ...h,
        faab: h.how === "waiver" ? (tx.settings?.waiver_bid ?? null) : null,
        otherRosterId: h.how === "trade" ? (drops[playerId] ?? null) : null,
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
