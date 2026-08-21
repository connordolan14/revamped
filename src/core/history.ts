// All-time history engine. From per-season matchup rows (roster_id, matchup_id,
// points) it derives each team's matchup log and fun all-time stats. Traded
// players are handled naturally at the player layer (a player-week belongs to
// whoever rostered it that week); this module works at the team/matchup layer.

export interface MatchRow { r: number; m: number; p: number; }
export interface SeasonInput {
  season: string;
  weeks: Record<string, MatchRow[]>;
  finishByRoster: Record<number, number>; // final regular-season rank
  topN?: number;
}
export interface MatchupEntry {
  season: string; week: number; rosterId: number; points: number;
  oppRosterId: number | null; oppPoints: number | null;
  result: "W" | "L" | "T" | null; top6: boolean; margin: number | null;
}
export interface TeamAllTime {
  rosterId: number; seasonsPlayed: number; games: number;
  h2hW: number; h2hL: number; h2hT: number;
  halfWins: number; halfLosses: number; top6: number;
  pointsFor: number; pointsAgainst: number; avgPoints: number;
  highWeek: { points: number; oppPoints: number | null; oppRosterId: number | null; season: string; week: number } | null;
  lowWeek: { points: number; oppPoints: number | null; oppRosterId: number | null; season: string; week: number } | null;
  biggestWin: { margin: number; points: number; oppPoints: number; season: string; week: number; oppRosterId: number } | null;
  worstLoss: { margin: number; points: number; oppPoints: number; season: string; week: number; oppRosterId: number } | null;
  finishes: { season: string; finish: number }[];
  avgFinish: number | null; bestFinish: number | null;
  rival: { rosterId: number; games: number; w: number; l: number; avgMargin: number } | null;
}

export interface RecordEntry { rosterId: number; value: number; season: string; week?: number; isPlayoff?: boolean; oppRosterId?: number; oppPoints?: number; points?: number; }
export interface LeagueRecords {
  highestWeek: RecordEntry | null; lowestWeek: RecordEntry | null;
  biggestBlowout: (RecordEntry & { oppRosterId: number }) | null;
  highestGame: { aRoster: number; bRoster: number; aP: number; bP: number; total: number; season: string; week: number } | null;
  longestWinStreak: { rosterId: number; len: number; season: string } | null;
  longestLossStreak: { rosterId: number; len: number; season: string } | null;
  mostPointsSeason: { rosterId: number; points: number; season: string } | null;
}

// League record book. `all` includes playoff games (for scoring records); streaks
// & season totals use regular-season games only.
export function computeRecords(all: (MatchupEntry & { isPlayoff?: boolean })[]): LeagueRecords {
  if (!all.length) return { highestWeek: null, lowestWeek: null, biggestBlowout: null, highestGame: null, longestWinStreak: null, longestLossStreak: null, mostPointsSeason: null };
  const withOpp = all.filter((g) => g.oppRosterId != null);
  const highestWeek = all.reduce((b, g) => (!b || g.points > b.value ? { rosterId: g.rosterId, value: g.points, oppRosterId: g.oppRosterId ?? undefined, oppPoints: g.oppPoints ?? undefined, season: g.season, week: g.week, isPlayoff: !!g.isPlayoff } : b), null as RecordEntry | null);
  const lowestWeek = all.reduce((b, g) => (!b || g.points < b.value ? { rosterId: g.rosterId, value: g.points, oppRosterId: g.oppRosterId ?? undefined, oppPoints: g.oppPoints ?? undefined, season: g.season, week: g.week, isPlayoff: !!g.isPlayoff } : b), null as RecordEntry | null);
  const blow = withOpp.filter((g) => g.result === "W").reduce((b, g) => (!b || (g.margin || 0) > b.value ? { rosterId: g.rosterId, value: g.margin || 0, points: g.points, oppPoints: g.oppPoints ?? undefined, season: g.season, week: g.week, isPlayoff: !!g.isPlayoff, oppRosterId: g.oppRosterId! } : b), null as any);
  // highest combined game (dedupe: take the higher-scoring side)
  let highestGame: LeagueRecords["highestGame"] = null;
  for (const g of withOpp) if (g.points >= (g.oppPoints || 0)) { const total = +(g.points + (g.oppPoints || 0)).toFixed(2); if (!highestGame || total > highestGame.total) highestGame = { aRoster: g.rosterId, bRoster: g.oppRosterId!, aP: +g.points.toFixed(2), bP: +(g.oppPoints || 0).toFixed(2), total, season: g.season, week: g.week }; }
  // streaks & season totals — regular season only
  const reg = withOpp.filter((g) => !g.isPlayoff);
  const byTeamSeason = new Map<string, MatchupEntry[]>();
  for (const g of reg) { const k = `${g.rosterId}|${g.season}`; if (!byTeamSeason.has(k)) byTeamSeason.set(k, []); byTeamSeason.get(k)!.push(g); }
  let longestWinStreak: any = null, longestLossStreak: any = null, mostPointsSeason: any = null;
  for (const [k, gs] of byTeamSeason) {
    const [rid, season] = k.split("|"); const rosterId = Number(rid);
    gs.sort((a, b) => a.week - b.week);
    let w = 0, l = 0;
    for (const g of gs) {
      w = g.result === "W" ? w + 1 : 0; l = g.result === "L" ? l + 1 : 0;
      if (!longestWinStreak || w > longestWinStreak.len) longestWinStreak = { rosterId, len: w, season };
      if (!longestLossStreak || l > longestLossStreak.len) longestLossStreak = { rosterId, len: l, season };
    }
    const pts = +gs.reduce((a, g) => a + g.points, 0).toFixed(2);
    if (!mostPointsSeason || pts > mostPointsSeason.points) mostPointsSeason = { rosterId, points: pts, season };
  }
  return { highestWeek, lowestWeek, biggestBlowout: blow, highestGame, longestWinStreak, longestLossStreak, mostPointsSeason };
}

export function computeHistory(seasons: SeasonInput[]) {
  const matchups: MatchupEntry[] = [];
  for (const s of seasons) {
    for (const [wk, rows] of Object.entries(s.weeks)) {
      const week = Number(wk);
      const n = rows.length;
      const topN = s.topN ?? Math.floor(n / 2);
      const topIds = new Set([...rows].sort((a, b) => b.p - a.p).slice(0, topN).map((r) => r.r));
      const byMatch = new Map<number, MatchRow[]>();
      for (const r of rows) { if (!byMatch.has(r.m)) byMatch.set(r.m, []); byMatch.get(r.m)!.push(r); }
      for (const r of rows) {
        const pair = byMatch.get(r.m) || [];
        const opp = pair.find((x) => x.r !== r.r) || null;
        let result: "W" | "L" | "T" | null = null;
        if (opp) result = r.p > opp.p ? "W" : r.p < opp.p ? "L" : "T";
        matchups.push({
          season: s.season, week, rosterId: r.r, points: r.p,
          oppRosterId: opp?.r ?? null, oppPoints: opp?.p ?? null,
          result, top6: topIds.has(r.r), margin: opp ? +(r.p - opp.p).toFixed(2) : null,
        });
      }
    }
  }

  const rosterIds = [...new Set(matchups.map((m) => m.rosterId))];
  const byRoster: Record<number, TeamAllTime> = {};
  for (const rid of rosterIds) {
    const games = matchups.filter((m) => m.rosterId === rid);
    const withOpp = games.filter((g) => g.oppRosterId != null);
    const pf = games.reduce((a, g) => a + g.points, 0);
    const pa = withOpp.reduce((a, g) => a + (g.oppPoints || 0), 0);
    const h2hW = withOpp.filter((g) => g.result === "W").length;
    const h2hL = withOpp.filter((g) => g.result === "L").length;
    const h2hT = withOpp.filter((g) => g.result === "T").length;
    const top6 = games.filter((g) => g.top6).length;
    const halfWins = h2hW + h2hT * 0.5 + top6 * 0.5;
    const halfLosses = games.length * 1.5 - halfWins;
    const high = games.reduce((b, g) => (!b || g.points > b.points ? { points: g.points, oppPoints: g.oppPoints, oppRosterId: g.oppRosterId, season: g.season, week: g.week } : b), null as any);
    const low = games.reduce((b, g) => (!b || g.points < b.points ? { points: g.points, oppPoints: g.oppPoints, oppRosterId: g.oppRosterId, season: g.season, week: g.week } : b), null as any);
    const wins = withOpp.filter((g) => g.result === "W");
    const losses = withOpp.filter((g) => g.result === "L");
    const bigWin = wins.reduce((b, g) => (!b || (g.margin || 0) > b.margin ? { margin: g.margin!, points: g.points, oppPoints: g.oppPoints!, season: g.season, week: g.week, oppRosterId: g.oppRosterId! } : b), null as any);
    const worstLoss = losses.reduce((b, g) => (!b || (g.margin || 0) < b.margin ? { margin: g.margin!, points: g.points, oppPoints: g.oppPoints!, season: g.season, week: g.week, oppRosterId: g.oppRosterId! } : b), null as any);

    const finishes = seasons
      .filter((s) => s.finishByRoster[rid] != null)
      .map((s) => ({ season: s.season, finish: s.finishByRoster[rid] }));
    const avgFinish = finishes.length ? +(finishes.reduce((a, f) => a + f.finish, 0) / finishes.length).toFixed(1) : null;
    const bestFinish = finishes.length ? Math.min(...finishes.map((f) => f.finish)) : null;

    // rival: opponent faced most; tiebreak by more losses to them, then closest avg margin
    const oppAgg = new Map<number, { games: number; w: number; l: number; marginSum: number }>();
    for (const g of withOpp) {
      const o = g.oppRosterId!;
      if (!oppAgg.has(o)) oppAgg.set(o, { games: 0, w: 0, l: 0, marginSum: 0 });
      const a = oppAgg.get(o)!;
      a.games += 1; a.marginSum += g.margin || 0;
      if (g.result === "W") a.w += 1; else if (g.result === "L") a.l += 1;
    }
    let rival: TeamAllTime["rival"] = null;
    for (const [oid, a] of oppAgg) {
      const cand = { rosterId: oid, games: a.games, w: a.w, l: a.l, avgMargin: +(a.marginSum / a.games).toFixed(1) };
      if (!rival || cand.games > rival.games ||
        (cand.games === rival.games && Math.abs(cand.avgMargin) < Math.abs(rival.avgMargin))) rival = cand;
    }

    byRoster[rid] = {
      rosterId: rid, seasonsPlayed: new Set(games.map((g) => g.season)).size, games: games.length,
      h2hW, h2hL, h2hT, halfWins, halfLosses, top6,
      pointsFor: +pf.toFixed(2), pointsAgainst: +pa.toFixed(2), avgPoints: +(pf / games.length).toFixed(2),
      highWeek: high, lowWeek: low, biggestWin: bigWin, worstLoss,
      finishes, avgFinish, bestFinish, rival,
    };
  }
  return { matchups, byRoster };
}
