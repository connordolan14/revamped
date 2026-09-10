// LIVE pipeline — runs in GitHub Actions weekly (and on demand). Fetches
// Sleeper + FantasyCalc, computes the SAME bundle shape as scripts/buildBundle.ts
// using the validated core engine, across all seasons in the league chain.
// Run: npx tsx src/pipeline/buildLive.ts   (env: LEAGUE_ID, GEN_TS optional)
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { sleeper, fetchLeagueChain, SleeperUser, SleeperRoster } from "../core/sleeper.js";
import { fetchDynastyValues, rosterValue } from "../core/fantasycalc.js";
import { TeamWeek } from "../core/types.js";
import { computeWeeklyResults, computeStandings } from "../core/standings.js";
import { computePowerRankings, TeamFactors } from "../core/power.js";
import { computeHistory, computeRecords, SeasonInput, MatchRow } from "../core/history.js";
import { computeRecaps } from "../core/recap.js";
import { round } from "../core/stats.js";
import { readFileSync } from "node:fs";
import { marked } from "marked";

const LEAGUE_ID = process.env.LEAGUE_ID || "1312251123628789760";
const GEN_TS = process.env.GEN_TS || null;

interface TeamInfo { rosterId: number; ownerId: string; handle: string; teamName: string; avatar: string | null; }

function teamsFromLeague(users: SleeperUser[], rosters: SleeperRoster[]): TeamInfo[] {
  const byId = new Map(users.map((u) => [u.user_id, u]));
  return rosters.map((r) => {
    const u = r.owner_id ? byId.get(r.owner_id) : undefined;
    const av = u?.metadata?.avatar || (u?.avatar ? sleeper.avatarUrl(u.avatar) : null);
    return {
      rosterId: r.roster_id, ownerId: r.owner_id ?? "",
      handle: u?.display_name ?? `roster ${r.roster_id}`,
      teamName: u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`,
      avatar: av,
    };
  });
}

interface SeasonData {
  season: string; leagueId: string; complete: boolean;
  rowsByWeek: Record<string, MatchRow[]>;
  teams: TeamInfo[];
  playerBest: Map<number, { name: string; playerId: string | null; points: number; season: string; week: number }>;
}

// A week only "counts" once every roster has posted a full score. Below this
// floor the week is still in progress (or hasn't started) — folding partial
// totals into standings/power would badly distort them. Lowest real weekly
// score on record is ~50, so 40 clears every finished week.
const WEEK_COMPLETE_FLOOR = 40;

async function fetchSeason(leagueId: string, season: string, complete: boolean, regWeeks: number, teams: TeamInfo[], players: Record<string, any>, liveWeek = Number.POSITIVE_INFINITY): Promise<SeasonData> {
  const rowsByWeek: Record<string, MatchRow[]> = {};
  const playerBest = new Map<number, { name: string; playerId: string | null; points: number; season: string; week: number }>();
  for (let w = 1; w <= regWeeks; w++) {
    let ms; try { ms = await sleeper.matchups(leagueId, w); } catch { continue; }
    if (!ms || !ms.length) continue;
    if (!ms.some((m) => (m.points ?? 0) > 0)) break;
    // The live NFL week (and beyond) is only folded in once it's fully scored.
    if (w >= liveWeek && !ms.every((m) => (m.points ?? 0) >= WEEK_COMPLETE_FLOOR)) break;
    rowsByWeek[String(w)] = ms.map((m) => ({ r: m.roster_id, m: m.matchup_id ?? 0, p: m.points ?? 0 }));
    for (const m of ms) {
      const pp = m.players_points || {};
      let bestId: string | null = null, bestPts = -Infinity;
      for (const [pid, pts] of Object.entries(pp)) if ((pts as number) > bestPts) { bestPts = pts as number; bestId = pid; }
      if (bestId != null) {
        const cur = playerBest.get(m.roster_id);
        if (!cur || bestPts > cur.points) {
          const meta = players[bestId];
          playerBest.set(m.roster_id, { name: meta ? `${meta.first_name} ${meta.last_name}` : bestId, playerId: bestId, points: round(bestPts, 2), season, week: w });
        }
      }
    }
  }
  return { season, leagueId, complete, rowsByWeek, teams, playerBest };
}

function toTeamWeeks(rowsByWeek: Record<string, MatchRow[]>): TeamWeek[] {
  const out: TeamWeek[] = [];
  for (const [wk, rows] of Object.entries(rowsByWeek)) for (const r of rows) out.push({ rosterId: r.r, week: Number(wk), points: r.p, matchupId: r.m });
  return out;
}

function standingsShape(rowsByWeek: Record<string, MatchRow[]>, teams: TeamInfo[], movesByRoster?: Map<number, number>) {
  const std = computeStandings(computeWeeklyResults(toTeamWeeks(rowsByWeek)));
  const byR = new Map(teams.map((t) => [t.rosterId, t]));
  // Preseason: no scored weeks yet — show every current team at 0–0.
  const rowsSrc = std.length
    ? std
    : [...teams].sort((a, b) => a.rosterId - b.rosterId).map((t) => ({
        rosterId: t.rosterId, wins: 0, losses: 0, winPct: 0, h2hWins: 0, h2hLosses: 0,
        pointsFor: 0, pointsAgainst: 0, high: 0, low: 0, avgPF: 0, stdev: 0,
        topFinishes: 0, ovw: 0, streakLabel: "W0",
      }));
  return rowsSrc.map((s, i) => {
    const t = byR.get(s.rosterId)!;
    return {
      rank: i + 1, rosterId: s.rosterId, handle: t.handle, teamName: t.teamName, avatar: t.avatar,
      wins: s.wins, losses: s.losses, winPct: round(s.winPct, 3), h2hWins: s.h2hWins, h2hLosses: s.h2hLosses,
      pf: round(s.pointsFor, 2), pa: round(s.pointsAgainst, 2), maxPF: round(s.high, 2), minPF: round(s.low, 2),
      avgPF: round(s.avgPF, 2), stdev: round(s.stdev, 2), topFinishes: s.topFinishes, ovw: s.ovw,
      streak: s.streakLabel, moves: movesByRoster ? (movesByRoster.get(s.rosterId) ?? 0) : null,
    };
  });
}

function powerShape(rowsByWeek: Record<string, MatchRow[]>, teams: TeamInfo[], rosterScores: Map<number, number>) {
  const weeks = toTeamWeeks(rowsByWeek);
  const maxW = Math.max(0, ...weeks.map((w) => w.week));
  const byR = new Map(teams.map((t) => [t.rosterId, t]));
  const rankAt = (upto: number) => {
    const st = computeStandings(computeWeeklyResults(weeks.filter((w) => w.week <= upto)));
    const sByR = new Map(st.map((s) => [s.rosterId, s]));
    const tf: TeamFactors[] = teams.map((t) => {
      // Preseason: no standings row yet — every on-field factor is 0, so the
      // ranking collapses to roster strength (the one component that's live).
      const s = sByR.get(t.rosterId);
      return { rosterId: t.rosterId, factors: {
        wins: s?.wins ?? 0, streak: s?.streak ?? 0, rosterScore: rosterScores.get(t.rosterId) ?? 0,
        ovw: s?.ovw ?? 0, consistency: s ? -s.stdev : 0, avgPF: s?.avgPF ?? 0,
      } };
    });
    return computePowerRankings(tf);
  };
  const prev = maxW > 1 ? new Map(rankAt(maxW - 1).map((p) => [p.rosterId, p.rank])) : new Map();
  return rankAt(maxW).map((p) => {
    const prevRank = prev.get(p.rosterId) ?? null;
    const t = byR.get(p.rosterId)!;
    return { rosterId: p.rosterId, handle: t.handle, teamName: t.teamName, avatar: t.avatar, rank: p.rank, prevRank, trend: prevRank == null ? null : prevRank - p.rank, score: round(p.score, 2) };
  });
}

function weeklyMatrix(rowsByWeek: Record<string, MatchRow[]>, teams: TeamInfo[]) {
  const maxW = Math.max(0, ...Object.keys(rowsByWeek).map(Number));
  return teams.map((t) => {
    const scores = new Array(maxW).fill(0);
    for (const [wk, rows] of Object.entries(rowsByWeek)) { const r = rows.find((x) => x.r === t.rosterId); if (r) scores[Number(wk) - 1] = r.p; }
    return { rosterId: t.rosterId, handle: t.handle, teamName: t.teamName, scores };
  });
}

async function championOf(leagueId: string, teams: TeamInfo[]) {
  try {
    const wb: any[] = await (await fetch(`https://api.sleeper.app/v1/league/${leagueId}/winners_bracket`)).json();
    const byR = new Map(teams.map((t) => [t.rosterId, t]));
    const f = wb.find((m) => m.p === 1), third = wb.find((m) => m.p === 3);
    return {
      champion: f ? byR.get(f.w) ?? null : null, runnerUp: f ? byR.get(f.l) ?? null : null,
      third: third ? byR.get(third.w) ?? null : null,
    };
  } catch { return { champion: null, runnerUp: null, third: null }; }
}

async function fetchJson(url: string): Promise<any> { try { return await (await fetch(url)).json(); } catch { return null; } }

// Full playoff picture for one league: trophies, bracket display, and playoff
// matchup-log entries. Uses raw bracket JSON (reliable) + playoff-week scores.
async function buildPlayoffs(leagueId: string, playoffStart: number, seeds: number[]) {
  const wb: any[] = (await fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/winners_bracket`)) || [];
  const lb: any[] = (await fetchJson(`https://api.sleeper.app/v1/league/${leagueId}/losers_bracket`)) || [];
  const maxR = Math.max(1, ...wb.map((m) => m.r || 1));
  const pts = new Map<string, number>(); // `${week}:${roster}` -> points
  for (let i = 0; i < maxR; i++) {
    const w = playoffStart + i;
    const ms = await sleeper.matchups(leagueId, w).catch(() => []);
    for (const m of ms || []) if (m.points != null) pts.set(`${w}:${m.roster_id}`, m.points);
  }
  const P = (r: number, rid: number | null) => (rid == null ? null : pts.get(`${playoffStart + r - 1}:${rid}`) ?? null);
  const game = (m: any) => ({ a: m.t1, b: m.t2, aP: round(P(m.r, m.t1) ?? 0, 2), bP: round(P(m.r, m.t2) ?? 0, 2), w: m.w ?? null });
  const champM = wb.find((m) => m.p === 1), thirdM = wb.find((m) => m.p === 3), toiletM = lb.find((m) => m.p === 1);
  const trophies = {
    champion: champM?.w ?? null, runnerUp: champM?.l ?? null, third: thirdM?.w ?? null, toiletBowl: toiletM?.w ?? null,
  };
  const bracket = champM ? {
    byes: seeds.slice(0, 2),
    round1: wb.filter((m) => m.r === 1).map(game),
    semis: wb.filter((m) => m.r === 2 && m.p == null).map(game),
    final: game(champM), third: thirdM ? game(thirdM) : null,
  } : null;
  // playoff log entries (both brackets)
  const entries: any[] = [];
  for (const m of [...wb, ...lb]) {
    if (m.t1 == null || m.t2 == null) continue;
    const week = playoffStart + (m.r - 1);
    const a = P(m.r, m.t1), b = P(m.r, m.t2);
    if (a == null || b == null) continue;
    for (const [self, selfP, opp, oppP] of [[m.t1, a, m.t2, b], [m.t2, b, m.t1, a]] as any) {
      entries.push({ season: "", week, rosterId: self, points: selfP, oppRosterId: opp, oppPoints: oppP,
        result: selfP > oppP ? "W" : selfP < oppP ? "L" : "T", top6: false, margin: round(selfP - oppP, 2), isPlayoff: true, round: `PO Wk ${week}` });
    }
  }
  return { trophies, bracket, entries };
}

async function main() {
  const state = await sleeper.state();
  const chain = await fetchLeagueChain(LEAGUE_ID); // oldest → newest
  const current = chain[chain.length - 1];
  const values = await fetchDynastyValues();
  const valueById = new Map(values.map((v) => [v.sleeperId, v]));
  const players = await sleeper.playersNfl().catch(() => ({} as Record<string, any>));

  // roster strength (current league) → internal power factor only
  const rosters = await sleeper.rosters(LEAGUE_ID);
  const rosterScores = new Map<number, number>();
  for (const r of rosters) rosterScores.set(r.roster_id, rosterValue(r.players, valueById));

  // fetch every season's data
  const seasonDatas: SeasonData[] = [];
  for (const lg of chain) {
    const users = await sleeper.users(lg.league_id);
    const rs = await sleeper.rosters(lg.league_id);
    const teams = teamsFromLeague(users, rs);
    const regWeeks = (lg.settings.playoff_week_start ?? 15) - 1;
    const liveWeek = lg.league_id === LEAGUE_ID ? state.week : Number.POSITIVE_INFINITY;
    const sd = await fetchSeason(lg.league_id, lg.season, lg.status === "complete", regWeeks, teams, players, liveWeek);
    // Always keep the current league (even preseason with no games) so the site
    // shows a fresh 0–0 season; older seasons only count if they have games.
    if (lg.league_id === LEAGUE_ID || Object.keys(sd.rowsByWeek).length) seasonDatas.push(sd);
  }

  // current league teams (for the roster/nav layer)
  const currentUsers = await sleeper.users(LEAGUE_ID);
  const currentTeams = teamsFromLeague(currentUsers, rosters);

  // transactions (current league) → list + per-roster counts for standings.moves
  const movesByRoster = new Map<number, number>();
  const transactions: any[] = [];
  const upto = Math.max(1, state.week);
  for (let w = 1; w <= upto + 1; w++) {
    try {
      const txs = await sleeper.transactions(LEAGUE_ID, w);
      for (const tx of txs || []) {
        if (tx.status !== "complete") continue;
        for (const rid of tx.roster_ids || []) movesByRoster.set(rid, (movesByRoster.get(rid) ?? 0) + 1);
        transactions.push({
          id: tx.transaction_id, type: tx.type, week: w, created: tx.created, rosterIds: tx.roster_ids,
          adds: tx.adds ? Object.entries(tx.adds).map(([pid, rid]) => ({ player: players[pid] ? `${players[pid].first_name} ${players[pid].last_name}` : pid, pos: players[pid]?.position ?? null, rosterId: rid })) : [],
          drops: tx.drops ? Object.entries(tx.drops).map(([pid, rid]) => ({ player: players[pid] ? `${players[pid].first_name} ${players[pid].last_name}` : pid, pos: players[pid]?.position ?? null, rosterId: rid })) : [],
          faab: tx.settings?.waiver_bid ?? null,
        });
      }
    } catch {}
  }
  transactions.sort((a, b) => b.created - a.created);

  // seasons output (scored seasons only)
  const seasons: Record<string, any> = {};
  const seasonInputs: SeasonInput[] = [];
  const champsByRoster: Record<number, string[]> = {};
  const trophiesByRoster: Record<number, { season: string; trophy: string }[]> = {};
  const addTrophy = (rid: number | null, season: string, trophy: string) => { if (rid != null) (trophiesByRoster[rid] ||= []).push({ season, trophy }); };
  const historySeasons: any[] = [];
  const playoffLog: any[] = [];
  const leagueBySeasonId = new Map(chain.map((l) => [l.season, l]));
  for (const sd of seasonDatas) {
    const isCurrent = sd.leagueId === LEAGUE_ID;
    const moves = isCurrent ? movesByRoster : undefined;
    const standings = standingsShape(sd.rowsByWeek, sd.teams, moves);
    const nameByRoster = new Map(sd.teams.map((t) => [t.rosterId, t.teamName]));
    seasons[sd.season] = {
      complete: sd.complete,
      standings,
      power: powerShape(sd.rowsByWeek, sd.teams, isCurrent ? rosterScores : new Map()),
      weeklyScores: weeklyMatrix(sd.rowsByWeek, sd.teams),
      recaps: computeRecaps(sd.season, sd.rowsByWeek, nameByRoster),
    };
    // Preseason current league: standings + power only, no history/playoff rows.
    if (!Object.keys(sd.rowsByWeek).length) continue;
    const finishByRoster: Record<number, number> = {};
    standings.forEach((s: any) => (finishByRoster[s.rosterId] = s.rank));
    seasonInputs.push({ season: sd.season, weeks: sd.rowsByWeek, finishByRoster });
    const nm = (rid: number | null) => { if (rid == null) return null; const t = sd.teams.find((x) => x.rosterId === rid); return t ? { handle: t.handle, teamName: t.teamName } : null; };

    // playoffs (only for complete seasons with a bracket)
    let bracket = null;
    if (sd.complete) {
      const playoffStart = (leagueBySeasonId.get(sd.season)?.settings.playoff_week_start ?? 15);
      const seeds = standings.map((s: any) => s.rosterId);
      const po = await buildPlayoffs(sd.leagueId, playoffStart, seeds);
      bracket = po.bracket;
      const deadLast = standings[standings.length - 1].rosterId;
      addTrophy(po.trophies.champion, sd.season, "Champion");
      addTrophy(po.trophies.runnerUp, sd.season, "Runner-Up");
      addTrophy(po.trophies.third, sd.season, "3rd Place");
      addTrophy(po.trophies.toiletBowl, sd.season, "Toilet Bowl");
      addTrophy(deadLast, sd.season, "Dead Last (Reg.)");
      if (po.trophies.champion != null) (champsByRoster[po.trophies.champion] ||= []).push(sd.season);
      for (const e of po.entries) playoffLog.push({ ...e, season: sd.season });
      historySeasons.push({
        season: sd.season, leagueId: sd.leagueId, complete: true,
        champion: nm(po.trophies.champion), runnerUp: nm(po.trophies.runnerUp), third: nm(po.trophies.third),
        regularSeasonNo1: { handle: standings[0].handle, teamName: standings[0].teamName },
        standings: standings.map((s: any) => ({ rank: s.rank, handle: s.handle, teamName: s.teamName, record: `${s.wins}-${s.losses}`, pf: s.pf })),
        bracket, placements: null,
        trophies: { champion: po.trophies.champion, runnerUp: po.trophies.runnerUp, third: po.trophies.third, toiletBowl: po.trophies.toiletBowl, deadLast },
        seeds: standings.map((s: any) => s.rosterId),
      });
    } else {
      historySeasons.push({
        season: sd.season, leagueId: sd.leagueId, complete: false,
        champion: null, runnerUp: null, third: null,
        regularSeasonNo1: { handle: standings[0].handle, teamName: standings[0].teamName },
        standings: standings.map((s: any) => ({ rank: s.rank, handle: s.handle, teamName: s.teamName, record: `${s.wins}-${s.losses}`, pf: s.pf })),
        bracket: null, placements: null,
      });
    }
  }
  historySeasons.sort((a, b) => b.season.localeCompare(a.season));

  const hist = computeHistory(seasonInputs);
  const bestByRoster = new Map<number, { name: string; playerId: string | null; points: number; season: string; week: number }>();
  for (const sd of seasonDatas) for (const [rid, b] of sd.playerBest) { const cur = bestByRoster.get(rid); if (!cur || b.points > cur.points) bestByRoster.set(rid, b); }
  for (const [rid, at] of Object.entries(hist.byRoster)) (at as any).bestPlayerWeek = bestByRoster.get(Number(rid)) ?? null;
  let recordPlayerWeek: any = null;
  for (const [rid, b] of bestByRoster) if (!recordPlayerWeek || b.points > recordPlayerWeek.points) recordPlayerWeek = { ...b, rosterId: rid };
  const allMatchups = [...hist.matchups.map((m) => ({ ...m, isPlayoff: false, round: null })), ...playoffLog];

  // full current-season schedule pairings (all weeks, even future)
  const regWeeksCur = (current.settings.playoff_week_start ?? 15) - 1;
  const scheduleWeeksArr: any[] = [];
  for (let w = 1; w <= regWeeksCur; w++) {
    const ms = await sleeper.matchups(LEAGUE_ID, w).catch(() => []);
    if (!ms || !ms.length) continue;
    const byM = new Map<number, number[]>();
    for (const m of ms) { if (m.matchup_id == null) continue; if (!byM.has(m.matchup_id)) byM.set(m.matchup_id, []); byM.get(m.matchup_id)!.push(m.roster_id); }
    scheduleWeeksArr.push({ week: w, games: [...byM.values()].filter((p) => p.length === 2).map((p) => ({ a: p[0], b: p[1] })) });
  }
  const schedule = { season: current.season, playoffStart: current.settings.playoff_week_start ?? 15, weeks: scheduleWeeksArr };

  // rulebook (from repo)
  let rulebook: any = { updated: "", html: "", proposed: [] };
  try {
    const md = readFileSync(new URL("../../data/raw/rulebook.md", import.meta.url), "utf8");
    const upd = md.match(/Last updated:\s*(.+)/)?.[1] ?? "";
    rulebook = { updated: upd, html: marked.parse(md.replace(/^# .*\nLast updated:.*\n/, "")) as string, proposed: [] };
  } catch {}

  const currentScored = seasonDatas.some(
    (sd) => sd.leagueId === LEAGUE_ID && Object.keys(sd.rowsByWeek).length > 0,
  );
  const withRecaps = Object.keys(seasons).filter((k) => (seasons[k].recaps || []).length > 0);
  const latestScored = (withRecaps.length ? withRecaps : Object.keys(seasons)).sort().pop();
  const recapSeason = latestScored;
  const recapWeek = latestScored ? Math.max(0, ...(seasons[latestScored].recaps || []).map((r: any) => r.week)) : 0;
  const bundle = {
    generatedAt: GEN_TS,
    league: {
      name: current.name, currentLeagueId: LEAGUE_ID, season: current.season, numTeams: current.total_rosters,
      playoffTeams: current.settings.playoff_teams, playoffWeekStart: current.settings.playoff_week_start ?? 15,
      topBonusCount: Math.floor(current.total_rosters / 2), sleeperUrl: `https://sleeper.com/leagues/${LEAGUE_ID}`,
    },
    state: { season: state.season, week: state.week, seasonType: state.season_type, inSeason: state.season_type === "regular" && currentScored, recapSeason, recapWeek },
    teams: currentTeams,
    seasons,
    transactions: transactions.slice(0, 60),
    history: { seasons: historySeasons, champsByRoster, trophiesByRoster, records: computeRecords(allMatchups as any), recordPlayerWeek, allTime: hist.byRoster, matchups: allMatchups },
    schedule,
    rulebook,
    meta: { note: currentScored ? "" : "Preseason — 2026 standings/power/transactions light up at Week 1." },
  };

  mkdirSync(join(process.cwd(), "web/data"), { recursive: true });
  writeFileSync(join(process.cwd(), "web/data/bundle.json"), JSON.stringify(bundle));
  console.log(`Wrote web/data/bundle.json — seasons scored: ${Object.keys(seasons).join(", ") || "none"}; history teams: ${Object.keys(hist.byRoster).length}; txns: ${transactions.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
