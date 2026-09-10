// Persistence for generated weekly recaps.
//
// The repo is the database: one committed JSON file per week under data/recaps/,
// matching the existing data/raw/ convention. The daily build rebuilds
// bundle.json from scratch, so recaps must live outside it or they would be
// regenerated (and rewritten) every morning.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PersistedRecap } from "./recapSchema.js";

export const RECAP_DIR = "data/recaps";

export const recapFileName = (season: string | number, week: number) =>
  `${season}-week-${String(week).padStart(2, "0")}.json`;

export const recapPath = (season: string | number, week: number, root = process.cwd()) =>
  join(root, RECAP_DIR, recapFileName(season, week));

/**
 * Stable hash of the deterministic source data.
 *
 * Keys are canonicalized so that object insertion order cannot change the hash.
 * Never hash research output, model output, or timestamps.
 */
export function sourceHash(context: unknown): string {
  return createHash("sha256").update(canonical(context)).digest("hex").slice(0, 16);
}

function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
}

export function loadRecap(season: string | number, week: number, root = process.cwd()): PersistedRecap | null {
  const p = recapPath(season, week, root);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as PersistedRecap;
  } catch {
    return null;
  }
}

export function saveRecap(recap: PersistedRecap, root = process.cwd()): string {
  const dir = join(root, RECAP_DIR);
  mkdirSync(dir, { recursive: true });
  const p = recapPath(recap.season, recap.week, root);
  writeFileSync(p, JSON.stringify(recap, null, 2) + "\n");
  return p;
}

/** Every persisted recap for a season, oldest week first. */
export function loadSeasonRecaps(season: string | number, root = process.cwd()): PersistedRecap[] {
  const dir = join(root, RECAP_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith(`${season}-week-`) && f.endsWith(".json"))
    .sort()
    .map((f) => {
      try { return JSON.parse(readFileSync(join(dir, f), "utf8")) as PersistedRecap; } catch { return null; }
    })
    .filter((r): r is PersistedRecap => r != null);
}

/**
 * Compact continuity context for the writer: what recent weeks already did, so
 * jokes, openings and running bits do not repeat. Metadata only, never prose.
 * Shape follows README.md "Recent recap memory".
 */
export function recentRecapContext(
  season: string | number, week: number, lookback = 3, root = process.cwd(),
) {
  const prior = loadSeasonRecaps(season, root)
    .filter((r) => r.week < week && r.week >= week - lookback)
    .sort((a, b) => b.week - a.week);

  return {
    lookback_weeks: prior.map((r) => r.week).sort((a, b) => a - b),
    team_bits: prior.flatMap((r) =>
      (r.recap.team_bits_used ?? []).map((b) => ({ team: b.team, week: r.week, theme: b.theme })),
    ),
    external_references: dedupe(prior.flatMap((r) => r.recap.external_context_used ?? [])),
    opening_mechanisms: prior.map((r) => r.recap.opening_mechanism).filter(Boolean) as string[],
    ending_mechanisms: prior.map((r) => r.recap.ending_mechanism).filter(Boolean) as string[],
    titles: prior.map((r) => r.recap.title),
  };
}

const dedupe = <T>(xs: T[]) => [...new Set(xs)];

/* ------------------------- generation gating (idempotency) ----------------- */

export type GenerationDecision =
  | { action: "reuse"; reason: "already_published"; recap: PersistedRecap }
  | { action: "reuse"; reason: "source_changed"; recap: PersistedRecap; publishedHash: string; currentHash: string }
  | { action: "generate"; reason: "not_published" }
  | { action: "generate"; reason: "forced"; replacing: PersistedRecap | null };

/**
 * Decide whether a scheduled run should generate or reuse.
 *
 * A published recap is always reused, including when the source data has since
 * changed: the article is preserved and the mismatch is surfaced instead. Only
 * an explicit force regenerates.
 */
export function decideGeneration(
  existing: PersistedRecap | null,
  currentHash: string,
  force = false,
): GenerationDecision {
  if (force) return { action: "generate", reason: "forced", replacing: existing };
  if (!existing) return { action: "generate", reason: "not_published" };
  if (existing.source_data_hash !== currentHash) {
    return { action: "reuse", reason: "source_changed", recap: existing, publishedHash: existing.source_data_hash, currentHash };
  }
  return { action: "reuse", reason: "already_published", recap: existing };
}
