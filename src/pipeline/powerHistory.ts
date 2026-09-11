// Append-only persistence for the power ranking that was actually displayed
// after each completed week. Recomputing an old week with today's roster values
// would rewrite history, so snapshots live outside the generated site bundle.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const POWER_HISTORY_DIR = "data/power-rankings";

export interface PowerSnapshotRanking {
  rosterId: number;
  ownerId: string;
  handle: string;
  teamName: string;
  avatar: string | null;
  rank: number;
  score: number;
}

export interface PowerSnapshot {
  season: string;
  week: number;
  capturedAt: string;
  leagueId: string;
  rankings: PowerSnapshotRanking[];
}

export const powerSnapshotFileName = (season: string | number, week: number) =>
  `${season}-week-${String(week).padStart(2, "0")}.json`;

export const powerSnapshotPath = (
  season: string | number,
  week: number,
  root = process.cwd(),
) => join(root, POWER_HISTORY_DIR, powerSnapshotFileName(season, week));

function readSnapshot(path: string): PowerSnapshot {
  const snapshot = JSON.parse(readFileSync(path, "utf8")) as PowerSnapshot;
  if (!snapshot.season || !Number.isInteger(snapshot.week) || !Array.isArray(snapshot.rankings)) {
    throw new Error(`Invalid power-ranking snapshot: ${path}`);
  }
  return snapshot;
}

/** Existing snapshots are deliberately reused byte-for-byte, never overwritten. */
export function savePowerSnapshot(snapshot: PowerSnapshot, root = process.cwd()) {
  const directory = join(root, POWER_HISTORY_DIR);
  const path = powerSnapshotPath(snapshot.season, snapshot.week, root);
  mkdirSync(directory, { recursive: true });
  if (existsSync(path)) return { created: false, path, snapshot: readSnapshot(path) };
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + "\n", { flag: "wx" });
  return { created: true, path, snapshot };
}

export function loadPowerSnapshots(season: string | number, root = process.cwd()): PowerSnapshot[] {
  const directory = join(root, POWER_HISTORY_DIR);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((file) => file.startsWith(`${season}-week-`) && file.endsWith(".json"))
    .sort()
    .map((file) => readSnapshot(join(directory, file)))
    .sort((a, b) => a.week - b.week);
}
