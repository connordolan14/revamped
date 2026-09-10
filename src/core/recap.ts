// Weekly matchup facts for the homepage recap card: the games, the top-6 bonus
// group and cutline, and the week's high and low.
//
// This module is deterministic structure only. The recap's prose comes from the
// generated article in data/recaps/ (see recapSchema.ts); there is no
// auto-written narrative fallback.
import { MatchRow } from "./history.js";

export interface RecapGame { a: number; b: number; aP: number; bP: number; w: number | null; margin: number; }
export interface WeekRecap {
  season: string; week: number;
  games: RecapGame[]; topSix: number[]; cutline: number;
  high: { r: number; p: number }; low: { r: number; p: number };
}

export function computeRecaps(season: string, weeks: Record<string, MatchRow[]>): WeekRecap[] {
  const out: WeekRecap[] = [];
  for (const [wk, rows] of Object.entries(weeks)) {
    const week = Number(wk);
    const sorted = [...rows].sort((a, b) => b.p - a.p);
    const topSix = sorted.slice(0, 6).map((r) => r.r);
    const cutline = +(sorted[5]?.p ?? 0).toFixed(2);
    const high = { r: sorted[0].r, p: +sorted[0].p.toFixed(2) };
    const low = { r: sorted[sorted.length - 1].r, p: +sorted[sorted.length - 1].p.toFixed(2) };
    const byMatch = new Map<number, MatchRow[]>();
    for (const r of rows) { if (!byMatch.has(r.m)) byMatch.set(r.m, []); byMatch.get(r.m)!.push(r); }
    const games: RecapGame[] = [];
    for (const pair of byMatch.values()) {
      if (pair.length < 2) continue;
      const [x, y] = pair[0].p >= pair[1].p ? [pair[0], pair[1]] : [pair[1], pair[0]];
      games.push({ a: x.r, b: y.r, aP: +x.p.toFixed(2), bP: +y.p.toFixed(2), w: x.p === y.p ? null : x.r, margin: +(x.p - y.p).toFixed(2) });
    }
    games.sort((a, b) => b.aP - a.aP);
    out.push({ season, week, games, topSix, cutline, high, low });
  }
  return out.sort((a, b) => a.week - b.week);
}
