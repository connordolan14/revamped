import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSeasonBundle, powerShape } from "../src/pipeline/bundle.js";
import {
  loadPowerSnapshots,
  PowerSnapshot,
  powerSnapshotPath,
  savePowerSnapshot,
} from "../src/pipeline/powerHistory.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "power-history-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const snapshot = (week: number, rank = 1): PowerSnapshot => ({
  season: "2026",
  week,
  capturedAt: `2026-09-${String(week).padStart(2, "0")}T12:00:00.000Z`,
  leagueId: "league-2026",
  rankings: [{
    rosterId: 1,
    ownerId: "owner-1",
    handle: "manager",
    teamName: "Team One",
    avatar: "https://example.com/logo.png",
    rank,
    score: rank,
  }],
});

describe("weekly power-ranking history", () => {
  it("creates a sortable per-week snapshot", () => {
    const result = savePowerSnapshot(snapshot(2), root);

    expect(result.created).toBe(true);
    expect(result.path).toBe(powerSnapshotPath("2026", 2, root));
    expect(JSON.parse(readFileSync(result.path, "utf8"))).toEqual(snapshot(2));
  });

  it("never overwrites an existing week's displayed ranking", () => {
    const first = savePowerSnapshot(snapshot(1, 1), root);
    const originalBytes = readFileSync(first.path, "utf8");
    const second = savePowerSnapshot(snapshot(1, 9), root);

    expect(second.created).toBe(false);
    expect(readFileSync(first.path, "utf8")).toBe(originalBytes);
    expect(second.snapshot.rankings[0].rank).toBe(1);
  });

  it("loads snapshots in week order and exposes them on the season bundle", () => {
    savePowerSnapshot(snapshot(2), root);
    savePowerSnapshot(snapshot(1), root);

    expect(loadPowerSnapshots("2026", root).map((entry) => entry.week)).toEqual([1, 2]);
    const season = buildSeasonBundle({
      season: "2026",
      complete: false,
      rowsByWeek: {},
      teams: [{ rosterId: 1, ownerId: "owner-1", handle: "manager", teamName: "Team One", avatar: null }],
      rosterScores: new Map([[1, 100]]),
      root,
    });
    expect(season.powerHistory.map((entry) => entry.week)).toEqual([1, 2]);
  });

  it("can reproduce a completed week's ranking without later scores", () => {
    const teams = [
      { rosterId: 1, ownerId: "owner-1", handle: "one", teamName: "One", avatar: null },
      { rosterId: 2, ownerId: "owner-2", handle: "two", teamName: "Two", avatar: null },
    ];
    const rows = {
      "1": [{ r: 1, m: 1, p: 100 }, { r: 2, m: 1, p: 90 }],
      "2": [{ r: 1, m: 1, p: 50 }, { r: 2, m: 1, p: 150 }],
    };

    expect(powerShape(rows, teams, new Map(), 1).map((entry) => entry.rosterId)).toEqual([1, 2]);
    expect(powerShape(rows, teams, new Map(), 2).map((entry) => entry.rosterId)).toEqual([2, 1]);
  });
});
