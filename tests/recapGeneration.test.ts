// Acceptance-tests.md sections H (idempotency), I (stat correction),
// J (failure safety) and K (manual generation). No network, no model calls.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decideGeneration, loadRecap, saveRecap, sourceHash, recapPath } from "../src/core/recapStore.js";
import { validateRecap, PersistedRecap, RecapArticle } from "../src/core/recapSchema.js";
import { historyBeforeWeek } from "../src/pipeline/generateRecap.js";
import { MatchupEntry } from "../src/core/history.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "recap-gen-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const CONTEXT = { season: 2025, week: 8, scoring: { topSix: [8, 9, 11, 2, 6, 12] } };

const article = (over: Partial<RecapArticle> = {}): RecapArticle => ({
  title: "Week 8 Recap",
  body: ["a ".repeat(200).trim(), "b ".repeat(200).trim()],
  for_the_record: [
    { text: "One.", fact_ids: ["2025-w08-a"] },
    { text: "Two.", fact_ids: ["2025-w08-b"] },
    { text: "Three.", fact_ids: ["2025-w08-c"] },
  ],
  used_body_fact_ids: ["2025-w08-d"],
  external_context_used: [],
  team_bits_used: [],
  ...over,
});

const envelope = (hash: string, over: Partial<RecapArticle> = {}): PersistedRecap => ({
  season: 2025, week: 8,
  generated_at: "2025-10-28T12:00:00.000Z",
  source_data_hash: hash,
  prompt_versions: { research: "recap-research-v1", writer: "recap-writer-v1", editor: "recap-editor-v1" },
  models: { research: "m", writer: "m", editor: "m" },
  recap: article(over),
});

const opts = { knownFactIds: new Set(["2025-w08-a", "2025-w08-b", "2025-w08-c", "2025-w08-d"]) };

describe("H. idempotency", () => {
  it("Tuesday generates, Wednesday reuses the identical recap", () => {
    const hash = sourceHash(CONTEXT);
    // Tuesday: nothing published yet.
    expect(decideGeneration(loadRecap(2025, 8, root), hash)).toEqual({ action: "generate", reason: "not_published" });
    saveRecap(envelope(hash), root);

    // Wednesday: same source data.
    const wednesday = decideGeneration(loadRecap(2025, 8, root), hash);
    expect(wednesday.action).toBe("reuse");
    expect(wednesday.reason).toBe("already_published");
  });

  it("reuse returns byte-identical content across repeated builds", () => {
    const hash = sourceHash(CONTEXT);
    const p = saveRecap(envelope(hash), root);
    const first = readFileSync(p, "utf8");
    for (let i = 0; i < 3; i++) {
      const d = decideGeneration(loadRecap(2025, 8, root), hash);
      expect(d.action).toBe("reuse");
    }
    expect(readFileSync(p, "utf8")).toBe(first);
  });

  it("makes no model call when reusing", () => {
    // The gate is pure: reaching a "reuse" decision cannot touch the network.
    const spy = vi.spyOn(globalThis, "fetch" as any);
    const hash = sourceHash(CONTEXT);
    saveRecap(envelope(hash), root);
    decideGeneration(loadRecap(2025, 8, root), hash);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("I. stat correction", () => {
  it("preserves the article and surfaces the hash change", () => {
    const published = sourceHash(CONTEXT);
    saveRecap(envelope(published), root);

    const corrected = sourceHash({ ...CONTEXT, scoring: { topSix: [8, 9, 11, 2, 6, 7] } });
    expect(corrected).not.toBe(published);

    const d = decideGeneration(loadRecap(2025, 8, root), corrected);
    expect(d.action).toBe("reuse");
    expect(d.reason).toBe("source_changed");
    if (d.reason === "source_changed") {
      expect(d.publishedHash).toBe(published);
      expect(d.currentHash).toBe(corrected);
    }
    // and the file is untouched
    expect(loadRecap(2025, 8, root)!.source_data_hash).toBe(published);
  });

  it("regenerates only when explicitly forced", () => {
    const hash = sourceHash(CONTEXT);
    saveRecap(envelope(hash), root);
    const d = decideGeneration(loadRecap(2025, 8, root), sourceHash({ changed: true }), true);
    expect(d).toMatchObject({ action: "generate", reason: "forced" });
  });

  it("hashes canonically, so key order cannot change the result", () => {
    expect(sourceHash({ a: 1, b: 2 })).toBe(sourceHash({ b: 2, a: 1 }));
    expect(sourceHash({ a: [1, 2] })).not.toBe(sourceHash({ a: [2, 1] }));
  });
});

describe("J. failure safety", () => {
  it("a failed validation leaves an existing recap in place", () => {
    const hash = sourceHash(CONTEXT);
    const p = saveRecap(envelope(hash, { title: "The Good One" }), root);
    const before = readFileSync(p, "utf8");

    const broken = article({ title: "CHAOS REIGNS", body: ["short", "short"] });
    const result = validateRecap(broken, opts);
    expect(result.ok).toBe(false);
    // The caller must not write on failure; nothing here does.
    expect(readFileSync(p, "utf8")).toBe(before);
    expect(loadRecap(2025, 8, root)!.recap.title).toBe("The Good One");
  });

  it("malformed JSON on disk reads as absent rather than throwing", () => {
    saveRecap(envelope(sourceHash(CONTEXT)), root);
    writeFileSync(recapPath(2025, 8, root), "{ truncated");
    expect(() => loadRecap(2025, 8, root)).not.toThrow();
    expect(loadRecap(2025, 8, root)).toBeNull();
    // and the gate then treats the week as unpublished rather than crashing
    expect(decideGeneration(loadRecap(2025, 8, root), sourceHash(CONTEXT)).action).toBe("generate");
  });

  it("reports every validation failure at once rather than the first", () => {
    const broken = article({ title: "CHAOS REIGNS", body: ["short", "short"], used_body_fact_ids: ["unknown-id"] });
    const rules = validateRecap(broken, opts).errors.map((e) => e.rule);
    expect(new Set(rules)).toEqual(new Set(["length", "banned_title", "banned_phrase", "unknown_fact_id"]));
  });
});

describe("K. manual generation", () => {
  it("names a predictable, sortable persisted path", () => {
    expect(recapPath(2025, 8, "/repo")).toBe("/repo/data/recaps/2025-week-08.json");
    const p = saveRecap(envelope(sourceHash(CONTEXT)), root);
    expect(p).toBe(recapPath(2025, 8, root));
  });

  it("generates a missing specific week without touching other weeks", () => {
    saveRecap(envelope(sourceHash(CONTEXT)), root);
    expect(decideGeneration(loadRecap(2025, 9, root), sourceHash(CONTEXT)).action).toBe("generate");
    expect(loadRecap(2025, 8, root)).not.toBeNull();
  });
});

describe("historical context boundary", () => {
  const game = (season: string, week: number, points: number): MatchupEntry => ({
    season,
    week,
    rosterId: week,
    points,
    oppRosterId: null,
    oppPoints: null,
    result: null,
    top6: true,
    margin: null,
  });

  it("excludes the target week and future weeks when computing the all-time high", () => {
    const history = [
      game("2024", 14, 160),
      game("2025", 7, 150),
      game("2025", 8, 190),
      game("2025", 10, 200),
      game("2026", 1, 210),
    ];

    const result = historyBeforeWeek(history, "2025", 8);

    expect(result.priorMeetings.map((entry) => [entry.season, entry.week])).toEqual([
      ["2024", 14],
      ["2025", 7],
    ]);
    expect(result.allTimeHighWeek).toEqual({ rosterId: 14, points: 160, season: "2024", week: 14 });
  });
});
