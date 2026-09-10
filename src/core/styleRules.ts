// Style rules parsed out of the permanent writer prompt.
//
// implementation-notes.md: "Use the permanent writer prompt's explicit banned
// phrase list as a configurable validator list." Parsing the list from the
// prompt at validation time keeps docs/weekly-recap/writer-prompt.md
// authoritative, so the two cannot drift.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const WRITER_PROMPT_PATH = "docs/weekly-recap/writer-prompt.md";

export interface StyleRules {
  /** Multi-word stock phrases. A match is an error. */
  bannedPhrases: string[];
  /** Single common words the prompt flags. A match is a warning, not an error,
   *  because the prompt itself allows for unavoidable normal English. */
  discouragedWords: string[];
  /** Headline styles the prompt bans outright. */
  bannedTitles: string[];
}

/** Quoted entries under a `# N. HEADING` section of the prompt. */
function quotedUnder(markdown: string, headingPattern: RegExp): string[] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => headingPattern.test(l));
  if (start === -1) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,3} /.test(lines[i])) break; // next section
    const m = lines[i].trim().match(/^"(.+)"$/);
    if (m) out.push(m[1]);
  }
  return out;
}

/**
 * Read the banned-phrase and banned-title lists out of the writer prompt.
 * Falls back to empty lists if the prompt is missing, so validation still runs
 * its structural rules rather than failing outright.
 */
export function loadStyleRules(root = process.cwd()): StyleRules {
  const p = join(root, WRITER_PROMPT_PATH);
  if (!existsSync(p)) return { bannedPhrases: [], discouragedWords: [], bannedTitles: [] };
  const md = readFileSync(p, "utf8");

  const banned = quotedUnder(md, /^#\s*\d+\.\s*BANNED AI AND SPORTS-COPY PHRASES/i);
  const titles = quotedUnder(md, /^#\s*\d+\.\s*OUTPUT/i);
  // §42 lists construction patterns and empty intensifiers as quoted examples.
  const habits = quotedUnder(md, /^#\s*\d+\.\s*OTHER STYLE HABITS TO AVOID/i);

  // A single common word ("chaos", "meanwhile") cannot be a hard error: the
  // prompt says some are unavoidable in normal English. Multi-word phrases can.
  const bannedPhrases: string[] = [];
  const discouragedWords: string[] = [];
  for (const entry of banned) {
    (entry.trim().includes(" ") ? bannedPhrases : discouragedWords).push(entry.trim());
  }
  // Empty intensifiers from §42 are multi-word and safe to enforce.
  for (const h of habits) if (h.trim().includes(" ")) bannedPhrases.push(h.trim());

  return {
    bannedPhrases: dedupe(bannedPhrases),
    discouragedWords: dedupe(discouragedWords),
    bannedTitles: dedupe(titles.map((t) => t.trim())),
  };
}

const dedupe = (xs: string[]) => [...new Set(xs.map((x) => x.toLowerCase()))];

/** "It's not X, it's Y" / "This isn't X. It's Y." / "Not X, but Y." */
export const NOT_X_BUT_Y = /\b(?:it(?:'|’)?s not|this isn(?:'|’)?t|not)\b[^.!?]{2,60}?,?\s*(?:it(?:'|’)?s|but)\b/i;

/** Scores written as a hyphenated pair, e.g. "129.63-99.35". */
export const HYPHENATED_SCORE = /\d+\.\d+\s*[-‐-―]\s*\d+\.\d+/;

/** Emoji, which §42 bans outright. */
export const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
