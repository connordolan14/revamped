// Stage 6: deterministic validation of a generated recap.
//
// Structure is validated against docs/weekly-recap/output-schema.json itself,
// rather than a hand-written copy of it, so the published schema stays the
// single source of truth. Editorial rules from the writer prompt (§15 banned phrases, §14 style habits) and
// the acceptance tests layer on top.
//
// Errors block publication. Warnings are surfaced but do not block, and cover
// checks that are inherently fuzzy.

import { readFileSync } from "node:fs";
import { join } from "node:path";
// The published schemas declare draft 2020-12, so use Ajv's 2020 build.
import Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import { loadStyleRules, StyleRules, HYPHENATED_SCORE, NOT_X_BUT_Y, EMOJI } from "./styleRules.js";

export const OUTPUT_SCHEMA_PATH = "docs/weekly-recap/output-schema.json";
export const PERSISTED_SCHEMA_PATH = "docs/weekly-recap/persisted-recap-schema.json";
export const RESEARCH_SCHEMA_PATH = "docs/weekly-recap/research-output-schema.json";

/** The writer/editor output, matching output-schema.json. */
export interface RecapArticle {
  title: string;
  body: string[];
  for_the_record: { text: string; fact_ids: string[] }[];
  used_body_fact_ids: string[];
  external_context_used: string[];
  team_bits_used: { team: string; theme: string }[];
  opening_mechanism?: string | null;
  ending_mechanism?: string | null;
}

/** The persisted envelope, matching persisted-recap-schema.json. */
export interface PersistedRecap {
  season: number;
  week: number;
  generated_at: string;
  source_data_hash: string;
  prompt_versions: { research: string; writer: string; editor: string };
  models: { research: string; writer: string; editor: string };
  recap: RecapArticle;
}

export interface ValidationIssue { rule: string; detail: string; }
export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  stats: { bodyWords: number; paragraphs: number; forTheRecord: number; externalRefs: number };
}

export interface ValidateOptions {
  knownFactIds: Set<string>;
  knownExternalIds?: Set<string>;
  /**
   * External-candidate id -> category (from the research packet). Real NFL
   * box-score/record context for players already in WEEK_DATA is expected
   * and uncapped; only non-NFL "cultural" references (other sports,
   * celebrities, memes) count against maxExternalRefs. If omitted, every
   * entry in external_context_used counts toward the cap (old behavior).
   */
  externalCategories?: Map<string, string>;
  knownTeamNames?: string[];
  knownHandles?: string[];
  knownPlayerNames?: string[];
  /** Body only, footer excluded. Hard range 600-800. */
  minWords?: number;
  maxWords?: number;
  minForTheRecord?: number;
  maxForTheRecord?: number;
  /** Cap applies only to non-NFL cultural references; see externalCategories. */
  maxExternalRefs?: number;
  /**
   * Minimum share of supplied tier-one (NFL) research candidates that must
   * actually appear in external_context_used. Research is uncapped precisely
   * so it gets used; a draft that fetches seven real box-score facts and
   * uses one isn't under-cap, it's under-researched in practice. Requires
   * externalCategories. Default 0.5.
   */
  minTierOneUsageRatio?: number;
  /**
   * Each week's matchups as schedule order + identifying strings per side
   * (team name and handle). Used only for the matchup_march_structure
   * heuristic below; omit to skip that check.
   */
  matchups?: { a: string[]; b: string[] }[];
  /** Allow a footer item to reuse a fact the body already used. */
  allowFactReuse?: boolean;
  styleRules?: StyleRules;
  repoRoot?: string;
}

const DEFAULTS = {
  minWords: 600, maxWords: 800,
  minForTheRecord: 3, maxForTheRecord: 5,
  maxExternalRefs: 2,
  minTierOneUsageRatio: 0.5,
};

const wordCount = (s: string) => (s.trim().match(/\S+/g) ?? []).length;

/* ------------------------------ schema loading ----------------------------- */

const ajv = new Ajv2020({ allErrors: true, strict: false });
const compiled = new Map<string, ValidateFunction>();
const registered = new Set<string>();

/**
 * Register a schema under its bare filename so sibling $refs resolve.
 * persisted-recap-schema.json refers to `output-schema.json` by relative name.
 */
function register(schemaPath: string, root: string) {
  const file = schemaPath.split("/").pop()!;
  if (registered.has(file)) return;
  registered.add(file);
  ajv.addSchema(JSON.parse(readFileSync(join(root, schemaPath), "utf8")), file);
}

export function schemaValidator(schemaPath: string, root = process.cwd()): ValidateFunction {
  const key = join(root, schemaPath);
  let v = compiled.get(key);
  if (!v) {
    for (const p of [OUTPUT_SCHEMA_PATH, RESEARCH_SCHEMA_PATH, PERSISTED_SCHEMA_PATH]) register(p, root);
    v = ajv.getSchema(schemaPath.split("/").pop()!)!;
    compiled.set(key, v);
  }
  return v;
}

/** Validate any object against one of the published schemas. */
export function validateAgainstSchema(obj: unknown, schemaPath: string, root = process.cwd()): ValidationIssue[] {
  const v = schemaValidator(schemaPath, root);
  if (v(obj)) return [];
  return (v.errors ?? []).map((e) => ({
    rule: "schema",
    detail: `${e.instancePath || "/"} ${e.message ?? "is invalid"}`,
  }));
}

/* -------------------------------- validation ------------------------------- */

export function validateRecap(article: unknown, opts: ValidateOptions): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const cfg = { ...DEFAULTS, ...opts };
  const root = opts.repoRoot ?? process.cwd();
  const style = opts.styleRules ?? loadStyleRules(root);
  const err = (rule: string, detail: string) => errors.push({ rule, detail });
  const warn = (rule: string, detail: string) => warnings.push({ rule, detail });

  const empty = { bodyWords: 0, paragraphs: 0, forTheRecord: 0, externalRefs: 0 };

  // Structure first, straight from output-schema.json.
  const schemaErrors = validateAgainstSchema(article, OUTPUT_SCHEMA_PATH, root);
  if (schemaErrors.length) return { ok: false, errors: schemaErrors, warnings, stats: empty };

  const a = article as RecapArticle;
  const bodyText = a.body.join("\n\n");
  const ftrText = a.for_the_record.map((f) => f.text).join("\n");
  const prose = `${bodyText}\n${ftrText}`;
  const allText = `${a.title}\n${prose}`;
  const bodyWords = wordCount(bodyText);
  const stats = {
    bodyWords, paragraphs: a.body.length,
    forTheRecord: a.for_the_record.length,
    externalRefs: a.external_context_used.length,
  };

  /* ---- length ---- */
  if (bodyWords < cfg.minWords) err("length", `body is ${bodyWords} words, minimum ${cfg.minWords}`);
  if (bodyWords > cfg.maxWords) err("length", `body is ${bodyWords} words, maximum ${cfg.maxWords}`);

  /* ---- external references ---- */
  // Real NFL context for players already in WEEK_DATA is uncapped; only
  // non-NFL "cultural" references count toward the limit.
  const culturalRefs = opts.externalCategories
    ? a.external_context_used.filter((id) => (opts.externalCategories!.get(id) ?? "").toUpperCase() !== "NFL")
    : a.external_context_used;
  if (culturalRefs.length > cfg.maxExternalRefs) {
    err("external_refs", `${culturalRefs.length} non-NFL cultural references, maximum ${cfg.maxExternalRefs}`);
  }

  // Tier-one (NFL) research is uncapped so it gets used. A draft that fetched
  // real box-score/milestone facts and then barely touched them isn't a
  // stylistic quibble — it's the difference between the Week 1 draft that got
  // rejected (1 of 7 candidates used) and the one that replaced it (used all
  // 8 supplied). Enforce a floor rather than trusting the writer to remember.
  if (opts.knownExternalIds && opts.externalCategories) {
    const nflCandidates = [...opts.knownExternalIds].filter(
      (id) => (opts.externalCategories!.get(id) ?? "").toUpperCase() === "NFL",
    );
    if (nflCandidates.length) {
      const nflUsed = a.external_context_used.filter((id) => nflCandidates.includes(id));
      const minRequired = Math.max(1, Math.ceil(nflCandidates.length * cfg.minTierOneUsageRatio));
      if (nflUsed.length < minRequired) {
        err(
          "underused_research",
          `research surfaced ${nflCandidates.length} real NFL box-score/milestone facts but the recap used only ${nflUsed.length} (minimum ${minRequired}). Tier-one context is uncapped so it gets used — go back through EXTERNAL_CONTEXT and weave in more of it.`,
        );
      }
    }
  }

  // A draft where every paragraph maps 1:1 onto one matchup, in schedule
  // order, with no other team mentioned, is the "six matchup capsules"
  // structure the writer prompt explicitly bans — the exact shape of the
  // Week 1 draft that got rejected. Fuzzy (a short week can coincidentally
  // match), so this is a warning, not a hard failure.
  if (opts.matchups?.length && a.body.length === opts.matchups.length) {
    const paraLower = a.body.map((p) => p.toLowerCase());
    let exclusiveMatches = 0;
    opts.matchups.forEach((m, i) => {
      const para = paraLower[i];
      const mentionsA = m.a.some((name) => name && para.includes(name.toLowerCase()));
      const mentionsB = m.b.some((name) => name && para.includes(name.toLowerCase()));
      const mentionsOther = opts.matchups!.some((other, j) => {
        if (j === i) return false;
        return [...other.a, ...other.b].some((name) => name && para.includes(name.toLowerCase()));
      });
      if (mentionsA && mentionsB && !mentionsOther) exclusiveMatches++;
    });
    if (exclusiveMatches === opts.matchups.length) {
      warn(
        "matchup_march_structure",
        "every paragraph maps 1:1 onto a single matchup, in schedule order, with no cross-references — restructure around 2-4 real threads instead of one paragraph per game",
      );
    }
  }

  /* ---- typography and formatting ---- */
  if (allText.includes("—")) err("em_dash", "em dash is not allowed");
  const score = allText.match(HYPHENATED_SCORE);
  if (score) err("score_format", `hyphenated score "${score[0]}", write it as "129.63 to 99.35"`);
  if (EMOJI.test(allText)) err("emoji", "emoji are not allowed");
  if (/#[A-Za-z]/.test(allText)) err("hashtag", "hashtags are not allowed");
  const notXButY = prose.match(NOT_X_BUT_Y);
  if (notXButY) warn("not_x_but_y", `"It's not X, it's Y" construction: "${notXButY[0].slice(0, 50)}"`);

  /* ---- title ---- */
  const titleLower = a.title.trim().toLowerCase();
  if (style.bannedTitles.includes(titleLower)) err("banned_title", `"${a.title}" is a banned headline`);
  if (a.title === a.title.toUpperCase() && /[A-Z]{4,}/.test(a.title)) {
    err("banned_title", "all-caps headlines are not allowed");
  }

  /* ---- banned phrases (writer prompt §15/§14) ---- */
  const lower = allText.toLowerCase();
  for (const p of style.bannedPhrases) if (lower.includes(p)) err("banned_phrase", `contains "${p}"`);
  for (const w of style.discouragedWords) {
    if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(allText)) {
      warn("discouraged_word", `contains "${w}"`);
    }
  }

  /* ---- referential integrity ---- */
  const bodyFacts = new Set(a.used_body_fact_ids);
  for (const id of a.used_body_fact_ids) {
    if (!opts.knownFactIds.has(id)) err("unknown_fact_id", `used_body_fact_ids contains unknown "${id}"`);
  }
  for (const [i, item] of a.for_the_record.entries()) {
    for (const id of item.fact_ids) {
      // A footer fact_id may point at a local WEEK_DATA fact or a researched
      // external candidate (e.g. a real NFL milestone with no local fact of
      // its own) — either is a legitimate, checkable source.
      const known = opts.knownFactIds.has(id) || (opts.knownExternalIds?.has(id) ?? false);
      if (!known) err("unknown_fact_id", `for_the_record[${i}] contains unknown "${id}"`);
      if (!cfg.allowFactReuse && bodyFacts.has(id)) {
        err("fact_reuse", `for_the_record[${i}] reuses "${id}" already used in the body`);
      }
    }
  }
  if (opts.knownExternalIds) {
    for (const id of a.external_context_used) {
      if (!opts.knownExternalIds.has(id)) err("unknown_external_id", `unknown external context id "${id}"`);
    }
  } else if (a.external_context_used.length) {
    err("unknown_external_id", "external_context_used is non-empty but no research packet was supplied");
  }

  /* ---- metadata must not leak into prose ---- */
  const leak = allText.match(/\b\d{4}-w\d{2}-[a-z0-9-]+\b/i);
  if (leak) err("metadata_leak", `prose contains a fact ID "${leak[0]}"`);

  /* ---- duplication ---- */
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const seen = new Map<string, number>();
  for (const s of [...a.body, ...a.for_the_record.map((f) => f.text)]) {
    for (const sentence of s.split(/(?<=[.!?])\s+/)) {
      const n = norm(sentence);
      if (n.length < 25) continue;
      seen.set(n, (seen.get(n) ?? 0) + 1);
    }
  }
  for (const [s, n] of seen) if (n > 1) err("duplication", `sentence repeated ${n} times: "${s.slice(0, 60)}..."`);

  /* ---- proper nouns (fuzzy: warnings, except handles) ---- */
  const known = new Set(
    [...(opts.knownTeamNames ?? []), ...(opts.knownHandles ?? []), ...(opts.knownPlayerNames ?? [])]
      .flatMap((n) => [n.toLowerCase(), ...n.toLowerCase().split(/\s+/)]),
  );
  if (known.size) {
    for (const h of allText.match(/@[A-Za-z0-9_]+/g) ?? []) {
      if (!known.has(h.slice(1).toLowerCase())) err("unknown_handle", `unknown handle ${h}`);
    }
    const stop = new Set(["the", "a", "an", "and", "but", "for", "week", "it", "he", "they", "this", "that", "his", "her", "their", "no", "if", "so", "then", "when", "what", "who", "how", "why", "now", "still", "just", "one", "two", "three", "first", "last", "next", "top", "league", "sunday", "monday", "tuesday", "points", "bench", "start", "started", "won", "lost", "beat", "great", "our"]);
    for (const m of prose.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) ?? []) {
      const tokens = m.toLowerCase().split(/\s+/);
      if (tokens.every((t) => stop.has(t))) continue;
      if (tokens.some((t) => known.has(t))) continue;
      warn("unverified_proper_noun", `"${m}" does not match a known team, handle, or player`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, stats };
}
