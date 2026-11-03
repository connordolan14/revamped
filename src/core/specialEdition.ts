// Special editions: hand-edited reports that take a week's place in the weekly
// recap (e.g. the Week 8 midseason report).
//
// One committed JSON file per week under data/recaps/specials/, published
// verbatim like a human-written recap. The bundle attaches it to that week's
// recap entry, so the homepage week selector treats it as just another week.
// The content is structured blocks (prose, tables, chart data) rather than a
// RecapArticle, so it bypasses the article schema and validator.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { RECAP_DIR, recapFileName } from "./recapStore.js";

export const SPECIAL_DIR = join(RECAP_DIR, "specials");

/** Block types the homepage renderer (web/app.js) knows how to draw. */
export const SPECIAL_BLOCK_TYPES = [
  "p", "sub", "powerChart", "reportCards", "playoffOdds",
  "table", "stats", "barList", "awards", "fixtures",
] as const;

export interface SpecialBlock { type: (typeof SPECIAL_BLOCK_TYPES)[number]; [k: string]: unknown; }
export interface SpecialSection { id: string; title: string; blocks: SpecialBlock[]; }
export interface SpecialEdition {
  season: number;
  week: number;
  kicker: string;
  title: string;
  intro: string[];
  lead: { title: string; body: string[] };
  teamShort: Record<string, string>;
  sections: SpecialSection[];
}

export const specialPath = (season: string | number, week: number, root = process.cwd()) =>
  join(root, SPECIAL_DIR, recapFileName(season, week));

/** Structural problems that would break rendering; empty when the file is usable. */
export function specialEditionIssues(doc: unknown): string[] {
  const issues: string[] = [];
  const d = doc as Partial<SpecialEdition> | null;
  if (!d || typeof d !== "object") return ["not an object"];
  if (!Number.isInteger(d.season)) issues.push("season must be an integer");
  if (!Number.isInteger(d.week)) issues.push("week must be an integer");
  if (!d.title) issues.push("title is required");
  if (!Array.isArray(d.intro)) issues.push("intro must be an array of paragraphs");
  if (!d.lead || !Array.isArray(d.lead.body)) issues.push("lead.body must be an array of paragraphs");
  if (!Array.isArray(d.sections) || !d.sections.length) return [...issues, "sections must be a non-empty array"];
  const ids = new Set<string>();
  for (const [i, s] of d.sections.entries()) {
    if (!s.id || !s.title) issues.push(`sections[${i}] needs an id and a title`);
    if (ids.has(s.id)) issues.push(`sections[${i}] duplicates id "${s.id}"`);
    ids.add(s.id);
    for (const [j, b] of (s.blocks ?? []).entries()) {
      if (!SPECIAL_BLOCK_TYPES.includes(b.type)) issues.push(`sections[${i}].blocks[${j}] has unknown type "${b.type}"`);
    }
  }
  return issues;
}

export function loadSpecialEdition(season: string | number, week: number, root = process.cwd()): SpecialEdition | null {
  const p = specialPath(season, week, root);
  if (!existsSync(p)) return null;
  const doc = JSON.parse(readFileSync(p, "utf8"));
  const issues = specialEditionIssues(doc);
  if (issues.length) throw new Error(`${p} is invalid: ${issues.join("; ")}`);
  return doc as SpecialEdition;
}

/**
 * Every special edition for a season, keyed by week. A broken file is skipped
 * with a warning rather than thrown: the daily data refresh must not fail over
 * editorial content (tests/specialEdition.test.ts catches it before merge).
 */
export function loadSeasonSpecialEditions(season: string | number, root = process.cwd()): Map<number, SpecialEdition> {
  const dir = join(root, SPECIAL_DIR);
  const out = new Map<number, SpecialEdition>();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((f) => f.startsWith(`${season}-week-`) && f.endsWith(".json")).sort()) {
    const week = Number(f.slice(`${season}-week-`.length, -".json".length));
    try {
      const doc = loadSpecialEdition(season, week, root);
      if (doc) out.set(week, doc);
    } catch (e) {
      console.warn(`[specialEdition] skipping ${f}: ${(e as Error).message}`);
    }
  }
  return out;
}
