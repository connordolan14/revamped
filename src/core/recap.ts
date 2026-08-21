// Weekly recap engine. From one week's matchup rows it derives the games, the
// top-6 bonus group + cutline, high/low, blowout/nailbiter, and a short auto
// narrative. Used for the homepage weekly recap (past week, updates each Tue).
import { MatchRow } from "./history.js";

export interface RecapGame { a: number; b: number; aP: number; bP: number; w: number | null; margin: number; }
export interface WeekRecap {
  season: string; week: number;
  games: RecapGame[]; topSix: number[]; cutline: number;
  high: { r: number; p: number }; low: { r: number; p: number };
  headline: string; lines: string[];
}

export function computeRecaps(season: string, weeks: Record<string, MatchRow[]>, nameByRoster: Map<number, string>): WeekRecap[] {
  const out: WeekRecap[] = [];
  const nm = (r: number) => nameByRoster.get(r) || `Team ${r}`;
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
    const blowout = [...games].sort((a, b) => b.margin - a.margin)[0];
    const nail = [...games].sort((a, b) => a.margin - b.margin)[0];
    const lines: string[] = [];
    lines.push(`**${nm(high.r)}** led the week with **${high.p}**.`);
    if (blowout) lines.push(`Biggest win: ${nm(blowout.a)} over ${nm(blowout.b)} by ${blowout.margin}.`);
    if (nail && nail !== blowout) lines.push(`Closest game: ${nm(nail.a)} edged ${nm(nail.b)} by ${nail.margin}.`);
    lines.push(`Top-6 bonus cutline: **${cutline}** — ${topSix.map(nm).join(", ")} banked the extra +0.5.`);
    if (low) lines.push(`Low man: ${nm(low.r)} at ${low.p}.`);
    out.push({ season, week, games, topSix, cutline, high, low, headline: `Week ${week}: ${nm(high.r)} tops the slate at ${high.p}`, lines });
  }
  return out.sort((a, b) => a.week - b.week);
}
