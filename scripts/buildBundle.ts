// Offline bundle builder (preview). Computes full 2025 standings/power/history
// from real matchups via the validated engine, attaches team logos, and writes
// web/data/bundle.json. The live pipeline mirrors this across all seasons.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { LEAGUE, TEAMS, AVATARS, teamByRoster, STANDINGS_2025_FINAL } from "../src/data/league.js";
import { TeamWeek } from "../src/core/types.js";
import { computeWeeklyResults, computeStandings } from "../src/core/standings.js";
import { computeHistory, computeRecords, SeasonInput, MatchRow, MatchupEntry } from "../src/core/history.js";
import { round } from "../src/core/stats.js";
import { buildBundleDocument, buildSeasonBundle, scheduleWeeksFromRows } from "../src/pipeline/bundle.js";
import { marked } from "marked";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = (f: string) => JSON.parse(readFileSync(join(ROOT, "data/raw", f), "utf8"));
const matchups2025: Record<string, MatchRow[]> = raw("matchups2025.json");
const brackets2025 = raw("brackets2025.json");
const playoffs2025: Record<string, { r: number; m: number | null; p: number }[]> = raw("playoffs2025.json");
const schedule2026: Record<string, { r: number; m: number }[]> = raw("schedule2026.json");
const playerBests2025 = raw("playerbests2025.json");

const teams = TEAMS.map((t) => ({ ...t, avatar: AVATARS[t.ownerId] ?? null }));

// ---- 2025 standings from real pairings (validated vs the sheet) ----
const weeks2025: TeamWeek[] = [];
for (const [wk, rows] of Object.entries(matchups2025))
  for (const r of rows) weeks2025.push({ rosterId: r.r, week: Number(wk), points: r.p, matchupId: r.m });
const results2025 = computeWeeklyResults(weeks2025);
const std2025 = computeStandings(results2025);

// cross-check against the sheet's final numbers
let mism = 0;
for (const s of std2025) {
  const t = teamByRoster.get(s.rosterId)!;
  const sheet = STANDINGS_2025_FINAL.find((x) => x.handle === t.handle)!;
  if (Math.abs(s.wins - sheet.wins) > 0.01 || Math.abs(round(s.pointsFor, 2) - sheet.pf) > 0.05 || s.h2hWins !== sheet.h2hW) {
    mism++; console.warn(`  MISMATCH ${t.handle}: computed ${s.wins}W ${round(s.pointsFor,2)}PF ${s.h2hWins}H2H vs sheet ${sheet.wins}W ${sheet.pf}PF ${sheet.h2hW}H2H`);
  }
}
console.log(mism === 0 ? "✓ 2025 standings match the sheet exactly (from live matchups)" : `⚠ ${mism} mismatches`);

// ---- canonical season payload ----
// Historical fixture builds do not have an authoritative weekly roster-value
// snapshot, so the existing neutral roster-score behavior is retained. The
// other factors and all output fields now use exactly the same code as live.
const season2025 = buildSeasonBundle({
  season: "2025",
  complete: true,
  rowsByWeek: matchups2025,
  teams,
  rosterScores: new Map(),
  root: ROOT,
});
const standings2025 = season2025.standings;
const power2025 = season2025.power;

// ---- history (all-time; 2025 only so far) ----
const finishByRoster: Record<number, number> = {};
standings2025.forEach((s) => (finishByRoster[s.rosterId] = s.rank));
const seasonsInput: SeasonInput[] = [{ season: "2025", weeks: matchups2025, finishByRoster }];
const hist = computeHistory(seasonsInput);
// attach real best-player-week per team (2025)
for (const [rid, b] of Object.entries(playerBests2025.byRoster)) if (hist.byRoster[Number(rid)]) (hist.byRoster[Number(rid)] as any).bestPlayerWeek = b;

const nm = (rid: number) => { const t = teamByRoster.get(rid)!; return { handle: t.handle, teamName: t.teamName }; };

// trophies (dead-last = worst regular-season finish)
const deadLast = standings2025[standings2025.length - 1].rosterId;
const trophies2025 = { ...brackets2025.trophies, deadLast };
const trophiesByRoster: Record<number, { season: string; trophy: string }[]> = {};
const addTrophy = (rid: number, trophy: string) => ((trophiesByRoster[rid] ||= []).push({ season: "2025", trophy }));
addTrophy(trophies2025.champion, "Champion");
addTrophy(trophies2025.runnerUp, "Runner-Up");
addTrophy(trophies2025.third, "3rd Place");
addTrophy(trophies2025.toiletBowl, "Toilet Bowl");
addTrophy(deadLast, "Dead Last (Reg.)");

// playoff matchup entries → appended to the log (not counted in reg-season records)
function playoffEntries(rowsByWeek: Record<string, { r: number; m: number | null; p: number }[]>, season: string): MatchupEntry[] {
  const entries: any[] = [];
  for (const [wk, rows] of Object.entries(rowsByWeek)) {
    const week = Number(wk);
    const byM = new Map<number, { r: number; p: number }[]>();
    for (const r of rows) { if (r.m == null) continue; if (!byM.has(r.m)) byM.set(r.m, []); byM.get(r.m)!.push({ r: r.r, p: r.p }); }
    for (const pair of byM.values()) {
      if (pair.length < 2) continue;
      for (const r of pair) {
        const opp = pair.find((x) => x.r !== r.r)!;
        entries.push({ season, week, rosterId: r.r, points: r.p, oppRosterId: opp.r, oppPoints: opp.p,
          result: r.p > opp.p ? "W" : r.p < opp.p ? "L" : "T", top6: false, margin: +(r.p - opp.p).toFixed(2),
          isPlayoff: true, round: week === 15 ? "Playoff R1" : week === 16 ? "Semifinal" : "Final round" });
      }
    }
  }
  return entries;
}
const allMatchups = [
  ...hist.matchups.map((m) => ({ ...m, isPlayoff: false, round: null })),
  ...playoffEntries(playoffs2025, "2025"),
];

const history = {
  seasons: [{
    season: "2025", leagueId: "1253912888536481792", complete: true,
    champion: nm(trophies2025.champion), runnerUp: nm(trophies2025.runnerUp), third: nm(trophies2025.third),
    regularSeasonNo1: { handle: standings2025[0].handle, teamName: standings2025[0].teamName },
    standings: standings2025.map((s) => ({ rank: s.rank, handle: s.handle, teamName: s.teamName, record: `${s.wins}-${s.losses}`, pf: s.pf })),
    bracket: brackets2025.championship, placements: brackets2025.placements,
    trophies: { champion: trophies2025.champion, runnerUp: trophies2025.runnerUp, third: trophies2025.third, toiletBowl: trophies2025.toiletBowl, deadLast },
    seeds: standings2025.map((s) => s.rosterId),
  }],
  champsByRoster: { [trophies2025.champion]: ["2025"] } as Record<number, string[]>,
  trophiesByRoster,
  records: computeRecords(allMatchups as any),
  recordPlayerWeek: playerBests2025.leagueRecord,
  allTime: hist.byRoster,
  matchups: allMatchups,
};

// 2026 schedule
const schedule = { season: "2026", playoffStart: 15, weeks: scheduleWeeksFromRows(schedule2026) };

const bundle = buildBundleDocument({
  generatedAt: null,
  league: LEAGUE,
  state: { season: "2026", week: 2, seasonType: "pre", inSeason: false, recapSeason: "2025", recapWeek: 14 },
  teams,
  players: {},
  seasons: { "2025": season2025 },
  transactions: [],
  history,
  schedule,
  rulebook: {
    updated: "June 9, 2026",
    html: marked.parse(readFileSync(join(ROOT, "data/raw/rulebook.md"), "utf8").replace(/^# .*\nLast updated:.*\n/, "")) as string,
    proposed: [] as { title: string; note?: string }[],
  },
  meta: { note: "Preseason — 2026 standings/power/transactions light up at Week 1. Homepage recap shows the 2025 finale until then." },
});

mkdirSync(join(ROOT, "web/data"), { recursive: true });
writeFileSync(join(ROOT, "web/data/bundle.json"), JSON.stringify(bundle));
console.log(`Wrote bundle. 2025 champ New England Keys; power #1 ${power2025[0].handle}; history teams ${Object.keys(hist.byRoster).length}; matchup log ${hist.matchups.length}`);
