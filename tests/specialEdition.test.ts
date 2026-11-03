import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SPECIAL_DIR, specialEditionIssues, loadSeasonSpecialEditions, specialPath,
} from "../src/core/specialEdition.js";
import { attachArticles } from "../src/pipeline/bundle.js";
import { WeekRecap } from "../src/core/recap.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "special-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const minimal = (week: number) => ({
  season: 2026, week, kicker: "Special edition", title: "Midseason",
  intro: ["Hello."], lead: { title: `Week ${week}`, body: ["Scores."] },
  teamShort: {}, sections: [{ id: "a", title: "A", blocks: [{ type: "p", text: "x" }] }],
});
const write = (doc: object, week: number) => {
  mkdirSync(join(root, SPECIAL_DIR), { recursive: true });
  writeFileSync(specialPath(2026, week, root), JSON.stringify(doc));
};
const recap = (week: number): WeekRecap => ({
  season: "2026", week, games: [], topSix: [], high: { r: 1, p: 1 }, low: { r: 2, p: 0 },
});

describe("special editions", () => {
  it("attaches to its week only, alongside the matchup facts", () => {
    write(minimal(8), 8);
    const out = attachArticles("2026", [recap(7), recap(8)], root) as any[];
    expect(out[0].special).toBeUndefined();
    expect(out[1].special.title).toBe("Midseason");
    expect(out[1].special.season).toBeUndefined();
    expect(out[1].games).toEqual([]);
  });

  it("flags unknown block types and duplicate section ids", () => {
    const bad = minimal(8);
    bad.sections.push({ id: "a", title: "B", blocks: [{ type: "chart3d", text: "" }] });
    const issues = specialEditionIssues(bad);
    expect(issues.some((i) => i.includes("duplicates id"))).toBe(true);
    expect(issues.some((i) => i.includes('unknown type "chart3d"'))).toBe(true);
  });

  it("skips a broken file instead of failing the data refresh", () => {
    write({ season: 2026 }, 8);
    expect(loadSeasonSpecialEditions("2026", root).size).toBe(0);
  });
});

describe("committed special editions", () => {
  const dir = join(process.cwd(), SPECIAL_DIR);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

  it.each(files)("%s is valid and references real teams", (f) => {
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
    expect(specialEditionIssues(doc)).toEqual([]);
    expect(f).toBe(`${doc.season}-week-${String(doc.week).padStart(2, "0")}.json`);
    // Team references are roster ids; player references carry a Sleeper id for the headshot.
    const teamIds: number[] = [];
    const players: { pid?: string; name?: string }[] = [];
    JSON.stringify(doc, (key, value) => {
      if (["team", "a", "b"].includes(key) && typeof value === "number") teamIds.push(value);
      if (key === "player" && value && typeof value === "object") players.push(value);
      return value;
    });
    for (const id of teamIds) expect(id >= 1 && id <= 12, `roster id ${id}`).toBe(true);
    for (const p of players) expect(p.pid && p.name, JSON.stringify(p)).toBeTruthy();
    expect(JSON.stringify(doc)).not.toContain("—");
  });
});
