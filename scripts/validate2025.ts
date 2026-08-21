// Validates the computation engine against the published 2025 season numbers
// captured from Connor's league sheet (PowerCalculations + Standings tabs).
// Run: npm run validate

import { TeamWeek } from "../src/core/types.js";
import { computeWeeklyResults, computeStandings } from "../src/core/standings.js";
import { computePowerRankings, TeamFactors } from "../src/core/power.js";
import { mean, stdevPop, stdevSample, round } from "../src/core/stats.js";

interface Fixture {
  rosterId: number;
  handle: string;
  team: string;
  scores: number[]; // weeks 1..14
  sheetAvg: number;
  sheetDev: number;
  sheetOVW: number;
  sheetTotal: number;
  h2hWins: number; // from Standings tab
  sheetWins: number; // half-win total from Standings tab
  sheetPowerRank: number;
}

// rosterId here is a synthetic 1..12 index for the fixture (real roster_ids
// come from Sleeper at sync time; the math is identical).
const F: Fixture[] = [
  { rosterId: 1, handle: "dackerly36", team: "The Permanent Rebuild", scores: [100.82,92.65,99.22,108.98,73.76,61.93,49.83,70.65,117.32,92.37,74.02,61.99,59.21,75.36], sheetAvg: 81.29, sheetDev: 20.57, sheetOVW: 11, sheetTotal: 1138.11, h2hWins: 0, sheetWins: 0, sheetPowerRank: 12 },
  { rosterId: 2, handle: "Hank1517", team: "Jayden's Blue Balls", scores: [134.78,94.82,125.39,106.12,147.11,116.49,137.90,129.32,95.94,124.37,75.24,72.50,118.99,92.28], sheetAvg: 112.23, sheetDev: 23.22, sheetOVW: 69, sheetTotal: 1571.25, h2hWins: 6, sheetWins: 10, sheetPowerRank: 10 },
  { rosterId: 3, handle: "greenie0513", team: "Green Egbukas & Ham", scores: [116.51,125.17,103.42,113.51,139.37,76.52,163.26,99.91,161.42,102.05,84.29,113.10,107.38,126.84], sheetAvg: 116.63, sheetDev: 25.27, sheetOVW: 75, sheetTotal: 1632.75, h2hWins: 5, sheetWins: 8.5, sheetPowerRank: 7 },
  { rosterId: 4, handle: "TheBearJew44", team: "Jerking Goff", scores: [95.77,187.61,127.64,133.77,157.92,113.22,92.69,99.35,127.01,131.00,114.15,100.21,113.39,111.41], sheetAvg: 121.80, sheetDev: 25.92, sheetOVW: 78, sheetTotal: 1705.14, h2hWins: 5, sheetWins: 8.5, sheetPowerRank: 9 },
  { rosterId: 5, handle: "mhaanders", team: "Injured Reserve", scores: [125.80,105.33,117.48,139.55,166.03,123.44,95.06,84.19,96.55,114.63,139.61,67.08,96.62,70.86], sheetAvg: 110.16, sheetDev: 27.79, sheetOVW: 68, sheetTotal: 1542.23, h2hWins: 7, sheetWins: 9.5, sheetPowerRank: 11 },
  { rosterId: 6, handle: "dball11", team: "Woodys Toy Box", scores: [103.10,101.43,132.48,120.57,131.83,114.53,111.05,118.98,95.81,126.77,100.52,97.17,128.95,118.74], sheetAvg: 114.42, sheetDev: 13.05, sheetOVW: 72, sheetTotal: 1601.93, h2hWins: 8, sheetWins: 10.5, sheetPowerRank: 5 },
  { rosterId: 7, handle: "ryanog", team: "New York Mudbones", scores: [134.38,162.64,101.00,136.29,148.93,155.17,128.81,105.12,160.20,120.89,149.53,160.70,115.15,131.22], sheetAvg: 136.43, sheetDev: 20.64, sheetOVW: 112, sheetTotal: 1910.03, h2hWins: 11, sheetWins: 16.5, sheetPowerRank: 1 },
  { rosterId: 8, handle: "connordolan14", team: "New England Keys", scores: [113.34,137.92,124.45,135.63,129.26,75.94,146.01,160.59,105.95,123.19,114.56,117.49,127.05,157.27], sheetAvg: 126.33, sheetDev: 21.66, sheetOVW: 94, sheetTotal: 1768.65, h2hWins: 10, sheetWins: 15, sheetPowerRank: 2 },
  { rosterId: 9, handle: "jtyurconic2", team: "Team jtyurconic2", scores: [143.89,106.67,162.23,121.64,91.64,116.56,99.43,154.22,147.68,106.26,145.35,133.22,146.72,134.23], sheetAvg: 129.27, sheetDev: 22.24, sheetOVW: 105, sheetTotal: 1809.74, h2hWins: 10, sheetWins: 14.5, sheetPowerRank: 4 },
  { rosterId: 10, handle: "chrisrenna17", team: "Team chrisrenna17", scores: [108.51,142.64,99.51,171.91,109.26,152.12,131.60,107.00,145.67,135.98,126.94,148.11,118.33,108.64], sheetAvg: 129.02, sheetDev: 21.40, sheetOVW: 95, sheetTotal: 1806.22, h2hWins: 8, sheetWins: 12.5, sheetPowerRank: 3 },
  { rosterId: 11, handle: "jbitterman99", team: "Mark 2.0", scores: [120.27,104.29,84.89,109.26,145.52,139.24,154.22,129.63,154.60,81.85,98.65,122.75,149.03,117.76], sheetAvg: 122.28, sheetDev: 24.45, sheetOVW: 85, sheetTotal: 1711.96, h2hWins: 8, sheetWins: 12.5, sheetPowerRank: 6 },
  { rosterId: 12, handle: "BrendanBall03", team: "Team BrendanBall03", scores: [105.74,111.60,132.29,141.45,115.16,100.24,80.73,118.75,107.12,80.79,106.91,97.83,91.72,111.96], sheetAvg: 107.31, sheetDev: 17.14, sheetOVW: 60, sheetTotal: 1502.29, h2hWins: 6, sheetWins: 8, sheetPowerRank: 8 },
];

const NWEEKS = 14;
let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; } else { fail++; console.log(`  ✗ FAIL ${name} ${detail}`); }
};

// Build TeamWeek[] from the fixture (no pairings — we validate scoring/top6/OVW,
// which don't need H2H opponents).
const weeks: TeamWeek[] = [];
for (const f of F) {
  f.scores.forEach((pts, i) => weeks.push({ rosterId: f.rosterId, week: i + 1, points: pts, matchupId: null }));
}

const results = computeWeeklyResults(weeks); // topN defaults to floor(12/2)=6

// --- Aggregate per team from engine ---
const agg = new Map<number, { top: number; ovw: number; pf: number[] }>();
for (const f of F) agg.set(f.rosterId, { top: 0, ovw: 0, pf: [] });
for (const r of results) {
  const a = agg.get(r.rosterId)!;
  if (r.isTop) a.top += 1;
  a.ovw += r.beatenCount;
  a.pf.push(r.points);
}

console.log("=== 2025 engine validation ===\n");
console.log("Per-team checks (AVG, DEV, OVW total, half-win reconstruction):");

// Determine which stdev the sheet used.
let popMatches = 0, sampleMatches = 0;
for (const f of F) {
  if (Math.abs(round(stdevPop(f.scores), 2) - f.sheetDev) <= 0.02) popMatches++;
  if (Math.abs(round(stdevSample(f.scores), 2) - f.sheetDev) <= 0.02) sampleMatches++;
}
console.log(`  stdev match: population=${popMatches}/12, sample=${sampleMatches}/12`);

let topBonusOK = 0;
for (const f of F) {
  const a = agg.get(f.rosterId)!;
  // AVG
  check(`AVG ${f.handle}`, Math.abs(round(mean(f.scores), 2) - f.sheetAvg) <= 0.02, `got ${round(mean(f.scores),2)} vs ${f.sheetAvg}`);
  // OVW
  check(`OVW ${f.handle}`, a.ovw === f.sheetOVW, `got ${a.ovw} vs ${f.sheetOVW}`);
  // TOTAL
  check(`TOTAL ${f.handle}`, Math.abs(round(f.scores.reduce((x,y)=>x+y,0),2) - f.sheetTotal) <= 0.02);
  // Half-win reconstruction: h2hWins + 0.5*topFinishes should equal sheetWins
  const reconstructed = f.h2hWins + 0.5 * a.top;
  const ok = Math.abs(reconstructed - f.sheetWins) < 1e-9;
  if (ok) topBonusOK++;
  check(`HALF-WIN ${f.handle}`, ok, `h2h ${f.h2hWins} + 0.5*${a.top}top = ${reconstructed} vs sheet ${f.sheetWins}`);
}

// Sanity: OVW totals across league must equal weeks * C(11,1..) = 14 * 66
const ovwSum = [...agg.values()].reduce((s, a) => s + a.ovw, 0);
check("OVW league sum = 14*66", ovwSum === NWEEKS * 66, `got ${ovwSum}`);

// Top-6 finishes across league must equal weeks * 6
const topSum = [...agg.values()].reduce((s, a) => s + a.top, 0);
check("Top finishes league sum = 14*6", topSum === NWEEKS * 6, `got ${topSum}`);

// --- Power model: run with the 5 mechanical factors we can derive from the
// sheet (rosterScore left neutral) and report order vs sheet. Exact 2025 power
// order also depends on the external roster-rank factor, sourced from
// FantasyCalc for live seasons. ---
console.log("\nPower model (5 mechanical factors; rosterScore neutral):");
const tf: TeamFactors[] = F.map((f) => {
  const a = agg.get(f.rosterId)!;
  return {
    rosterId: f.rosterId,
    factors: {
      wins: f.sheetWins,
      streak: 0, // final-week streak not in fixture; neutralized
      rosterScore: 0, // external; neutral here
      ovw: a.ovw,
      consistency: -stdevPop(f.scores),
      avgPF: mean(f.scores),
    },
  };
});
const pr = computePowerRankings(tf);
const handleById = new Map(F.map((f) => [f.rosterId, f.handle]));
const sheetRankById = new Map(F.map((f) => [f.rosterId, f.sheetPowerRank]));
let within1 = 0;
for (const p of pr) {
  const sheetR = sheetRankById.get(p.rosterId)!;
  if (Math.abs(p.rank - sheetR) <= 1) within1++;
  console.log(`  #${p.rank} ${handleById.get(p.rosterId)!.padEnd(14)} score=${round(p.score,2)}  (sheet #${sheetR})`);
}
console.log(`  within ±1 of sheet power rank: ${within1}/12 (rosterScore excluded)`);

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
