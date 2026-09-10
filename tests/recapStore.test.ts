import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadRecap, saveRecap, loadSeasonRecaps, recentRecapContext,
  recapFileName, recapPath, sourceHash,
} from "../src/core/recapStore.js";
import { PersistedRecap } from "../src/core/recapSchema.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "recap-store-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const make = (week: number, over: Partial<PersistedRecap["recap"]> = {}): PersistedRecap => ({
  season: 2025, week,
  generated_at: "2025-10-28T12:00:00.000Z",
  source_data_hash: "abc123",
  prompt_versions: { research: "recap-research-v1", writer: "recap-writer-v1", editor: "recap-editor-v1" },
  models: { research: "test", writer: "test", editor: "test" },
  recap: {
    title: `Week ${week}`,
    body: ["Something happened."],
    for_the_record: [{ text: "A thing.", fact_ids: [`2025-w0${week}-a`] }],
    used_body_fact_ids: [`2025-w0${week}-b`],
    external_context_used: [`ext-${week}`],
    team_bits_used: [{ team: "The Permanent Rebuild", theme: `theme-${week}` }],
    opening_mechanism: `open-${week}`,
    ending_mechanism: `close-${week}`,
    ...over,
  },
});

describe("recap file naming", () => {
  it("zero-pads the week so files sort chronologically", () => {
    expect(recapFileName("2025", 8)).toBe("2025-week-08.json");
    expect(recapFileName("2025", 12)).toBe("2025-week-12.json");
    expect(["2025-week-08.json", "2025-week-12.json"].sort()).toEqual(["2025-week-08.json", "2025-week-12.json"]);
  });
  it("lives under data/recaps", () => {
    expect(recapPath("2025", 8, "/x")).toBe("/x/data/recaps/2025-week-08.json");
  });
});

describe("sourceHash", () => {
  it("is stable for equal input and differs for changed input", () => {
    expect(sourceHash({ a: 1 })).toBe(sourceHash({ a: 1 }));
    expect(sourceHash({ a: 1 })).not.toBe(sourceHash({ a: 2 }));
  });
});

describe("persistence", () => {
  it("returns null when nothing is published", () => {
    expect(loadRecap("2025", 8, root)).toBeNull();
    expect(loadSeasonRecaps("2025", root)).toEqual([]);
  });

  it("round-trips a saved recap", () => {
    const p = saveRecap(make(8), root);
    expect(existsSync(p)).toBe(true);
    const back = loadRecap("2025", 8, root)!;
    expect(back.recap.title).toBe("Week 8");
    expect(back.source_data_hash).toBe("abc123");
  });

  it("survives a rebuild: a second read returns the same bytes", () => {
    const p = saveRecap(make(8), root);
    const first = readFileSync(p, "utf8");
    expect(loadRecap("2025", 8, root)).toEqual(JSON.parse(first));
  });

  it("tolerates a corrupt file instead of throwing", () => {
    const p = saveRecap(make(8), root);
    require("node:fs").writeFileSync(p, "{ not json");
    expect(loadRecap("2025", 8, root)).toBeNull();
    expect(loadSeasonRecaps("2025", root)).toEqual([]);
  });

  it("lists a season in week order and ignores other seasons", () => {
    saveRecap(make(3), root);
    saveRecap(make(11), root);
    saveRecap(make(8), root);
    const other = make(1); other.season = 2026;
    saveRecap(other, root);
    expect(loadSeasonRecaps("2025", root).map((r) => r.week)).toEqual([3, 8, 11]);
    expect(loadSeasonRecaps("2026", root).map((r) => r.week)).toEqual([1]);
  });
});

describe("recentRecapContext", () => {
  beforeEach(() => { for (const w of [4, 5, 6, 7, 8]) saveRecap(make(w), root); });

  it("returns only prior weeks within the lookback", () => {
    expect(recentRecapContext("2025", 8, 3, root).lookback_weeks).toEqual([5, 6, 7]);
  });

  it("excludes the week being written", () => {
    expect(recentRecapContext("2025", 8, 3, root).lookback_weeks).not.toContain(8);
  });

  it("carries continuity metadata but never prose", () => {
    const r = recentRecapContext("2025", 8, 1, root);
    expect(r.lookback_weeks).toEqual([7]);
    expect(r.team_bits).toEqual([{ team: "The Permanent Rebuild", week: 7, theme: "theme-7" }]);
    expect(r.opening_mechanisms).toEqual(["open-7"]);
    expect(r.external_references).toEqual(["ext-7"]);
    expect(JSON.stringify(r)).not.toContain("Something happened");
  });

  it("is empty for week 1", () => {
    const r = recentRecapContext("2025", 1, 3, root);
    expect(r.lookback_weeks).toEqual([]);
    expect(r.team_bits).toEqual([]);
  });
});
