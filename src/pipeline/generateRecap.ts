// Weekly recap generator CLI — the entry point for the LLM stages.
//
// Deliberately NOT part of `npm run build:live`: the daily build must never
// depend on generation, and a failure here must never block the data refresh or
// overwrite a published recap.
//
//   npm run recap:context -- --week 8 [--season 2025]
//       Writes the deterministic writer packet: WEEK_DATA, RECENT_RECAP_CONTEXT,
//       the research window, and the prompt paths. No model calls.
//
//   npm run recap:research -- --week 8 --input research.json
//       Validates a research packet against research-output-schema.json and
//       stores it next to the context.
//
//   npm run recap:persist -- --week 8 --article article.json [--force]
//       Validates a finished article against that week's context and publishes.
//
//   npm run recap:status -- --week 8
//       Reports what exists and whether the source data has changed since.
//
// The research / writer / editor stages run in a Claude Code session against
// these files, following docs/weekly-recap/{research,writer,editor}-prompt.md.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { sleeper, fetchLeagueChain } from "../core/sleeper.js";
import { buildRecapContext, RecapContext } from "../core/recapContext.js";
import { recapInputFromSleeper, SleeperLike } from "./recapInput.js";
import {
  validateRecap, validateAgainstSchema, RecapArticle, PersistedRecap, RESEARCH_SCHEMA_PATH, PERSISTED_SCHEMA_PATH,
} from "../core/recapSchema.js";
import { loadRecap, saveRecap, sourceHash, recentRecapContext, recapPath, decideGeneration } from "../core/recapStore.js";
import { computeRecords, MatchRow, MatchupEntry } from "../core/history.js";

const LEAGUE_ID = process.env.LEAGUE_ID || "1312251123628789760";
export const CONTEXT_DIR = "data/recaps/context";

/** Bumped whenever the substance of a prompt file changes. */
export const PROMPT_VERSIONS = {
  research: process.env.RECAP_RESEARCH_PROMPT_VERSION || "recap-research-v1",
  writer: process.env.RECAP_WRITER_PROMPT_VERSION || "recap-writer-v1",
  editor: process.env.RECAP_EDITOR_PROMPT_VERSION || "recap-editor-v1",
};

/** Configurable rather than scattered through the code. */
export const MODELS = {
  research: process.env.RECAP_RESEARCH_MODEL || "claude-code-session",
  writer: process.env.RECAP_WRITER_MODEL || "claude-code-session",
  editor: process.env.RECAP_EDITOR_MODEL || "claude-code-session",
};

type HistoricalMatchup = MatchupEntry & { isPlayoff?: boolean };

/** Build historical recap context using only games completed before the target week. */
export function historyBeforeWeek(
  matchups: HistoricalMatchup[],
  season: string,
  week: number,
) {
  const targetSeason = Number(season);
  const priorMeetings = matchups.filter((game) => {
    const gameSeason = Number(game.season);
    return gameSeason < targetSeason || (gameSeason === targetSeason && game.week < week);
  });
  const high = computeRecords(priorMeetings).highestWeek;
  const allTimeHighWeek = high
    ? { rosterId: high.rosterId, points: high.value, season: high.season, week: high.week! }
    : null;
  return { priorMeetings, allTimeHighWeek };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

export const contextPath = (season: string | number, week: number, root = process.cwd()) =>
  join(root, CONTEXT_DIR, `${season}-week-${String(week).padStart(2, "0")}.json`);
export const researchPath = (season: string | number, week: number, root = process.cwd()) =>
  join(root, CONTEXT_DIR, `${season}-week-${String(week).padStart(2, "0")}.research.json`);

/** Pull everything the context builder needs for one week of one season. */
export async function fetchWeekContext(season: string, week: number): Promise<RecapContext> {
  // A score can look non-zero before Monday Night Football ends. Only the
  // current season needs this check: any week of a past season is already over.
  const state = await sleeper.state();
  if (season === state.season && week >= Number(state.week)) {
    throw new Error(
      `${season} week ${week} is not finished yet (Sleeper's current week is ${state.week}). ` +
      `Wait until the week completes before running recap:context.`,
    );
  }

  const chain = await fetchLeagueChain(LEAGUE_ID);
  const lg = chain.find((l) => l.season === season);
  if (!lg) throw new Error(`No league in the chain for season ${season}`);

  const [users, rosters, matchups, transactions, players] = await Promise.all([
    sleeper.users(lg.league_id),
    sleeper.rosters(lg.league_id),
    sleeper.matchups(lg.league_id, week),
    sleeper.transactions(lg.league_id, week).catch(() => []),
    sleeper.playersNfl().catch(() => ({} as Record<string, any>)),
  ]);
  if (!matchups?.length || !matchups.some((m) => (m.points ?? 0) > 0)) {
    throw new Error(`${season} week ${week} has no scores yet`);
  }

  const regWeeks = (lg.settings.playoff_week_start ?? 15) - 1;
  const rowsByWeek: Record<string, MatchRow[]> = {};
  for (let w = 1; w <= Math.min(week, regWeeks); w++) {
    const ms = w === week ? matchups : await sleeper.matchups(lg.league_id, w).catch(() => []);
    if (!ms?.length || !ms.some((m) => (m.points ?? 0) > 0)) continue;
    rowsByWeek[String(w)] = ms.map((m) => ({ r: m.roster_id, m: m.matchup_id ?? 0, p: m.points ?? 0 }));
  }

  // Historical colour from the already-built bundle. Strictly before this week,
  // so nothing from the future can leak in.
  let priorMeetings: any[] = [];
  let allTimeHighWeek: any = null;
  try {
    const bundle = JSON.parse(readFileSync(join(process.cwd(), "web/data/bundle.json"), "utf8"));
    ({ priorMeetings, allTimeHighWeek } = historyBeforeWeek(
      bundle.history?.matchups ?? [],
      season,
      week,
    ));
  } catch { /* bundle is optional context */ }

  const trimmed: Record<string, { n: string; p: string; t?: string | null }> = {};
  const addPlayer = (pid: string) => {
    const meta = players[pid];
    if (meta && !trimmed[pid]) {
      trimmed[pid] = {
        n: meta.full_name || `${meta.first_name ?? ""} ${meta.last_name ?? ""}`.trim() || pid,
        p: meta.position ?? "", t: meta.team ?? null,
      };
    }
  };
  for (const m of matchups) for (const pid of [...(m.players ?? []), ...(m.starters ?? [])]) addPlayer(pid);
  for (const t of transactions ?? []) for (const pid of [...Object.keys(t.adds ?? {}), ...Object.keys(t.drops ?? {})]) addPlayer(pid);

  const s: SleeperLike = {
    league: lg as any, users: users as any, rosters: rosters as any,
    matchups: matchups as any, transactions: transactions as any, players: trimmed,
  };
  // The window is derived from `season`, not from live NFL state.
  return buildRecapContext(recapInputFromSleeper(s, { season, week, rowsByWeek, priorMeetings, allTimeHighWeek }));
}

/** Validation options derived from a week's context and research packet. */
export function optionsFor(ctx: RecapContext, research?: { candidates: { id: string }[] } | null) {
  return {
    knownFactIds: new Set(ctx.facts.map((f) => f.fact_id)),
    knownExternalIds: research ? new Set(research.candidates.map((c) => c.id)) : undefined,
    knownTeamNames: ctx.teams.map((t) => t.teamName),
    knownHandles: ctx.teams.map((t) => t.handle),
    knownPlayerNames: [
      ...ctx.players.topStarters.map((p) => p.name),
      ...ctx.players.highestBench.map((b) => b.name),
      ...ctx.players.benchBlunders.flatMap((b) => [b.name, b.startedInstead ?? ""]),
      ...ctx.transactions.flatMap((t) => [...t.adds, ...t.drops].map((p) => p.player)),
      // Proper nouns the research packet supplied are legitimately nameable.
      ...(research?.candidates ?? []).flatMap((c: any) =>
        String(c.description ?? "").match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) ?? []),
    ].filter(Boolean),
  };
}

const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));

async function main() {
  const cmd = process.argv[2];
  const season = arg("season") ?? (await sleeper.state()).season;
  const week = Number(arg("week"));
  if (!Number.isFinite(week) || week < 1) {
    console.error("Usage: <context|research|persist|status> --week <n> [--season <yyyy>]");
    process.exit(2);
  }
  const cp = contextPath(season, week);
  const rp = researchPath(season, week);

  /* ------------------------------- status -------------------------------- */
  if (cmd === "status") {
    const existing = loadRecap(season, week);
    console.log(`${season} week ${week}`);
    console.log(`  published: ${existing ? recapPath(season, week) : "no"}`);
    console.log(`  context:   ${existsSync(cp) ? cp : "not built"}`);
    console.log(`  research:  ${existsSync(rp) ? rp : "none"}`);
    if (existing && existsSync(cp)) {
      const d = decideGeneration(existing, sourceHash(readJson(cp).context));
      if (d.action === "reuse" && d.reason === "source_changed") {
        console.log(`  source hash: ${d.publishedHash} -> ${d.currentHash} CHANGED`);
        console.log("  Source data changed since publication. The article is preserved; use --force to regenerate deliberately.");
      } else {
        console.log(`  source hash: ${existing.source_data_hash} (unchanged)`);
      }
      console.log(`  prompts: ${JSON.stringify(existing.prompt_versions)}`);
      console.log(`  models:  ${JSON.stringify(existing.models)}`);
    }
    return;
  }

  /* ------------------------------- context ------------------------------- */
  if (cmd === "context") {
    const existing = loadRecap(season, week);
    if (existing && !flag("force")) {
      console.log(`${season} week ${week} is already published at ${recapPath(season, week)}.`);
      console.log("Reusing it. Pass --force to rebuild the context for regeneration.");
      return;
    }
    const ctx = await fetchWeekContext(season, week);
    const hash = sourceHash(ctx);
    mkdirSync(join(process.cwd(), CONTEXT_DIR), { recursive: true });
    writeFileSync(cp, JSON.stringify({
      season, week,
      publication_date: ctx.publicationDate,
      context_window: ctx.contextWindow,
      source_data_hash: hash,
      prompts: {
        research: "docs/weekly-recap/research-prompt.md",
        writer: "docs/weekly-recap/writer-prompt.md",
        editor: "docs/weekly-recap/editor-prompt.md",
      },
      context: ctx,
      recent_recap_context: recentRecapContext(season, week),
    }, null, 2) + "\n");
    if (existing) console.warn(`  note: overwriting context for an already-published week (--force)`);
    console.log(`Wrote ${cp}`);
    console.log(`  ${ctx.matchups.length} matchups, ${ctx.facts.length} story candidates, hash ${hash}`);
    console.log(`  window ${ctx.contextWindow.start} to ${ctx.contextWindow.end}, publishes ${ctx.publicationDate}`);
    console.log(`  top candidates: ${ctx.facts.slice(0, 3).map((f) => f.fact_id).join(", ")}`);
    return;
  }

  /* ------------------------------- research ------------------------------ */
  if (cmd === "research") {
    const input = arg("input");
    if (!input) { console.error("--input <path> is required"); process.exit(2); }
    const packet = readJson(input!);
    const issues = validateAgainstSchema(packet, RESEARCH_SCHEMA_PATH);
    if (issues.length) {
      console.error("Research packet failed research-output-schema.json:");
      for (const i of issues) console.error(`  [${i.rule}] ${i.detail}`);
      process.exit(1);
    }
    mkdirSync(join(process.cwd(), CONTEXT_DIR), { recursive: true });
    writeFileSync(rp, JSON.stringify(packet, null, 2) + "\n");
    console.log(`Wrote ${rp} (${packet.candidates.length} candidates, ${packet.window_start} to ${packet.window_end})`);
    return;
  }

  /* ------------------------------- persist ------------------------------- */
  if (cmd === "persist") {
    const articleFile = arg("article");
    if (!articleFile) { console.error("--article <path> is required"); process.exit(2); }
    if (!existsSync(cp)) { console.error(`No context at ${cp}. Run recap:context first.`); process.exit(2); }

    const packet = readJson(cp) as { context: RecapContext; source_data_hash: string };
    const research = existsSync(rp) ? readJson(rp) : null;
    const article = readJson(articleFile!) as RecapArticle;

    const result = validateRecap(article, optionsFor(packet.context, research));
    for (const w of result.warnings) console.warn(`  warn  [${w.rule}] ${w.detail}`);
    if (!result.ok) {
      console.error(`Validation failed for ${season} week ${week}. Nothing was written.`);
      for (const e of result.errors) console.error(`  error [${e.rule}] ${e.detail}`);
      process.exit(1);
    }

    const existing = loadRecap(season, week);
    if (existing && !flag("force")) {
      console.error(`${season} week ${week} is already published. Pass --force to replace it.`);
      process.exit(1);
    }

    const persisted: PersistedRecap = {
      season: Number(season), week,
      generated_at: new Date().toISOString(),
      source_data_hash: packet.source_data_hash,
      prompt_versions: { ...PROMPT_VERSIONS },
      models: { ...MODELS },
      recap: article,
    };
    const envelopeIssues = validateAgainstSchema(persisted, PERSISTED_SCHEMA_PATH);
    if (envelopeIssues.length) {
      console.error("Envelope failed persisted-recap-schema.json:");
      for (const i of envelopeIssues) console.error(`  [${i.rule}] ${i.detail}`);
      process.exit(1);
    }

    const out = saveRecap(persisted);
    console.log(`Published ${season} week ${week} -> ${out}`);
    console.log(`  ${result.stats.bodyWords} words, ${result.stats.paragraphs} paragraphs, ` +
      `${result.stats.forTheRecord} for-the-record, ${result.stats.externalRefs} external refs`);
    console.log(`  prompts ${JSON.stringify(PROMPT_VERSIONS)} models ${JSON.stringify(MODELS)}`);
    return;
  }

  console.error("Unknown command. Use: context | research | persist | status");
  process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
