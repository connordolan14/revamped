import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildRecapContext, teamSlug, playerSlug } from "../src/core/recapContext.js";
import { recapInputFromSleeper, SleeperLike } from "../src/pipeline/recapInput.js";
import { optimalLineup, lineupRegret, LineupPlayer } from "../src/core/lineup.js";
import { MatchRow } from "../src/core/history.js";

const FX = join(process.cwd(), "fixtures/weekly-recap/2025-week-08");
const load = (f: string) => JSON.parse(readFileSync(join(FX, f), "utf8"));
const raw = (f: string) => JSON.parse(readFileSync(join(process.cwd(), "data/raw", f), "utf8"));

function week8Context() {
  const all: Record<string, MatchRow[]> = raw("matchups2025.json");
  const rowsByWeek = Object.fromEntries(Object.entries(all).filter(([w]) => Number(w) <= 8));
  const s: SleeperLike = {
    league: load("raw-sleeper/league.json"),
    users: load("raw-sleeper/users.json"),
    rosters: load("raw-sleeper/rosters.json"),
    matchups: load("raw-sleeper/matchups.json"),
    transactions: load("raw-sleeper/transactions.json"),
    players: load("raw-sleeper/players.json"),
  };
  return buildRecapContext(recapInputFromSleeper(s, { season: "2025", week: 8, rowsByWeek, seasonStartDate: "2025-09-04" }));
}

describe("lineup solver", () => {
  const p = (id: string, pos: string, pts: number): LineupPlayer => ({ playerId: id, name: id, position: pos, points: pts });

  it("fills every slot and prefers the highest scorer", () => {
    const pool = [
      p("qb1", "QB", 30), p("qb2", "QB", 25), p("qb3", "QB", 5),
      p("rb1", "RB", 20), p("rb2", "RB", 18), p("rb3", "RB", 15),
      p("wr1", "WR", 22), p("wr2", "WR", 19), p("wr3", "WR", 14),
      p("te1", "TE", 12), p("te2", "TE", 3),
    ];
    const best = optimalLineup(pool);
    expect(best.starters).toHaveLength(10);
    // SUPER_FLEX should take the second QB over any remaining flex player.
    expect(best.starters.find((x) => x.slot === "SUPER_FLEX")!.playerId).toBe("qb2");
    expect(best.total).toBe(30 + 25 + 20 + 18 + 22 + 19 + 12 + 15 + 14 + 3);
  });

  it("leaves a slot empty rather than starting an ineligible player", () => {
    // A kicker is eligible for no slot in this lineup, so it never starts.
    const best = optimalLineup([p("qb1", "QB", 10), p("k1", "K", 99)]);
    expect(best.starters.map((s) => s.slot)).toEqual(["QB"]);
    expect(best.total).toBe(10);
    expect(best.benched.map((b) => b.playerId)).toEqual(["k1"]);
  });

  it("reports zero regret for an optimal lineup", () => {
    const pool = [p("qb1", "QB", 30), p("rb1", "RB", 20), p("wr1", "WR", 10)];
    const best = optimalLineup(pool);
    const lr = lineupRegret(best.starters, pool);
    expect(lr.regret).toBe(0);
    expect(lr.missed).toEqual([]);
  });

  it("identifies the bench player who should have displaced a starter", () => {
    const pool = [
      p("qb1", "QB", 30), p("qb2", "QB", 2),
      p("rb1", "RB", 4), p("rb2", "RB", 3), p("rbBench", "RB", 25),
      p("wr1", "WR", 5), p("wr2", "WR", 4), p("wr3", "WR", 3), p("wr4", "WR", 2),
      p("te1", "TE", 6), p("teDud", "TE", 1),
    ];
    // A full 10-man lineup that benches the 25-point back for a 1-point TE.
    const started = pool.filter((x) => x.playerId !== "rbBench");
    const lr = lineupRegret(started, pool);
    expect(lr.regret).toBe(24);
    expect(lr.missed[0].benched.playerId).toBe("rbBench");
    expect(lr.missed[0].wouldHaveReplaced!.playerId).toBe("teDud");
    expect(lr.missed[0].gain).toBe(24);
  });

  it("counts a bench player filling an empty slot as a full loss", () => {
    const pool = [p("qb1", "QB", 30), p("rbBench", "RB", 25)];
    const lr = lineupRegret([p("qb1", "QB", 30)], pool); // manager started one player
    expect(lr.regret).toBe(25);
    expect(lr.missed[0].benched.playerId).toBe("rbBench");
    expect(lr.missed[0].wouldHaveReplaced).toBeNull();
    expect(lr.missed[0].gain).toBe(25);
  });
});

describe("slugs are stable and filesystem-safe", () => {
  it("normalizes handles", () => {
    expect(teamSlug("dackerly36")).toBe("dackerly36");
    expect(teamSlug("Team BrendanBall03")).toBe("teambrendanball03");
  });
  it("uses a player's last name and drops suffixes", () => {
    expect(playerSlug("Brian Thomas Jr.")).toBe("thomas");
    expect(playerSlug("Ja'Marr Chase")).toBe("chase");
  });
});

describe("2025 week 8 golden context", () => {
  const ctx = week8Context();

  it("matches the known week 8 slate", () => {
    expect(ctx.season).toBe("2025");
    expect(ctx.week).toBe(8);
    expect(ctx.matchups).toHaveLength(6);
    expect(ctx.league.teamCount).toBe(12);
    expect(ctx.league.regularSeasonWeeks).toBe(14);
    expect(ctx.league.weeksRemaining).toBe(6);
  });

  it("reproduces the high, low and top-six group", () => {
    expect(ctx.scoring.high.points).toBe(160.59);
    expect(ctx.scoring.high.teamName).toBe("New England Keys");
    expect(ctx.scoring.low.points).toBe(70.65);
    expect(ctx.scoring.low.teamName).toBe("The Permanent Rebuild");
    expect(ctx.scoring.topSix).toHaveLength(6);
    expect(ctx.scoring.topSix).toEqual([8, 9, 11, 2, 6, 12]);
  });

  it("computes all-play records that sum to the league total", () => {
    const total = ctx.allPlay.reduce((a, x) => a + x.beaten, 0);
    expect(total).toBe(66); // 12 teams choose 2
    expect(ctx.allPlay[0].beaten).toBe(11);
  });

  it("ranks the biggest blowout first and flags it", () => {
    const blow = ctx.matchups.find((m) => m.margin === 76.4)!;
    expect(blow.a.teamName).toBe("New England Keys");
    expect(blow.b.teamName).toBe("Injured Reserve");
    expect(blow.kind).toBe("blowout");
  });

  it("produces before and after standings that differ", () => {
    expect(ctx.standings.before).toHaveLength(12);
    expect(ctx.standings.after).toHaveLength(12);
    const before = ctx.standings.before.find((s) => s.teamName === "New England Keys")!;
    const after = ctx.standings.after.find((s) => s.teamName === "New England Keys")!;
    expect(after.wins).toBeGreaterThan(before.wins);
  });

  it("derives player-level detail from the fixture", () => {
    expect(ctx.players.topStarters.length).toBeGreaterThan(0);
    expect(ctx.players.lineupRegret).toHaveLength(12);
    for (const r of ctx.players.lineupRegret) {
      expect(r.optimal).toBeGreaterThanOrEqual(r.actual);
      expect(r.regret).toBeGreaterThanOrEqual(0);
    }
  });

  it("emits candidate facts with unique ids in the documented format", () => {
    expect(ctx.facts.length).toBeGreaterThan(5);
    const ids = ctx.facts.map((f) => f.fact_id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^2025-w08-[a-z0-9-]+$/);
  });

  it("orders facts by importance and keeps scores in range", () => {
    const scores = ctx.facts.map((f) => f.importance_score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    for (const s of scores) { expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(10); }
  });

  it("derives the publication date and research window", () => {
    expect(ctx.publicationDate).toBe("2025-10-28");
    expect(ctx.contextWindow).toEqual({ start: "2025-10-21", end: "2025-10-27" });
  });

  it("flags the all-winners-were-top-six coincidence", () => {
    const f = ctx.facts.find((x) => x.type === "coincidence")!;
    expect(f.fact_id).toBe("2025-w08-coincidence-all-winners-top-six");
    expect(f.teams).toHaveLength(6);
  });

  it("tracks the highest bench score in the league", () => {
    const league = ctx.players.highestBench.find((b) => b.highestBenchScoreLeague)!;
    expect(league.name).toBe("Tua Tagovailoa");
    expect(league.points).toBe(24.2);
    expect(league.teamName).toBe("chrisrenna17");
    // chrisrenna17 lost by 47.22, so starting Tua would not have changed it.
    expect(league.changesH2hResult).toBe(false);
  });

  it("exposes head-to-head records before and after the week", () => {
    const after = new Map(ctx.standings.after.map((s) => [s.rosterId, s.h2hRecord]));
    expect(after.get(1)).toBe("0-8");  // The Permanent Rebuild
    expect(after.get(5)).toBe("6-2");  // Injured Reserve
    expect(after.get(8)).toBe("5-3");  // New England Keys
    const keys = ctx.matchups.flatMap((m) => [m.a, m.b]).find((s) => s.rosterId === 8)!;
    expect(keys.h2hRecordBefore).toBe("4-3");
    expect(keys.h2hRecordAfter).toBe("5-3");
  });

  it("never leaks a future week into the before snapshot", () => {
    for (const s of ctx.standings.before) expect(s.h2hWins + s.h2hLosses).toBe(7);
    for (const s of ctx.standings.after) expect(s.h2hWins + s.h2hLosses).toBe(8);
  });

  it("is deterministic across runs", () => {
    expect(JSON.stringify(week8Context())).toBe(JSON.stringify(ctx));
  });
});
