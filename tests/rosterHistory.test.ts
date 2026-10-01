import { describe, expect, it } from "vitest";
import {
  computeRosterHistory,
  eventsFromDraft,
  eventsFromTransactions,
  RosterEvent,
  RosterWeek,
} from "../src/core/rosterHistory.js";
import type { SleeperTransaction } from "../src/core/sleeper.js";

const wk = (week: number, rosterId: number, players: string[], starters: string[], points: Record<string, number>, season = "2025"): RosterWeek =>
  ({ season, week, rosterId, players, starters, points });
const ev = (e: Partial<RosterEvent> & Pick<RosterEvent, "rosterId" | "playerId" | "kind" | "leg">): RosterEvent =>
  ({ season: "2025", ts: e.leg * 1000, how: "free_agent", ...e });
const tx = (t: Partial<SleeperTransaction>): SleeperTransaction => ({
  transaction_id: "t", type: "free_agent", status: "complete", created: 5, leg: 3, roster_ids: [],
  adds: null, drops: null, draft_picks: [], waiver_budget: [], ...t,
});

describe("computeRosterHistory", () => {
  it("totals usage from weekly snapshots and keeps a drafted player's stint open", () => {
    const events = [ev({ rosterId: 1, playerId: "p", kind: "add", leg: 0, how: "draft", draftLabel: "Startup draft · 1.01" })];
    const weeks = [
      wk(1, 1, ["p", "q"], ["p"], { p: 20, q: 5 }),
      wk(2, 1, ["p", "q"], ["q"], { p: 12, q: 8 }),
    ];
    const rows = computeRosterHistory(weeks, events, new Map([[1, ["p", "q"]]])).get(1)!;
    const p = rows.find((r) => r.playerId === "p")!;
    expect(p).toMatchObject({ weeks: 2, starts: 1, points: 32, starterPoints: 20, current: true });
    expect(p.stints).toHaveLength(1);
    expect(p.stints[0].from).toMatchObject({ how: "draft", draftLabel: "Startup draft · 1.01" });
    expect(p.stints[0].to).toBeNull();
  });

  it("splits a drop and re-add by the same team into two stints", () => {
    const events = [
      ev({ rosterId: 1, playerId: "p", kind: "add", leg: 1, how: "waiver", faab: 7 }),
      ev({ rosterId: 1, playerId: "p", kind: "drop", leg: 3 }),
      ev({ rosterId: 1, playerId: "p", kind: "add", leg: 5 }),
    ];
    const weeks = [1, 2, 5, 6].map((w) => wk(w, 1, ["p"], ["p"], { p: w }));
    const [p] = computeRosterHistory(weeks, events).get(1)!;
    expect(p).toMatchObject({ weeks: 4, starts: 4, points: 14, current: true });
    expect(p.stints.map((s) => [s.weeks, s.points])).toEqual([[2, 3], [2, 11]]);
    expect(p.stints[0].from).toMatchObject({ how: "waiver", faab: 7 });
    expect(p.stints[0].to).toMatchObject({ how: "free_agent" });
    expect(p.stints[1].to).toBeNull();
  });

  it("credits each franchise only for its own weeks after a trade", () => {
    const events = [
      ev({ rosterId: 1, playerId: "p", kind: "add", leg: 0, how: "draft" }),
      ev({ rosterId: 1, playerId: "p", kind: "drop", leg: 3, how: "trade", otherRosterId: 2 }),
      ev({ rosterId: 2, playerId: "p", kind: "add", leg: 3, how: "trade", otherRosterId: 1 }),
    ];
    const weeks = [
      wk(1, 1, ["p"], ["p"], { p: 10 }), wk(2, 1, ["p"], [], { p: 10 }),
      wk(3, 2, ["p"], ["p"], { p: 30 }),
    ];
    const history = computeRosterHistory(weeks, events, new Map([[1, []], [2, ["p"]]]));
    expect(history.get(1)![0]).toMatchObject({ weeks: 2, starts: 1, points: 20, starterPoints: 10, current: false });
    expect(history.get(1)![0].stints[0].to).toMatchObject({ how: "trade", otherRosterId: 2 });
    expect(history.get(2)![0]).toMatchObject({ weeks: 1, points: 30, current: true });
    expect(history.get(2)![0].stints[0].from).toMatchObject({ how: "trade", otherRosterId: 1 });
  });

  it("carries a stint across seasons and orders by season before week", () => {
    const events = [
      ev({ rosterId: 1, playerId: "p", kind: "add", leg: 10, season: "2025" }),
      ev({ rosterId: 1, playerId: "p", kind: "drop", leg: 2, season: "2026" }),
    ];
    const weeks = [wk(11, 1, ["p"], [], { p: 4 }), wk(1, 1, ["p"], [], { p: 6 }, "2026")];
    const [p] = computeRosterHistory(weeks, events).get(1)!;
    expect(p.stints).toHaveLength(1);
    expect(p.stints[0]).toMatchObject({ weeks: 2, points: 10 });
    expect(p.stints[0].to).toMatchObject({ season: "2026" });
  });

  it("keeps usage and current rosters even when events are missing", () => {
    const weeks = [wk(1, 1, ["p"], ["p"], { p: 9 })];
    const history = computeRosterHistory(weeks, [], new Map([[1, ["p", "new"]]]));
    const p = history.get(1)!.find((r) => r.playerId === "p")!;
    expect(p).toMatchObject({ weeks: 1, points: 9, current: true });
    expect(p.stints[0].from.how).toBe("unknown");
    expect(history.get(1)!.find((r) => r.playerId === "new")).toMatchObject({ weeks: 0, current: true });
  });

  it("keeps playoff weeks out of regular-season totals", () => {
    const events = [ev({ rosterId: 1, playerId: "p", kind: "add", leg: 0, how: "draft" })];
    const weeks = [
      wk(14, 1, ["p"], ["p"], { p: 10 }),
      { ...wk(15, 1, ["p"], ["p"], { p: 25 }), playoff: true },
      { ...wk(16, 1, ["p"], [], { p: 7 }), playoff: true },
    ];
    const [p] = computeRosterHistory(weeks, events).get(1)!;
    expect(p).toMatchObject({ weeks: 1, starts: 1, points: 10, starterPoints: 10, postSeasons: ["2025"] });
    expect(p.post).toEqual({ weeks: 2, games: 2, starts: 1, points: 32, starterPoints: 25 });
    expect(p.stints[0].post).toEqual(p.post);
  });

  it("counts games played separately from weeks rostered (byes, inactives)", () => {
    const weeks = [
      { ...wk(1, 1, ["p"], ["p"], { p: 12 }), played: ["p"] },
      { ...wk(2, 1, ["p"], [], { p: 0 }), played: [] }, // bye
      { ...wk(3, 1, ["p"], ["p"], { p: 8 }), played: ["p"] },
    ];
    const [p] = computeRosterHistory(weeks, []).get(1)!;
    expect(p).toMatchObject({ weeks: 3, games: 2, starts: 2, points: 20 });
  });

  it("closes a stint for a player no longer on the current roster", () => {
    const events = [ev({ rosterId: 1, playerId: "p", kind: "add", leg: 1 })];
    const [p] = computeRosterHistory([], events, new Map([[1, []]])).get(1)!;
    expect(p.current).toBe(false);
    expect(p.stints[0].to).toMatchObject({ how: "unknown" });
  });
});

describe("Sleeper event mapping", () => {
  it("maps waivers, trades, and skips failed transactions", () => {
    const events = eventsFromTransactions("2025", [
      tx({ type: "waiver", adds: { a: 1 }, drops: { b: 1 }, settings: { waiver_bid: 12 } }),
      tx({ type: "trade", adds: { c: 2, d: 1 }, drops: { c: 1, d: 2 } }),
      tx({ type: "waiver", status: "failed", adds: { e: 3 } }),
    ]);
    expect(events).toHaveLength(6);
    expect(events.find((e) => e.playerId === "a")).toMatchObject({ kind: "add", how: "waiver", faab: 12, leg: 3, ts: 5 });
    expect(events.find((e) => e.playerId === "b")).toMatchObject({ kind: "drop", how: "waiver" });
    expect(events.find((e) => e.playerId === "c" && e.kind === "add")).toMatchObject({ rosterId: 2, otherRosterId: 1 });
    expect(events.find((e) => e.playerId === "c" && e.kind === "drop")).toMatchObject({ rosterId: 1, otherRosterId: 2 });
    expect(events.some((e) => e.playerId === "e")).toBe(false);
  });

  it("treats a commissioner's team-to-team move as a trade, but not a free-agent add", () => {
    const events = eventsFromTransactions("2025", [
      tx({ type: "commissioner", adds: { a: 2, f: 3 }, drops: { a: 1 } }),
    ]);
    expect(events.find((e) => e.playerId === "a" && e.kind === "add")).toMatchObject({ how: "trade", viaCommissioner: true, rosterId: 2, otherRosterId: 1 });
    expect(events.find((e) => e.playerId === "a" && e.kind === "drop")).toMatchObject({ how: "trade", viaCommissioner: true, rosterId: 1, otherRosterId: 2 });
    expect(events.find((e) => e.playerId === "f")).toMatchObject({ how: "commissioner", otherRosterId: null });
    expect(events.find((e) => e.playerId === "f")?.viaCommissioner).toBeUndefined();
  });

  it("labels draft picks with round and pick-in-round", () => {
    const [e] = eventsFromDraft("2025", 100, "Startup draft", [
      { player_id: "p", picked_by: "u", roster_id: 4, round: 2, draft_slot: 9, pick_no: 16 },
    ], 12);
    expect(e).toMatchObject({ rosterId: 4, how: "draft", leg: 0, ts: 100, draftLabel: "Startup draft · 2.04" });
  });
});
